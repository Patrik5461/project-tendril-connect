// Supabase Edge Function: fetch-josephine-tenders
// Scrapes active Slovak tenders from Josephine (josephine.proebiz.com) public
// list and upserts them into public.tenders.
//
// Data source: server-rendered HTML list at
//   /sk/public-tenders/list/{page}?filter[nuts]=1&filter[state]=executed
//   &order=id&sort=DESC
// The list rows contain every field we need — id, ref, title, CPV, buyer,
// country code, value, deadline — so no detail fetch is required.
//
// Design mirrors fetch-eks-tenders:
// - Deduplicate by publication_number BEFORE processing.
// - Polite scraping: browser-like UA, ~500 ms between list pages.
// - Hard cap of MAX_SAVE_PER_RUN new rows per run.
// - Skip rows whose country != SK (defense in depth on top of nuts filter).
// - Skip rows whose deadline is missing or already past.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";
const BASE = "https://josephine.proebiz.com";
const LIST_PATH = "/sk/public-tenders/list";
const DETAIL_URL = (id: string) => `${BASE}/sk/tender/${id}/summary`;

const PAGE_DELAY_MS = 500;
const DEFAULT_PAGES_PER_RUN = 3; // 20 rows/page → up to 60 rows/run
const MAX_PAGES_PER_RUN = 15;
const MAX_SAVE_PER_RUN = 60;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ListRow = {
  id: string;
  ref: string;
  title: string;
  cpv: string | null;
  buyer: string;
  country: string; // e.g. "SK", "CZ", "PL"
  value: number | null;
  currency: string | null;
  deadline: string | null; // ISO UTC
  status: string;
};

// Parse "23.07.2026 10:00:00" (SK local, no tz) → ISO UTC.
function parseDeadlineSk(s: string): string | null {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+02:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Parse value like "116 305,80 EUR" or "1.234,56 EUR".
function parseValue(s: string): { value: number | null; currency: string | null } {
  const m = s.match(/([\d\s.]+,\d+|\d[\d\s.]*)\s*(EUR|€|CZK|Kč|PLN|zł)/i);
  if (!m) return { value: null, currency: null };
  const raw = m[1].replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(raw);
  if (!isFinite(n) || n <= 0) return { value: null, currency: null };
  let currency = m[2].toUpperCase();
  if (currency === "€") currency = "EUR";
  else if (currency === "KČ") currency = "CZK";
  else if (currency === "ZŁ") currency = "PLN";
  return { value: n, currency };
}

function parseListPage(html: string): ListRow[] {
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];
  const tbody = tbodyMatch[1];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const out: ListRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(tbody)) !== null) {
    const rowHtml = m[1];
    const tds: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tdRe.exec(rowHtml)) !== null) tds.push(tm[1]);
    if (tds.length < 7) continue;
    // td0 = id, td1 = ref, td2 = title + cpv, td3 = mode label,
    // td4 = buyer + country, td5 = value + type, td6 = deadline + status
    const id = stripTags(tds[0]);
    if (!/^\d+$/.test(id)) continue;
    const ref = stripTags(tds[1]);
    const titleAndCpv = tds[2];
    const titleMatch = titleAndCpv.match(/<strong>([\s\S]*?)<\/strong>/);
    const title = titleMatch ? stripTags(titleMatch[1]) : stripTags(titleAndCpv);
    const cpvMatch = stripTags(titleAndCpv).replace(title, "").match(/(\d{8}-\d)/);
    const cpv = cpvMatch ? cpvMatch[1] : null;
    const buyerBlock = stripTags(tds[4]);
    const cCodeMatch = buyerBlock.match(/\b([A-Z]{2})\b\s*$/);
    const country = cCodeMatch ? cCodeMatch[1] : "";
    const buyer = cCodeMatch
      ? buyerBlock.slice(0, cCodeMatch.index).trim()
      : buyerBlock;
    const valueBlock = stripTags(tds[5]);
    const { value, currency } = parseValue(valueBlock);
    const deadlineBlock = stripTags(tds[6]);
    const deadlineMatch = deadlineBlock.match(
      /\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}/,
    );
    const deadline = deadlineMatch ? parseDeadlineSk(deadlineMatch[0]) : null;
    const statusMatch = deadlineBlock.match(
      /(Prebiehaj[úu]ca|Ukon[čc]en[áa]|Zru[šs]en[áa])/,
    );
    const status = statusMatch ? statusMatch[1] : "";
    out.push({
      id,
      ref,
      title,
      cpv,
      buyer,
      country,
      value,
      currency,
      deadline,
      status,
    });
  }
  return out;
}

