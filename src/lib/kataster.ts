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

export type KuRow = {
  ku_code: string;
  ku_name: string;
  obec: string | null;
  okres: string | null;
  kraj: string | null;
};

/** Riadok zo zoznamu nezistených vlastníkov SPF — úroveň listu vlastníctva. */
export type SpfFolio = {
  id: string;
  ku_code: string;
  lv_number: string;
  owners_count: number;
  source: string;
  valid_as_of: string | null;
  updated_at: string;
};

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

// Overené 4. 9. 2026 priamo v appke ZBGIS: klient beží na /mapka/ (staré
// /mkzbgis/ len redirectuje) a detail sa otvára routou detail/kataster/<typ>,
// kde typ je parcela-c, parcela-e alebo list-vlastnictva. Berie kód k.ú. podľa
// ÚGKK a číslo parcely/LV, čiže presne to, čo máme v databáze.
//
// Pozor: samotný obsah detailu si ZBGIS pýta cez reCAPTCHA — odkaz otvorí
// správny panel, používateľ potvrdí „Nie som robot" a až potom vidí údaje.
const ZBGIS_DETAIL = "https://zbgis.skgeodesy.sk/mapka/sk/kataster/detail/kataster";

function overrideTemplate(): string | undefined {
  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  return env?.["VITE_ZBGIS_PARCEL_URL"] as string | undefined;
}

/** Odkaz na parcelu v ZBGIS. */
export function zbgisParcelUrl(parcel: {
  ku_code: string;
  parcel_register: ParcelRegister;
  parcel_number: string;
  centroid_lat?: number | null;
  centroid_lng?: number | null;
}): string {
  const register = parcel.parcel_register.toLowerCase();
  const template = overrideTemplate();
  if (template) {
    return template
      .replace(/\{lat\}/g, String(parcel.centroid_lat ?? ""))
      .replace(/\{lng\}/g, String(parcel.centroid_lng ?? ""))
      .replace(/\{register\}/g, register)
      .replace(/\{ku_code\}/g, encodeURIComponent(parcel.ku_code))
      .replace(/\{parcel_number\}/g, encodeURIComponent(parcel.parcel_number));
  }
  return `${ZBGIS_DETAIL}/parcela-${register}/${encodeURIComponent(parcel.ku_code)}/${encodeURIComponent(parcel.parcel_number)}`;
}

/** Odkaz na list vlastníctva v ZBGIS. */
export function zbgisFolioUrl(kuCode: string, lvNumber: string): string {
  return `${ZBGIS_DETAIL}/list-vlastnictva/${encodeURIComponent(kuCode)}/${encodeURIComponent(lvNumber)}`;
}

export function formatArea(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined || !Number.isFinite(Number(m2))) return "—";
  return `${Number(m2).toLocaleString("sk-SK", { maximumFractionDigits: 0 })} m²`;
}

/**
 * Supabase vracia chyby, ktoré majú občas prázdny `message` (napr. timeout).
 * Prázdny toast vyzerá ako rozbitá appka, tak vždy vrátime aspoň niečo.
 */
export function errorText(e: unknown): string {
  if (typeof e === "string" && e.trim()) return e;
  const err = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  const parts = [err?.message, err?.details, err?.hint]
    .map((x) => (x ?? "").toString().trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" · ");
  if (err?.code) return `Chyba ${err.code}`;
  return "Neznáma chyba – detail je v konzole prehliadača.";
}
