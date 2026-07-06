// Supabase Edge Function: fetch-tenders
// Fetches Slovak public tenders from TED API and upserts them into public.tenders.

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

/**
 * Extract the first plain string out of TED's polymorphic values.
 * TED returns strings, arrays, or multilingual objects like {"slk": ["..."]}
 * where each language key can itself be a string OR an array of strings.
 */
function firstString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = firstString(v);
      if (s) return s;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Prefer Slovak
    for (const key of ["slk", "sk", "SLK", "SK"]) {
      if (key in obj) {
        const s = firstString(obj[key]);
        if (s) return s;
      }
    }
    // Fallback: first non-empty language
    for (const v of Object.values(obj)) {
      const s = firstString(v);
      if (s) return s;
    }
    return null;
  }
  return null;
}

/** TED sometimes returns "2026-07-21+02:00" (date + tz, no time). */
function parseTedDate(value: unknown): string | null {
  const s = firstString(value);
  if (!s) return null;
  // Insert T00:00:00 before tz offset if missing time component
  const normalized = /^\d{4}-\d{2}-\d{2}([+-]\d{2}:?\d{2}|Z)$/.test(s)
    ? s.replace(/^(\d{4}-\d{2}-\d{2})/, "$1T00:00:00")
    : s;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Pick the first NUTS-3 SK region code from an array like ["SK010","SVK",…]. */
function pickRegion(value: unknown): string | null {
  const collect = (v: unknown, out: string[]) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => collect(x, out));
    else if (v && typeof v === "object") {
      Object.values(v).forEach((x) => collect(x, out));
    }
  };
  const codes: string[] = [];
  collect(value, codes);

  for (const c of codes) {
    if (/^SK0[1-4][0-2]$/.test(c) && NUTS_TO_REGION[c]) {
      return NUTS_TO_REGION[c];
    }
  }
  // SK0 / SKZZ / plain SVK → whole country
  if (codes.some((c) => /^(SK0?|SKZZ|SVK)$/.test(c))) {
    return "celé Slovensko";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const tedRes = await fetch(
      "https://api.ted.europa.eu/v3/notices/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query:
            "place-of-performance IN (SVK) AND notice-type IN (cn-standard) SORT BY publication-date DESC",
          fields: [
            "publication-number",
            "notice-title",
            "buyer-name",
            "publication-date",
            "deadline-receipt-tender-date-lot",
            "deadline-receipt-request-date-lot",
            "classification-cpv",
            "place-of-performance",
          ],
          limit: 100,
          page: 1,
        }),
      },
    );

    if (!tedRes.ok) {
      const text = await tedRes.text();
      console.error("TED API error", tedRes.status, text);
      return new Response(
        JSON.stringify({ error: "TED API error", status: tedRes.status, body: text }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = await tedRes.json();
    const notices: any[] = payload?.notices ?? [];

    // Debug: log the raw shape of the first notice so future field-name
    // surprises are visible in edge-function logs.
    if (notices[0]) {
      console.log("TED sample notice keys:", Object.keys(notices[0]));
      console.log("TED sample notice payload:", JSON.stringify(notices[0]).slice(0, 2000));
    }

    let newCount = 0;
    let processed = 0;

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
      const sourceUrl = `https://ted.europa.eu/sk/notice/-/detail/${pubNumber}`;

      const { data: existing } = await supabase
        .from("tenders")
        .select("id")
        .eq("publication_number", pubNumber)
        .maybeSingle();

      const { error } = await supabase.from("tenders").upsert(
        {
          publication_number: pubNumber,
          title: title ?? pubNumber,
          contracting_authority: buyer ?? "—",
          cpv_code: cpv,
          region,
          published_at: publishedAt,
          deadline,
          source: "TED",
          source_url: sourceUrl,
        },
        { onConflict: "publication_number" },
      );

      if (error) {
        console.error("Upsert error", pubNumber, error);
        continue;
      }
      processed += 1;
      if (!existing) newCount += 1;
    }

    return new Response(
      JSON.stringify({ processed, new: newCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("fetch-tenders failed", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
