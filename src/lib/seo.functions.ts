import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SEO_CATEGORIES, SEO_REGIONS } from "./seo-catalog";

// ---------- Public server fn: fetch a SEO page by triple ----------

type PageType = "category" | "region" | "category_region";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const getSeoPage = createServerFn({ method: "GET" })
  .inputValidator((input: { page_type: PageType; category_slug: string | null; region_slug: string | null }) => input)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: row, error } = await sb
      .from("seo_pages")
      .select("*")
      .eq("page_type", data.page_type)
      .filter("category_slug", data.category_slug === null ? "is" : "eq", data.category_slug as any)
      .filter("region_slug", data.region_slug === null ? "is" : "eq", data.region_slug as any)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;

    // Načítať aktuálne zákazky
    const cat = data.category_slug ? SEO_CATEGORIES.find((c) => c.slug === data.category_slug) : null;
    const reg = data.region_slug ? SEO_REGIONS.find((r) => r.slug === data.region_slug) : null;
    const { data: tenders } = await sb.rpc("get_seo_tenders", {
      _cpv_prefix: (cat?.cpvPrefix ?? null) as unknown as string,
      _region_name: (reg?.name ?? null) as unknown as string,
      _limit: 20,
    });

    return { page: row, tenders: tenders ?? [] };
  });

// ---------- Admin server fns ----------

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("forbidden");
}

export const listSeoPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("seo_pages")
      .select("*")
      .order("page_type")
      .order("category_slug", { ascending: true, nullsFirst: true })
      .order("region_slug", { ascending: true, nullsFirst: true });
    if (error) throw error;
    return data;
  });

