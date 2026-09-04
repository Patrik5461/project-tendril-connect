// Klient ZBGIS (kataster nehnuteľností) pre interný modul Kataster.
//
// TODO: docs/zbgis-endpoints.md v repozitári chýba, takže presné cesty ani tvar
// odpovedí nie sú overené. Preto je tu abstrakcia: adresy sa berú z env
// premenných (šablóny s {ku_code}, {register}, {offset}, {limit}, {parcel_id})
// a odpovede prechádzajú tolerantným normalizérom. Keď dokumentácia dorazí,
// stačí doplniť .env a prípadne mapovanie polí v parseParcelList /
// parseLvDetail – zvyšok kódu (throttling, retry, timeout) sa nemení.
//
// Premenné prostredia:
//   ZBGIS_PARCELS_URL    – šablóna zoznamu parciel v k.ú.
//   ZBGIS_LV_DETAIL_URL  – šablóna detailu LV pre parcelu
//   ZBGIS_USER_AGENT     – hlavička User-Agent
//   ZBGIS_REFERER        – hlavička Referer
//   ZBGIS_GEOMETRY_CRS   – wgs84 | mercator | none (keď odpoveď neuvádza wkid)
//   ZBGIS_REQ_DELAY_MS   – rozostup medzi requestmi (default 1000 = max 1 req/s)
//   ZBGIS_TIMEOUT_MS     – timeout jedného requestu (default 15000)
//   ZBGIS_MAX_RETRIES    – počet opakovaní po chybe (default 3)
//   ZBGIS_MAX_PAGES      – poistka proti nekonečnému stránkovaniu (default 200)

import type { ParcelOwner, ParcelRegister, OwnerRole } from "@/lib/kataster";
import { ownersHaveSpf } from "@/lib/kataster";

export type ZbgisParcelRef = {
  parcelId: string;
  parcelNumber: string;
  centroidLat: number | null;
  centroidLng: number | null;
  raw: unknown;
};

export type ZbgisLvDetail = {
  lvNumber: string | null;
  areaM2: number | null;
  landType: string | null;
  owners: ParcelOwner[];
  hasSpf: boolean;
  raw: unknown;
};

/** ZBGIS nás odstrihol (403/429). Sync sa má okamžite zastaviť, nie opakovať. */
export class ZbgisBlockedError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`ZBGIS zablokoval požiadavku (HTTP ${status}) – ${url}`);
    this.name = "ZbgisBlockedError";
    this.status = status;
  }
}

