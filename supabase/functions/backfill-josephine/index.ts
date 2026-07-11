// Supabase Edge Function: backfill-josephine
// Delegates to fetch-josephine-tenders repeatedly, walking through list pages
// (each call fetches a range) until nothing new is saved or the page window
// runs out.

import { createClient as _cc } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

    const pagesPerCall = 5;
    const maxWindow = 60; // up to 60 * 20 = 1200 rows scanned per backfill run
    let totalSaved = 0;
    let iterations = 0;
    let last: unknown = null;
    let startPage = 1;

    while (startPage <= maxWindow) {
      const r = await fetch(
        `${supabaseUrl}/functions/v1/fetch-josephine-tenders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ startPage, pages: pagesPerCall }),
        },
      );
      const j = (await r.json()) as { saved?: number; listed?: number };
      last = j;
      iterations += 1;
      const saved = Number(j?.saved ?? 0);
      totalSaved += saved;
      // Stop when the window produced no new rows AND had records listed
      // (avoids stopping only because the SK filter returned nothing).
      if (saved === 0 && (j?.listed ?? 0) === 0) break;
      startPage += pagesPerCall;
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
