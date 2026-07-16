import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import skCommon from "./locales/sk/common.json";
import csCommon from "./locales/cs/common.json";
import enCommon from "./locales/en/common.json";
import deCommon from "./locales/de/common.json";
import skMarketing from "./locales/sk/marketing.json";
import csMarketing from "./locales/cs/marketing.json";
import enMarketing from "./locales/en/marketing.json";
import deMarketing from "./locales/de/marketing.json";

export const SUPPORTED_LANGS = ["sk", "cs", "en", "de"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "sk";

export const LANG_LABELS: Record<Lang, { label: string; flag: string; name: string }> = {
  sk: { label: "SK", flag: "🇸🇰", name: "Slovenčina" },
  cs: { label: "CS", flag: "🇨🇿", name: "Čeština" },
  en: { label: "EN", flag: "🇬🇧", name: "English" },
  de: { label: "DE", flag: "🇩🇪", name: "Deutsch" },
};

let initialized = false;

export function ensureI18n(initialLang?: Lang) {
  if (initialized) return i18n;
  i18n.use(initReactI18next).init({
    resources: {
      sk: { common: skCommon },
      cs: { common: csCommon },
      en: { common: enCommon },
      de: { common: deCommon },
    },
    lng: initialLang ?? DEFAULT_LANG,
    fallbackLng: DEFAULT_LANG,
    defaultNS: "common",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  initialized = true;
  return i18n;
}

export function isLang(v: string | null | undefined): v is Lang {
  return !!v && (SUPPORTED_LANGS as readonly string[]).includes(v);
}

export function detectClientLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem("tendrik-lang");
    if (isLang(stored)) return stored;
    const cookieMatch = document.cookie.match(/(?:^|;\s*)tendrik-lang=([a-z]{2})/i);
    if (cookieMatch && isLang(cookieMatch[1])) return cookieMatch[1] as Lang;
    const nav = (navigator.language || "").slice(0, 2).toLowerCase();
    if (isLang(nav)) return nav;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANG;
}

export function persistLang(lang: Lang) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("tendrik-lang", lang);
    document.cookie = `tendrik-lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    /* ignore */
  }
}

export default i18n;
