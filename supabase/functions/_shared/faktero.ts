// Faktero API klient (Deno). Používaný z GoPay webhooku a z faktero-retry funkcie.
// Base URL: https://faktero.sk/api/v1, autentifikácia: Bearer FAKTERO_API_KEY.
// Kľúč s prefixom fk_test_ = testovací režim, fk_live_ = produkcia.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BASE_URL = "https://faktero.sk/api/v1";

// Aktívny režim v rámci požiadavky. Nastavuje sa cez resolveFakteroMode(admin).
let _activeMode: "test" | "live" | null = null;

function keyForMode(mode: "test" | "live"): string {
  const specific = Deno.env.get(mode === "test" ? "FAKTERO_API_KEY_TEST" : "FAKTERO_API_KEY_LIVE");
  if (specific) return specific;
  const fallback = Deno.env.get("FAKTERO_API_KEY") ?? "";
  if (fallback.startsWith(mode === "test" ? "fk_test_" : "fk_live_")) return fallback;
  return "";
}

/** Zisti dostupné režimy podľa uložených secrets a prefixu FAKTERO_API_KEY. */
export function fakteroAvailableModes(): { test: boolean; live: boolean } {
  return { test: !!keyForMode("test"), live: !!keyForMode("live") };
}

/**
 * Načítaj aktívny režim z app_settings.faktero_mode (test/live).
 * Fallback: prefix FAKTERO_API_KEY, inak prvý dostupný kľúč.
 */
export async function resolveFakteroMode(
  admin: ReturnType<typeof createClient>,
): Promise<"test" | "live" | "missing"> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "faktero_mode").maybeSingle();
  const stored = (data?.value ?? null) as string | null;
  const avail = fakteroAvailableModes();
  let mode: "test" | "live" | null = null;
  if (stored === "test" || stored === "live") mode = stored;
  if (!mode) {
    const fk = Deno.env.get("FAKTERO_API_KEY") ?? "";
    if (fk.startsWith("fk_test_")) mode = "test";
    else if (fk.startsWith("fk_live_")) mode = "live";
  }
  if (!mode) mode = avail.test ? "test" : avail.live ? "live" : null;
  if (!mode) { _activeMode = null; return "missing"; }
  _activeMode = mode;
  return mode;
}

export function fakteroMode(): "test" | "live" | "missing" {
  return _activeMode ?? "missing";
}

export function fakteroKey(): string {
  if (!_activeMode) throw new Error("FAKTERO_MODE_NOT_RESOLVED");
  const key = keyForMode(_activeMode);
  if (!key) throw new Error(_activeMode === "test" ? "FAKTERO_API_KEY_TEST_MISSING" : "FAKTERO_API_KEY_LIVE_MISSING");
  return key;
}

