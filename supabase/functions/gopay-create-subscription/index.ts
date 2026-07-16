// Vytvorí opakovanú platbu (recurring) pre prihláseného používateľa.
// Tobify s.r.o. nie je platca DPH – suma je konečná, bez pripočítania DPH.
// basic = 4,99 €, premium = 14,99 €.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, getGoPayToken, gopayConfig, resolveGopayEnv } from "../_shared/gopay.ts";

const PRICE_CENTS_BASIC = 499;    // 4,99 € (konečná cena, neplatca DPH)
const PRICE_CENTS_PREMIUM = 1499; // 14,99 € (konečná cena, neplatca DPH)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  await resolveGopayEnv();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const tier: "basic" | "premium" = body?.tier === "premium" ? "premium" : "basic";
    const priceCents = tier === "premium" ? PRICE_CENTS_PREMIUM : PRICE_CENTS_BASIC;
    const tierLabel = tier === "premium" ? "Prémium" : "Základ";

    const cfg = gopayConfig();
    if (!cfg.configured) {
      return new Response(JSON.stringify({
        error: "GOPAY_NOT_CONFIGURED",
        message: "GoPay kľúče zatiaľ nie sú vyplnené.",
        env: cfg.env,
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appBase = Deno.env.get("APP_BASE_URL") ?? "https://www.tendrik.sk";
    const supabaseFunctions = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

    const token = await getGoPayToken("payment-create");

    const dateTo = new Date();
    dateTo.setFullYear(dateTo.getFullYear() + 10);
    const dateToStr = dateTo.toISOString().slice(0, 10);

    const payload = {
      payer: {
        default_payment_instrument: "PAYMENT_CARD",
        allowed_payment_instruments: ["PAYMENT_CARD"],
        contact: { email: user.email ?? "" },
      },
      amount: priceCents,
      currency: "EUR",
      order_number: `sub_${tier}_${user.id.slice(0, 8)}_${Date.now()}`,
      order_description: `Tendrik ${tierLabel} – mesačné predplatné`,
      items: [
        { name: `Tendrik ${tierLabel} (1 mesiac)`, amount: priceCents, count: 1 },
      ],
      recurrence: {
        recurrence_cycle: "MONTH",
        recurrence_period: 1,
        recurrence_date_to: dateToStr,
      },
      callback: {
        return_url: `${appBase}/platba/vysledok`,
        notification_url: `${supabaseFunctions}/gopay-webhook`,
      },
      additional_params: [
        { name: "user_id", value: user.id },
        { name: "tier", value: tier },
      ],
      lang: "SK",
      target: { type: "ACCOUNT", goid: Number(cfg.goid) },
    };

    const res = await fetch(`${cfg.baseUrl}/api/payments/payment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "gopay_error", detail: j }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await admin.from("user_preferences").update({
      gopay_subscription_id: String(j.id),
      gopay_recurrence_id: String(j.id),
      subscription_tier: tier,
    }).eq("user_id", user.id);

    return new Response(JSON.stringify({
      payment_id: j.id,
      gw_url: j.gw_url,
      state: j.state,
      tier,
      env: cfg.env,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
