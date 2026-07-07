// Simple GDPR/ePrivacy cookie consent store (localStorage).
// Only two categories: necessary (always on) and analytics (opt-in, default off).

export type ConsentCategories = {
  necessary: true;
  analytics: boolean;
};

export type ConsentRecord = {
  categories: ConsentCategories;
  timestamp: number;
  version: number;
};

const STORAGE_KEY = "tendrik-cookie-consent";
const CURRENT_VERSION = 1;
const EVENT_CHANGED = "tendrik:cookie-consent-changed";
export const EVENT_OPEN_SETTINGS = "tendrik:open-cookie-settings";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getConsent(): ConsentRecord | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (!parsed || parsed.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setConsent(analytics: boolean) {
  if (!isBrowser()) return;
  const record: ConsentRecord = {
    categories: { necessary: true, analytics },
    timestamp: Date.now(),
    version: CURRENT_VERSION,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  window.dispatchEvent(new CustomEvent(EVENT_CHANGED, { detail: record }));
}

export function clearConsent() {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT_CHANGED, { detail: null }));
}

export function hasAnalyticsConsent(): boolean {
  return getConsent()?.categories.analytics === true;
}

export function subscribeConsent(cb: (r: ConsentRecord | null) => void) {
  if (!isBrowser()) return () => {};
  const handler = (e: Event) => cb((e as CustomEvent).detail ?? null);
  window.addEventListener(EVENT_CHANGED, handler);
  return () => window.removeEventListener(EVENT_CHANGED, handler);
}

export function openCookieSettings() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(EVENT_OPEN_SETTINGS));
}
