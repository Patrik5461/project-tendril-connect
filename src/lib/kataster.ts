// Zdieľané typy a pomôcky modulu Kataster (admin-only).
// Tento súbor končí aj v klientskom bundli – nesmie obsahovať nič tajné.

export type ParcelRegister = "C" | "E";
export type SyncRegister = ParcelRegister | "both";
export type SyncMode = "test" | "full";
export type OwnerRole = "vlastnik" | "spravca" | "iny";

export type ParcelOwner = {
  name: string;
  role: OwnerRole;
  share: string | null;
  id_no: string | null;
};

export type CadastralParcel = {
  id: string;
  ku_code: string;
  parcel_register: ParcelRegister;
  parcel_number: string;
  lv_number: string | null;
  area_m2: number | null;
  land_type: string | null;
  owners: ParcelOwner[] | null;
  has_spf: boolean;
  centroid_lat: number | null;
  centroid_lng: number | null;
  fetched_at: string;
};

export type KuRow = { ku_code: string; ku_name: string; okres: string | null; kraj: string | null };

export type SyncRun = {
  id: string;
  ku_code: string;
  register: SyncRegister;
  mode: SyncMode;
  started_at: string;
  finished_at: string | null;
  status: "running" | "done" | "failed" | "blocked";
  parcels_total: number;
  parcels_done: number;
  spf_count: number;
  errors: Array<{ parcel?: string; message: string }> | null;
};

/** Test sync ide len po prvých N parciel – nech sa dá endpoint overiť za pár desiatok sekúnd. */
export const TEST_PARCEL_LIMIT = 20;

// Diakritika preč, malé písmená, jedna medzera. Kataster píše mená raz s
// diakritikou, raz bez nej, a občas s dvojitými medzerami.
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Je to Slovenský pozemkový fond? Berieme celý názov (aj bez diakritiky)
 * aj skratku SPF, ale len ako samostatné slovo – inak by sa chytili
 * náhodné podreťazce typu "spfk" alebo IČO s písmenami.
 */
export function isSpfOwner(name: string): boolean {
  const n = normalizeName(name);
  if (!n) return false;
  if (n.includes("slovensky pozemkovy fond")) return true;
  return /(^|[^a-z0-9])spf([^a-z0-9]|$)/.test(n);
}

export function ownersHaveSpf(owners: ParcelOwner[] | null | undefined): boolean {
  return (owners ?? []).some((o) => isSpfOwner(o.name ?? ""));
}

export const OWNER_ROLE_LABEL: Record<OwnerRole, string> = {
  vlastnik: "vlastník",
  spravca: "správca",
  iny: "iný",
};

// Overené 4. 9. 2026 sledovaním samotnej appky ZBGIS: klient beží na /mapka/
// (staré /mkzbgis/ len redirectuje) a detail parcely otvára bodová
// identifikácia, nie parcelné číslo. Preto linkujeme cez ťažisko.
// Prebiť sa to dá premennou VITE_ZBGIS_PARCEL_URL, zástupné znaky
// {lat}, {lng}, {register}, {ku_code}, {parcel_number}.
const DEFAULT_POINT_LINK =
  "https://zbgis.skgeodesy.sk/mapka/sk/kataster/identification/point/{lat},{lng}?pos={lat},{lng},19";
const MAP_FALLBACK = "https://zbgis.skgeodesy.sk/mapka/sk/kataster";

function parcelLinkTemplate(): string | undefined {
  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  return env?.["VITE_ZBGIS_PARCEL_URL"] as string | undefined;
}

/**
 * Odkaz na parcelu v ZBGIS. Bez ťažiska sa presné miesto ukázať nedá,
 * vtedy vraciame aspoň mapu katastra.
 */
export function zbgisParcelUrl(parcel: {
  ku_code: string;
  parcel_register: ParcelRegister;
  parcel_number: string;
  centroid_lat?: number | null;
  centroid_lng?: number | null;
}): string {
  const template = parcelLinkTemplate() ?? DEFAULT_POINT_LINK;
  const lat = parcel.centroid_lat;
  const lng = parcel.centroid_lng;
  if (
    template.includes("{lat}") &&
    (lat === null || lat === undefined || lng === null || lng === undefined)
  ) {
    return MAP_FALLBACK;
  }
  return template
    .replace(/\{lat\}/g, String(lat))
    .replace(/\{lng\}/g, String(lng))
    .replace(/\{register\}/g, parcel.parcel_register.toLowerCase())
    .replace(/\{ku_code\}/g, encodeURIComponent(parcel.ku_code))
    .replace(/\{parcel_number\}/g, encodeURIComponent(parcel.parcel_number));
}

export function formatArea(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined || !Number.isFinite(Number(m2))) return "—";
  return `${Number(m2).toLocaleString("sk-SK", { maximumFractionDigits: 0 })} m²`;
}
