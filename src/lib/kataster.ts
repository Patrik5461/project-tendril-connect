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

// TODO: presný tvar deep-linku patrí do docs/zbgis-endpoints.md. Kým dokumentácia
// nie je, adresa sa dá prebiť premennou VITE_ZBGIS_PARCEL_URL bez zásahu do kódu.
const DEFAULT_PARCEL_LINK =
  "https://zbgis.skgeodesy.sk/mkzbgis/sk/kataster/detail/kataster/parcela-{register}/{ku_code}/{parcel_number}";

function parcelLinkTemplate(): string {
  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  return (env?.["VITE_ZBGIS_PARCEL_URL"] as string | undefined) || DEFAULT_PARCEL_LINK;
}

export function zbgisParcelUrl(
  kuCode: string,
  register: ParcelRegister,
  parcelNumber: string,
): string {
  return parcelLinkTemplate()
    .replace("{register}", register.toLowerCase())
    .replace("{ku_code}", encodeURIComponent(kuCode))
    .replace("{parcel_number}", encodeURIComponent(parcelNumber));
}

export function formatArea(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined || !Number.isFinite(Number(m2))) return "—";
  return `${Number(m2).toLocaleString("sk-SK", { maximumFractionDigits: 0 })} m²`;
}
