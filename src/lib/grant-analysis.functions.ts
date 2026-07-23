import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GEMINI_MODELS, geminiGenerate, geminiUserMessage, type GeminiModel } from "./gemini.server";

// Strip HTML tags/entities from ITMS-provided WYSIWYG fields for cleaner AI context.
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&scaron;/g, "š").replace(/&Scaron;/g, "Š")
    .replace(/&aacute;/g, "á").replace(/&Aacute;/g, "Á")
    .replace(/&eacute;/g, "é").replace(/&Eacute;/g, "É")
    .replace(/&iacute;/g, "í").replace(/&Iacute;/g, "Í")
    .replace(/&oacute;/g, "ó").replace(/&Oacute;/g, "Ó")
    .replace(/&uacute;/g, "ú").replace(/&Uacute;/g, "Ú")
    .replace(/&yacute;/g, "ý").replace(/&Yacute;/g, "Ý")
    .replace(/&auml;/g, "ä").replace(/&ocirc;/g, "ô")
    .replace(/&ccaron;/g, "č").replace(/&Ccaron;/g, "Č")
    .replace(/&dcaron;/g, "ď").replace(/&Dcaron;/g, "Ď")
    .replace(/&lcaron;/g, "ľ").replace(/&Lcaron;/g, "Ľ")
    .replace(/&ncaron;/g, "ň").replace(/&Ncaron;/g, "Ň")
    .replace(/&tcaron;/g, "ť").replace(/&Tcaron;/g, "Ť")
    .replace(/&zcaron;/g, "ž").replace(/&Zcaron;/g, "Ž")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");
}

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return decodeEntities(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// ---------- Prompts (Slovak) ----------
const PROMPT_SUMMARY_GRANT =
  "Zhrň túto grantovú výzvu (dotáciu): čo sa financuje, aké aktivity sú oprávnené, celkové zdroje EU+SR, miera spolufinancovania, kľúčové termíny. Vecne, bez marketingu. Max. 6-8 viet.";

const PROMPT_REQUIREMENTS_GRANT = [
  "Vytiahni zo štruktúrovaných polí grantovej výzvy nasledujúce parametre. Ak niektorý údaj nie je uvedený, napíš 'neuvedené'. Nedomýšľaj.",
  "Vráť JSON so schémou:",
  '{"opravneny_ziadatel": string, "miesto_realizacie": string, "opravnene_vydavky": string, "cielova_skupina": string, "forma_podpory": string, "miera_spolufinancovania": string, "indikatory": string, "podmienky_poskytnutia": string, "ostatne": string}',
  "Pravidlá:",
  "- Zachovaj konkrétne čísla (miera %, sumy, počty).",
  "- Ak je uvedený zoznam právnych foriem/regiónov, vypíš ich taxatívne.",
  "- Krátko, výstižne, v slovenčine.",
].join("\n");

const PROMPT_ELIGIBILITY_GRANT = `Porovnaj podmienky grantovej výzvy s profilom firmy.

DÔLEŽITÉ PORADIE POSÚDENIA (pri grantoch je oprávnenosť žiadateľa PRIORITNÁ – ak firma nie je oprávnený žiadateľ, ostatné podmienky sú irelevantné):
1) Oprávnenosť žiadateľa (právna forma, veľkosť podniku, typ organizácie)
2) Miesto realizácie projektu (región/kraj vs. sídlo firmy)
3) Súlad predmetu podnikania (SK-NACE) s oblasťou intervencie
4) Kapacita – obrat, zamestnanci, referencie (menej dôležité ako pri zákazkách)
5) Ostatné podmienky

Pre každú podmienku uveď: SPĹŇA / HRANIČNÉ / NESPĹŇA / NEMOŽNO POSÚDIŤ + krátke vysvetlenie.
Na záver: celkové odporúčanie (odporucame/opatrne/neodporucame) a čo firme chýba.
Ak údaj o firme chýba, označ ako 'NEMOŽNO POSÚDIŤ', nie ako NESPĹŇA.
Ak firma zjavne nie je oprávneným žiadateľom (napr. výzva je len pre samosprávy a firma je s.r.o.), odporúčanie = 'neodporucame' bez ohľadu na ostatné.

Vráť JSON: {"posudenia": [{"podmienka": string, "stav": "SPĹŇA"|"HRANIČNÉ"|"NESPĹŇA"|"NEMOŽNO POSÚDIŤ", "vysvetlenie": string}], "odporucanie": "odporucame"|"opatrne"|"neodporucame", "co_chyba": string, "zhrnutie": string}`;

// ---------- Types ----------
type GrantRow = {
  id: string;
  kod: string | null;
  title: string;
  program: string | null;
  poskytovatel: string | null;
  suma_eu: number | null;
  suma_sr: number | null;
  currency: string | null;
  deadline: string | null;
  datum_vyhlasenia: string | null;
  stav: string | null;
  typ: string | null;
  druh: string | null;
  zameranie: string | null;
  opravneny_ziadatel: any;
  miesto_realizacie: any;
  oblasti: any;
  structured_conditions: any;
  documents: any;
  detail_url: string | null;
};

type CompanyForAnalysis = {
  ico?: string | null;
  nazov?: string | null;
  pravna_forma?: string | null;
  sk_nace?: string | null;
  velkost?: string | null;
  mesto?: string | null;
  kraj?: string | null;
  financne_roky?: Array<{ rok: number; obrat?: number; zamestnanci?: number }>;
  referencie?: any[];
  certifikaty?: string[];
  doplnkove_info?: string | null;
};

function jsonArrayToList(arr: any, key: string = "nazov"): string {
  if (!Array.isArray(arr) || arr.length === 0) return "neuvedené";
  return arr.map((x) => (x && typeof x === "object" ? (x[key] ?? x.nazovSk ?? "") : String(x))).filter(Boolean).join(", ");
}

function buildGrantContext(g: GrantRow): string {
  const sc = g.structured_conditions ?? {};
  const parts: string[] = [
    `Kód výzvy: ${g.kod ?? "—"}`,
    `Názov: ${g.title}`,
    `Program: ${g.program ?? "—"}`,
    `Poskytovateľ: ${g.poskytovatel ?? "—"}`,
    `Zdroje EÚ: ${g.suma_eu ?? "—"} ${g.currency ?? "EUR"}`.trim(),
    `Zdroje ŠR: ${g.suma_sr ?? "—"} ${g.currency ?? "EUR"}`.trim(),
    `Termín predkladania (deadline): ${g.deadline ?? "priebežná / neuvedený"}`,
    `Dátum vyhlásenia: ${g.datum_vyhlasenia ?? "—"}`,
    `Formát výzvy (typ): ${g.typ === "OTVORENA" ? "priebežná (rolling call)" : g.typ === "UZAVRETA" ? "one-shot (uzatvárajúca sa výzva)" : g.typ ?? "—"}`,
    `Druh: ${g.druh ?? "—"}`,
    `Zameranie: ${stripHtml(g.zameranie)}`,
    "",
    `Oprávnený žiadateľ (zoznam z ITMS): ${jsonArrayToList(g.opravneny_ziadatel, "nazov")}`,
    `Miesto realizácie: ${jsonArrayToList(g.miesto_realizacie, "nazov")}`,
    `Oblasti intervencie: ${jsonArrayToList(g.oblasti, "nazovSk")}`,
    "",
    "ŠTRUKTÚROVANÉ PODMIENKY (z ITMS OpenData):",
    `- Miera spolufinancovania: ${stripHtml(sc.mieraSpolufinancovania) || "neuvedené"}`,
    `- Cieľová skupina: ${Array.isArray(sc.cielovaSkupina) && sc.cielovaSkupina.length ? sc.cielovaSkupina.map((x: any) => x.nazovSk ?? x.nazov ?? JSON.stringify(x)).join(", ") : "neuvedené"}`,
    `- Forma podpory: ${Array.isArray(sc.formaPodpory) && sc.formaPodpory.length ? sc.formaPodpory.map((x: any) => x.nazovSk ?? x.nazov ?? JSON.stringify(x)).join(", ") : "neuvedené"}`,
    `- Miesto pre podanie ŽoNFP: ${stripHtml(sc.miestoPrePodanieZoNFP) || "neuvedené"}`,
  ];

  if (Array.isArray(sc.oblastIntervencie) && sc.oblastIntervencie.length) {
    parts.push("- Oblasti intervencie (detail):");
    for (const oi of sc.oblastIntervencie.slice(0, 10)) {
      const nazov = oi?.oblastIntervencie?.nazovSk ?? oi?.oblastIntervencie?.popisSk ?? "";
      if (nazov) parts.push(`  • ${nazov}`);
    }
  }

  if (Array.isArray(sc.opravneneVydavky) && sc.opravneneVydavky.length) {
    parts.push("- Oprávnené výdavky:");
    for (const v of sc.opravneneVydavky.slice(0, 20)) {
      const n = v?.nazovSk ?? v?.nazov ?? "";
      if (n) parts.push(`  • ${n}`);
    }
  }

  if (Array.isArray(sc.podmienkaPoskytnutiaPrispevku) && sc.podmienkaPoskytnutiaPrispevku.length) {
    parts.push("- Podmienky poskytnutia príspevku:");
    for (const p of sc.podmienkaPoskytnutiaPrispevku.slice(0, 15)) {
      const n = p?.nazovSk ?? "";
      const d = stripHtml(p?.popisSk).slice(0, 500);
      if (n) parts.push(`  • ${n}: ${d}`);
    }
  }

  if (Array.isArray(sc.merateInyUkazovatel) && sc.merateInyUkazovatel.length) {
    parts.push("- Indikátory (merateľné ukazovatele):");
    for (const i of sc.merateInyUkazovatel.slice(0, 10)) {
      const n = i?.nazovSk ?? i?.nazov ?? "";
      if (n) parts.push(`  • ${n}`);
    }
  }

  return parts.join("\n");
}

function buildCompanyContext(c: CompanyForAnalysis): string {
  const roky = (c.financne_roky ?? [])
    .sort((a, b) => (b.rok ?? 0) - (a.rok ?? 0))
    .map((r) => `- ${r.rok}: obrat ${r.obrat ?? "?"} EUR, zamestnanci ${r.zamestnanci ?? "?"}`)
    .join("\n") || "(žiadne roky)";
  return [
    `IČO: ${c.ico ?? "—"}`,
    `Názov: ${c.nazov ?? "—"}`,
    `Právna forma: ${c.pravna_forma ?? "—"}`,
    `SK-NACE: ${c.sk_nace ?? "—"}`,
    `Veľkostná kategória: ${c.velkost ?? "—"}`,
    `Sídlo: ${[c.mesto, c.kraj].filter(Boolean).join(", ") || "—"}`,
    `Obrat/zamestnanci po rokoch:\n${roky}`,
    `Referencie (počet ${(c.referencie ?? []).length}):`,
    JSON.stringify(c.referencie ?? [], null, 2),
    `Certifikáty: ${(c.certifikaty ?? []).join(", ") || "—"}`,
    `Doplňujúce info: ${c.doplnkove_info ?? "—"}`,
  ].join("\n");
}

function profileToCompanyCtx(p: any): CompanyForAnalysis {
  return {
    ico: p?.ico,
    nazov: p?.nazov,
    pravna_forma: p?.pravna_forma,
    sk_nace: p?.sk_nace_name ? `${p.sk_nace_code} — ${p.sk_nace_name}` : p?.sk_nace_code,
    velkost: p?.velkost_kategoria,
    mesto: p?.mesto,
    kraj: p?.kraj,
    financne_roky: (p?.financne_roky ?? []) as any,
    referencie: (p?.referencie ?? []) as any,
    certifikaty: (p?.certifikaty ?? []) as string[],
    doplnkove_info: p?.doplnkove_info,
  };
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
  try { return JSON.parse(text) as T; } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

// ---------- Get existing analysis ----------

export const getGrantAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ grant_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("grant_analysis")
      .select("*")
      .eq("user_id", context.userId)
      .eq("grant_id", data.grant_id)
      .maybeSingle();
    return row ?? null;
  });

