// Shared helpers for ITMS21+ OpenData API (https://api.itms21.sk/public/v1)
// Documentation: https://api.itms21.sk/public/v1/api-docs

export const ITMS_BASE_URL = "https://api.itms21.sk/public/v1";

export type ItmsVyzvaListItem = Record<string, unknown> & {
  id: number;
  kod: string;
  nazovSk?: string;
  datumVyhlasenia?: number | null;
  datumUkoncenia?: number | null;
  vyhlasena?: boolean;
  uzavreta?: boolean;
  zrusena?: boolean;
  typ?: string;
  druh?: string;
  sumaEu?: number | null;
  sumaSr?: number | null;
  program?: Record<string, unknown> | null;
  vyhlasovatel?: Record<string, unknown> | null;
  poskytovatel?: Record<string, unknown> | null;
  ziadatel?: Array<Record<string, unknown>>;
  miestoRealizacie?: Array<Record<string, unknown>>;
  updatedAt?: string | number | null;
};

export type ItmsVyzvaDetail = ItmsVyzvaListItem & {
  dokument?: Array<{ nazov?: string; uuid?: string }>;
  kontaktEmail?: string;
  kontaktTelefon?: string;
  kontaktnaOsoba?: string;
  kontaktNazov?: string;
  podmienkaPoskytnutiaPrispevku?: unknown;
  ukazovatelVysledkovy?: unknown;
  ukazovatelVystupovy?: unknown;
  oblastIntervencie?: unknown;
  typAkcieProgramu?: unknown;
  formaPodpory?: unknown;
  cielovaSkupina?: unknown;
  opravneneVydavky?: unknown;
  mieraSpolufinancovania?: unknown;
  sposobPodaniaZoNFP?: unknown;
  miestoPrePodanieZoNFP?: unknown;
  predpokladanaLehotaNaRozhodnutie?: unknown;
  zameranieProjektu?: string;
  zmenaAZrusenieVyzvy?: unknown;
};

export async function itmsFetch<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const url = new URL(ITMS_BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ITMS ${res.status} ${url.pathname}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function itmsListVyzvy(opts: {
  limit?: number;
  offset?: number;
  ajUkoncene?: boolean;
  druh?: string;
  modifiedSince?: number;
  expression?: "KOD" | "DATUMVYHLASENIA" | "NAZOV";
  ascending?: boolean;
}): Promise<{ size: number; offset: number; limit: number; results: ItmsVyzvaListItem[] }> {
  return await itmsFetch("/vyzva", {
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
    ajUkoncene: opts.ajUkoncene ?? true,
    druh: opts.druh,
    modifiedSince: opts.modifiedSince,
    expression: opts.expression ?? "DATUMVYHLASENIA",
    ascending: opts.ascending ?? false,
  });
}

export async function itmsGetVyzva(idOrKod: number | string): Promise<ItmsVyzvaDetail> {
  const path = typeof idOrKod === "number" ? `/vyzva/id/${idOrKod}` : `/vyzva/${encodeURIComponent(idOrKod)}`;
  return await itmsFetch<ItmsVyzvaDetail>(path);
}

function msToIso(ms: unknown): string | null {
  if (ms === null || ms === undefined) return null;
  const n = typeof ms === "number" ? ms : Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseIsoish(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return msToIso(v);
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function pickName(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const v = o.nazovSk ?? o.nazov ?? o.nazovEn;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function deriveStav(v: ItmsVyzvaListItem): string {
  if (v.zrusena) return "ZRUSENA";
  if (v.typ && typeof v.typ === "string") {
    const t = v.typ.toUpperCase();
    if (t === "OTVORENA" || t === "UZAVRETA" || t === "PLANOVANA") return t;
  }
  if (v.uzavreta) return "UZAVRETA";
  if (v.vyhlasena) return "OTVORENA";
  return "PLANOVANA";
}

/**
 * Normalize a raw ITMS vyzva (list item OR detail) into a row for `public.grant_calls`.
 * If a detail is passed, includes documents + structured_conditions + kontakt.
 */
export function normalizeVyzva(
  v: ItmsVyzvaDetail,
  opts: { source?: string } = {},
): Record<string, unknown> {
  const source = opts.source ?? "ITMS21";
  const stav = deriveStav(v);

  const ziadatelia = Array.isArray(v.ziadatel)
    ? v.ziadatel.map((z) => ({
        kod: (z as Record<string, unknown>).kod ?? null,
        nazov: pickName(z),
      }))
    : [];
  const miesta = Array.isArray(v.miestoRealizacie)
    ? v.miestoRealizacie.map((m) => ({
        kod: (m as Record<string, unknown>).kod ?? null,
        nazov: pickName(m),
      }))
    : [];

  const documents = Array.isArray(v.dokument)
    ? v.dokument
        .filter((d) => d && d.uuid)
        .map((d) => ({ uuid: d.uuid, nazov: d.nazov ?? null }))
    : [];

  const kontakt = (v.kontaktEmail || v.kontaktTelefon || v.kontaktnaOsoba || v.kontaktNazov)
    ? {
        nazov: v.kontaktNazov ?? null,
        osoba: v.kontaktnaOsoba ?? null,
        email: v.kontaktEmail ?? null,
        telefon: v.kontaktTelefon ?? null,
      }
    : null;

  const structured =
    v.podmienkaPoskytnutiaPrispevku !== undefined
      ? {
          podmienkaPoskytnutiaPrispevku: v.podmienkaPoskytnutiaPrispevku ?? null,
          oblastIntervencie: v.oblastIntervencie ?? null,
          typAkcieProgramu: v.typAkcieProgramu ?? null,
          formaPodpory: v.formaPodpory ?? null,
          cielovaSkupina: v.cielovaSkupina ?? null,
          opravneneVydavky: v.opravneneVydavky ?? null,
          mieraSpolufinancovania: v.mieraSpolufinancovania ?? null,
          sposobPodaniaZoNFP: v.sposobPodaniaZoNFP ?? null,
          miestoPrePodanieZoNFP: v.miestoPrePodanieZoNFP ?? null,
          predpokladanaLehotaNaRozhodnutie: v.predpokladanaLehotaNaRozhodnutie ?? null,
          zmenaAZrusenieVyzvy: v.zmenaAZrusenieVyzvy ?? null,
          ukazovatelVysledkovy: v.ukazovatelVysledkovy ?? null,
          ukazovatelVystupovy: v.ukazovatelVystupovy ?? null,
        }
      : null;

  return {
    source,
    source_id: String(v.id),
    kod: v.kod ?? null,
    title: v.nazovSk ?? v.kod ?? "(bez názvu)",
    program: pickName(v.program),
    poskytovatel: pickName(v.poskytovatel),
    vyhlasovatel: pickName(v.vyhlasovatel),
    suma_eu: v.sumaEu ?? null,
    suma_sr: v.sumaSr ?? null,
    currency: "EUR",
    datum_vyhlasenia: msToIso(v.datumVyhlasenia),
    deadline: msToIso(v.datumUkoncenia),
    stav,
    druh: v.druh ?? null,
    zameranie: v.zameranieProjektu ?? null,
    opravneny_ziadatel: ziadatelia,
    miesto_realizacie: miesta,
    oblasti: [],
    kontakt,
    documents,
    structured_conditions: structured,
    detail_url: v.kod ? `https://itms2014.sk/vyzva?id=${v.id}` : null,
    itms_updated_at: parseIsoish(v.updatedAt),
    raw: v,
  };
}
