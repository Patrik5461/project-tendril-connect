// Shared GoPay helpers. All URLs and keys are read from env — no hardcoding.
// GOPAY_ENV switches sandbox vs production. Kým sú kľúče placeholderové,
// funkcie vrátia zrozumiteľnú chybu, aby sa dal integračný tok otestovať štruktúrne.

export type GoPayEnv = "sandbox" | "production";

let cachedMode: GoPayEnv | null = null;

/** DB override (app_settings.gopay_mode) má prednosť pred GOPAY_ENV secretom. */
export async function resolveGopayEnv(): Promise<GoPayEnv> {
  if (cachedMode) return cachedMode;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const r = await fetch(`${url}/rest/v1/app_settings?key=eq.gopay_mode&select=value`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (r.ok) {
        const rows = await r.json();
        const v = rows?.[0]?.value;
        const s = typeof v === "string" ? v : "";
        if (s === "production" || s === "sandbox") {
          cachedMode = s;
          return s;
        }
      }
    }
  } catch { /* ignore, fallback to env */ }
  const v = (Deno.env.get("GOPAY_ENV") ?? "sandbox").toLowerCase();
  cachedMode = v === "production" ? "production" : "sandbox";
  return cachedMode;
}

/** Synchrónny fallback – používa iba env (bez DB overridu). */
export function gopayEnv(): GoPayEnv {
  if (cachedMode) return cachedMode;
  const v = (Deno.env.get("GOPAY_ENV") ?? "sandbox").toLowerCase();
  return v === "production" ? "production" : "sandbox";
}

export function gopayBaseUrl(): string {
  return gopayEnv() === "production"
    ? "https://gate.gopay.com"
    : "https://gw.sandbox.gopay.com";
}

export function gopayConfig() {
  const goid = Deno.env.get("GOPAY_GOID") ?? "";
  const clientId = Deno.env.get("GOPAY_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOPAY_CLIENT_SECRET") ?? "";
  const configured =
    goid && clientId && clientSecret &&
    goid !== "PLACEHOLDER" && clientId !== "PLACEHOLDER" && clientSecret !== "PLACEHOLDER";
  return { goid, clientId, clientSecret, configured, env: gopayEnv(), baseUrl: gopayBaseUrl() };
}

/** OAuth client_credentials token pre platobné operácie (scope payment-create). */
export async function getGoPayToken(scope = "payment-create"): Promise<string> {
  const cfg = gopayConfig();
  if (!cfg.configured) {
    throw new Error("GOPAY_NOT_CONFIGURED");
  }
  const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  const res = await fetch(`${cfg.baseUrl}/api/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GOPAY_AUTH_FAILED: ${res.status} ${t}`);
  }
  const j = await res.json();
  return j.access_token as string;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/** Mapa GoPay stavov na naše subscription_status. */
export function mapPaymentState(state: string): "active" | "expired" | "trial" | null {
  switch ((state || "").toUpperCase()) {
    case "PAID":
      return "active";
    case "CANCELED":
    case "TIMEOUTED":
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "expired";
    default:
      return null; // CREATED / PAYMENT_METHOD_CHOSEN / AUTHORIZED — nemenime
  }
}
