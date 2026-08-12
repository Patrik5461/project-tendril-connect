import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { encodeQuotaError } from "./ai-quota";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { z } from "zod";
import { GEMINI_MODELS, geminiGenerate, geminiUserMessage, type GeminiModel } from "./gemini.server";
import { fetchCompanyFromRegisters, type RegistryCompany } from "./registers.server";
import type { StructuredCriteria } from "./ted-criteria";
import { hasNoticeSelectionCriteria, selectionCriteriaAreInAttachments } from "./ted-criteria";

// ---------- Prompts (Slovak) ----------
const PROMPT_SUMMARY =
  "Zhrň túto verejnú zákazku: čo sa obstaráva, rozsah, kľúčové termíny, spôsob hodnotenia ponúk (cena/kvalita). Vecne, bez marketingu.";

const PROMPT_REQUIREMENTS =
  "Vytiahni z tohto oznámenia všetky podmienky účasti pre uchádzača: požadovaný obrat, referencie (počet, hodnota, typ), certifikáty, technická a personálna spôsobilosť, zábezpeka. Ak niektorá podmienka nie je uvedená, napíš 'neuvedené'. Vráť ako JSON so schémou: {\"obrat\": string, \"referencie\": string, \"certifikaty\": string, \"technicka_sposobilost\": string, \"personalna_sposobilost\": string, \"zabezpeka\": string, \"ostatne\": string}.";

const PROMPT_REQUIREMENTS_TED_VERIFIED = [
  "Nižšie sú OVEREN\u00c9 podmienky účasti stiahnuté priamo zo štruktúrovaných polí registra TED (nie voľný text).",
  "Tvoja úloha: usporiadaj ich do slovenských kategórií a preložte do slovenčiny.",
  "PRAVIDLÁ:",
  "- Nedomýšľaj, nedopĺňaj, čo tam nie je. Ak kategória nie je v texte pokrytá, napíš 'neuvedené'.",
  "- Ak podmienka obsahuje konkrétne čísla (počet referencií, hodnota, roky), zachovaj ich presne.",
  "- Zábezpeku uveď len ak je uvedená; inak 'neuvedené'.",
  "Vráť JSON: {\"obrat\": string, \"referencie\": string, \"certifikaty\": string, \"technicka_sposobilost\": string, \"personalna_sposobilost\": string, \"zabezpeka\": string, \"ostatne\": string}.",
].join("\n");

const PROMPT_ELIGIBILITY = `Porovnaj podmienky účasti s profilom firmy. Pre každú podmienku uveď: SPĹŇA / HRANIČNÉ / NESPĹŇA + krátke vysvetlenie. Na záver: celkové odporúčanie (odporúčame/neodporúčame sa uchádzať) a čo firme chýba. Buď presný pri porovnávaní čísel (obrat, počet referencií). Ak údaj o firme chýba, označ ako 'nemožno posúdiť', nie ako nespĺňa.
Vráť JSON: {"posudenia": [{"podmienka": string, "stav": "SPĹŇA"|"HRANIČNÉ"|"NESPĹŇA"|"NEMOŽNO POSÚDIŤ", "vysvetlenie": string}], "odporucanie": "odporucame"|"neodporucame"|"opatrne", "co_chyba": string, "zhrnutie": string}`;

// ---------- Types ----------
type TenderRow = {
  id: string;
  title: string;
  description: string | null;
  contracting_authority: string;
  cpv_code: string | null;
  estimated_value: number | null;
  currency: string | null;
  deadline: string | null;
  published_at: string | null;
  region: string | null;
  country: string | null;
  source_url: string | null;
  source?: string | null;
  structured_criteria?: StructuredCriteria | null;
};

type CompanyForAnalysis = {
  ico?: string | null;
  nazov?: string | null;
  sk_nace?: string | null;
  velkost?: string | null;
  financne_roky?: Array<{ rok: number; obrat?: number; zamestnanci?: number }>;
  referencie?: any[];
  certifikaty?: string[];
  technicke_vybavenie?: string | null;
  kluc_odbornici?: string | null;
  doplnkove_info?: string | null;
};

