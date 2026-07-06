// Supabase Edge Function: fetch-uvo-tenders
// Scrapes the current issue of "Vestník verejného obstarávania" from
// www.uvo.gov.sk and upserts new notices (groups M + WY) into public.tenders.
//
// Design notes:
// - Always processes the CURRENT issue only (top of /vestnik-a-registre/vestnik).
// - Deduplicates by publication_number BEFORE downloading details, to save
//   requests. After the first backfill, only a handful of new details load.
// - Polite scraping: custom User-Agent, 500 ms pause between detail requests,
//   hard cap of 60 detail fetches per run.
// - Filters out result / cancellation / correction notice types.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const USER_AGENT =
  "TendrikBot/1.0 (bezplatny monitoring VO; kontakt@tendrik.sk)";
const BASE = "https://www.uvo.gov.sk";
const LIST_URL = `${BASE}/vestnik-a-registre/vestnik`;
const MAX_DETAILS = 60;
const DETAIL_DELAY_MS = 500;

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
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
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

type ListedNotice = {
  publication_number: string;
  order_num: string;
  type_code: string;
  buyer: string;
  title: string;
  detail_url: string;
};

function parseIssue(html: string): { number: string; year: string } | null {
  const m = html.match(/Vestník\s+číslo\s+(\d+)\/(\d{4})/i);
  if (!m) return null;
  return { number: m[1], year: m[2] };
}

function extractGroup(html: string, groupId: string): string {
  const re = new RegExp(
    `<ul[^>]*id="vestnik-0-${groupId}"[^>]*>([\\s\\S]*?)</ul>`,
    "i",
  );
  const m = html.match(re);
  return m ? m[1] : "";
}

function parseListedNotices(html: string, year: string): ListedNotice[] {
  const out: ListedNotice[] = [];
  for (const group of ["M", "WY"]) {
    const block = extractGroup(html, group);
    if (!block) continue;
    const anchorRe =
      /<a\s+class="ul-link"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let am: RegExpExecArray | null;
    while ((am = anchorRe.exec(block)) !== null) {
      const href = decodeEntities(am[1]);
      const inner = am[2];
      const titleMatch = inner.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
      const title = titleMatch ? stripTags(titleMatch[1]) : "";
      // Text before the <span> looks like: " 9367 - MST : Banskobystrický ... "
      const headText = stripTags(inner.replace(/<span[\s\S]*/i, ""));
      const headMatch = headText.match(/^(\d+)\s*-\s*([A-Z]+)\s*:\s*(.+?)$/);
      if (!headMatch) continue;
      const [, orderNum, typeCode, buyer] = headMatch;
      out.push({
        publication_number: `${orderNum}-${year}`,
        order_num: orderNum,
        type_code: typeCode,
        buyer: buyer.trim(),
        title: title || `${typeCode} ${orderNum}`,
        detail_url: href.startsWith("http") ? href : `${BASE}${href}`,
      });
    }
  }
  // Sort ascending by order number for stable pagination
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
    findVal(/^Typ oznámenia:\s*(.+)$/i) ||
    findVal(/^Typ formulára:\s*(.+)$/i);

  // CPV: first look for "Kód CPV", then fallback to first token of
  // "Doplňujúci CPV kód: 39110000, 39120000, ..."
  let cpv = findVal(/^(?:Hlavný\s+)?Kód CPV:\s*(\S+)/i);
  if (!cpv) {
    const doprCpv = findVal(/^Doplňujúci CPV kód:\s*(.+)$/i);
    if (doprCpv) cpv = doprCpv.split(/[,\s]/)[0] || null;
  }

  // NUTS
  let region: string | null = null;
  const nutsMatch = html.match(/\bSK0[1-4][0-2]\b/);
  if (nutsMatch && NUTS_TO_REGION[nutsMatch[0]]) {
    region = NUTS_TO_REGION[nutsMatch[0]];
  } else if (/\bSK0\b|\bSKZZ\b|\bSVK\b/.test(html)) {
    region = "celé Slovensko";
  } else {
    region = "celé Slovensko";
  }

  // Deadline: "Lehota na predkladanie ponúk (dátum): 04.08.2026" + "(čas): 11:00"
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
    // Local Slovak time; +02:00 is a safe approximation year-round for a
    // deadline. Postgres stores it as timestamptz correctly.
    const iso = `${y}-${mo}-${d}T${t.length === 4 ? "0" + t : t}:00+02:00`;
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) deadline = dt.toISOString();
  }

  // Estimated value (procedure-level)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) List page
    const listHtml = await fetchText(LIST_URL);
    const issue = parseIssue(listHtml);
    if (!issue) {
      return new Response(
        JSON.stringify({ error: "Cannot parse issue number from list page" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const issueLabel = `${issue.number}/${issue.year}`;
    const listed = parseListedNotices(listHtml, issue.year);
    console.log(`Issue ${issueLabel}: listed ${listed.length} notices (M+WY)`);

    // 2) Dedupe against DB
    const pubs = listed.map((n) => n.publication_number);
    let existingSet = new Set<string>();
    if (pubs.length > 0) {
      const { data: existing, error: exErr } = await supabase
        .from("tenders")
        .select("publication_number")
        .in("publication_number", pubs);
      if (exErr) throw exErr;
      existingSet = new Set(
        (existing ?? []).map((r: any) => r.publication_number),
      );
    }
    const todo = listed
      .filter((n) => !existingSet.has(n.publication_number))
      .slice(0, MAX_DETAILS);
    const skippedExisting = listed.length - todo.length -
      Math.max(0, listed.length - existingSet.size - MAX_DETAILS);

    // 3) Fetch + parse details
    let saved = 0;
    let fetchedDetails = 0;
    let errors = 0;

    for (let i = 0; i < todo.length; i++) {
      const n = todo[i];
      try {
        if (i > 0) await sleep(DETAIL_DELAY_MS);
        const detailHtml = await fetchText(n.detail_url);
        fetchedDetails += 1;
        const d = parseDetail(detailHtml);

        if (d.form_type && SKIP_FORM_TYPES.test(d.form_type)) {
          console.log(
            `Skip ${n.publication_number}: form_type='${d.form_type}'`,
          );
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
          console.error(`Upsert error ${n.publication_number}`, upErr);
          errors += 1;
          continue;
        }
        saved += 1;
      } catch (e) {
        errors += 1;
        console.error(
          `Detail failed ${n.publication_number} ${n.detail_url}`,
          (e as Error).message,
        );
      }
    }

    const result = {
      issue: issueLabel,
      listed: listed.length,
      fetched_details: fetchedDetails,
      saved,
      skipped_existing: existingSet.size,
      errors,
    };
    console.log("fetch-uvo-tenders result", result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-uvo-tenders failed", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
