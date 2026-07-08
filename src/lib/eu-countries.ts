// EU country utilities used across the app.

export const EU_COUNTRIES: Record<string, string> = {
  AT: "Rakúsko",
  BE: "Belgicko",
  BG: "Bulharsko",
  HR: "Chorvátsko",
  CY: "Cyprus",
  CZ: "Česko",
  DK: "Dánsko",
  EE: "Estónsko",
  FI: "Fínsko",
  FR: "Francúzsko",
  DE: "Nemecko",
  GR: "Grécko",
  HU: "Maďarsko",
  IE: "Írsko",
  IT: "Taliansko",
  LV: "Lotyšsko",
  LT: "Litva",
  LU: "Luxembursko",
  MT: "Malta",
  NL: "Holandsko",
  PL: "Poľsko",
  PT: "Portugalsko",
  RO: "Rumunsko",
  SK: "Slovensko",
  SI: "Slovinsko",
  ES: "Španielsko",
  SE: "Švédsko",
};

// Sorted by Slovak name for UI listings.
export const EU_COUNTRY_LIST: { code: string; name: string }[] = Object.entries(EU_COUNTRIES)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name, "sk"));

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  return EU_COUNTRIES[code.toUpperCase()] ?? code;
}

export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const A = 0x1f1e6;
  const up = code.toUpperCase();
  return String.fromCodePoint(A + up.charCodeAt(0) - 65, A + up.charCodeAt(1) - 65);
}

export const ALL_COUNTRY_CODES = Object.keys(EU_COUNTRIES);