function buildTenderContext(t: TenderRow): string {
  const parts: string[] = [
    `Názov: ${t.title}`,
    `Obstarávateľ: ${t.contracting_authority}`,
    `CPV: ${t.cpv_code ?? "—"}`,
    `Odhadovaná hodnota: ${t.estimated_value ?? "—"} ${t.currency ?? ""}`.trim(),
    `Termín predkladania: ${t.deadline ?? "—"}`,
    `Región: ${t.region ?? "—"} / ${t.country ?? "—"}`,
    `Zdrojové URL: ${t.source_url ?? "—"}`,
  ];

  const sc = t.structured_criteria ?? null;
  if (sc && hasNoticeSelectionCriteria(sc)) {
    parts.push("", "PODMIENKY ÚČASTI (overené zo štruktúrovaných polí TED — epo-notice):");
    const names = sc.selection_criterion_names ?? [];
    const descs = sc.selection_criterion_descriptions ?? [];
    for (let i = 0; i < descs.length; i++) {
      const name = names[i] ?? `Podmienka ${i + 1}`;
      parts.push(`- ${name}: ${descs[i]}`);
    }
    if (sc.tenderer_legal_form_description) {
      parts.push(`- Právna forma uchádzača: ${sc.tenderer_legal_form_description}`);
    }
    if (sc.guarantee_required_description) {
      parts.push(`- Zábezpeka: ${sc.guarantee_required_description}`);
    }
    if (sc.contract_conditions_description) {
      parts.push(`- Zmluvné podmienky: ${sc.contract_conditions_description}`);
    }
    if (sc.language && sc.language !== "slk" && sc.language !== "sk") {
      parts.push(`(Text je v jazyku: ${sc.language}. Preložte do slovenčiny pri odpovedi.)`);
    }
  } else if (sc && selectionCriteriaAreInAttachments(sc)) {
    parts.push(
      "",
      "POZNÁMKA: TED oznámenie uvádza, že podmienky účasti sú v prílohách/súťažných podkladoch (epo-procurement-document), nie v tomto texte. Extrahuj len to, čo je dostupné v popise nižšie; ostatné označ ako 'neuvedené'.",
    );
    if (sc.description_lot) {
      parts.push("", "Detailný popis predmetu (z TED):", sc.description_lot);
    }
  }

  parts.push("", "Popis / oznámenie:", t.description ?? "(bez popisu)");
  return parts.join("\n");
}

function requirementsPromptFor(t: TenderRow): string {
  const sc = t.structured_criteria ?? null;
  return sc && hasNoticeSelectionCriteria(sc) ? PROMPT_REQUIREMENTS_TED_VERIFIED : PROMPT_REQUIREMENTS;
}

function buildCompanyContext(c: CompanyForAnalysis): string {
  const roky = (c.financne_roky ?? [])
    .sort((a, b) => (b.rok ?? 0) - (a.rok ?? 0))
    .map((r) => `- ${r.rok}: obrat ${r.obrat ?? "?"} EUR, zamestnanci ${r.zamestnanci ?? "?"}`)
    .join("\n") || "(žiadne roky)";
  const priemer3 = (() => {
    const r = (c.financne_roky ?? []).filter((x) => typeof x.obrat === "number").sort((a, b) => (b.rok ?? 0) - (a.rok ?? 0)).slice(0, 3);
    if (!r.length) return "neuvedené";
    return `${Math.round(r.reduce((s, x) => s + (x.obrat as number), 0) / r.length).toLocaleString("sk")} EUR (${r.map((x) => x.rok).join(", ")})`;
  })();
  return [
    `IČO: ${c.ico ?? "—"}`,
    `Názov: ${c.nazov ?? "—"}`,
    `SK-NACE: ${c.sk_nace ?? "—"}`,
    `Veľkostná kategória: ${c.velkost ?? "—"}`,
    `Obrat/zamestnanci po rokoch:\n${roky}`,
    `Priemerný ročný obrat (posledné 3 roky s údajom): ${priemer3}`,
    `Referencie (počet ${(c.referencie ?? []).length}):`,
    JSON.stringify(c.referencie ?? [], null, 2),
    `Certifikáty: ${(c.certifikaty ?? []).join(", ") || "—"}`,
    `Technické vybavenie: ${c.technicke_vybavenie ?? "—"}`,
    `Kľúčoví odborníci: ${c.kluc_odbornici ?? "—"}`,
    `Doplňujúce info: ${c.doplnkove_info ?? "—"}`,
  ].join("\n");
}

