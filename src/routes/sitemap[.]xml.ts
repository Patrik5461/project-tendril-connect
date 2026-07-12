import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BASE_URL = "https://www.tendrik.sk";

type Entry = { path: string; lastmod?: string; changefreq?: string; priority?: string };

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticEntries: Entry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/cennik", changefreq: "monthly", priority: "0.7" },
          { path: "/kontakt", changefreq: "monthly", priority: "0.5" },
          { path: "/ochrana-osobnych-udajov", changefreq: "yearly", priority: "0.3" },
          { path: "/pravne/obchodne-podmienky", changefreq: "yearly", priority: "0.3" },
          { path: "/pravne/gdpr", changefreq: "yearly", priority: "0.3" },
          { path: "/pravne/cookies", changefreq: "yearly", priority: "0.3" },
          { path: "/pravne/reklamacny-poriadok", changefreq: "yearly", priority: "0.3" },
          { path: "/pravne/opakovane-platby", changefreq: "yearly", priority: "0.3" },
        ];

        let seoEntries: Entry[] = [];
        try {
          const sb = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });
          const { data } = await sb
            .from("seo_pages")
            .select("page_type, category_slug, region_slug, updated_at")
            .gt("active_tenders_count", 0);
          for (const p of data ?? []) {
            let path = "";
            if (p.page_type === "category" && p.category_slug) path = `/zakazky/kategoria/${p.category_slug}`;
            else if (p.page_type === "region" && p.region_slug) path = `/zakazky/kraj/${p.region_slug}`;
            else if (p.page_type === "category_region" && p.category_slug && p.region_slug)
              path = `/zakazky/kategoria/${p.category_slug}/${p.region_slug}`;
            if (path) {
              seoEntries.push({
                path,
                lastmod: p.updated_at ? new Date(p.updated_at).toISOString() : undefined,
                changefreq: "daily",
                priority: "0.8",
              });
            }
          }
        } catch (e) {
          console.error("[sitemap] seo pages failed", e);
        }

        const entries = [...staticEntries, ...seoEntries];
        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ].filter(Boolean).join("\n"),
        );
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
