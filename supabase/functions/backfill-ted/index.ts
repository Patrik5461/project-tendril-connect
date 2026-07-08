// Supabase Edge Function: backfill-ted
// Manual historical backfill of TED notices EU-wide (last 60 days).
// Paginates in chunks of MAX_PAGES_PER_CALL per invocation to avoid edge timeouts.
// Only saves notices with deadline today-or-later, or (no deadline AND
// published within last 60 days).
//
// Call:
//   POST {}                    -> starts at page 1
//   POST { "next_page": 11 }   -> continues from page 11
//
// Returns:
//   { pages_done, next_page, saved, has_more, processed, db_limit_hit? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { a2FromNuts, a2FromA3, countryName } from "../_shared/eu.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const NUTS_TO_REGION: Record<string, string> = {
  SK010: "Bratislavský kraj",
  SK021: "Trnavský kraj",
  SK022: "Trenčiansky kraj",
  SK023: "Nitriansky kraj",
  SK031: "Žilinský kraj",
  SK032: "Banskobystrický kraj",
  SK041: "Prešovský kraj",
  SK042: "Košický kraj",
};

const PAGE_LIMIT = 250;
const MAX_PAGES_PER_CALL = 10;
const MAX_PAGES_TOTAL = 100;
const PAGE_DELAY_MS = 250;
const LOOKBACK_DAYS = 60;

function firstString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = firstString(v);
      if (s) return s;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["slk", "sk", "SLK", "SK"]) {
      if (key in obj) {
        const s = firstString(obj[key]);
        if (s) return s;
      }
    }
    for (const v of Object.values(obj)) {
      const s = firstString(v);
      if (s) return s;
    }
    return null;
  }
  return null;
}

function parseTedDate(value: unknown): string | null {
  const s = firstString(value);
  if (!s) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}([+-]\d{2}:?\d{2}|Z)$/.test(s)
    ? s.replace(/^(\d{4}-\d{2}-\d{2})/, "$1T00:00:00")
    : s;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function collectStrings(value: unknown, out: string[]) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") { if (value.trim()) out.push(value.trim()); return; }
  if (Array.isArray(value)) { value.forEach((v) => collectStrings(v, out)); return; }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((v) => collectStrings(v, out));
  }
}

function pickSkRegion(codes: string[]): string | null {
  for (const c of codes) {
    if (/^SK0[1-4][0-2]$/.test(c) && NUTS_TO_REGION[c]) return NUTS_TO_REGION[c];
  }
  if (codes.some((c) => /^(SK0?|SKZZ|SVK)$/.test(c))) return "celé Slovensko";
  return null;
}

function pickCountry(codes: string[]): string | null {
  for (const c of codes) {
    const a2 = a2FromNuts(c);
    if (a2) return a2;
  }
  for (const c of codes) {
    const a2 = a2FromA3(c);
    if (a2) return a2;
  }
  return null;
}

function collectNumbers(v: unknown, out: number[]) {
  if (v === null || v === undefined) return;
  if (typeof v === "number" && isFinite(v)) { out.push(v); return; }
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    if (isFinite(n) && n > 0) out.push(n);
    return;
  }
  if (Array.isArray(v)) { v.forEach((x) => collectNumbers(x, out)); return; }
  if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => collectNumbers(x, out));
}

function collectCurrencies(v: unknown, out: string[]) {
  if (v === null || v === undefined) return;
  if (typeof v === "string") { if (/^[A-Z]{3}$/i.test(v.trim())) out.push(v.trim().toUpperCase()); return; }
  if (Array.isArray(v)) { v.forEach((x) => collectCurrencies(x, out)); return; }
  if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => collectCurrencies(x, out));
}

function pickTedValue(n: Record<string, unknown>): { value: number | null; currency: string | null } {
  const nums: number[] = [];
  collectNumbers(n["estimated-value-glo"], nums);
  if (nums.length === 0) collectNumbers(n["estimated-value-lot"], nums);
  const curs: string[] = [];
  collectCurrencies(n["estimated-value-cur-glo"], curs);
  if (curs.length === 0) collectCurrencies(n["estimated-value-cur-lot"], curs);
  const value = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  const currency = curs[0] ?? (value != null ? "EUR" : null);
  return { value, currency };
}

function tedQuery(): string {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const y = since.getUTCFullYear();
  const m = String(since.getUTCMonth() + 1).padStart(2, "0");
  const d = String(since.getUTCDate()).padStart(2, "0");
  // EU-wide contract-notice variants (open procurements only).
  return `notice-type IN (cn-standard, cn-social, cn-desg, pin-cfc-standard, pin-cfc-social, qu-sy) AND publication-date >= ${y}${m}${d} SORT BY publication-date DESC`;
}

