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
const CALENDAR_URL = `${BASE}/vestnik-a-registre/vestnik/calendar`;
const MAX_ISSUES_PER_CALL = 3;
const MAX_DETAILS_PER_ISSUE = 60;
const DETAIL_DELAY_MS = 500;
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
 * Discover the URLs of the last ~3 months of vestník issues.
 * Strategy:
 *   1. Fetch the calendar / current list page.
 *   2. Collect all anchors whose href matches /vestnik-a-registre/vestnik/{num}-{year}.
 *   3. If we didn't get enough, synthesize URLs by decrementing the current
 *      issue number (with rollover across the year boundary).
 */
async function discoverIssues(): Promise<IssueRef[]> {
  const found = new Map<string, IssueRef>();

  const addFromHtml = (html: string) => {
    const re = /href="([^"]*\/vestnik-a-registre\/vestnik\/(\d+)-(\d{4}))"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = decodeEntities(m[1]);
      const label = `${m[2]}/${m[3]}`;
      const url = href.startsWith("http") ? href : `${BASE}${href}`;
      if (!found.has(label)) found.set(label, { label, url });
    }
  };

  // Try calendar page (may not exist — non-fatal)
  try {
    const calHtml = await fetchText(CALENDAR_URL);
    addFromHtml(calHtml);
  } catch (e) {
    console.warn("calendar unreachable, falling back to list page:", (e as Error).message);
  }

  // Always also scan the main list page (for current issue anchor + navigation)
  const listHtml = await fetchText(LIST_URL);
  addFromHtml(listHtml);

  const current = parseIssue(listHtml);
  if (!current) throw new Error("Cannot parse current issue number");

  // Build a canonical URL for the current issue (in case we didn't find its anchor)
  const currentLabel = `${current.number}/${current.year}`;
  if (!found.has(currentLabel)) {
    found.set(currentLabel, {
      label: currentLabel,
      url: `${BASE}/vestnik-a-registre/vestnik/${current.number}-${current.year}`,
    });
  }

  // Sort discovered issues newest first (by year, then number)
  let issues = Array.from(found.values()).sort((a, b) => {
    const [an, ay] = a.label.split("/").map(Number);
    const [bn, by] = b.label.split("/").map(Number);
    if (ay !== by) return by - ay;
    return bn - an;
  });

  // If we have fewer than the expected lookback, synthesize by decrementing.
  if (issues.length < ISSUES_LOOKBACK_COUNT) {
    let num = Number(current.number);
    let year = Number(current.year);
    // UVO issue numbers per year are typically 250-260; we cross year boundary
    // conservatively by picking 250 as the rollover point when hitting 0.
    const YEAR_ROLLOVER = 250;
    const synthesized: IssueRef[] = [];
    for (let i = 0; synthesized.length + issues.length < ISSUES_LOOKBACK_COUNT && i < 400; i++) {
      num -= 1;
      if (num <= 0) {
        year -= 1;
        num = YEAR_ROLLOVER;
      }
      const label = `${num}/${year}`;
      if (found.has(label)) continue;
      synthesized.push({
        label,
        url: `${BASE}/vestnik-a-registre/vestnik/${num}-${year}`,
      });
    }
    issues = issues.concat(synthesized);
  }

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

  return { form_type, cpv, region, deadline, estimated_value };
}

async function processIssue(
  supabase: any,
  issue: IssueRef,
  now: number,
): Promise<{ saved: number; skipped_stale: number; skipped_existing: number; errors: number; listed: number }> {
  let saved = 0, skipped_stale = 0, errors = 0;

  const listHtml = await fetchText(issue.url);
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

      if (d.form_type && SKIP_FORM_TYPES.test(d.form_type)) continue;

      // Backfill rule: only future deadlines.
      if (!d.deadline || new Date(d.deadline).getTime() < now) {
        skipped_stale += 1;
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

  return { saved, skipped_stale, skipped_existing: existingSet.size, errors, listed: listed.length };
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
    let skipped_stale = 0;
    let errors = 0;
    const per_issue: any[] = [];

    for (const issue of toProcess) {
      try {
        const r = await processIssue(supabase, issue, now);
        saved += r.saved;
        skipped_stale += r.skipped_stale;
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
        skipped_stale,
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
