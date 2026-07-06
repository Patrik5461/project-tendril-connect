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

          const { data, error } = await supabase.rpc(
            "get_active_tenders_stats",
          );
          if (error) throw error;
          const row = Array.isArray(data) ? data[0] : data;
          const active = Number(row?.active_count ?? 0);
          const total = Number(row?.total_value_eur ?? 0);

          return new Response(
            JSON.stringify({
              active_tenders: active,
              total_value_eur: total,
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
