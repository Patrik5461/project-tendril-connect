import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  EMPTY_ANALYTICS_CONFIG,
  initConsentDefaults,
  loadTags,
  trackPageView,
  updateConsent,
  type AnalyticsConfig,
} from "@/lib/analytics";
import { hasAnalyticsConsent, subscribeConsent } from "@/lib/cookie-consent";

/**
 * Loads the Google tags (GTM / GA4 / Google Ads) configured in the admin panel.
 * Consent Mode v2 defaults to denied; tags only start measuring after the
 * visitor grants analytics consent in the cookie banner.
 */
export function AnalyticsScripts() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ready = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let config: AnalyticsConfig = EMPTY_ANALYTICS_CONFIG;
      try {
        const res = await fetch("/api/public/analytics-config");
        if (res.ok) config = { ...EMPTY_ANALYTICS_CONFIG, ...(await res.json()) };
      } catch {
        /* analytics must never break the app */
      }
      if (cancelled || !config.enabled || (!config.gtm_id && !config.ga4_id && !config.ads_id)) return;

      initConsentDefaults(config);
      loadTags(config);
      updateConsent(hasAnalyticsConsent());
      ready.current = true;
      trackPageView(window.location.pathname + window.location.search, document.title);
    })();

    const unsub = subscribeConsent((record) => {
      updateConsent(record?.categories.analytics === true);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!ready.current) return;
    trackPageView(window.location.pathname + window.location.search, document.title);
  }, [pathname]);

  return null;
}