/** Fetch s exponenciálnym backoffom pre 429/5xx (max 4 pokusy). */
export async function fakteroFetch(
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${fakteroKey()}`,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let lastErr: any;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers });
      const text = await res.text();
      const json = text ? safeJson(text) : null;
      if (res.ok) return json;
      // retry na 429 a 5xx
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`faktero ${res.status}: ${text.slice(0, 300)}`);
      } else {
        throw new Error(`faktero ${res.status}: ${text.slice(0, 500)}`);
      }
    } catch (e) {
      lastErr = e;
    }
    // backoff: 500 ms, 1 s, 2 s, 4 s + jitter
    const wait = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw lastErr ?? new Error("faktero_unknown_error");
}

function safeJson(t: string): any {
  try { return JSON.parse(t); } catch { return t; }
}

export type BillingDetails = {
  user_id: string;
  name: string;
  ico: string | null;
  ic_dph: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string;
  email: string;
  faktero_customer_id: string | null;
};

/** Získa alebo vytvorí odberateľa vo Faktere a vráti jeho id. */
export async function ensureFakteroCustomer(
  admin: ReturnType<typeof createClient>,
  billing: BillingDetails,
): Promise<string> {
  if (billing.faktero_customer_id) return billing.faktero_customer_id;

  const payload: Record<string, unknown> = {
    name: billing.name,
    email: billing.email,
    country: billing.country || "SK",
  };
  if (billing.ico) payload.ico = billing.ico;
  if (billing.ic_dph) payload.ic_dph = billing.ic_dph;
  if (billing.street) payload.street = billing.street;
  if (billing.city) payload.city = billing.city;
  if (billing.zip) payload.zip = billing.zip;

  const created = await fakteroFetch("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const customerId = String(created?.id ?? created?.data?.id ?? created?.customer_id ?? "");
  if (!customerId) throw new Error("faktero_customer_no_id");

  await admin.from("billing_details").update({
    faktero_customer_id: customerId,
  }).eq("user_id", billing.user_id);

  return customerId;
}

/**
 * Prepočet unit_price bez DPH tak, aby suma s DPH sedela na `amountGross`.
 * 4.99 / 1.23 = 4.056… → 4.06 EUR bez DPH.
 */
export function unitPriceExVat(amountGross: number, vatRate = 23): number {
  return Math.round((amountGross / (1 + vatRate / 100)) * 100) / 100;
}

const today = () => new Date().toISOString().slice(0, 10);

export type IssueResult = {
  faktero_invoice_id: string;
  invoice_number: string | null;
  status: "sent" | "paid_marked" | "issued";
};

/** Vytvorí faktúru, označí ako zaplatenú a odošle e-mailom. */
export async function issueFakteroInvoice(params: {
  customerId: string;
  amountGross: number;
  currency: string;
  recipientEmail: string;
}): Promise<IssueResult> {
  const unit = unitPriceExVat(params.amountGross, 23);
  const invoicePayload = {
    customer_id: params.customerId,
    issue_date: today(),
    due_date: today(),
    currency: params.currency || "EUR",
    items: [{
      name: "Tendrik – mesačné predplatné",
      quantity: 1,
      unit: "ks",
      unit_price: unit,
      vat_rate: 23,
    }],
  };

  const inv = await fakteroFetch("/invoices", {
    method: "POST",
    body: JSON.stringify(invoicePayload),
  });
  const invoiceId = String(inv?.id ?? inv?.data?.id ?? "");
  const invoiceNumber = inv?.number ?? inv?.invoice_number ?? inv?.data?.number ?? null;
  if (!invoiceId) throw new Error("faktero_invoice_no_id");

  let status: IssueResult["status"] = "issued";

  try {
    await fakteroFetch(`/invoices/${invoiceId}/mark-paid`, { method: "POST", body: JSON.stringify({}) });
    status = "paid_marked";
  } catch (e) {
    console.error("faktero mark-paid failed", invoiceId, e);
  }

  try {
    await fakteroFetch(`/invoices/${invoiceId}/send`, {
      method: "POST",
      body: JSON.stringify({ recipient_email: params.recipientEmail }),
    });
    status = "sent";
  } catch (e) {
    console.error("faktero send failed", invoiceId, e);
  }

  return { faktero_invoice_id: invoiceId, invoice_number: invoiceNumber, status };
}

/** Kompletný orchestrátor pre jednu GoPay platbu – nikdy nehádže. */
export async function issueInvoiceForPayment(params: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  gopayPaymentId: string;
  amountGrossEur: number;
  currency?: string;
}): Promise<{ ok: boolean; error?: string; invoice_id?: string; invoice_number?: string | null }> {
  const { admin, userId, gopayPaymentId, amountGrossEur } = params;

  // Idempotencia: ak existuje záznam so status='sent'|'paid_marked'|'issued' pre tento gopay_payment_id, skončiť.
  const { data: existing } = await admin
    .from("invoices").select("id, status, faktero_invoice_id, invoice_number")
    .eq("gopay_payment_id", gopayPaymentId).maybeSingle();
  if (existing && existing.status !== "pending" && existing.status !== "failed") {
    return { ok: true, invoice_id: existing.faktero_invoice_id ?? undefined, invoice_number: existing.invoice_number };
  }

  // upsert pending
  await admin.from("invoices").upsert({
    id: existing?.id,
    user_id: userId,
    gopay_payment_id: gopayPaymentId,
    amount: amountGrossEur,
    currency: params.currency || "EUR",
    status: "pending",
  } as any, { onConflict: "gopay_payment_id" });

  // Načítaj billing_details
  const { data: billing } = await admin
    .from("billing_details").select("*").eq("user_id", userId).maybeSingle();
  if (!billing) {
    await admin.from("invoices").update({
      status: "failed",
      error_message: "billing_details_missing",
      retry_count: (existing?.retry_count ?? 0) + 1,
      next_retry_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } as any).eq("gopay_payment_id", gopayPaymentId);
    return { ok: false, error: "billing_details_missing" };
  }

  try {
    const customerId = await ensureFakteroCustomer(admin, billing as BillingDetails);
    const result = await issueFakteroInvoice({
      customerId,
      amountGross: amountGrossEur,
      currency: params.currency || "EUR",
      recipientEmail: (billing as any).email,
    });

    await admin.from("invoices").update({
      faktero_invoice_id: result.faktero_invoice_id,
      invoice_number: result.invoice_number,
      status: result.status,
      issued_at: new Date().toISOString(),
      error_message: null,
    } as any).eq("gopay_payment_id", gopayPaymentId);

    return { ok: true, invoice_id: result.faktero_invoice_id, invoice_number: result.invoice_number };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    console.error("faktero issue failed", gopayPaymentId, msg);
    await admin.from("invoices").update({
      status: "failed",
      error_message: msg,
      retry_count: (existing?.retry_count ?? 0) + 1,
      next_retry_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    } as any).eq("gopay_payment_id", gopayPaymentId);
    return { ok: false, error: msg };
  }
}

/** Vráti signed URL pre PDF faktúry (platí ~5 minút). */
export async function getInvoicePdfUrl(fakteroInvoiceId: string): Promise<string> {
  const res = await fakteroFetch(`/invoices/${fakteroInvoiceId}/pdf`, { method: "GET" });
  const url = res?.signed_url ?? res?.url ?? res?.data?.signed_url ?? null;
  if (!url) throw new Error("faktero_pdf_no_url");
  return String(url);
}
