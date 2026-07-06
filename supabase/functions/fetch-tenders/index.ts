// Supabase Edge Function: fetch-tenders
// Fetches Slovak public tenders from TED API and upserts them into public.tenders.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type MultilingualText = Record<string, string> | string | null | undefined;

function pickSk(value: MultilingualText): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value["slk"]) return value["slk"];
    if (value["sk"]) return value["sk"];
    const first = Object.values(value).find(
      (v) => typeof v === "string" && v.length > 0,
    );
    return (first as string) ?? null;
  }
  return null;
}

function firstString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = firstString(v);
      if (s) return s;
    }
    return null;
  }
  if (typeof value === "object") {
    return pickSk(value as MultilingualText);
  }
  return null;
}

function firstDate(value: unknown): string | null {
  const s = firstString(value);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
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
            "classification-cpv",
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

    let newCount = 0;
    let processed = 0;

    for (const n of notices) {
      const pubNumber = firstString(n["publication-number"]);
      if (!pubNumber) continue;

      const title = pickSk(n["notice-title"]);
      const buyer = pickSk(n["buyer-name"]);
      const cpv = firstString(n["classification-cpv"]);
      const publishedAt = firstDate(n["publication-date"]);
      const deadline = firstDate(n["deadline-receipt-tender-date-lot"]);
      const sourceUrl = `https://ted.europa.eu/sk/notice/${pubNumber}`;

      // Check if exists to count "new"
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
