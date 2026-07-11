// Shared GoPay helpers. All URLs and keys are read from env — no hardcoding.
// GOPAY_ENV switches sandbox vs production. Kým sú kľúče placeholderové,
// funkcie vrátia zrozumiteľnú chybu, aby sa dal integračný tok otestovať štruktúrne.

export type GoPayEnv = "sandbox" | "production";

export function gopayEnv(): GoPayEnv {
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
