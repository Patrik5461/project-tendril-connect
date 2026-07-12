// Operácie nad Faktero faktúrami spustené z UI:
// - action=pdf: vráti signed_url pre PDF faktúry (autor faktúry alebo admin)
// - action=retry: znova pokúsi vystaviť faktúru pre daný invoice_id (admin)
// - action=issue: manuálne vystaví faktúru pre gopay_payment_id (admin)
// - action=mode: vráti test/live režim podľa prefixu FAKTERO_API_KEY (admin)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/gopay.ts";
import { fakteroMode, getInvoicePdfUrl, issueInvoiceForPayment } from "../_shared/faktero.ts";

async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("unauthorized");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("unauthorized");
  return { admin, userId: data.user.id };
}

async function isAdmin(admin: ReturnType<typeof createClient>, userId: string) {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { admin, userId } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "mode") {
      if (!(await isAdmin(admin, userId))) throw new Error("forbidden");
      const { count: issued } = await admin.from("invoices").select("id", { count: "exact", head: true }).in("status", ["issued", "paid_marked", "sent"]);
      const { count: failed } = await admin.from("invoices").select("id", { count: "exact", head: true }).eq("status", "failed");
      const { count: pending } = await admin.from("invoices").select("id", { count: "exact", head: true }).eq("status", "pending");
      return json({ mode: fakteroMode(), counts: { issued: issued ?? 0, failed: failed ?? 0, pending: pending ?? 0 } });
    }

    if (action === "pdf") {
      const invoiceId = String(body.invoice_id ?? "");
      const { data: inv } = await admin.from("invoices").select("user_id, faktero_invoice_id").eq("id", invoiceId).maybeSingle();
      if (!inv || !inv.faktero_invoice_id) throw new Error("invoice_not_found");
      const admin_ok = await isAdmin(admin, userId);
      if (inv.user_id !== userId && !admin_ok) throw new Error("forbidden");
      const url = await getInvoicePdfUrl(inv.faktero_invoice_id);
      return json({ url });
    }

    if (action === "retry") {
      if (!(await isAdmin(admin, userId))) throw new Error("forbidden");
      const invoiceId = String(body.invoice_id ?? "");
      const { data: inv } = await admin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
      if (!inv) throw new Error("invoice_not_found");
      const result = await issueInvoiceForPayment({
        admin,
        userId: (inv as any).user_id,
        gopayPaymentId: (inv as any).gopay_payment_id,
        amountGrossEur: Number((inv as any).amount),
        currency: (inv as any).currency,
      });
      return json(result);
    }

    if (action === "issue") {
      if (!(await isAdmin(admin, userId))) throw new Error("forbidden");
      const gopayId = String(body.gopay_payment_id ?? "");
      const targetUser = String(body.user_id ?? "");
      const amount = Number(body.amount ?? 0);
      if (!gopayId || !targetUser || !amount) throw new Error("missing_params");
      const result = await issueInvoiceForPayment({
        admin,
        userId: targetUser,
        gopayPaymentId: gopayId,
        amountGrossEur: amount,
        currency: "EUR",
      });
      return json(result);
    }

    throw new Error("unknown_action");
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const status = msg === "unauthorized" ? 401 : msg === "forbidden" ? 403 : 400;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(v: unknown) {
  return new Response(JSON.stringify(v), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
