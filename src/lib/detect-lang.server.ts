import { getRequest } from "@tanstack/react-start/server";
import { DEFAULT_LANG, isLang, type Lang } from "@/i18n/config";

/** Mapovanie krajiny (geo IP z hlavičky CDN) na jazyk */
const COUNTRY_TO_LANG: Record<string, Lang> = {
  SK: "sk",
  CZ: "cs",
  DE: "de",
  AT: "de",
  CH: "de",
};

function fromAcceptLanguage(header: string | null): Lang | null {
  if (!header) return null;
  const parts = header
    .split(",")
    .map((p) => {
      const [tag, q] = p.trim().split(";q=");
      return { tag: (tag ?? "").trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((p) => p.tag)
    .sort((a, b) => b.q - a.q);
  for (const p of parts) {
    const base = p.tag.slice(0, 2);
    if (isLang(base)) return base;
  }
  return null;
}

/** Poradie: cookie (voľba používateľa) → jazyk prehliadača → krajina podľa IP → default */
export function detectServerLang(): Lang {
  try {
    const request = getRequest();
    const headers = request.headers;

    const cookie = headers.get("cookie") ?? "";
    const match = cookie.match(/(?:^|;\s*)tendrik-lang=([a-zA-Z]{2})/);
    if (match && isLang(match[1]?.toLowerCase())) return match[1]!.toLowerCase() as Lang;

    const accept = fromAcceptLanguage(headers.get("accept-language"));
    if (accept) return accept;

    const country = (
      headers.get("cf-ipcountry") ||
      headers.get("x-vercel-ip-country") ||
      headers.get("x-country-code") ||
      ""
    ).toUpperCase();
    if (country && COUNTRY_TO_LANG[country]) return COUNTRY_TO_LANG[country];
  } catch {
    /* mimo requestu */
  }
  return DEFAULT_LANG;
}
