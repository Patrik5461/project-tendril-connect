// Supabase Edge Function: fetch-itms-grants
// Incremental sync of ITMS21+ vyzvy (grant calls).
// - Watermark stored in app_settings.key = 'itms_grants_watermark' (unix ms).
// - Empty watermark = full sync (falls back to backfill semantics).
// - Runs nightly via pg_cron (see cron setup); DataCentrum recommends nighttime.
// - Detail calls are throttled to be gentle on ITMS.

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

const PAGE_LIMIT = 100;
const MAX_PAGES = 30; // hard safety cap per invocation (30 * 100 = 3000)
const DETAIL_DELAY_MS = 250;
const WATERMARK_KEY = "itms_grants_watermark";

async function readWatermark(supabase: ReturnType<typeof createClient>): Promise<number | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", WATERMARK_KEY)
    .maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

async function writeWatermark(supabase: ReturnType<typeof createClient>, ms: number): Promise<void> {
  await supabase
    .from("app_settings")
    .upsert({ key: WATERMARK_KEY, value: ms, updated_at: new Date().toISOString() });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const forceFull = body?.full === true;
    const overrideSince = typeof body?.since === "number" ? (body.since as number) : null;

    const watermark = forceFull ? null : (overrideSince ?? (await readWatermark(supabase)));
    const startedAt = Date.now();

    let offset = 0;
    let processed = 0;
    let upserted = 0;
    let failed = 0;
    let pages = 0;
    let total = 0;

    while (pages < MAX_PAGES) {
      const list = await itmsListVyzvy({
        limit: PAGE_LIMIT,
        offset,
        ajUkoncene: true,
        modifiedSince: watermark ?? undefined,
        expression: "DATUMVYHLASENIA",
        ascending: false,
      });
      total = list.size;
      pages++;

      if (!list.results.length) break;

      for (const item of list.results as ItmsVyzvaListItem[]) {
        processed++;
        try {
          // Fetch detail (dokumenty + podmienky) — throttled.
          const detail = await itmsGetVyzva(item.id);
          const row = normalizeVyzva(detail);
          const { error } = await supabase
            .from("grant_calls")
            .upsert(row, { onConflict: "source,source_id" });
          if (error) {
            console.error("upsert failed", item.id, error.message);
            failed++;
          } else {
            upserted++;
          }
        } catch (e) {
          console.error("detail fetch failed", item.id, e);
          failed++;
        }
        await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS));
      }

      offset += PAGE_LIMIT;
      if (offset >= total) break;
    }

    // Advance watermark only on a fully successful run that covered everything.
    // (For a full-sync we still advance; for incremental only if failures didn't happen.)
    if (failed === 0 && (offset >= total || pages < MAX_PAGES)) {
      await writeWatermark(supabase, startedAt);
    }

    const result = {
      mode: watermark ? "incremental" : "full",
      watermark_used: watermark,
      total_available: total,
      pages,
      processed,
      upserted,
      failed,
      duration_ms: Date.now() - startedAt,
    };
    console.log("fetch-itms-grants", result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-itms-grants failed", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
