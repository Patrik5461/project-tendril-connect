import { useEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { ensureI18n, detectClientLang, persistLang, DEFAULT_LANG, type Lang } from "./config";

const i18n = ensureI18n(DEFAULT_LANG);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const detected = detectClientLang();
    if (detected !== i18n.language) {
      i18n.changeLanguage(detected);
    }
    setLang(detected);
    if (typeof document !== "undefined") {
      document.documentElement.lang = detected;
    }
  }, []);

  useEffect(() => {
    const onChange = (lng: string) => {
      setLang(lng as Lang);
      if (typeof document !== "undefined") {
        document.documentElement.lang = lng;
      }
      persistLang(lng as Lang);
    };
    i18n.on("languageChanged", onChange);
    return () => {
      i18n.off("languageChanged", onChange);
    };
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function changeLang(lang: Lang) {
  i18n.changeLanguage(lang);
}

export function currentLang(): Lang {
  return (i18n.language as Lang) ?? DEFAULT_LANG;
}
