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

/**
 * Značka pre natívne-only CSS. Musí byť na `html` už pri prvej obrazovke
 * (prihlásenie), preto sa nastavuje v roote, nie až v prihlásenej časti.
 */
export function applyNativeShell(): void {
  if (!isNative()) return;
  document.documentElement.classList.add("capacitor-native");
}

/**
 * Bez explicitného nastavenia použije iOS systémový štýl, ktorý pri svetlom
 * pozadí appky môže vykresliť biely čas a signál na bielej hlavičke. Tendrik
 * tmavý režim neprepína, takže natrvalo fixujeme tmavý text.
 */
export async function applyNativeStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Light = tmavý text pre svetlé pozadie (nie naopak).
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    /* plugin nemusí byť v starom builde — appka funguje aj bez toho */
  }
}

/**
 * Krátky hmatový impulz pri dotyku (prepnutie záložky a podobne).
 * Na webe a pri chýbajúcom plugine nerobí nič, takže volajúci sa nemusí
 * strážiť, či beží v appke.
 */
export async function tapFeedback(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}

/**
 * Hmatové potvrdenie dokončenia. AI analýza beží desiatky sekúnd a používateľ
 * medzitým typicky odloží telefón — toto mu dá vedieť aj bez pozerania.
 */
export async function successFeedback(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* ignore */
  }
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
