// Vytvorí platbu predplatného pre prihláseného používateľa.
// Tobify s.r.o. nie je platca DPH – suma je konečná, bez pripočítania DPH.
// Tiery: basic / premium / komplet, obdobia: monthly / yearly.
// Ročné predplatné je VŽDY jednorazová platba (bez recurrence).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, getGoPayToken, gopayConfig, resolveGopayEnv } from "../_shared/gopay.ts";
import {
  normalizePeriod, normalizeTier, periodLabel, priceCents, tierLabel,
} from "../_shared/pricing.ts";


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
    const tier = normalizeTier(body?.tier);
    const period = normalizePeriod(body?.period);

    // Globálny prepínač opakovaných platieb (app_settings.gopay_recurring_enabled)
    let recurringEnabled = false;
    try {
      const r = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/rest/v1/app_settings?key=eq.gopay_recurring_enabled&select=value`,
        {
          headers: {
            apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
        },
      );
      if (r.ok) {
        const rows = await r.json();
        recurringEnabled = rows?.[0]?.value === true;
      }
    } catch { /* default false */ }
    // Ročné predplatné je vždy jednorazová platba.
    const wantAutorenew = period === "monthly" && recurringEnabled && body?.autorenew === true;
    const amountCents = priceCents(tier, period);
    const tLabel = tierLabel(tier);
    const pLabel = periodLabel(period);
    const itemPeriod = period === "yearly" ? "12 mesiacov" : "1 mesiac";


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

    const payload: Record<string, unknown> = {
      payer: {
        default_payment_instrument: "PAYMENT_CARD",
        allowed_payment_instruments: ["PAYMENT_CARD"],
        contact: { email: user.email ?? "" },
      },
      amount: amountCents,
      currency: "EUR",
      order_number: `sub_${tier}_${period}_${user.id.slice(0, 8)}_${Date.now()}`,
      order_description: `Tendrik ${tLabel} – ${pLabel} predplatné`,
      items: [
        { name: `Tendrik ${tLabel} (${itemPeriod})`, amount: amountCents, count: 1 },
      ],
      callback: {
        return_url: `${appBase}/platba/vysledok`,
        notification_url: `${supabaseFunctions}/gopay-webhook`,
      },
      additional_params: [
        { name: "user_id", value: user.id },
        { name: "tier", value: tier },
        { name: "period", value: period },
      ],

      lang: "SK",
      target: { type: "ACCOUNT", goid: Number(cfg.goid) },
    };

    if (wantAutorenew) {
      payload.recurrence = {
        recurrence_cycle: "MONTH",
        recurrence_period: 1,
        recurrence_date_to: dateToStr,
      };
    }

    async function createPayment(p: Record<string, unknown>) {
      const r = await fetch(`${cfg.baseUrl}/api/payments/payment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(p),
      });
      return { ok: r.ok, json: await r.json() };
    }

    let autorenewApplied = wantAutorenew;
    let { ok, json: j } = await createPayment(payload);

    // GoPay error_code 344 = opakované platby nie sú povolené na účte → fallback bez recurrence
    if (!ok && wantAutorenew) {
      const errs = Array.isArray(j?.errors) ? j.errors : [];
      const has344 = errs.some((e: any) => Number(e?.error_code) === 344) ||
        Number(j?.error_code) === 344;
      if (has344) {
        const { recurrence: _drop, ...withoutRecurrence } = payload as any;
        autorenewApplied = false;
        ({ ok, json: j } = await createPayment(withoutRecurrence));
      }
    }

    if (!ok) {
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
      gopay_recurrence_id: autorenewApplied ? String(j.id) : null,
      subscription_tier: tier,
      billing_period: period,
    }).eq("user_id", user.id);

    return new Response(JSON.stringify({
      payment_id: j.id,
      gw_url: j.gw_url,
      state: j.state,
      tier,
      period,
      amount_cents: amountCents,
      env: cfg.env,
      autorenew_applied: autorenewApplied,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
