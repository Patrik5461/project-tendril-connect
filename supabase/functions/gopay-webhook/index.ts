// Príjem notifikácií z GoPay. GoPay posiela `id` platby v query parametri,
// stav si musíme dotiahnuť sami cez GET /api/payments/payment/{id}.
// Autenticita: preveríme, že platba skutočne existuje v našom GoPay účte
// (kontrolujeme, či je asociovaná s naším GOID).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  corsHeaders, getGoPayToken, gopayConfig, mapPaymentState, resolveGopayEnv } from "../_shared/gopay.ts";
import { issueInvoiceForPayment, resolveFakteroMode } from "../_shared/faktero.ts";
import { normalizePeriod, normalizeTier, tierFromAmount, type Period, type Tier } from "../_shared/pricing.ts";


async function fetchPayment(id: string) {
  const cfg = gopayConfig();
  const token = await getGoPayToken("payment-all");
  const res = await fetch(`${cfg.baseUrl}/api/payments/payment/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`gopay fetch ${res.status}`);
  return await res.json();
}

const ADMIN_ALERT_TO = "admin@tendrik.sk";
const ALERT_FROM = "Tendrik <noreply@tendrik.sk>";

async function sendAdminAlert(subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("RESEND_API_KEY missing – nemôžem poslať upozornenie adminovi");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: ALERT_FROM, to: [ADMIN_ALERT_TO], subject, html }),
    });
    if (!res.ok) console.error("Resend alert failed", res.status, await res.text());
  } catch (e) {
    console.error("Resend alert threw", e);
  }
}

function esc(v: unknown): string {
  return String(v ?? "—").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
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
      amount: 499,
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
  const tierParam: string | undefined =
    payment.additional_params?.find((p: any) => p.name === "tier")?.value;
  const periodParam: string | undefined =
    payment.additional_params?.find((p: any) => p.name === "period")?.value;

  // Prednosť majú additional_params; mapa suma->tier/obdobie je fallback
  // pre opakované platby, ktoré parametre neprenášajú.
  const fromAmount = tierFromAmount(Number(payment.amount ?? 0));
  const hasTierParam = tierParam === "basic" || tierParam === "premium" || tierParam === "komplet";
  const hasPeriodParam = periodParam === "monthly" || periodParam === "yearly";
  const resolvedTier: Tier = hasTierParam
    ? normalizeTier(tierParam)
    : (fromAmount?.tier ?? "basic");
  const resolvedPeriod: Period = hasPeriodParam
    ? normalizePeriod(periodParam)
    : (fromAmount?.period ?? "monthly");
  const hasExplicit = hasTierParam || !!fromAmount;

  // Idempotencia: bola už táto platba v tomto stave spracovaná?
  let alreadyProcessed = false;
  try {
    const { count: alreadyCount } = await admin
      .from("gopay_payment_events")
      .select("id", { count: "exact", head: true })
      .eq("gopay_payment_id", String(payment.id))
      .eq("state", payment.state);
    alreadyProcessed = (alreadyCount ?? 0) > 0;
  } catch (e) {
    console.error("idempotency check failed", e);
  }

  // Audit log – musí sa zapísať VŽDY, aj keď ďalšie kroky zlyhajú.
  let eventId: string | null = null;
  try {
    const { data: ev } = await admin.from("gopay_payment_events").insert({
      user_id: userId ?? null,
      gopay_payment_id: String(payment.id),
      parent_id: payment.parent_id ? String(payment.parent_id) : null,
      state: payment.state,
      amount_cents: payment.amount ?? null,
      currency: payment.currency ?? null,
      raw: payment,
    }).select("id").maybeSingle();
    eventId = (ev as any)?.id ?? null;
  } catch (e) {
    console.error("audit insert failed", e);
  }


  if (!userId) return { ok: true, note: "no user_id" };

  const mapped = mapPaymentState(payment.state);

  try {
    if (mapped === "active") {
      const { data: pref, error: prefErr } = await admin
        .from("user_preferences")
        .select("subscription_valid_until,subscription_tier,ai_quota_period_start")
        .eq("user_id", userId).maybeSingle();
      if (prefErr) throw new Error(`load user_preferences: ${prefErr.message}`);
      const base = pref?.subscription_valid_until && new Date(pref.subscription_valid_until) > new Date()
        ? new Date(pref.subscription_valid_until)
        : new Date();
      const next = new Date(base);
      // monthly = +1 mesiac, yearly = +12 mesiacov
      next.setMonth(next.getMonth() + (resolvedPeriod === "yearly" ? 12 : 1));

      // Ak nemáme spoľahlivý zdroj tieru, ponechaj existujúci (napr. manuálne pridelený).
      const existingTier = (pref as any)?.subscription_tier;
      const finalTier: Tier = hasExplicit
        ? resolvedTier
        : (existingTier === "premium" || existingTier === "komplet" || existingTier === "basic"
          ? existingTier : resolvedTier);

      // ai_quota_period_start: nastav na teraz, ak je null alebo starší než mesiac
      const prevStart = (pref as any)?.ai_quota_period_start
        ? new Date((pref as any).ai_quota_period_start) : null;
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      const quotaStart = !prevStart || prevStart <= monthAgo
        ? new Date().toISOString()
        : prevStart.toISOString();

      const { error: updErr } = await admin.from("user_preferences").update({
        subscription_status: "active",
        subscription_source: "paid",
        subscription_tier: finalTier,
        billing_period: resolvedPeriod,
        subscription_valid_until: next.toISOString(),
        last_payment_at: new Date().toISOString(),
        ai_quota_period_start: quotaStart,
        gopay_recurrence_id: String(payment.parent_id ?? payment.id),
      }).eq("user_id", userId);
      if (updErr) throw new Error(`update user_preferences: ${updErr.message}`);

      // Faktero
      const amountGrossEur = Number(payment.amount ?? 0) / 100;
      if (amountGrossEur > 0) {
        await resolveFakteroMode(admin);
        await issueInvoiceForPayment({
          admin,
          userId,
          gopayPaymentId: String(payment.id),
          amountGrossEur,
          currency: payment.currency ?? "EUR",
          tier: finalTier,
          period: resolvedPeriod,
        });
      }
    } else if (mapped === "expired") {
      // Neúspešná NOVÁ platba nesmie zrušiť trial ani platné predplatné.
      // Expirujeme len vtedy, ak zlyhala obnova práve bežiaceho predplatného.
      const { data: pref, error: prefErr } = await admin
        .from("user_preferences")
        .select("subscription_status,subscription_valid_until,gopay_recurrence_id")
        .eq("user_id", userId).maybeSingle();
      if (prefErr) throw new Error(`load user_preferences: ${prefErr.message}`);

      const ids = [payment.parent_id, payment.id]
        .filter((v: unknown) => v !== null && v !== undefined)
        .map((v: unknown) => String(v));
      const recId = (pref as any)?.gopay_recurrence_id
        ? String((pref as any).gopay_recurrence_id) : null;
      const validUntil = (pref as any)?.subscription_valid_until
        ? new Date((pref as any).subscription_valid_until) : null;

      const shouldExpire =
        (pref as any)?.subscription_status === "active" &&
        !!recId && ids.includes(recId) &&
        !!validUntil && validUntil < new Date();

      if (shouldExpire) {
        const { error: expErr } = await admin.from("user_preferences").update({
          subscription_status: "expired",
        }).eq("user_id", userId);
        if (expErr) throw new Error(`expire user_preferences: ${expErr.message}`);
      }
    }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.error("payment processing failed", paymentId, msg);
    try {
      if (eventId) {
        await admin.from("gopay_payment_events").update({ processing_error: msg }).eq("id", eventId);
      } else {
        await admin.from("gopay_payment_events").update({ processing_error: msg })
          .eq("gopay_payment_id", String(payment.id));
      }
    } catch (e2) {
      console.error("nepodarilo sa zapísať processing_error", e2);
    }
    await sendAdminAlert(
      `Zlyhalo spracovanie platby ${String(payment.id)}`,
      `<h2>Zlyhalo spracovanie platby</h2>
       <p><b>GoPay ID:</b> ${esc(payment.id)}</p>
       <p><b>User ID:</b> ${esc(userId)}</p>
       <p><b>Suma:</b> ${esc(((Number(payment.amount ?? 0)) / 100).toFixed(2))} ${esc(payment.currency ?? "EUR")}</p>
       <p><b>Stav platby:</b> ${esc(payment.state)}</p>
       <p><b>Chyba:</b><br><pre style="white-space:pre-wrap">${esc(msg)}</pre></p>
       <p>Zákazník zaplatil, ale predplatné/faktúra nemuseli prebehnúť. Dorovnajte to v admine → GoPay.</p>`,
    );
    throw new Error(msg);
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
      // Admin "Dorovnať": POST body { reprocess: true, payment_id }
      if (body?.reprocess && body?.payment_id) {
        const result = await processPayment(String(body.payment_id));
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
