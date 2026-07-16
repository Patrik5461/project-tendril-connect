// Supabase Edge Function: backfill-ted-criteria
// One-shot batched backfill of structured_criteria for existing TED tenders.
// Call with POST { limit?: number, batch_size?: number, dry_run?: boolean }.
// Safe to call repeatedly — only picks rows where structured_criteria IS NULL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { TED_STRUCTURED_FIELDS, buildStructuredCriteria } from "../_shared/ted-criteria.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 5000);
    const batchSize = Math.min(Math.max(Number(body.batch_size) || 50, 1), 100);
    const dryRun = !!body.dry_run;

    // Pick TED rows still missing structured_criteria, oldest published first
    // (older data is more likely to be corrigendum-frozen; new data flows through fetch-tenders).
    const { data: rows, error } = await supabase
      .from("tenders")
      .select("id, publication_number")
      .eq("source", "TED")
      .is("structured_criteria", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;

    const total = rows?.length ?? 0;
    let fetched = 0;
    let updated = 0;
    let empty = 0;
    const errors: Array<{ pn: string; error: string }> = [];

    for (let i = 0; i < total; i += batchSize) {
      const batch = (rows ?? []).slice(i, i + batchSize);
      const pns = batch.map((r) => r.publication_number).filter(Boolean) as string[];
      if (!pns.length) continue;

      // TED expert query: IN() with unquoted values (matches pattern [0-9]{1,8}-[0-9]{4}).
      const query = `publication-number IN (${pns.join(",")})`;

      const res = await fetch("https://api.ted.europa.eu/v3/notices/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          fields: ["publication-number", ...TED_STRUCTURED_FIELDS],
          limit: batchSize,
          page: 1,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("TED batch failed", res.status, txt.slice(0, 300));
        errors.push({ pn: pns[0] + "…", error: `TED ${res.status}` });
        // rate-limit backoff
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const payload = await res.json();
      const notices: any[] = payload?.notices ?? [];
      fetched += notices.length;

      for (const n of notices) {
        const pn = firstString(n["publication-number"]);
        if (!pn) continue;
        const structured = buildStructuredCriteria(n);
        if (!structured) {
          empty += 1;
          continue;
        }
        if (dryRun) {
          updated += 1;
          continue;
        }
        const { error: uErr } = await supabase
          .from("tenders")
          .update({ structured_criteria: structured })
          .eq("publication_number", pn);
        if (uErr) {
          errors.push({ pn, error: uErr.message });
        } else {
          updated += 1;
        }
      }

      // Small delay between batches to be gentle on TED API.
      await new Promise((r) => setTimeout(r, 250));
    }

    return new Response(
      JSON.stringify({
        candidates: total,
        fetched_from_ted: fetched,
        updated,
        empty_notices: empty,
        errors: errors.slice(0, 20),
        error_count: errors.length,
        dry_run: dryRun,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-ted-criteria failed", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function firstString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const v of value) { const s = firstString(v); if (s) return s; }
    return null;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const s = firstString(v);
      if (s) return s;
    }
  }
  return null;
}
