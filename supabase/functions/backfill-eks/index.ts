// Supabase Edge Function: backfill-eks
// Runs the same active-tender fetch logic as fetch-eks-tenders but with a
// larger detail cap. Because EKS exposes only current tenders (there's no
// public historical vestník paging), a single call is enough to hydrate the
// active set.

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Delegate to fetch-eks-tenders repeatedly until nothing new is saved.
    let totalSaved = 0;
    let iterations = 0;
    let last: any = null;
    const maxIter = 6;
    while (iterations < maxIter) {
      const r = await fetch(`${supabaseUrl}/functions/v1/fetch-eks-tenders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: "{}",
      });
      const j = await r.json();
      last = j;
      iterations += 1;
      const saved = Number(j?.saved ?? 0);
      totalSaved += saved;
      if (saved === 0) break;
    }
    return new Response(
      JSON.stringify({ total_saved: totalSaved, iterations, last }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
