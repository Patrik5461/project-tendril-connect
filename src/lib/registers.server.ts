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

async function fetchRpo(ico: string): Promise<any | null> {
  try {
    const url = `https://api.statistics.sk/rpo/v1/search?identifier=${encodeURIComponent(ico)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.results?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchRegisteruz(ico: string): Promise<any | null> {
  // registeruz.sk – Register účtovných závierok, verejné JSON API
  try {
    const idxUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${encodeURIComponent(ico)}&zmenene-od=2000-01-01`;
    const idxRes = await fetch(idxUrl, { headers: { Accept: "application/json" } });
    if (!idxRes.ok) return null;
    const idxJson: any = await idxRes.json();
    const idList: number[] = idxJson?.id ?? idxJson?.ids ?? [];
    if (!idList.length) return null;
    const id = idList[0];
    const detailRes = await fetch(`https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${id}`, {
      headers: { Accept: "application/json" },
    });
    if (!detailRes.ok) return null;
    const detail: any = await detailRes.json();

    // Roky závierok (metadáta)
    const zavRes = await fetch(
      `https://www.registeruz.sk/cruz-public/api/uctovne-zavierky?ico=${encodeURIComponent(ico)}&zmenene-od=2000-01-01`,
      { headers: { Accept: "application/json" } },
    );
    const zavJson: any = zavRes.ok ? await zavRes.json() : null;
    return { detail, zavierky: zavJson };
  } catch {
    return null;
  }
}

/** Lookup SK-NACE name for a code (e.g. "62.01" → "Počítačové programovanie…"). Prefix match on 2-digit division. */
export async function lookupSkNaceName(
  code: string | null | undefined,
  sb: { rpc: (...a: any[]) => Promise<any>; from: (...a: any[]) => any },
): Promise<string | null> {
  if (!code) return null;
  const twoDigit = code.replace(/\D/g, "").slice(0, 2);
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
  sb: { rpc: (...a: any[]) => Promise<any>; from: (...a: any[]) => any },
): Promise<RegistryCompany> {
  const ico = normalizeIco(icoInput);
  const errors: string[] = [];

  const [rpo, ruz] = await Promise.all([fetchRpo(ico), fetchRegisteruz(ico)]);

  if (!rpo) errors.push("RPO: firma nenájdená alebo API nedostupné");
  if (!ruz) errors.push("registeruz: firma nenájdená alebo bez záznamov");

  const rpoAddr = rpo?.addresses?.[0] ?? {};
  const ruzDetail = ruz?.detail ?? {};

  const roky_zavierok: number[] = Array.from(
    new Set(
      (ruz?.zavierky?.zavierky ?? ruz?.zavierky?.items ?? [])
        .map((z: any) => Number(z?.obdobieOd?.slice?.(0, 4) ?? z?.rok))
        .filter((n: number) => Number.isFinite(n) && n > 1990 && n < 2100),
    ),
  ).sort((a: any, b: any) => (b as number) - (a as number));

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
