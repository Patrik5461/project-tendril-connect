// Supabase Edge Function: backfill-ted
// Manual historical backfill of TED notices for Slovakia (last 365 days).
// Paginates in chunks of 10 pages per invocation to avoid edge timeouts.
// Only saves notices with deadline today-or-later, or (no deadline AND
// published within last 60 days).
//
// Call:
//   POST {}                    -> starts at page 1
//   POST { "next_page": 11 }   -> continues from page 11
//
// Returns:
//   { pages_done, next_page, saved, has_more, processed }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

const PAGE_LIMIT = 100;
const MAX_PAGES_PER_CALL = 10;
const MAX_PAGES_TOTAL = 50;
const PAGE_DELAY_MS = 300;

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

function pickRegion(value: unknown): string | null {
  const collect = (v: unknown, out: string[]) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => collect(x, out));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, out));
  };
  const codes: string[] = [];
  collect(value, codes);
  for (const c of codes) {
    if (/^SK0[1-4][0-2]$/.test(c) && NUTS_TO_REGION[c]) return NUTS_TO_REGION[c];
  }
  if (codes.some((c) => /^(SK0?|SKZZ|SVK)$/.test(c))) return "celé Slovensko";
  return null;
}

function tedQuery(): string {
  const since = new Date();
  since.setDate(since.getDate() - 365);
  const y = since.getUTCFullYear();
  const m = String(since.getUTCMonth() + 1).padStart(2, "0");
  const d = String(since.getUTCDate()).padStart(2, "0");
  return `place-of-performance IN (SVK) AND notice-type IN (cn-standard) AND publication-date >= ${y}${m}${d} SORT BY publication-date DESC`;
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
    const publishedCutoff = now - 60 * 24 * 60 * 60 * 1000;

    let saved = 0;
    let processed = 0;
    let skipped_stale = 0;
    let pages_done = 0;
    let currentPage = startPage;
    let has_more = false;

    for (let i = 0; i < MAX_PAGES_PER_CALL; i++) {
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
        const region = pickRegion(n["place-of-performance"]);
        const { value: estimated_value, currency } = pickTedValue(n);

        // Save gate: deadline today-or-future, OR (no deadline AND published within 60d)
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
          console.error("Upsert error", pubNumber, error);
          continue;
        }
        saved += 1;
      }

      // If fewer than a full page came back, we're at the end.
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
        next_page: has_more ? currentPage : null,
        processed,
        saved,
        skipped_stale,
        has_more,
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
