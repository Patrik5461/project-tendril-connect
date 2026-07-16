import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GEMINI_MODELS, geminiGenerate, geminiUserMessage, type GeminiModel } from "./gemini.server";
import { fetchCompanyFromRegisters, type RegistryCompany } from "./registers.server";

// ---------- Prompts (Slovak) ----------
const PROMPT_SUMMARY =
  "Zhrň túto verejnú zákazku: čo sa obstaráva, rozsah, kľúčové termíny, spôsob hodnotenia ponúk (cena/kvalita). Vecne, bez marketingu.";

const PROMPT_REQUIREMENTS =
  "Vytiahni z tohto oznámenia všetky podmienky účasti pre uchádzača: požadovaný obrat, referencie (počet, hodnota, typ), certifikáty, technická a personálna spôsobilosť, zábezpeka. Ak niektorá podmienka nie je uvedená, napíš 'neuvedené'. Vráť ako JSON so schémou: {\"obrat\": string, \"referencie\": string, \"certifikaty\": string, \"technicka_sposobilost\": string, \"personalna_sposobilost\": string, \"zabezpeka\": string, \"ostatne\": string}.";

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
  return [
    `Názov: ${t.title}`,
    `Obstarávateľ: ${t.contracting_authority}`,
    `CPV: ${t.cpv_code ?? "—"}`,
    `Odhadovaná hodnota: ${t.estimated_value ?? "—"} ${t.currency ?? ""}`.trim(),
    `Termín predkladania: ${t.deadline ?? "—"}`,
    `Región: ${t.region ?? "—"} / ${t.country ?? "—"}`,
    `Zdrojové URL: ${t.source_url ?? "—"}`,
    "",
    "Popis / oznámenie:",
    t.description ?? "(bez popisu)",
  ].join("\n");
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
      .select("id,title,description,contracting_authority,cpv_code,estimated_value,currency,deadline,published_at,region,country,source_url")
      .eq("id", data.tender_id)
      .maybeSingle<TenderRow>();
    if (tErr) throw tErr;
    if (!tender) throw new Error("Zákazka nenájdená");

    // 2) Fetch company identification from registers (no profile needed)
    const registry: RegistryCompany = await fetchCompanyFromRegisters(data.ico, context.supabase);

    const companyCtx: CompanyForAnalysis = {
      ico: registry.ico,
      nazov: registry.nazov,
      sk_nace: registry.sk_nace_name
        ? `${registry.sk_nace_code} — ${registry.sk_nace_name}`
        : registry.sk_nace_code,
      velkost: registry.velkost_kategoria,
      financne_roky: [],
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
      requirements = await runPart(GEMINI_MODELS.FLASH, PROMPT_REQUIREMENTS, tenderText, { json: true });
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
    return await fetchCompanyFromRegisters(data.ico, context.supabase);
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
