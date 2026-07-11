// Overí GoPay konfiguráciu: ktoré secrets sú vyplnené a či OAuth token funguje.
// NEVRACIA hodnoty secretov – iba true/false a stav autentifikácie.
import { corsHeaders, gopayConfig, resolveGopayEnv, getGoPayToken } from "../_shared/gopay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  await resolveGopayEnv();

  const cfg = gopayConfig();
  const status = {
    env: cfg.env,
    base_url: cfg.baseUrl,
    secrets: {
      GOPAY_GOID: !!cfg.goid && cfg.goid !== "PLACEHOLDER",
      GOPAY_CLIENT_ID: !!cfg.clientId && cfg.clientId !== "PLACEHOLDER",
      GOPAY_CLIENT_SECRET: !!cfg.clientSecret && cfg.clientSecret !== "PLACEHOLDER",
    },
    configured: cfg.configured,
    oauth: { ok: false, error: null as string | null },
  };

  if (cfg.configured) {
    try {
      const token = await getGoPayToken("payment-create");
      status.oauth.ok = !!token;
    } catch (e) {
      status.oauth.error = String((e as Error).message ?? e);
    }
  } else {
    status.oauth.error = "GOPAY_NOT_CONFIGURED";
  }

  return new Response(JSON.stringify(status), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
