// Supabase Edge Function: cleanup-tenders
// Removes stale tenders so the database stays small:
//   - deadline older than 30 days
//   - no deadline AND published_at older than 60 days
// Called daily by pg_cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const deadlineCutoff = new Date(now);
    deadlineCutoff.setDate(deadlineCutoff.getDate() - 30);
    const publishedCutoff = new Date(now);
    publishedCutoff.setDate(publishedCutoff.getDate() - 60);

    // 1) deadline in the past by 30+ days
    const { data: expiredRows, error: expiredErr } = await supabase
      .from("tenders")
      .delete()
      .lt("deadline", deadlineCutoff.toISOString())
      .select("id");
    if (expiredErr) throw expiredErr;

    // 2) no deadline AND published_at older than 60 days
    const { data: staleRows, error: staleErr } = await supabase
      .from("tenders")
      .delete()
      .is("deadline", null)
      .lt("published_at", publishedCutoff.toISOString())
      .select("id");
    if (staleErr) throw staleErr;

    const result = {
      deleted_expired: expiredRows?.length ?? 0,
      deleted_stale_undated: staleRows?.length ?? 0,
      deadline_cutoff: deadlineCutoff.toISOString(),
      published_cutoff: publishedCutoff.toISOString(),
    };
    console.log("cleanup-tenders result", result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("cleanup-tenders failed", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