async function runPart(model: GeminiModel, system: string, user: string, opts: { json?: boolean } = {}) {
  const t0 = Date.now();
  const text = await geminiGenerate(model, user, {
    system,
    temperature: 0.3,
    maxOutputTokens: opts.json ? 4096 : 2048,
    responseJson: !!opts.json,
    disableThinking: model === GEMINI_MODELS.FLASH || model === GEMINI_MODELS.LITE,
    fallback: GEMINI_MODELS.FLASH,
  });
  return { model, text, elapsedMs: Date.now() - t0 };
}

function safeJson<T = any>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { /* try to extract */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

// ---------- Admin test: run analysis on ad-hoc tender_id + IČO ----------

export const adminAnalyzeTender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      tender_id: z.string().uuid(),
      ico: z.string().min(6).max(12),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");

    // 1) Load tender
    const { data: tender, error: tErr } = await context.supabase
      .from("tenders")
      .select("id,title,description,contracting_authority,cpv_code,estimated_value,currency,deadline,published_at,region,country,source_url,source,structured_criteria")
      .eq("id", data.tender_id)
      .maybeSingle<TenderRow>();
    if (tErr) throw tErr;
    if (!tender) throw new Error("Zákazka nenájdená");

    // 2) Fetch company identification from registers (no profile needed)
    const registry: RegistryCompany = await fetchCompanyFromRegisters(data.ico, context.supabase, {
      financneRoky: 3,
    });

    const companyCtx: CompanyForAnalysis = {
      ico: registry.ico,
      nazov: registry.nazov,
      sk_nace: registry.sk_nace_name
        ? `${registry.sk_nace_code} — ${registry.sk_nace_name}`
        : registry.sk_nace_code,
      velkost: registry.velkost_kategoria,
      financne_roky: registry.financne_roky ?? [],
      referencie: [],
      certifikaty: [],
      doplnkove_info: `Testovací režim — bez firemného profilu. Roky dostupných účtovných závierok: ${(registry.roky_zavierok ?? []).join(", ") || "—"}. Právna forma: ${registry.pravna_forma ?? "—"}. Adresa: ${[registry.adresa, registry.psc, registry.mesto].filter(Boolean).join(", ")}.`,
    };

    const tenderText = buildTenderContext(tender);
    const companyText = buildCompanyContext(companyCtx);

    // 3) Run three parts (a, b flash; c pro)
    const errors: string[] = [];
    let summary: Awaited<ReturnType<typeof runPart>> | null = null;
    let requirements: Awaited<ReturnType<typeof runPart>> | null = null;
    let eligibility: Awaited<ReturnType<typeof runPart>> | null = null;

    try {
      summary = await runPart(GEMINI_MODELS.FLASH, PROMPT_SUMMARY, tenderText);
    } catch (e) { errors.push("Súhrn: " + geminiUserMessage(e)); }

    try {
      requirements = await runPart(GEMINI_MODELS.FLASH, requirementsPromptFor(tender), tenderText, { json: true });
    } catch (e) { errors.push("Podmienky: " + geminiUserMessage(e)); }

    if (requirements) {
      try {
        eligibility = await runPart(
          GEMINI_MODELS.PRO,
          PROMPT_ELIGIBILITY,
          `PODMIENKY ÚČASTI (JSON):\n${requirements.text}\n\nPROFIL FIRMY:\n${companyText}`,
          { json: true },
        );
      } catch (e) { errors.push("Spôsobilosť: " + geminiUserMessage(e)); }
    }

    return {
      tender: {
        id: tender.id,
        title: tender.title,
        contracting_authority: tender.contracting_authority,
        source_url: tender.source_url,
      },
      registry_data: {
        ico: registry.ico,
        nazov: registry.nazov,
        pravna_forma: registry.pravna_forma,
        adresa: [registry.adresa, registry.psc, registry.mesto].filter(Boolean).join(", "),
        sk_nace: registry.sk_nace_code
          ? `${registry.sk_nace_code} — ${registry.sk_nace_name ?? "?"}`
          : null,
        velkost_kategoria: registry.velkost_kategoria,
        roky_zavierok: registry.roky_zavierok,
        errors: registry.errors,
      },
      parts: {
        summary: summary && { model: summary.model, elapsedMs: summary.elapsedMs, text: summary.text },
        requirements: requirements && {
          model: requirements.model,
          elapsedMs: requirements.elapsedMs,
          text: requirements.text,
          parsed: safeJson(requirements.text),
        },
        eligibility: eligibility && {
          model: eligibility.model,
          elapsedMs: eligibility.elapsedMs,
          text: eligibility.text,
          parsed: safeJson(eligibility.text),
        },
      },
      errors,
    };
  });