// ---------- Analyze grant (user-facing) ----------

export const analyzeGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    grant_id: z.string().uuid(),
    force: z.boolean().optional().default(false),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: prefs } = await context.supabase
      .from("user_preferences")
      .select("subscription_status,subscription_tier")
      .eq("user_id", context.userId)
      .maybeSingle();
    const status = prefs?.subscription_status ?? "trial";
    const tier = (prefs as any)?.subscription_tier ?? "basic";
    const hasAi = status === "trial" || (status === "active" && tier === "premium");
    if (!hasAi) {
      throw new Error(
        status === "expired"
          ? "AI analýza je dostupná len s aktívnym predplatným."
          : "AI analýza je súčasťou balíka Prémium (14,99 €/mes). Upgradnite predplatné a odomknite ju.",
      );
    }

    const { data: profile } = await context.supabase
      .from("company_profile")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile || !profile.ico) {
      throw new Error("Najprv vyplňte firemný profil (aspoň IČO).");
    }

    if (!data.force) {
      const { data: cached } = await context.supabase
        .from("grant_analysis")
        .select("*")
        .eq("user_id", context.userId)
        .eq("grant_id", data.grant_id)
        .maybeSingle();
      if (cached) return { ...cached, cached: true };
    }

    const { data: credit, error: cErr } = await context.supabase
      .rpc("consume_ai_credit_grant", { _grant_id: data.grant_id });
    if (cErr) throw cErr;
    const c = credit as { allowed: boolean; unlimited: boolean; remaining: number; reason?: string };
    if (!c?.allowed) {
      if (c?.reason === "trial_limit") {
        throw new Error(
          "Využili ste všetkých 5 AI analýz z trial verzie. Pre neobmedzené analýzy aktivujte Prémium (14,99 €/mes) na /predplatne?tier=premium.",
        );
      }
      throw new Error("AI analýza nie je dostupná v tomto pláne.");
    }

    const { data: grant, error: gErr } = await context.supabase
      .from("grant_calls")
      .select("id,kod,title,program,poskytovatel,suma_eu,suma_sr,currency,deadline,datum_vyhlasenia,stav,typ,druh,zameranie,opravneny_ziadatel,miesto_realizacie,oblasti,structured_conditions,documents,detail_url")
      .eq("id", data.grant_id)
      .maybeSingle<GrantRow>();
    if (gErr) throw gErr;
    if (!grant) throw new Error("Grantová výzva nenájdená");

    const companyCtx = profileToCompanyCtx(profile);
    const companyText = buildCompanyContext(companyCtx);
    const grantText = buildGrantContext(grant);

    const errors: string[] = [];
    let summary: Awaited<ReturnType<typeof runPart>> | null = null;
    let requirements: Awaited<ReturnType<typeof runPart>> | null = null;
    let eligibility: Awaited<ReturnType<typeof runPart>> | null = null;

    try { summary = await runPart(GEMINI_MODELS.FLASH, PROMPT_SUMMARY_GRANT, grantText); }
    catch (e) { errors.push("Súhrn: " + geminiUserMessage(e)); }

    try { requirements = await runPart(GEMINI_MODELS.FLASH, PROMPT_REQUIREMENTS_GRANT, grantText, { json: true }); }
    catch (e) { errors.push("Podmienky: " + geminiUserMessage(e)); }

    if (requirements) {
      try {
        eligibility = await runPart(
          GEMINI_MODELS.PRO,
          PROMPT_ELIGIBILITY_GRANT,
          `GRANTOVÁ VÝZVA:\n${grantText}\n\nEXTRAHOVANÉ PODMIENKY (JSON):\n${requirements.text}\n\nPROFIL FIRMY:\n${companyText}`,
          { json: true },
        );
      } catch (e) { errors.push("Spôsobilosť: " + geminiUserMessage(e)); }
    }

    const eligibilityParsed = eligibility ? safeJson<any>(eligibility.text) : null;
    const requirementsParsed = requirements ? safeJson<any>(requirements.text) : null;

    const row = {
      user_id: context.userId,
      grant_id: data.grant_id,
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
      .from("grant_analysis")
      .upsert(row, { onConflict: "user_id,grant_id" })
      .select()
      .maybeSingle();
    if (sErr) throw sErr;
    return { ...saved, cached: false, credit_remaining: c.remaining, credit_unlimited: c.unlimited };
  });

