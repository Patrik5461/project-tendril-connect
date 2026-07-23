// Supabase Edge Function: backfill-itms-grants
// Manual historical backfill of ITMS21+ vyzvy.
// Paginated per call to avoid edge timeouts.
//
// POST body:
//   { "next_offset": 0, "limit": 100, "ajUkoncene": true, "raw_only": false }
//
// - raw_only=true: return the raw list page without upserting (for admin diagnostics).
// - Otherwise: upsert this page's rows (list-level fields only, no detail calls)
//   OR set with_detail=true to also fetch details (slower, throttled).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  itmsGetVyzva,
  itmsListVyzvy,
  normalizeVyzva,
  type ItmsVyzvaListItem,
} from "../_shared/itms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const DEFAULT_LIMIT = 100;
const DETAIL_DELAY_MS = 300;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const nextOffset = Number(body?.next_offset ?? 0) || 0;
    const limit = Math.min(Math.max(Number(body?.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), 200);
    const ajUkoncene = body?.ajUkoncene !== false; // default true
    const rawOnly = body?.raw_only === true;
    const withDetail = body?.with_detail !== false; // default true (fetch full detail)

    const list = await itmsListVyzvy({
      limit,
      offset: nextOffset,
      ajUkoncene,
      expression: "DATUMVYHLASENIA",
      ascending: false,
    });

    if (rawOnly) {
      return new Response(
        JSON.stringify({
          mode: "raw_only",
          offset: list.offset,
          limit: list.limit,
          total: list.size,
          returned: list.results.length,
          next_offset: nextOffset + list.results.length,
          has_more: nextOffset + list.results.length < list.size,
          results: list.results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let upserted = 0;
    let failed = 0;
    let skipped = 0;
    const items: Array<{
      id: number;
      kod: string | null;
      status: "upserted" | "failed_detail" | "failed_upsert" | "skipped";
      reason?: string;
      itms_typ?: unknown;
      mapped_stav?: string;
      deadline?: string | null;
    }> = [];

    for (const item of list.results as ItmsVyzvaListItem[]) {
      const meta = { id: item.id, kod: (item.kod as string) ?? null, itms_typ: item.typ };
      let detail;
      try {
        detail = withDetail ? await itmsGetVyzva(item.id) : (item as never);
      } catch (e) {
        items.push({ ...meta, status: "failed_detail", reason: (e as Error).message });
        failed++;
        if (withDetail) await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS));
        continue;
      }
      const row = normalizeVyzva(detail);
      if (!row.source_id || row.source_id === "undefined") {
        items.push({ ...meta, status: "skipped", reason: "missing_source_id" });
        skipped++;
        if (withDetail) await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS));
        continue;
      }
      const { error } = await supabase
        .from("grant_calls")
        .upsert(row, { onConflict: "source,source_id" });
      if (error) {
        items.push({ ...meta, status: "failed_upsert", reason: error.message, mapped_stav: row.stav as string });
        failed++;
      } else {
        items.push({
          ...meta,
          status: "upserted",
          mapped_stav: row.stav as string,
          deadline: row.deadline as string | null,
        });
        upserted++;
      }
      if (withDetail) await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS));
    }

    const nextOff = nextOffset + list.results.length;
    const hasMore = nextOff < list.size;
    return new Response(
      JSON.stringify({
        mode: withDetail ? "with_detail" : "list_only",
        offset: list.offset,
        limit: list.limit,
        total: list.size,
        fetched: list.results.length,
        upserted,
        failed,
        skipped,
        next_offset: nextOff,
        has_more: hasMore,
        items,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("backfill-itms-grants failed", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
