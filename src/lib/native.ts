import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

/** True len vnútri natívnej Capacitor appky (iOS/Android). Na webe vždy false. */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** 'ios' | 'android' | 'web' */
export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  try {
    const p = Capacitor.getPlatform();
    return p === "ios" || p === "android" ? p : "web";
  } catch {
    return "web";
  }
}

/**
 * SSR-safe hook. Prvý render vždy vráti false (rovnako ako server),
 * po hydratácii sa prepne na skutočnú hodnotu.
 */
export function useIsNative(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNative());
  }, []);
  return native;
}

/** Externý odkaz: v appke cez in-app browser, na webe klasicky nové okno. */
export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
