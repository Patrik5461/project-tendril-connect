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

/**
 * Bez `viewport-fit=cover` vracia iOS pre env(safe-area-inset-*) nulu,
 * takže safe-top / safe-x / safe-bottom utility by neurobili nič a obsah
 * by sa schoval pod výrez a domovský indikátor. Meníme to len v natívnej
 * appke, aby sa vzhľad webu v prehliadači nezmenil.
 */
export function applyNativeViewportFit(): void {
  if (!isNative()) return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const content = meta.getAttribute("content") ?? "";
  if (content.includes("viewport-fit")) return;
  meta.setAttribute("content", `${content}, viewport-fit=cover`);
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
