import { useEffect, useRef, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { ensureI18n, detectClientLang, persistLang, DEFAULT_LANG, isLang, type Lang } from "./config";

const i18n = ensureI18n(DEFAULT_LANG);

export function I18nProvider({
  children,
  initialLang,
}: {
  children: ReactNode;
  initialLang?: Lang | string;
}) {
  const serverLang: Lang = isLang(initialLang) ? initialLang : DEFAULT_LANG;
  const [, setLang] = useState<Lang>(serverLang);
  const applied = useRef(false);

  // Zosúladenie jazyka pri renderovaní (server aj prvý render klienta = serverLang)
  if (i18n.language !== serverLang && !applied.current) {
    i18n.changeLanguage(serverLang);
  }

  useEffect(() => {
    applied.current = true;
    // Po hydratácii má prednosť uložená voľba používateľa, inak jazyk zo servera
    const detected = detectClientLang(serverLang);
    if (detected !== i18n.language) {
      i18n.changeLanguage(detected);
    }
    setLang(detected);
    if (typeof document !== "undefined") {
      document.documentElement.lang = detected;
    }
  }, [serverLang]);

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
