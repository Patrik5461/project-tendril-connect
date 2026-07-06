// Supabase Edge Function: backfill-uvo
// Manual historical backfill of Slovak procurement notices from the UVO
// Vestník. Discovers issues from the last ~3 months and reuses the same
// scraping logic as fetch-uvo-tenders. Processes at most 3 issues per
// invocation; the caller keeps calling until has_more = false.
//
// Call:
//   POST {}                                  -> discover issues, process first 3
//   POST { "remaining_issues": [{...}, ...] } -> process next 3, return the rest
//
// A "remaining_issues" entry is: { label: "132/2026", url: "https://.../vestnik/132-2026" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const USER_AGENT = "TendrikBot/1.0 (bezplatny monitoring VO; kontakt@tendrik.sk)";
const BASE = "https://www.uvo.gov.sk";
const LIST_URL = `${BASE}/vestnik-a-registre/vestnik`;
const CALENDAR_AJAX_URL = `${BASE}/vestnik-a-registre/vestnik/ajaxCalendar?type=199900`;
const MAX_ISSUES_PER_CALL = 1;
const MAX_DETAILS_PER_ISSUE = 60;
const DETAIL_DELAY_MS = 250;
const ISSUES_LOOKBACK_DAYS = 92;
// UVO publishes on business days (~5/week), so ~65 issues in 3 months
const ISSUES_LOOKBACK_COUNT = 65;

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

const SKIP_FORM_TYPES = /Výsledok|Zrušen|Oprav/i;

type IssueRef = { label: string; url: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "sk,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.text();
}

function parseIssue(html: string): { number: string; year: string } | null {
  const m = html.match(/Vestník\s+číslo\s+(\d+)\/(\d{4})/i);
  if (!m) return null;
  return { number: m[1], year: m[2] };
}

/**
/**
 * Discover URLs of the last ~3 months of vestník issues via the FullCalendar
 * AJAX endpoint. It returns JSON entries of the form:
 *   { title: "133/2026", start: "2026-07-06",
 *     url: "/vestnik-a-registre/vestnik?date=&order=133&year=2026&cHash=..." }
 * The cHash token is required — synthetic URLs like /vestnik/{n}-{y} return
 * a "Nedostupne" page.
 */
