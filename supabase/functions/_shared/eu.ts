// Shared EU country helpers for edge functions.

export const EU_COUNTRIES: Record<string, string> = {
  AT: "Rakúsko", BE: "Belgicko", BG: "Bulharsko", HR: "Chorvátsko",
  CY: "Cyprus",  CZ: "Česko",    DK: "Dánsko",    EE: "Estónsko",
  FI: "Fínsko",  FR: "Francúzsko", DE: "Nemecko", GR: "Grécko",
  HU: "Maďarsko", IE: "Írsko",   IT: "Taliansko", LV: "Lotyšsko",
  LT: "Litva",   LU: "Luxembursko", MT: "Malta", NL: "Holandsko",
  PL: "Poľsko",  PT: "Portugalsko", RO: "Rumunsko", SK: "Slovensko",
  SI: "Slovinsko", ES: "Španielsko", SE: "Švédsko",
};

// TED / ISO alpha-3 → alpha-2 for EU countries.
const A3_TO_A2: Record<string, string> = {
  AUT: "AT", BEL: "BE", BGR: "BG", HRV: "HR", CYP: "CY", CZE: "CZ",
  DNK: "DK", EST: "EE", FIN: "FI", FRA: "FR", DEU: "DE", GRC: "GR",
  HUN: "HU", IRL: "IE", ITA: "IT", LVA: "LV", LTU: "LT", LUX: "LU",
  MLT: "MT", NLD: "NL", POL: "PL", PRT: "PT", ROU: "RO", SVK: "SK",
  SVN: "SI", ESP: "ES", SWE: "SE",
};

// NUTS uses EL for Greece.
const NUTS_PREFIX_ALIAS: Record<string, string> = { EL: "GR" };

export function a2FromNuts(code: string): string | null {
  if (!code || code.length < 2) return null;
  const p = code.slice(0, 2).toUpperCase();
  const mapped = NUTS_PREFIX_ALIAS[p] ?? p;
  return EU_COUNTRIES[mapped] ? mapped : null;
}

export function a2FromA3(code: string): string | null {
  const a2 = A3_TO_A2[code.toUpperCase()];
  return a2 && EU_COUNTRIES[a2] ? a2 : null;
}

export function countryName(a2: string | null): string | null {
  if (!a2) return null;
  return EU_COUNTRIES[a2.toUpperCase()] ?? null;
}
