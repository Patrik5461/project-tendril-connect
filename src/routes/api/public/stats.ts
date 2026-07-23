import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/stats")({
  server: {
    handlers: {
      GET: async () => {
        const headers = {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300, s-maxage=300",
          "Access-Control-Allow-Origin": "*",
        };
        try {
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!url || !key) throw new Error("Missing Supabase public config");

          const supabase = createClient<Database>(url, key, {
            auth: {
              storage: undefined,
              persistSession: false,
              autoRefreshToken: false,
            },
          });

          const [tendersRes, grantsRes] = await Promise.all([
            supabase.rpc("get_active_tenders_stats"),
            supabase.rpc("get_open_grants_stats"),
          ]);
          if (tendersRes.error) throw tendersRes.error;

          const tRow = Array.isArray(tendersRes.data) ? tendersRes.data[0] : tendersRes.data;
          const active = Number(tRow?.active_count ?? 0);
          const total = Number(tRow?.total_value_eur ?? 0);

          let openGrants = 0;
          let openGrantsAlloc = 0;
          if (!grantsRes.error) {
            const gRow = Array.isArray(grantsRes.data) ? grantsRes.data[0] : grantsRes.data;
            openGrants = Number(gRow?.open_count ?? 0);
            openGrantsAlloc = Number(gRow?.total_alloc_eur ?? 0);
          } else {
            console.error("open grants stats failed", grantsRes.error);
          }

          return new Response(
            JSON.stringify({
              active_tenders: active,
              total_value_eur: total,
              open_grants: openGrants,
              open_grants_alloc_eur: openGrantsAlloc,
              sources: 2,
            }),
            { status: 200, headers },
          );
        } catch (e) {
          console.error("public-stats failed", e);
          return new Response(
            JSON.stringify({ error: "stats_unavailable" }),
            { status: 500, headers },
          );
        }
      },
    },
  },
});
