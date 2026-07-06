import { createFileRoute } from "@tanstack/react-router";

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
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const nowIso = new Date().toISOString();
          const thirtyDaysAgoIso = new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString();

          const { count, error } = await supabaseAdmin
            .from("tenders")
            .select("id", { count: "exact", head: true })
            .or(
              `deadline.gte.${nowIso},and(deadline.is.null,published_at.gte.${thirtyDaysAgoIso})`,
            );

          if (error) throw error;

          return new Response(
            JSON.stringify({ active_tenders: count ?? 0, sources: 2 }),
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