async function discoverIssues(): Promise<IssueRef[]> {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - ISSUES_LOOKBACK_DAYS);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const url = `${CALENDAR_AJAX_URL}&start=${iso(start)}&end=${iso(end)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
      "Accept-Language": "sk,en;q=0.8",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok) throw new Error(`ajaxCalendar HTTP ${res.status}`);
  const arr: Array<{ title: string; start: string; url: string }> = await res.json();

  const found = new Map<string, IssueRef>();
  for (const e of arr) {
    if (!e?.title || !e?.url) continue;
    const label = e.title.trim();
    if (found.has(label)) continue;
    const href = decodeEntities(e.url);
    found.set(label, {
      label,
      url: href.startsWith("http") ? href : `${BASE}${href}`,
    });
  }

  // Sort newest first: parse "N/YYYY".
  const issues = Array.from(found.values()).sort((a, b) => {
    const [an, ay] = a.label.split("/").map(Number);
    const [bn, by] = b.label.split("/").map(Number);
    if (ay !== by) return by - ay;
    return bn - an;
  });

  return issues.slice(0, ISSUES_LOOKBACK_COUNT);
}

// ------- Reused parsers from fetch-uvo-tenders -------

type ListedNotice = {
  publication_number: string;
  order_num: string;
  type_code: string;
  buyer: string;
  title: string;
  detail_url: string;
};

function parseListedNotices(html: string, year: string): ListedNotice[] {
  const out: ListedNotice[] = [];
  const anchorRe = /<a\s+class="ul-link"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(html)) !== null) {
    const href = decodeEntities(am[1]);
    const inner = am[2];
    const titleMatch = inner.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
    const title = titleMatch ? stripTags(titleMatch[1]) : "";
    const headText = stripTags(inner.replace(/<span[\s\S]*/i, ""));
    const headMatch = headText.match(/^(\d+)\s*-\s*([A-Z]+)\s*:\s*(.+?)$/);
    if (!headMatch) continue;
    const [, orderNum, typeCode, buyer] = headMatch;
    if (!(typeCode.startsWith("M") || typeCode.startsWith("WY"))) continue;
    out.push({
      publication_number: `${orderNum}-${year}`,
      order_num: orderNum,
      type_code: typeCode,
      buyer: buyer.trim(),
      title: title || `${typeCode} ${orderNum}`,
      detail_url: href.startsWith("http") ? href : `${BASE}${href}`,
    });
  }
  out.sort((a, b) => Number(a.order_num) - Number(b.order_num));
  return out;
}

type DetailFields = {
  form_type: string | null;
  cpv: string | null;
  region: string | null;
  deadline: string | null;
  estimated_value: number | null;
  currency: string | null;
};

function parseDetail(html: string): DetailFields {
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html)) !== null) {
    const t = stripTags(m[1]);
    if (t) lines.push(t);
  }

  const findVal = (labelRe: RegExp): string | null => {
    for (const l of lines) {
      const mm = l.match(labelRe);
      if (mm) return (mm[1] || "").trim() || null;
    }
    return null;
  };

  const form_type =
    findVal(/^Typ oznámenia:\s*(.+)$/i) || findVal(/^Typ formulára:\s*(.+)$/i);

  let cpv = findVal(/^(?:Hlavný\s+)?Kód CPV:\s*(\S+)/i);
  if (!cpv) {
    const doprCpv = findVal(/^Doplňujúci CPV kód:\s*(.+)$/i);
    if (doprCpv) cpv = doprCpv.split(/[,\s]/)[0] || null;
  }

  let region: string | null = null;
  const nutsMatch = html.match(/\bSK0[1-4][0-2]\b/);
  if (nutsMatch && NUTS_TO_REGION[nutsMatch[0]]) region = NUTS_TO_REGION[nutsMatch[0]];
  else if (/\bSK0\b|\bSKZZ\b|\bSVK\b/.test(html)) region = "celé Slovensko";
  else region = "celé Slovensko";

  const dateStr = findVal(
    /^Lehota na predkladanie ponúk\s*\(dátum\):\s*(\d{2}\.\d{2}\.\d{4})/i,
  );
  const timeStr = findVal(
    /^Lehota na predkladanie ponúk\s*\(čas\):\s*(\d{1,2}:\d{2})/i,
  );
  let deadline: string | null = null;
  if (dateStr) {
    const [d, mo, y] = dateStr.split(".");
    const t = timeStr ?? "23:59";
    const iso = `${y}-${mo}-${d}T${t.length === 4 ? "0" + t : t}:00+02:00`;
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) deadline = dt.toISOString();
  }

  const valStr = findVal(
    /Predpokladaná hodnota \(BT-27-Procedure\) \(hodnota\):\s*([\d\s.,]+)/i,
  );
  let estimated_value: number | null = null;
  if (valStr) {
    const cleaned = valStr.replace(/\s/g, "").replace(",", ".");
    const n = Number(cleaned);
    if (!isNaN(n)) estimated_value = n;
  }
  const curStr = findVal(
    /Predpokladaná hodnota \(BT-27-Procedure\) \(mena\):\s*([A-Za-z]{3})/i,
  );
  const currency = curStr ? curStr.toUpperCase() : (estimated_value != null ? "EUR" : null);

  return { form_type, cpv, region, deadline, estimated_value, currency };
}

type IssueResult = {
  saved: number;
  skipped_missing_deadline: number;
  skipped_past_deadline: number;
  skipped_form_type: number;
  skipped_existing: number;
  errors: number;
  listed: number;
  unavailable?: boolean;
};

async function processIssue(
  supabase: any,
  issue: IssueRef,
  now: number,
): Promise<IssueResult> {
  let saved = 0, skipped_missing_deadline = 0, skipped_past_deadline = 0, skipped_form_type = 0, errors = 0;

  const listHtml = await fetchText(issue.url);
  // Sanity check: real issue pages are ~100+ kB with ul-link anchors. The
  // "Nedostupne" placeholder is ~3.5 kB and has zero ul-link occurrences.
  if (!listHtml.includes("ul-link") || /<title>Nedostupne<\/title>/i.test(listHtml)) {
    console.warn(`Issue ${issue.label} unavailable (${listHtml.length} B) — skipping`);
    return { saved: 0, skipped_missing_deadline: 0, skipped_past_deadline: 0, skipped_form_type: 0, skipped_existing: 0, errors: 0, listed: 0, unavailable: true };
  }

  const yearMatch = issue.label.match(/\/(\d{4})$/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getUTCFullYear());
  const listed = parseListedNotices(listHtml, year);

  const pubs = listed.map((n) => n.publication_number);
  let existingSet = new Set<string>();
  if (pubs.length > 0) {
    const { data: existing } = await supabase
      .from("tenders")
      .select("publication_number")
      .in("publication_number", pubs);
    existingSet = new Set((existing ?? []).map((r: any) => r.publication_number));
  }
  const todo = listed
    .filter((n) => !existingSet.has(n.publication_number))
    .slice(0, MAX_DETAILS_PER_ISSUE);

  for (let i = 0; i < todo.length; i++) {
    const n = todo[i];
    try {
      if (i > 0) await sleep(DETAIL_DELAY_MS);
      const detailHtml = await fetchText(n.detail_url);
      const d = parseDetail(detailHtml);

      if (d.form_type && SKIP_FORM_TYPES.test(d.form_type)) {
        skipped_form_type += 1;
        continue;
      }

      if (!d.deadline) {
        skipped_missing_deadline += 1;
        continue;
      }
      if (new Date(d.deadline).getTime() < now) {
        skipped_past_deadline += 1;
        continue;
      }

      const { error: upErr } = await supabase.from("tenders").upsert(
        {
          publication_number: n.publication_number,
          title: n.title,
          contracting_authority: n.buyer || "—",
          cpv_code: d.cpv,
          region: d.region,
          deadline: d.deadline,
          estimated_value: d.estimated_value,
          currency: d.currency,
          source: "UVO",
          source_url: n.detail_url,
          published_at: new Date().toISOString(),
        },
        { onConflict: "publication_number" },
      );
      if (upErr) {
        errors += 1;
        continue;
      }
      saved += 1;
    } catch (e) {
      errors += 1;
      console.error(`Detail failed ${n.publication_number}`, (e as Error).message);
    }
  }

  return {
    saved,
    skipped_missing_deadline,
    skipped_past_deadline,
    skipped_form_type,
    skipped_existing: existingSet.size,
    errors,
    listed: listed.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: { remaining_issues?: IssueRef[] } = {};
    try { body = await req.json(); } catch (_) { body = {}; }

    // On first call, discover.
    let queue: IssueRef[];
    if (body.remaining_issues && Array.isArray(body.remaining_issues) && body.remaining_issues.length > 0) {
      queue = body.remaining_issues;
    } else {
      queue = await discoverIssues();
      console.log(`Discovered ${queue.length} issues for backfill`);
    }

    const now = Date.now();
    const toProcess = queue.slice(0, MAX_ISSUES_PER_CALL);
    const remaining = queue.slice(MAX_ISSUES_PER_CALL);

    let saved = 0;
    let listed_total = 0;
    let skipped_missing_deadline = 0;
    let skipped_past_deadline = 0;
    let skipped_form_type = 0;
    let unavailable = 0;
    let errors = 0;
    const per_issue: any[] = [];

    for (const issue of toProcess) {
      try {
        const r = await processIssue(supabase, issue, now);
        saved += r.saved;
        listed_total += r.listed;
        skipped_missing_deadline += r.skipped_missing_deadline;
        skipped_past_deadline += r.skipped_past_deadline;
        skipped_form_type += r.skipped_form_type;
        if (r.unavailable) unavailable += 1;
        errors += r.errors;
        per_issue.push({ issue: issue.label, ...r });
      } catch (e) {
        errors += 1;
        per_issue.push({ issue: issue.label, error: (e as Error).message });
        console.error(`Issue ${issue.label} failed:`, (e as Error).message);
      }
    }

    return new Response(
      JSON.stringify({
        issues_done: toProcess.map((i) => i.label),
        remaining_issues: remaining,
        saved,
        listed: listed_total,
        skipped_missing_deadline,
        skipped_past_deadline,
        skipped_form_type,
        unavailable_issues: unavailable,
        errors,
        has_more: remaining.length > 0,
        per_issue,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-uvo failed", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
