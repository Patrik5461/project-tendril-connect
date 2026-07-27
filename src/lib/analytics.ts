// Google tag layer for Tendrik – GTM + GA4 + Google Ads, consent-aware.
// Nothing is loaded until the visitor grants analytics consent (Consent Mode v2).

export type ConversionKey =
  | "sign_up"
  | "onboarding_completed"
  | "ai_analysis"
  | "subscription_purchase"
  | "radar_created"
  | "contact_submit";

export const CONVERSION_KEYS: { key: ConversionKey; label: string; description: string }[] = [
  { key: "sign_up", label: "Registrácia", description: "Vytvorenie účtu (štart 30-dňového trialu)" },
  { key: "onboarding_completed", label: "Dokončený onboarding", description: "Používateľ nastavil kľúčové slová / regióny" },
  { key: "ai_analysis", label: "AI analýza", description: "Spustenie AI analýzy zákazky alebo grantu" },
  { key: "subscription_purchase", label: "Zaplatené predplatné", description: "Úspešná platba (posiela sa aj hodnota v EUR)" },
  { key: "radar_created", label: "Vytvorený radar", description: "Nový radar na zákazky alebo granty" },
  { key: "contact_submit", label: "Odoslaný kontaktný formulár", description: "Dopyt cez /kontakt" },
];

export type AnalyticsConfig = {
  enabled: boolean;
  gtm_id: string;
  ga4_id: string;
  ads_id: string;
  conversion_labels: Partial<Record<ConversionKey, string>>;
  debug: boolean;
};

export const EMPTY_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false,
  gtm_id: "",
  ga4_id: "",
  ads_id: "",
  conversion_labels: {},
  debug: false,
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __tendrikAnalytics?: { config: AnalyticsConfig; loaded: boolean };
  }
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function log(...args: unknown[]) {
  if (isBrowser() && window.__tendrikAnalytics?.config.debug) console.info("[analytics]", ...args);
}

function ensureGtagStub() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
}

function injectScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

export function getConfig(): AnalyticsConfig {
  if (!isBrowser()) return EMPTY_ANALYTICS_CONFIG;
  return window.__tendrikAnalytics?.config ?? EMPTY_ANALYTICS_CONFIG;
}

/** Sets Consent Mode v2 defaults (everything denied) before any tag loads. */
export function initConsentDefaults(config: AnalyticsConfig) {
  if (!isBrowser()) return;
  window.__tendrikAnalytics = { config, loaded: window.__tendrikAnalytics?.loaded ?? false };
  ensureGtagStub();
  window.gtag!("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: 500,
  });
}

export function updateConsent(granted: boolean) {
  if (!isBrowser() || !window.gtag) return;
  const v = granted ? "granted" : "denied";
  window.gtag("consent", "update", {
    ad_storage: v,
    ad_user_data: v,
    ad_personalization: v,
    analytics_storage: v,
  });
  log("consent update", v);
}

/** Loads GTM (preferred) or gtag.js directly. Idempotent. */
export function loadTags(config: AnalyticsConfig) {
  if (!isBrowser()) return;
  if (!config.enabled) return;
  const state = window.__tendrikAnalytics;
  if (state?.loaded) return;
  ensureGtagStub();
  window.__tendrikAnalytics = { config, loaded: true };

  if (config.gtm_id) {
    window.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" });
    injectScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(config.gtm_id)}`);
    log("GTM loaded", config.gtm_id);
  }

  const directIds = [config.ga4_id, config.ads_id].filter(Boolean);
  if (directIds.length && !config.gtm_id) {
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(directIds[0])}`);
    window.gtag!("js", new Date());
    if (config.ga4_id) {
      window.gtag!("config", config.ga4_id, { send_page_view: false, anonymize_ip: true });
    }
    if (config.ads_id) window.gtag!("config", config.ads_id);
    log("gtag loaded", directIds);
  }
}

export function trackPageView(path: string, title?: string) {
  if (!isBrowser()) return;
  const cfg = getConfig();
  if (!cfg.enabled || !window.__tendrikAnalytics?.loaded) return;
  window.dataLayer!.push({ event: "page_view", page_path: path, page_title: title });
  if (!cfg.gtm_id && cfg.ga4_id && window.gtag) {
    window.gtag("event", "page_view", {
      page_path: path,
      page_title: title,
      page_location: window.location.href,
    });
  }
  log("page_view", path);
}

export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (!isBrowser()) return;
  const cfg = getConfig();
  if (!cfg.enabled || !window.__tendrikAnalytics?.loaded) return;
  window.dataLayer!.push({ event: name, ...params });
  if (!cfg.gtm_id && window.gtag) window.gtag("event", name, params);
  log("event", name, params);
}

/**
 * Fires a GA4 event and, when a Google Ads conversion label is configured for
 * the key, the matching Ads conversion.
 */
export function trackConversion(
  key: ConversionKey,
  params: { value?: number; currency?: string; [k: string]: unknown } = {},
) {
  if (!isBrowser()) return;
  const cfg = getConfig();
  if (!cfg.enabled || !window.__tendrikAnalytics?.loaded) return;

  trackEvent(key, { ...params, conversion: true });

  const label = cfg.conversion_labels?.[key];
  if (cfg.ads_id && label && !cfg.gtm_id && window.gtag) {
    window.gtag("event", "conversion", {
      send_to: `${cfg.ads_id}/${label}`,
      value: params.value,
      currency: params.currency ?? "EUR",
    });
    log("ads conversion", key, label);
  }
}