// ---------- Fetch company data from registers (identification only) ----------

export const fetchCompanyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ ico: z.string().min(6).max(12) }).parse(raw))
  .handler(async ({ data, context }) => {
    return await fetchCompanyFromRegisters(data.ico, context.supabase, { financneRoky: 3 });
  });

// ---------- Simple list of latest tenders for admin picker ----------

export const adminListTendersForTest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");
    const { data, error } = await context.supabase
      .from("tenders")
      .select("id,title,contracting_authority,deadline,cpv_code")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  });

// ---------- Company profile (user-owned) ----------

const CompanyProfileSchema = z.object({
  ico: z.string().nullable().optional(),
  dic: z.string().nullable().optional(),
  nazov: z.string().nullable().optional(),
  adresa: z.string().nullable().optional(),
  psc: z.string().nullable().optional(),
  mesto: z.string().nullable().optional(),
  kraj: z.string().nullable().optional(),
  pravna_forma: z.string().nullable().optional(),
  datum_vzniku: z.string().nullable().optional(),
  sk_nace_code: z.string().nullable().optional(),
  sk_nace_name: z.string().nullable().optional(),
  velkost_kategoria: z.string().nullable().optional(),
  financne_roky: z.array(
    z.object({
      rok: z.number().int(),
      obrat: z.number().nullable().optional(),
      zamestnanci: z.number().int().nullable().optional(),
    }),
  ).default([]),
  referencie: z.array(
    z.object({
      nazov: z.string(),
      obstaravatel: z.string().optional().default(""),
      hodnota: z.number().nullable().optional(),
      rok: z.number().int().nullable().optional(),
    }),
  ).default([]),
  certifikaty: z.array(z.string()).default([]),
  technicke_vybavenie: z.string().nullable().optional(),
  kluc_odbornici: z.string().nullable().optional(),
  doplnkove_info: z.string().nullable().optional(),
  auto_data: z.any().optional(),
  /** Chýba pri zakladaní novej firmy, inak určuje, ktorú prepisujeme. */
  id: z.string().uuid().optional(),
});

/** Všetky firmy používateľa, hlavná ako prvá. */
export const listCompanyProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("company_profile")
      .select("*")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

/** Hlavná firma — to, s čím pracujú AI analýzy a predvyplnené formuláre. */
export const getCompanyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("company_profile")
      .select("*")
      .eq("user_id", context.userId)
      .eq("is_default", true)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  });

