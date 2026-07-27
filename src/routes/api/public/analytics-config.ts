import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/analytics-config")({
  server: {
    handlers: {
      GET: async () => {
        const headers = {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=120, s-maxage=120",
          "Access-Control-Allow-Origin": "*",
        };
        const fallback = {
          enabled: false,
          gtm_id: "",
          ga4_id: "",
          ads_id: "",
          conversion_labels: {},
          debug: false,
        };
        try {
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!url || !key) throw new Error("Missing Supabase public config");
          const supabase = createClient<Database>(url, key, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });
          const { data, error } = await supabase.rpc("get_analytics_config");
          if (error) throw error;
          return new Response(JSON.stringify(data ?? fallback), { status: 200, headers });
        } catch (e) {
          console.error("analytics-config failed", e);
          return new Response(JSON.stringify(fallback), { status: 200, headers });
        }
      },
    },
  },
});
