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
            "get_active_tenders_count",
          );
          if (error) throw error;

          return new Response(
            JSON.stringify({ active_tenders: data ?? 0, sources: 2 }),
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