async function fetchPage(page: number) {
  const res = await fetch("https://api.ted.europa.eu/v3/notices/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: tedQuery(),
      fields: [
        "publication-number",
        "notice-title",
        "buyer-name",
        "buyer-country",
        "publication-date",
        "deadline-receipt-tender-date-lot",
        "deadline-receipt-request-date-lot",
        "classification-cpv",
        "place-of-performance",
        "estimated-value-glo",
        "estimated-value-cur-glo",
        "estimated-value-lot",
        "estimated-value-cur-lot",
      ],
      limit: PAGE_LIMIT,
      page,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TED ${res.status}: ${text.slice(0, 300)}`);
  }
  return await res.json();
}

// Postgres error codes that indicate storage / row-limit exhaustion.
function isDbLimitError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return (
    code === "53100" || // disk_full
    code === "53200" || // out_of_memory
    code === "53300" || // too_many_connections
    msg.includes("disk") ||
    msg.includes("quota") ||
    msg.includes("storage limit") ||
    msg.includes("free tier") ||
    msg.includes("row limit")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: { next_page?: number } = {};
    try { body = await req.json(); } catch (_) { body = {}; }
    const startPage = Math.max(1, body.next_page ?? 1);

    const now = Date.now();
    const publishedCutoff = now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    let saved = 0;
    let processed = 0;
    let skipped_stale = 0;
    let pages_done = 0;
    let currentPage = startPage;
    let has_more = false;
    let db_limit_hit = false;
    const countryCounts: Record<string, number> = {};

    outer: for (let i = 0; i < MAX_PAGES_PER_CALL; i++) {
      if (currentPage > MAX_PAGES_TOTAL) {
        has_more = false;
        break;
      }
      if (i > 0) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));

      const payload = await fetchPage(currentPage);
      const notices: any[] = payload?.notices ?? [];
      pages_done += 1;

      if (notices.length === 0) {
        has_more = false;
        break;
      }

      for (const n of notices) {
        const pubNumber = firstString(n["publication-number"]);
        if (!pubNumber) continue;

        const title = firstString(n["notice-title"]);
        const buyer = firstString(n["buyer-name"]);
        const cpv = firstString(n["classification-cpv"]);
        const publishedAt = parseTedDate(n["publication-date"]);
        const deadline =
          parseTedDate(n["deadline-receipt-tender-date-lot"]) ??
          parseTedDate(n["deadline-receipt-request-date-lot"]);

        const popCodes: string[] = [];
        collectStrings(n["place-of-performance"], popCodes);
        const buyerCountryCodes: string[] = [];
        collectStrings(n["buyer-country"], buyerCountryCodes);

        const detectedCountry =
          pickCountry(popCodes) ?? pickCountry(buyerCountryCodes);
        const country = detectedCountry ?? "XX";
        const countryLabel = detectedCountry
          ? countryName(detectedCountry)
          : "neznáma krajina";

        const region =
          country === "SK"
            ? pickSkRegion(popCodes) ?? "celé Slovensko"
            : countryLabel;

        const { value: estimated_value, currency } = pickTedValue(n);

        const deadlineOk = deadline ? new Date(deadline).getTime() >= now : false;
        const freshOk = !deadline && publishedAt
          ? new Date(publishedAt).getTime() >= publishedCutoff
          : false;
        if (!deadlineOk && !freshOk) {
          skipped_stale += 1;
          continue;
        }

        processed += 1;
        const { error } = await supabase.from("tenders").upsert(
          {
            publication_number: pubNumber,
            title: title ?? pubNumber,
            contracting_authority: buyer ?? "—",
            cpv_code: cpv,
            region,
            country,
            country_name: countryLabel,
            published_at: publishedAt,
            deadline,
            estimated_value,
            currency,
            source: "TED",
            source_url: `https://ted.europa.eu/sk/notice/-/detail/${pubNumber}`,
          },
          { onConflict: "publication_number" },
        );
        if (error) {
          if (isDbLimitError(error)) {
            console.error("DB limit hit, aborting backfill", error);
            db_limit_hit = true;
            has_more = false;
            break outer;
          }
          console.error("Upsert error", pubNumber, error);
          continue;
        }
        saved += 1;
        countryCounts[country] = (countryCounts[country] ?? 0) + 1;
      }

      if (notices.length < PAGE_LIMIT) {
        has_more = false;
        currentPage += 1;
        break;
      }
      currentPage += 1;
      has_more = currentPage <= MAX_PAGES_TOTAL;
    }

    return new Response(
      JSON.stringify({
        pages_done,
        next_page: has_more && !db_limit_hit ? currentPage : null,
        processed,
        saved,
        skipped_stale,
        has_more: has_more && !db_limit_hit,
        db_limit_hit,
        country_counts: countryCounts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-ted failed", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