async function fetchListPage(page: number): Promise<string> {
  const qs = new URLSearchParams();
  qs.set("filter[nuts]", "1"); // SK
  qs.set("filter[state]", "executed"); // Prebiehajúca
  qs.set("order", "id");
  qs.set("sort", "DESC");
  const url = `${BASE}${LIST_PATH}/${page}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "sk,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`List page ${page} HTTP ${res.status}`);
  return await res.text();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let startPage = 1;
    let pagesToFetch = DEFAULT_PAGES_PER_RUN;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (Number.isInteger(body?.startPage) && body.startPage > 0) {
          startPage = body.startPage;
        }
        if (Number.isInteger(body?.pages) && body.pages > 0) {
          pagesToFetch = Math.min(body.pages, MAX_PAGES_PER_RUN);
        }
      } catch {
        // no body
      }
    }

    const allRows: ListRow[] = [];
    let unavailablePages = 0;
    for (let i = 0; i < pagesToFetch; i++) {
      const p = startPage + i;
      try {
        if (i > 0) await sleep(PAGE_DELAY_MS);
        const html = await fetchListPage(p);
        const rows = parseListPage(html);
        if (rows.length === 0) {
          console.log(`Josephine page ${p}: no rows, stopping.`);
          break;
        }
        allRows.push(...rows);
      } catch (e) {
        unavailablePages += 1;
        console.warn(`Josephine page ${p} failed`, (e as Error).message);
      }
    }

    const now = Date.now();
    let skippedForeign = 0;
    let skippedMissingDeadline = 0;
    const skRows = allRows.filter((r) => {
      if (r.country !== "SK") {
        skippedForeign += 1;
        return false;
      }
      if (!r.deadline || new Date(r.deadline).getTime() <= now) {
        skippedMissingDeadline += 1;
        return false;
      }
      return true;
    });

    // Dedup within batch (keep first occurrence)
    const uniqueMap = new Map<string, ListRow>();
    for (const r of skRows) {
      const pk = `JOS-${r.ref || r.id}`;
      if (!uniqueMap.has(pk)) uniqueMap.set(pk, r);
    }
    const publications = Array.from(uniqueMap.keys());

    let existingSet = new Set<string>();
    if (publications.length > 0) {
      const { data: existing, error: exErr } = await supabase
        .from("tenders")
        .select("publication_number")
        .in("publication_number", publications);
      if (exErr) throw exErr;
      existingSet = new Set(
        (existing ?? []).map((r: { publication_number: string }) =>
          r.publication_number,
        ),
      );
    }

    const todo: Array<[string, ListRow]> = [];
    for (const [pk, r] of uniqueMap.entries()) {
      if (existingSet.has(pk)) continue;
      todo.push([pk, r]);
      if (todo.length >= MAX_SAVE_PER_RUN) break;
    }

    let saved = 0;
    let errors = 0;
    const nowIso = new Date().toISOString();
    for (const [pk, r] of todo) {
      try {
        const { error: upErr } = await supabase.from("tenders").upsert(
          {
            publication_number: pk,
            title: r.title,
            description: null,
            contracting_authority: r.buyer || "—",
            cpv_code: r.cpv,
            region: null,
            country: "SK",
            country_name: "Slovensko",
            deadline: r.deadline,
            estimated_value: r.value,
            currency: r.currency,
            source: "JOSEPHINE",
            source_url: DETAIL_URL(r.id),
            published_at: nowIso,
          },
          { onConflict: "publication_number" },
        );
        if (upErr) {
          console.error(`Upsert error ${pk}`, upErr);
          errors += 1;
          continue;
        }
        saved += 1;
      } catch (e) {
        errors += 1;
        console.error(`Save failed ${pk}`, (e as Error).message);
      }
    }

    const result = {
      listed: allRows.length,
      saved,
      skipped_existing: existingSet.size,
      skipped_foreign: skippedForeign,
      skipped_missing_deadline: skippedMissingDeadline,
      unavailable_pages: unavailablePages,
      errors,
      start_page: startPage,
      pages_fetched: pagesToFetch,
    };
    console.log("fetch-josephine-tenders result", result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-josephine-tenders failed", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
