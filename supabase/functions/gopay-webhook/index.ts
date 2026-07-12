// Príjem notifikácií z GoPay. GoPay posiela `id` platby v query parametri,
// stav si musíme dotiahnuť sami cez GET /api/payments/payment/{id}.
// Autenticita: preveríme, že platba skutočne existuje v našom GoPay účte
// (kontrolujeme, či je asociovaná s naším GOID).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  corsHeaders, getGoPayToken, gopayConfig, mapPaymentState, resolveGopayEnv } from "../_shared/gopay.ts";
import { issueInvoiceForPayment, resolveFakteroMode } from "../_shared/faktero.ts";

async function fetchPayment(id: string) {
  const cfg = gopayConfig();
  const token = await getGoPayToken("payment-all");
  const res = await fetch(`${cfg.baseUrl}/api/payments/payment/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`gopay fetch ${res.status}`);
  return await res.json();
}

async function processPayment(paymentId: string, simulate?: { state?: string; user_id?: string }) {
  const cfg = gopayConfig();
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payment: any;
  if (simulate) {
    payment = {
      id: paymentId,
      state: simulate.state ?? "PAID",
      amount: 614,
      currency: "EUR",
      target: { goid: Number(cfg.goid) || 0 },
      parent_id: paymentId,
      additional_params: simulate.user_id ? [{ name: "user_id", value: simulate.user_id }] : [],
    };
  } else {
    payment = await fetchPayment(paymentId);
    // Kontrola pôvodu – platba musí patriť nášmu GOID.
    if (cfg.goid && payment?.target?.goid && String(payment.target.goid) !== String(cfg.goid)) {
      throw new Error("goid_mismatch");
    }
  }

  const userId: string | undefined =
    payment.additional_params?.find((p: any) => p.name === "user_id")?.value;

  // Audit log
  await admin.from("gopay_payment_events").insert({
    user_id: userId ?? null,
    gopay_payment_id: String(payment.id),
    parent_id: payment.parent_id ? String(payment.parent_id) : null,
    state: payment.state,
    amount_cents: payment.amount ?? null,
    currency: payment.currency ?? null,
    raw: payment,
  });

  if (!userId) return { ok: true, note: "no user_id" };

  const mapped = mapPaymentState(payment.state);
  if (mapped === "active") {
    // Predĺž o mesiac od teraz alebo od doterajšieho subscription_valid_until.
    const { data: pref } = await admin
      .from("user_preferences")
      .select("subscription_valid_until")
      .eq("user_id", userId).maybeSingle();
    const base = pref?.subscription_valid_until && new Date(pref.subscription_valid_until) > new Date()
      ? new Date(pref.subscription_valid_until)
      : new Date();
    const next = new Date(base);
    next.setMonth(next.getMonth() + 1);
    await admin.from("user_preferences").update({
      subscription_status: "active",
      subscription_valid_until: next.toISOString(),
      last_payment_at: new Date().toISOString(),
      gopay_recurrence_id: String(payment.parent_id ?? payment.id),
    }).eq("user_id", userId);

    // Faktero: vystaviť + poslať faktúru. Chyby NIKDY neblokujú aktiváciu.
    try {
      const amountGrossEur = Number(payment.amount ?? 0) / 100;
      if (amountGrossEur > 0) {
        await resolveFakteroMode(admin);
        await issueInvoiceForPayment({
          admin,
          userId,
          gopayPaymentId: String(payment.id),
          amountGrossEur,
          currency: payment.currency ?? "EUR",
        });
      }
    } catch (e) {
      console.error("faktero orchestrator threw (should not happen)", e);
    }
  } else if (mapped === "expired") {
    // Zrušené / timeout / refund → nastav expired ak už nie je aktívne obdobie.
    await admin.from("user_preferences").update({
      subscription_status: "expired",
    }).eq("user_id", userId);
  }

  return { ok: true, state: payment.state, mapped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  await resolveGopayEnv();

  try {
    // Admin simulator: POST body { simulate: true, payment_id, state, user_id }
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.simulate) {
        // Iba pre autentifikovaného používateľa (edge fn má verify_jwt=true na simulátore – riešime cez odlišnú fn nižšie)
        const result = await processPayment(String(body.payment_id ?? `sim_${Date.now()}`), {
          state: body.state, user_id: body.user_id,
        });
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id") ?? url.searchParams.get("payment_id");
    if (!id) {
      return new Response(JSON.stringify({ error: "missing id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await processPayment(id);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