// ---------- Admin: test analysis without profile ----------

export const adminAnalyzeGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    grant_id: z.string().uuid(),
    ico: z.string().optional(),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");

    const { data: grant, error: gErr } = await context.supabase
      .from("grant_calls")
      .select("id,kod,title,program,poskytovatel,suma_eu,suma_sr,currency,deadline,datum_vyhlasenia,stav,typ,druh,zameranie,opravneny_ziadatel,miesto_realizacie,oblasti,structured_conditions,documents,detail_url")
      .eq("id", data.grant_id)
      .maybeSingle<GrantRow>();
    if (gErr) throw gErr;
    if (!grant) throw new Error("Grantová výzva nenájdená");

    const grantText = buildGrantContext(grant);
    const companyText = data.ico
      ? `IČO: ${data.ico}\n(Testovací režim — bez firemného profilu.)`
      : "(Testovací režim — žiadny firemný profil.)";

    const errors: string[] = [];
    let summary = null, requirements = null, eligibility = null;
    try { summary = await runPart(GEMINI_MODELS.FLASH, PROMPT_SUMMARY_GRANT, grantText); }
    catch (e) { errors.push("Súhrn: " + geminiUserMessage(e)); }
    try { requirements = await runPart(GEMINI_MODELS.FLASH, PROMPT_REQUIREMENTS_GRANT, grantText, { json: true }); }
    catch (e) { errors.push("Podmienky: " + geminiUserMessage(e)); }
    if (requirements) {
      try {
        eligibility = await runPart(
          GEMINI_MODELS.PRO,
          PROMPT_ELIGIBILITY_GRANT,
          `GRANTOVÁ VÝZVA:\n${grantText}\n\nEXTRAHOVANÉ PODMIENKY (JSON):\n${requirements.text}\n\nPROFIL FIRMY:\n${companyText}`,
          { json: true },
        );
      } catch (e) { errors.push("Spôsobilosť: " + geminiUserMessage(e)); }
    }

    return {
      grant: { id: grant.id, kod: grant.kod, title: grant.title },
      parts: {
        summary: summary && { model: summary.model, elapsedMs: summary.elapsedMs, text: summary.text },
        requirements: requirements && { model: requirements.model, elapsedMs: requirements.elapsedMs, text: requirements.text, parsed: safeJson(requirements.text) },
        eligibility: eligibility && { model: eligibility.model, elapsedMs: eligibility.elapsedMs, text: eligibility.text, parsed: safeJson(eligibility.text) },
      },
      errors,
    };
  });