export const saveCompanyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CompanyProfileSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    const row: any = {
      ...fields,
      user_id: context.userId,
      financne_roky: data.financne_roky ?? [],
      referencie: data.referencie ?? [],
      certifikaty: data.certifikaty ?? [],
      updated_at: new Date().toISOString(),
    };

    // Bez id ide o novú firmu. `is_default` sa tu zámerne nenastavuje —
    // prvej firme ho pridelí trigger, ďalšie sa prepínajú cez setDefaultCompany.
    if (!id) {
      const { data: created, error } = await context.supabase
        .from("company_profile")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return created;
    }

    const { data: saved, error } = await context.supabase
      .from("company_profile")
      .update(row)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!saved) throw new Error("Firma sa nenašla.");
    return saved;
  });

export const deleteCompanyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("company_profile")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const setDefaultCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    // Cez RPC, aby sa odznačenie starej a označenie novej hlavnej firmy
    // stihlo v jednej transakcii — inak by kolidoval unique index.
    const { error } = await context.supabase.rpc("set_default_company", {
      _company_id: data.id,
    });
    if (error) throw error;
    return { ok: true };
  });

// ---------- Tender analysis (user-facing, subscription-gated) ----------

function profileToCompanyCtx(p: any): CompanyForAnalysis {
  return {
    ico: p?.ico,
    nazov: p?.nazov,
    sk_nace: p?.sk_nace_name ? `${p.sk_nace_code} — ${p.sk_nace_name}` : p?.sk_nace_code,
    velkost: p?.velkost_kategoria,
    financne_roky: (p?.financne_roky ?? []) as any,
    referencie: (p?.referencie ?? []) as any,
    certifikaty: (p?.certifikaty ?? []) as string[],
    technicke_vybavenie: p?.technicke_vybavenie,
    kluc_odbornici: p?.kluc_odbornici,
    doplnkove_info: p?.doplnkove_info,
  };
}

async function runAnalysisPipeline(tender: TenderRow, companyText: string) {
  const errors: string[] = [];
  const tenderText = buildTenderContext(tender);
  let summary: Awaited<ReturnType<typeof runPart>> | null = null;
  let requirements: Awaited<ReturnType<typeof runPart>> | null = null;
  let eligibility: Awaited<ReturnType<typeof runPart>> | null = null;
  try { summary = await runPart(GEMINI_MODELS.FLASH, PROMPT_SUMMARY, tenderText); }
  catch (e) { errors.push("Súhrn: " + geminiUserMessage(e)); }
  try { requirements = await runPart(GEMINI_MODELS.FLASH, requirementsPromptFor(tender), tenderText, { json: true }); }
  catch (e) { errors.push("Podmienky: " + geminiUserMessage(e)); }
  if (requirements) {
    try {
      eligibility = await runPart(
        GEMINI_MODELS.PRO,
        PROMPT_ELIGIBILITY,
        `PODMIENKY ÚČASTI (JSON):\n${requirements.text}\n\nPROFIL FIRMY:\n${companyText}`,
        { json: true },
      );
    } catch (e) { errors.push("Spôsobilosť: " + geminiUserMessage(e)); }
  }
  return { summary, requirements, eligibility, errors };
}

export const getTenderAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ tender_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("tender_analysis")
      .select("*")
      .eq("user_id", context.userId)
      .eq("tender_id", data.tender_id)
      .maybeSingle();
    return row ?? null;
  });

export const getAiCreditStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_ai_credit_status");
    if (error) throw error;
    return data as {
      status: string;
      tier: string;
      unlimited: boolean;
      used: number;
      limit: number;
      remaining: number;
    };
  });

