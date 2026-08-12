// Slovak business registers – identification data only (financial figures & references stay manual).

export type RegistryCompany = {
  ico: string;
  dic?: string | null;
  nazov?: string | null;
  adresa?: string | null;
  psc?: string | null;
  mesto?: string | null;
  pravna_forma?: string | null;
  datum_vzniku?: string | null; // ISO date
  registrovy_sud?: string | null;
  sk_nace_code?: string | null;
  sk_nace_name?: string | null;
  velkost_kategoria?: string | null;
  roky_zavierok?: number[];
  sources: {
    rpo?: any;
    registeruz?: any;
  };
  errors: string[];
};

function normalizeIco(ico: string): string {
  return ico.replace(/\D+/g, "").padStart(8, "0").slice(-8);
}

/**
 * Registre sú cudzie služby a občas visia. Bez limitu by na nich čakal
 * používateľ aj serverový request, tak radšej vrátime null a doplní sa ručne.
 */
const REGISTER_TIMEOUT_MS = 8000;

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchRpo(ico: string): Promise<any | null> {
  const json = await fetchJson(
    `https://api.statistics.sk/rpo/v1/search?identifier=${encodeURIComponent(ico)}`,
  );
  return json?.results?.[0] ?? null;
}

async function fetchRegisteruz(ico: string, includeZavierky: boolean): Promise<any | null> {
  // registeruz.sk – Register účtovných závierok, verejné JSON API
  const idxJson = await fetchJson(
    `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${encodeURIComponent(ico)}&zmenene-od=2000-01-01`,
  );
  if (!idxJson) return null;
  const idList: number[] = idxJson?.id ?? idxJson?.ids ?? [];
  if (!idList.length) return null;

  // Zoznam závierok nezávisí od detailu, tak nech idú súčasne. Ťahá sa len
  // na vyžiadanie — trvá rádovo 5 sekúnd, kým zvyšné volania desatiny,
  // a roky závierok potrebuje iba admin testovací režim analýzy.
  const [detail, zavierky] = await Promise.all([
    fetchJson(`https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${idList[0]}`),
    includeZavierky
      ? fetchJson(
          `https://www.registeruz.sk/cruz-public/api/uctovne-zavierky?ico=${encodeURIComponent(ico)}&zmenene-od=2000-01-01`,
        )
      : Promise.resolve(null),
  ]);
  if (!detail) return null;
  return { detail, zavierky };
}

/** Lookup SK-NACE name for a code (e.g. "62.01" → "Počítačové programovanie…"). Prefix match on 2-digit division. */
export async function lookupSkNaceName(
  code: string | null | undefined,
  sb: any,
): Promise<string | null> {
  if (!code) return null;
  const twoDigit = String(code).replace(/\D/g, "").slice(0, 2);
  if (!twoDigit) return null;
  const { data } = await sb.from("sk_nace").select("code,name").eq("code", twoDigit).maybeSingle();
  return data?.name ?? null;
}

/**
 * Fetch identification data for an IČO from Slovak business registers.
 * Returns all data pulled (identification only). Financial numbers stay manual.
 */
export async function fetchCompanyFromRegisters(
  icoInput: string,
  sb: any,
  opts: { includeZavierky?: boolean } = {},
): Promise<RegistryCompany> {
  const ico = normalizeIco(icoInput);
  const errors: string[] = [];

  const [rpo, ruz] = await Promise.all([
    fetchRpo(ico),
    fetchRegisteruz(ico, opts.includeZavierky ?? false),
  ]);

  if (!rpo) errors.push("RPO: firma nenájdená alebo API nedostupné");
  if (!ruz) errors.push("registeruz: firma nenájdená alebo bez záznamov");

  const rpoAddr = rpo?.addresses?.[0] ?? {};
  const ruzDetail = ruz?.detail ?? {};

  const rokyRaw: number[] = ((ruz?.zavierky?.zavierky ?? ruz?.zavierky?.items ?? []) as any[])
    .map((z: any) => Number(z?.obdobieOd?.slice?.(0, 4) ?? z?.rok))
    .filter((n: number) => Number.isFinite(n) && n > 1990 && n < 2100);
  const roky_zavierok: number[] = Array.from(new Set<number>(rokyRaw)).sort((a, b) => b - a);

  const skNaceCode =
    ruzDetail?.skNace ?? ruzDetail?.sknace ?? rpo?.mainActivityCode ?? null;
  const skNaceName = await lookupSkNaceName(skNaceCode, sb);

  return {
    ico,
    dic: ruzDetail?.dic ?? null,
    nazov: rpo?.fullNames?.[0]?.value ?? ruzDetail?.nazovUJ ?? null,
    adresa:
      [rpoAddr?.street, rpoAddr?.buildingNumber].filter(Boolean).join(" ") ||
      ruzDetail?.ulica ||
      null,
    psc: rpoAddr?.postalCodes?.[0] ?? ruzDetail?.psc ?? null,
    mesto: rpoAddr?.municipality ?? ruzDetail?.mesto ?? null,
    pravna_forma:
      rpo?.legalForms?.[0]?.value ?? ruzDetail?.pravnaForma ?? null,
    datum_vzniku: rpo?.establishment ?? null,
    registrovy_sud: rpo?.sourceRegister ?? null,
    sk_nace_code: skNaceCode ? String(skNaceCode) : null,
    sk_nace_name: skNaceName,
    velkost_kategoria: ruzDetail?.velkostOrganizacie ?? null,
    roky_zavierok,
    sources: { rpo, registeruz: ruz },
    errors,
  };
}