export const updateSeoPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; h1?: string; title?: string; description?: string; intro_text?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { h1?: string; title?: string; description?: string; intro_text?: string } = {};
    for (const k of ["h1", "title", "description", "intro_text"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    const { error } = await supabaseAdmin.from("seo_pages").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Generation ----------

type GenSpec = {
  page_type: PageType;
  category_slug: string | null;
  cpv_prefix: string | null;
  region_slug: string | null;
  region_name: string | null;
  categoryName?: string;
  categoryPlural?: string;
};

async function aiTexts(spec: GenSpec): Promise<{ h1: string; title: string; description: string; intro_text: string }> {
  const key = process.env.LOVABLE_API_KEY;
  const catLabel = spec.categoryName ?? "";
  const catPlural = spec.categoryPlural ?? "Verejné zákazky";
  const regLabel = spec.region_name ?? "celé Slovensko";

  // Fallback texts (used if AI fails or key missing)
  const fb = {
    h1: spec.page_type === "region"
      ? `Verejné zákazky – ${regLabel}`
      : spec.page_type === "category"
      ? `${catPlural} v SR`
      : `${catPlural} – ${regLabel}`,
    title:
      spec.page_type === "region"
        ? `Verejné zákazky ${regLabel} | Tendrik`
        : spec.page_type === "category"
        ? `${catPlural} | Aktuálne verejné obstarávanie | Tendrik`
        : `${catPlural} ${regLabel} | Tendrik`,
    description:
      spec.page_type === "region"
        ? `Aktuálne verejné zákazky v regióne ${regLabel}. Prehľad aktívnych verejných obstarávaní zo zdrojov TED, ÚVO, EKS a JOSEPHINE.`
        : spec.page_type === "category"
        ? `Aktuálne ${catPlural.toLowerCase()} zo Slovenska a EÚ. Prehľad aktívnych verejných obstarávaní z TED, ÚVO, EKS a JOSEPHINE.`
        : `Aktuálne ${catPlural.toLowerCase()} v regióne ${regLabel}. Prehľad aktívnych verejných obstarávaní z TED, ÚVO, EKS a JOSEPHINE.`,
    intro_text:
      spec.page_type === "region"
        ? `Na tejto stránke nájdete aktuálne verejné zákazky v regióne ${regLabel}. Vhodné pre dodávateľov, ktorí chcú prehľad o práve prebiehajúcich obstarávaniach v tomto kraji.`
        : spec.page_type === "category"
        ? `Prehľad aktuálnych zákaziek v kategórii ${catLabel.toLowerCase()}. Vhodné pre firmy, ktoré sa venujú tejto oblasti a chcú vedieť o nových verejných obstarávaniach hneď po ich vyhlásení.`
        : `Prehľad aktuálnych zákaziek v kategórii ${catLabel.toLowerCase()} v regióne ${regLabel}. Určené pre firmy z tohto kraja, ktoré sa venujú tejto oblasti.`,
  };

  if (!key) return fb;

  const system = "Si SEO copywriter pre slovenský portál verejného obstarávania Tendrik. Píšeš stručne, vecne, po slovensky, bez marketingového pátosu. Odpovedáš iba platným JSON objektom.";
  const user = `Kategória: ${catLabel || "(všeobecné verejné zákazky)"}${spec.cpv_prefix ? ` (CPV ${spec.cpv_prefix})` : ""}. Kraj: ${regLabel}.

Vygeneruj JSON s poľami:
- h1: nadpis stránky, max 70 znakov, obsahuje kategóriu aj kraj ak sú zadané.
- title: HTML title, max 60 znakov, končí "| Tendrik".
- description: meta description, max 155 znakov, čo návštevník na stránke nájde.
- intro_text: 2-3 vety (40-70 slov) opisujúce pre koho sú tieto zákazky vhodné a čo sa v tejto kategórii/kraji typicky obstaráva.

Vráť LEN JSON objekt, žiadny iný text.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[seo-ai]", res.status, await res.text());
      return fb;
    }
    const j = await res.json();
    const raw = j?.choices?.[0]?.message?.content;
    if (!raw) return fb;
    const parsed = JSON.parse(raw);
    return {
      h1: String(parsed.h1 || fb.h1).slice(0, 90),
      title: String(parsed.title || fb.title).slice(0, 65),
      description: String(parsed.description || fb.description).slice(0, 160),
      intro_text: String(parsed.intro_text || fb.intro_text),
    };
  } catch (e) {
    console.error("[seo-ai] failed", e);
    return fb;
  }
}

async function countActive(sb: any, cpvPrefix: string | null, regionName: string | null): Promise<number> {
  const { data, error } = await sb.rpc("count_seo_active_tenders", {
    _cpv_prefix: cpvPrefix,
    _region_name: regionName,
  });
  if (error) { console.error(error); return 0; }
  return Number(data) || 0;
}

export const generateSeoPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { minTenders?: number; onlyMissing?: boolean } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const min = data.minTenders ?? 3;
    const onlyMissing = data.onlyMissing ?? false;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = new Set<string>();
    if (onlyMissing) {
      const { data: rows } = await supabaseAdmin
        .from("seo_pages")
        .select("page_type, category_slug, region_slug");
      for (const r of rows ?? []) {
        existing.add(`${r.page_type}|${r.category_slug ?? ""}|${r.region_slug ?? ""}`);
      }
    }

    const specs: GenSpec[] = [];

    // Category-only
    for (const c of SEO_CATEGORIES) {
      specs.push({
        page_type: "category", category_slug: c.slug, cpv_prefix: c.cpvPrefix,
        region_slug: null, region_name: null,
        categoryName: c.name, categoryPlural: c.namePlural,
      });
    }
    // Region-only
    for (const r of SEO_REGIONS) {
      specs.push({
        page_type: "region", category_slug: null, cpv_prefix: null,
        region_slug: r.slug, region_name: r.name,
      });
    }
    // Combos
    for (const c of SEO_CATEGORIES) {
      for (const r of SEO_REGIONS) {
        if (r.slug === "cele-slovensko") continue; // category-only už pokrýva
        specs.push({
          page_type: "category_region", category_slug: c.slug, cpv_prefix: c.cpvPrefix,
          region_slug: r.slug, region_name: r.name,
          categoryName: c.name, categoryPlural: c.namePlural,
        });
      }
    }

    let created = 0, skipped = 0, updated = 0;

    for (const spec of specs) {
      const key = `${spec.page_type}|${spec.category_slug ?? ""}|${spec.region_slug ?? ""}`;
      if (onlyMissing && existing.has(key)) { skipped++; continue; }

      const count = await countActive(supabaseAdmin, spec.cpv_prefix, spec.region_name);
      if (count < min) { skipped++; continue; }

      const texts = await aiTexts(spec);

      const row = {
        page_type: spec.page_type,
        category_slug: spec.category_slug,
        cpv_prefix: spec.cpv_prefix,
        region_slug: spec.region_slug,
        region_name: spec.region_name,
        h1: texts.h1,
        title: texts.title,
        description: texts.description,
        intro_text: texts.intro_text,
        active_tenders_count: count,
        last_generated_at: new Date().toISOString(),
      };

      // Manual upsert (kombinovaný unique index s COALESCE nefunguje s onConflict)
      const { data: existRow } = await supabaseAdmin
        .from("seo_pages")
        .select("id")
        .eq("page_type", spec.page_type)
        .filter("category_slug", spec.category_slug === null ? "is" : "eq", spec.category_slug as any)
        .filter("region_slug", spec.region_slug === null ? "is" : "eq", spec.region_slug as any)
        .maybeSingle();

      if (existRow) {
        // Aktualizuj len count; texty nechaj (aby sa neprepisovali ručné úpravy)
        const { error } = await supabaseAdmin
          .from("seo_pages")
          .update({ active_tenders_count: count })
          .eq("id", existRow.id);
        if (error) console.error(error);
        else updated++;
      } else {
        const { error } = await supabaseAdmin.from("seo_pages").insert(row);
        if (error) console.error(error);
        else created++;
      }
    }

    return { created, updated, skipped, total: specs.length };
  });

export const regenerateSeoPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("seo_pages").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("not found");

    const cat = row.category_slug ? SEO_CATEGORIES.find((c) => c.slug === row.category_slug) : undefined;
    const spec: GenSpec = {
      page_type: row.page_type as PageType,
      category_slug: row.category_slug,
      cpv_prefix: row.cpv_prefix,
      region_slug: row.region_slug,
      region_name: row.region_name,
      categoryName: cat?.name,
      categoryPlural: cat?.namePlural,
    };
    const texts = await aiTexts(spec);
    const count = await countActive(supabaseAdmin, spec.cpv_prefix, spec.region_name);
    const { error: upErr } = await supabaseAdmin
      .from("seo_pages")
      .update({ ...texts, active_tenders_count: count, last_generated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (upErr) throw upErr;
    return { ok: true };
  });