export const analyzeTender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    tender_id: z.string().uuid(),
    force: z.boolean().optional().default(false),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    // Subscription check — AI dostupné pre trial alebo aktívny tier s limitom > 0.
    const { data: prefs } = await context.supabase
      .from("user_preferences")
      .select("subscription_status,subscription_tier,trial_started_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const status = prefs?.subscription_status ?? "trial";
    const tier = (prefs as any)?.subscription_tier ?? "basic";
    const hasAi = status === "trial" || (status === "active" && (tier === "premium" || tier === "komplet"));
    if (!hasAi) {
      throw new Error(
        status === "expired"
          ? "AI analýza je dostupná len s aktívnym predplatným."
          : "AI analýza je súčasťou balíkov Prémium a Komplet. Upgradnite predplatné na /cennik a odomknite ju.",
      );
    }

    // Company profile check — analyzuje sa vždy voči hlavnej firme.
    const { data: profile } = await context.supabase
      .from("company_profile")
      .select("*")
      .eq("user_id", context.userId)
      .eq("is_default", true)
      .maybeSingle();
    if (!profile || !profile.ico) {
      throw new Error("Najprv vyplňte firemný profil (aspoň IČO).");
    }

    // Cache — cached analysis is always free to view.
    if (!data.force) {
      const { data: cached } = await context.supabase
        .from("tender_analysis")
        .select("*")
        .eq("user_id", context.userId)
        .eq("tender_id", data.tender_id)
        .maybeSingle();
      if (cached) return { ...cached, cached: true };
    }

    // Kvóta: trial 5 spolu, platené podľa mesačného limitu tieru.
    const { data: credit, error: cErr } = await context.supabase
      .rpc("consume_ai_credit", { _tender_id: data.tender_id });
    if (cErr) throw cErr;
    const c = credit as {
      allowed: boolean; used: number; limit: number; tier: string; reason?: string;
    };
    if (!c?.allowed) {
      setResponseStatus(402);
      throw new Error(encodeQuotaError({
        error: "ai_quota_exceeded",
        used: c?.used ?? 0,
        limit: c?.limit ?? 0,
        tier: c?.tier ?? tier,
        status,
        scope: c?.reason === "trial_limit" ? "trial" : c?.reason === "no_ai_access" ? "none" : "monthly",
      }));
    }


    // Load tender
    const { data: tender, error: tErr } = await context.supabase
      .from("tenders")
      .select("id,title,description,contracting_authority,cpv_code,estimated_value,currency,deadline,published_at,region,country,source_url,source,structured_criteria")
      .eq("id", data.tender_id)
      .maybeSingle<TenderRow>();
    if (tErr) throw tErr;
    if (!tender) throw new Error("Zákazka nenájdená");

    const companyCtx = profileToCompanyCtx(profile);
    const companyText = buildCompanyContext(companyCtx);
    const { summary, requirements, eligibility, errors } = await runAnalysisPipeline(tender, companyText);

    const eligibilityParsed = eligibility ? safeJson<any>(eligibility.text) : null;
    const requirementsParsed = requirements ? safeJson<any>(requirements.text) : null;

    const row = {
      user_id: context.userId,
      tender_id: data.tender_id,
      summary: summary?.text ?? null,
      requirements: requirementsParsed ?? (requirements ? { raw: requirements.text } : null),
      eligibility: eligibilityParsed ?? (eligibility ? { raw: eligibility.text } : null),
      recommendation: eligibilityParsed?.odporucanie ?? null,
      overall: eligibilityParsed?.zhrnutie ?? null,
      model_versions: {
        summary: summary?.model,
        requirements: requirements?.model,
        eligibility: eligibility?.model,
        errors,
      },
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: sErr } = await context.supabase
      .from("tender_analysis")
      .upsert(row, { onConflict: "user_id,tender_id" })
      .select()
      .maybeSingle();
    if (sErr) throw sErr;

    // Natívny push: analýza je hotová
    try {
      await context.supabase.functions.invoke("send-push", {
        body: {
          user_id: context.userId,
          title: "AI analýza je hotová",
          body: tender.title,
          path: `/zakazka/${data.tender_id}`,
        },
      });
    } catch (pushErr) {
      console.error("[push]", pushErr);
    }


    return {
      ...saved, cached: false,
      credit_remaining: Math.max(0, (c.limit ?? 0) - (c.used ?? 0)),
      credit_used: c.used, credit_limit: c.limit, credit_unlimited: false,
    };

  });