/** Adresa endpointu nie je nakonfigurovaná – bez docs/zbgis-endpoints.md sa nedá uhádnuť. */
export class ZbgisNotConfiguredError extends Error {
  constructor(envName: string) {
    super(
      `Chýba premenná ${envName}. Doplň ju do .env podľa docs/zbgis-endpoints.md ` +
        `(šablóna URL s {ku_code}/{register}, resp. {parcel_id}).`,
    );
    this.name = "ZbgisNotConfiguredError";
  }
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function envNum(name: string, fallback: number): number {
  const v = Number(env(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const REQ_DELAY_MS = envNum("ZBGIS_REQ_DELAY_MS", 1000);
const TIMEOUT_MS = envNum("ZBGIS_TIMEOUT_MS", 15_000);
const MAX_RETRIES = envNum("ZBGIS_MAX_RETRIES", 3);
const MAX_PAGES = envNum("ZBGIS_MAX_PAGES", 200);
const PAGE_SIZE = envNum("ZBGIS_PAGE_SIZE", 500);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Throttling: max 1 request za REQ_DELAY_MS, naprieč celým procesom.
// Requesty sa radia do jedného reťazca, takže ani paralelné synce nezrýchlia
// tempo nad dohodnutý limit.
// ---------------------------------------------------------------------------
let chain: Promise<unknown> = Promise.resolve();
let lastStartedAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastStartedAt + REQ_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();
    return fn();
  });
  // Chyba jedného requestu nesmie zhodiť rad pre ďalšie.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function fetchOnce(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": env("ZBGIS_USER_AGENT") ?? "TendrikBot (+https://tendrik.sk)",
        Referer: env("ZBGIS_REFERER") ?? "https://zbgis.skgeodesy.sk/",
      },
    });
    if (res.status === 403 || res.status === 429) throw new ZbgisBlockedError(res.status, url);
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Jeden GET s throttlingom, timeoutom a MAX_RETRIES opakovaniami (exponenciálny backoff). */
async function request(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    try {
      return await throttled(() => fetchOnce(url));
    } catch (e) {
      // 403/429 sa neopakuje – to je zámerné odmietnutie, nie výpadok.
      if (e instanceof ZbgisBlockedError) throw e;
      lastError = e;
      console.warn(
        `[zbgis] pokus ${attempt + 1}/${MAX_RETRIES + 1} zlyhal: ${(e as Error).message}`,
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? encodeURIComponent(String(vars[key])) : whole,
  );
}

// ---------------------------------------------------------------------------
// Tolerantné čítanie odpovede. ZBGIS stojí na ArcGIS-e, takže dáta chodia buď
// ako { features: [{ attributes, geometry }] }, alebo ako obyčajné pole /
// { items | content | data | results }. Kľúče berieme case-insensitive.
// ---------------------------------------------------------------------------
type Bag = Record<string, unknown>;

function isBag(v: unknown): v is Bag {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function rowsOf(payload: unknown): Bag[] {
  if (Array.isArray(payload)) return payload.filter(isBag);
  if (!isBag(payload)) return [];
  for (const key of ["features", "items", "content", "data", "results", "records"]) {
    const v = payload[key];
    if (Array.isArray(v)) return v.filter(isBag);
  }
  return [];
}

/** ArcGIS balí hodnoty do `attributes`/`properties`; sploštíme to na jednu úroveň. */
function flatten(row: Bag): Bag {
  const out: Bag = { ...row };
  for (const key of ["attributes", "properties"]) {
    const nested = row[key];
    if (isBag(nested)) Object.assign(out, nested);
  }
  return out;
}

function pick(row: Bag, keys: string[]): unknown {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) lower.set(k.toLowerCase().replace(/[_\s-]/g, ""), v);
  for (const key of keys) {
    const v = lower.get(key.toLowerCase().replace(/[_\s-]/g, ""));
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function mercatorToWgs84(x: number, y: number): { lat: number; lng: number } {
  const lng = (x / 20_037_508.34) * 180;
  const raw = (y / 20_037_508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((raw * Math.PI) / 180)) - Math.PI / 2);
  return { lat, lng };
}

/**
 * Ťažisko parcely. Podporujeme WGS84 a web mercator; S-JTSK (wkid 5514) by
 * chcel poriadnu transformáciu, takže radšej vrátime null než nezmysel.
 * TODO: podľa docs doplniť, v akom CRS ZBGIS geometriu naozaj vracia.
 */
function centroidOf(row: Bag): { lat: number | null; lng: number | null } {
  const direct = {
    lat: num(pick(row, ["lat", "latitude", "centroidlat", "y_wgs84"])),
    lng: num(pick(row, ["lng", "lon", "longitude", "centroidlng", "x_wgs84"])),
  };
  if (direct.lat !== null && direct.lng !== null) return direct;

  const geometry = row["geometry"];
  if (!isBag(geometry)) return { lat: null, lng: null };
  const x = num(geometry["x"]);
  const y = num(geometry["y"]);
  if (x === null || y === null) return { lat: null, lng: null };

  const sr = geometry["spatialReference"];
  const wkid = isBag(sr) ? num(sr["latestWkid"] ?? sr["wkid"]) : null;
  const crs =
    wkid === 4326
      ? "wgs84"
      : wkid === 102_100 || wkid === 3857
        ? "mercator"
        : wkid !== null
          ? "none"
          : (env("ZBGIS_GEOMETRY_CRS") ?? "mercator");

  if (crs === "wgs84") return { lat: y, lng: x };
  if (crs === "mercator") {
    const c = mercatorToWgs84(x, y);
    return { lat: c.lat, lng: c.lng };
  }
  return { lat: null, lng: null };
}

function roleOf(value: unknown): OwnerRole {
  const v = str(value)?.toLowerCase() ?? "";
  if (v.includes("sprav")) return "spravca";
  if (v.includes("vlastn") || v.includes("owner")) return "vlastnik";
  return "iny";
}

function ownerFrom(row: Bag, fallbackRole: OwnerRole): ParcelOwner | null {
  const flat = flatten(row);
  const name =
    str(pick(flat, ["name", "nazov", "meno", "menopriezvisko", "subjekt", "vlastnik", "titul"])) ??
    [str(pick(flat, ["priezvisko"])), str(pick(flat, ["krstnemeno", "meno"]))]
      .filter(Boolean)
      .join(" ");
  if (!name) return null;
  const rawRole = pick(flat, ["role", "rola", "typ", "typsubjektu", "vztah", "druhvztahu"]);
  return {
    name,
    role: rawRole === undefined ? fallbackRole : roleOf(rawRole),
    share: str(pick(flat, ["share", "podiel", "spoluvlastnickypodiel"])),
    id_no: str(pick(flat, ["idno", "ico", "rodnecislo", "identifikator", "id"])),
  };
}

function ownersFrom(flat: Bag): ParcelOwner[] {
  const out: ParcelOwner[] = [];
  const groups: Array<[string[], OwnerRole]> = [
    [["vlastnici", "owners", "vlastnictvo", "subjekty", "majitelia"], "vlastnik"],
    [["spravcovia", "spravca", "administrators", "sprava"], "spravca"],
    [["ostatniopravneni", "inesubjekty", "others"], "iny"],
  ];
  for (const [keys, fallbackRole] of groups) {
    const value = pick(flat, keys);
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (isBag(item)) {
        const owner = ownerFrom(item, fallbackRole);
        if (owner) out.push(owner);
      } else {
        const name = str(item);
        if (name) out.push({ name, role: fallbackRole, share: null, id_no: null });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verejné API
// ---------------------------------------------------------------------------

/** Zoznam parciel v katastrálnom území pre daný register (C alebo E). */
export async function fetchParcelsInKu(
  kuCode: string,
  register: ParcelRegister,
): Promise<ZbgisParcelRef[]> {
  const template = env("ZBGIS_PARCELS_URL");
  if (!template) throw new ZbgisNotConfiguredError("ZBGIS_PARCELS_URL");

  const paged = template.includes("{offset}");
  const out: ZbgisParcelRef[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < (paged ? MAX_PAGES : 1); page++) {
    const url = fillTemplate(template, {
      ku_code: kuCode,
      register,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      page,
    });
    const rows = rowsOf(await request(url));
    for (const row of rows) {
      const flat = flatten(row);
      const parcelNumber = str(
        pick(flat, ["parcelnumber", "cisloparcely", "cislo", "parcela", "number", "parcelnocislo"]),
      );
      if (!parcelNumber) continue;
      const parcelId =
        str(pick(flat, ["parcelid", "objectid", "id", "idparcely", "guid", "uid"])) ?? parcelNumber;
      if (seen.has(parcelId)) continue;
      seen.add(parcelId);
      const centroid = centroidOf(row);
      out.push({
        parcelId,
        parcelNumber,
        centroidLat: centroid.lat,
        centroidLng: centroid.lng,
        raw: row,
      });
    }
    if (!paged || rows.length < PAGE_SIZE) break;
  }

  return out;
}

/** Detail listu vlastníctva k parcele: LV, výmera, druh pozemku, vlastníci a správcovia. */
export async function fetchLvDetail(parcelId: string): Promise<ZbgisLvDetail> {
  const template = env("ZBGIS_LV_DETAIL_URL");
  if (!template) throw new ZbgisNotConfiguredError("ZBGIS_LV_DETAIL_URL");

  const payload = await request(fillTemplate(template, { parcel_id: parcelId, parcelId }));
  const first = rowsOf(payload)[0];
  const flat = flatten(isBag(payload) ? { ...payload, ...(first ?? {}) } : (first ?? {}));

  const owners = ownersFrom(flat);
  return {
    lvNumber: str(
      pick(flat, ["lvnumber", "cislolv", "lv", "cislolistuvlastnictva", "listvlastnictva"]),
    ),
    areaM2: num(pick(flat, ["aream2", "vymera", "vymeram2", "area", "vymeraparcely"])),
    landType: str(pick(flat, ["landtype", "druhpozemku", "druh", "kultura", "sposobvyuzitia"])),
    owners,
    hasSpf: ownersHaveSpf(owners),
    raw: payload,
  };
}
