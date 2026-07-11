// Vytvorí opakovanú platbu (recurring) 4,99 €/mes pre prihláseného používateľa.
// Vracia gw_url – URL, kam presmerovať používateľa do GoPay brány.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, getGoPayToken, gopayConfig } from "../_shared/gopay.ts";

const PRICE_CENTS = 614; // 6,14 € s DPH (4,99 € bez DPH + 23 %)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const cfg = gopayConfig();
    if (!cfg.configured) {
      return new Response(JSON.stringify({
        error: "GOPAY_NOT_CONFIGURED",
        message: "GoPay kľúče zatiaľ nie sú vyplnené (GOPAY_GOID / GOPAY_CLIENT_ID / GOPAY_CLIENT_SECRET). Sandbox tok bude funkčný hneď po ich doplnení.",
        env: cfg.env,
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appBase = Deno.env.get("APP_BASE_URL") ?? "https://www.tendrik.sk";
    const supabaseFunctions = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

    const token = await getGoPayToken("payment-create");

    // Recurring platba – mesačne, bez dátumu konca (do zrušenia).
    // Podľa GoPay API v3: recurrence.recurrence_cycle=MONTH, recurrence_period=1, recurrence_date_to=YYYY-MM-DD.
    // Pretože GoPay vyžaduje date_to, dáme +10 rokov (efektívne "do zrušenia").
    const dateTo = new Date();
    dateTo.setFullYear(dateTo.getFullYear() + 10);
    const dateToStr = dateTo.toISOString().slice(0, 10);

    const payload = {
      payer: {
        default_payment_instrument: "PAYMENT_CARD",
        allowed_payment_instruments: ["PAYMENT_CARD"],
        contact: {
          email: user.email ?? "",
        },
      },
      amount: PRICE_CENTS,
      currency: "EUR",
      order_number: `sub_${user.id.slice(0, 8)}_${Date.now()}`,
      order_description: "Tendrik Premium – mesačné predplatné",
      items: [
        { name: "Tendrik Premium (1 mesiac)", amount: PRICE_CENTS, count: 1 },
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

    // Zapamätaj payment_id (parent recurring) na user_preferences.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await admin.from("user_preferences").update({
      gopay_subscription_id: String(j.id),
      gopay_recurrence_id: String(j.id),
    }).eq("user_id", user.id);

    return new Response(JSON.stringify({
      payment_id: j.id,
      gw_url: j.gw_url,
      state: j.state,
      env: cfg.env,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
