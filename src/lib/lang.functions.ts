import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_LANG, type Lang } from "@/i18n/config";

export const getInitialLang = createServerFn({ method: "GET" }).handler(async (): Promise<Lang> => {
  const { detectServerLang } = await import("./detect-lang.server");
  return detectServerLang();
});

export { DEFAULT_LANG };
