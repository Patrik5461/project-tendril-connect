import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GEMINI_MODELS, geminiGenerate, geminiUserMessage, type GeminiModel } from "./gemini.server";
import { categoriesForGrant, defaultCategoryFromLegalForm, type ApplicantCategory } from "./grant-applicant-categories";

// ---------- HTML / entity utilities ----------
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

function stripHtml(s: string | null | undefined, maxLen = 0): string {
  if (!s) return "";
  const cleaned = decodeEntities(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return maxLen > 0 && cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "…" : cleaned;
}

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
  financne_roky?: Array<{ rok: number; obrat?: number | null; zamestnanci?: number | null }>;
  referencie?: any[];
  certifikaty?: string[];
  doplnkove_info?: string | null;
};

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

// ---------- Deterministic pieces ----------

/** Parse "5%" / "5 %" / "spolufinancovanie 15 %" → percent number (0-100), or null. */
function parseSpolufinancovaniePct(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = stripHtml(s);
  // Match "X %" patterns; take the first plausible value
  const m = cleaned.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
}

function totalAlokacia(g: GrantRow): number | null {
  const a = Number(g.suma_eu ?? 0) + Number(g.suma_sr ?? 0);
  return a > 0 ? a : null;
}

function lastYearTurnover(c: CompanyForAnalysis): { rok: number; obrat: number } | null {
  const years = (c.financne_roky ?? [])
    .filter((r) => r && typeof r.obrat === "number" && (r.obrat as number) > 0)
    .sort((a, b) => (b.rok ?? 0) - (a.rok ?? 0));
  const y = years[0];
  return y ? { rok: y.rok, obrat: y.obrat as number } : null;
}

type FormalGate = {
  applicant_categories: ApplicantCategory[]; // categories the výzva targets
  user_category: ApplicantCategory | null;
  applicant_match: "match" | "mismatch" | "unknown";
  region_match: "match" | "mismatch" | "unknown" | "nationwide";
  region_hint: string | null;
  blocked: boolean;
  blocking_reason: string | null;
};

const KRAJ_NUTS: Record<string, string[]> = {
  "Bratislavský kraj": ["SK010", "SK01"],
  "Trnavský kraj": ["SK021", "SK02"],
  "Trenčiansky kraj": ["SK022", "SK02"],
  "Nitriansky kraj": ["SK023", "SK02"],
  "Žilinský kraj": ["SK031", "SK03"],
  "Banskobystrický kraj": ["SK032", "SK03"],
  "Prešovský kraj": ["SK041", "SK04"],
  "Košický kraj": ["SK042", "SK04"],
};

function isNationwide(m: any): boolean {
  if (!m) return false;
  const kod = String((m as any).kod ?? "").toUpperCase();
  const naz = String((m as any).nazov ?? "").toLowerCase();
  return kod === "SK" || kod === "SK0" || /slovensk/i.test(naz);
}

function computeFormalGate(g: GrantRow, c: CompanyForAnalysis): FormalGate {
  const grantCats = Array.from(categoriesForGrant(g.opravneny_ziadatel));
  const userCat = defaultCategoryFromLegalForm(c.pravna_forma);

  let applicant_match: FormalGate["applicant_match"] = "unknown";
  if (userCat && grantCats.length > 0) {
    applicant_match = grantCats.includes(userCat) ? "match" : "mismatch";
  }

  // Region
  const miesta: any[] = Array.isArray(g.miesto_realizacie) ? g.miesto_realizacie : [];
  const nationwide = miesta.some(isNationwide);
  let region_match: FormalGate["region_match"] = "unknown";
  let region_hint: string | null = null;
  if (nationwide) {
    region_match = "nationwide";
  } else if (c.kraj && miesta.length > 0) {
    const wanted = KRAJ_NUTS[c.kraj] ?? [];
    const codes = miesta.map((m) => String(m?.kod ?? "").toUpperCase());
    const names = miesta.map((m) => String(m?.nazov ?? "").toLowerCase());
    const hit = codes.some((k) => wanted.includes(k)) || names.some((n) => n.includes(c.kraj!.toLowerCase()));
    region_match = hit ? "match" : "mismatch";
    if (!hit) region_hint = `Firma má sídlo v ${c.kraj}, výzva sa realizuje v: ${miesta.map((m) => m?.nazov ?? m?.kod).filter(Boolean).join(", ")}.`;
  } else if (miesta.length > 0) {
    region_hint = `Miesta realizácie: ${miesta.map((m) => m?.nazov ?? m?.kod).filter(Boolean).join(", ")}.`;
  }

  let blocked = false;
  let blocking_reason: string | null = null;
  if (applicant_match === "mismatch") {
    blocked = true;
    blocking_reason = `Vaša právna forma (${c.pravna_forma ?? "?"}) nespadá medzi oprávnených žiadateľov tejto výzvy (${grantCats.map((x) => x).join(", ") || "—"}).`;
  } else if (region_match === "mismatch") {
    blocked = true;
    blocking_reason = region_hint;
  }

  return {
    applicant_categories: grantCats,
    user_category: userCat,
    applicant_match,
    region_match,
    region_hint,
    blocked,
    blocking_reason,
  };
}

type FinancialFeasibility = {
  miera_spolufinancovania_pct: number | null; // % vlastný vklad
  alokacia_eur: number | null; // celková alokácia výzvy
  posledny_obrat: { rok: number; obrat: number } | null;
  odhad_vlastneho_vkladu_min_eur: number | null; // per typical malý projekt (5% z 100k) — nedokážeme určiť, len ilustrácia
  hodnotenie: "realizovatelne" | "hranicne" | "rizikove" | "nemozno_posudit";
  poznamka: string;
};

function computeFinancialFeasibility(g: GrantRow, c: CompanyForAnalysis): FinancialFeasibility {
  const sc = g.structured_conditions ?? {};
  const miera = parseSpolufinancovaniePct(sc.mieraSpolufinancovania);
  const alok = totalAlokacia(g);
  const obr = lastYearTurnover(c);

  const notes: string[] = [];
  let hodnotenie: FinancialFeasibility["hodnotenie"] = "nemozno_posudit";

  if (miera !== null) {
    notes.push(`Miera spolufinancovania žiadateľa je ${miera} % (t.j. z každého 100 € projektu firma dá ${miera} €, výzva ${100 - miera} €).`);
  } else {
    notes.push("Miera spolufinancovania nebola v štruktúrovaných dátach jednoznačne rozpoznaná.");
  }

  if (obr && miera !== null) {
    // Heuristika: rozumný projekt = 10–30 % ročného obratu; vlastný vklad by nemal presiahnuť ~15 % obratu.
    const maxProjekt = obr.obrat / (miera / 100 || 1); // teoretická max veľkosť projektu, ktorý firma dokáže spolufinancovať celým obratom
    const rozumnyProjekt = obr.obrat * 0.20; // 20 % obratu ako rozumná ročná projektová záťaž
    const rozumnyVklad = rozumnyProjekt * (miera / 100);
    notes.push(`Pri obrate ${Math.round(obr.obrat).toLocaleString("sk-SK")} € (${obr.rok}) je pre firmu z pohľadu likvidity rozumný projekt do cca ${Math.round(rozumnyProjekt).toLocaleString("sk-SK")} € (vlastný vklad ~${Math.round(rozumnyVklad).toLocaleString("sk-SK")} €).`);
    if (miera <= 15) hodnotenie = "realizovatelne";
    else if (miera <= 30) hodnotenie = "hranicne";
    else hodnotenie = "rizikove";
    if (miera > 50) notes.push("POZOR: vysoká miera spolufinancovania — grant financuje menej ako polovicu projektu.");
    if (maxProjekt < 20_000) notes.push("Pri tomto obrate má zmysel len malý pilotný projekt.");
  } else if (obr) {
    notes.push(`Obrat firmy: ${Math.round(obr.obrat).toLocaleString("sk-SK")} € (${obr.rok}).`);
    hodnotenie = "nemozno_posudit";
  } else {
    notes.push("Firma nemá v profile vyplnený obrat — finančnú realizovateľnosť nemožno kvantifikovať. Doplňte financné roky v /firma.");
  }

  if (alok) notes.push(`Celková alokácia výzvy: ${Math.round(alok).toLocaleString("sk-SK")} € (EÚ + ŠR).`);

  return {
    miera_spolufinancovania_pct: miera,
    alokacia_eur: alok,
    posledny_obrat: obr,
    odhad_vlastneho_vkladu_min_eur: null,
    hodnotenie,
    poznamka: notes.join(" "),
  };
}

// ---------- Prompt builders (slim contexts per part) ----------

function buildFinancedContext(g: GrantRow): string {
  const sc = g.structured_conditions ?? {};
  const lines: string[] = [
    `Kód: ${g.kod ?? "—"}`,
    `Názov: ${g.title}`,
    `Program: ${g.program ?? "—"}`,
    `Poskytovateľ: ${g.poskytovatel ?? "—"}`,
    `Alokácia EÚ: ${g.suma_eu ?? "—"} EUR`,
    `Alokácia ŠR: ${g.suma_sr ?? "—"} EUR`,
    `Deadline: ${g.deadline ?? "priebežná / neuvedený"}`,
    `Formát: ${g.typ === "OTVORENA" ? "priebežná (rolling)" : g.typ === "UZAVRETA" ? "one-shot" : g.typ ?? "—"}`,
    `Zameranie: ${stripHtml(g.zameranie, 1200)}`,
  ];

  if (Array.isArray(sc.oblastIntervencie) && sc.oblastIntervencie.length) {
    lines.push("Oblasti intervencie:");
    for (const oi of sc.oblastIntervencie.slice(0, 8)) {
      const n = oi?.oblastIntervencie?.nazovSk ?? oi?.oblastIntervencie?.popisSk;
      if (n) lines.push(`  • ${stripHtml(n, 200)}`);
    }
  }

  if (Array.isArray(sc.opravneneVydavky) && sc.opravneneVydavky.length) {
    lines.push("Oprávnené výdavky (skrátené):");
    for (const v of sc.opravneneVydavky.slice(0, 15)) {
      const n = v?.nazovSk ?? v?.nazov;
      if (n) lines.push(`  • ${stripHtml(n, 200)}`);
    }
  }

  if (Array.isArray(sc.merateInyUkazovatel) && sc.merateInyUkazovatel.length) {
    lines.push("Merateľné ukazovatele:");
    for (const i of sc.merateInyUkazovatel.slice(0, 8)) {
      const n = i?.nazovSk ?? i?.nazov;
      if (n) lines.push(`  • ${stripHtml(n, 200)}`);
    }
  }

  if (sc.mieraSpolufinancovania) lines.push(`Miera spolufinancovania: ${stripHtml(sc.mieraSpolufinancovania, 300)}`);
  if (sc.formaPodpory && Array.isArray(sc.formaPodpory)) {
    lines.push(`Forma podpory: ${sc.formaPodpory.map((x: any) => x?.nazovSk ?? x?.nazov).filter(Boolean).join(", ")}`);
  }

  return lines.join("\n");
}

function buildFormalContext(g: GrantRow, c: CompanyForAnalysis, gate: FormalGate): string {
  const sc = g.structured_conditions ?? {};
  const miesta = Array.isArray(g.miesto_realizacie) ? g.miesto_realizacie.map((m: any) => m?.nazov ?? m?.kod).filter(Boolean).join(", ") : "";
  const ziadatelia = Array.isArray(g.opravneny_ziadatel) ? g.opravneny_ziadatel.map((z: any) => z?.nazov).filter(Boolean).join(", ") : "";

  const parts: string[] = [
    `VÝZVA (${g.kod ?? "?"}): ${g.title}`,
    `Oprávnený žiadateľ (taxatívny zoznam z ITMS): ${ziadatelia || "neuvedené"}`,
    `Miesto realizácie: ${miesta || "neuvedené"}`,
  ];

  // Include only top 5 podmienky poskytnutia s krátkym textom
  if (Array.isArray(sc.podmienkaPoskytnutiaPrispevku) && sc.podmienkaPoskytnutiaPrispevku.length) {
    parts.push("Vybrané podmienky poskytnutia príspevku (skrátené):");
    for (const p of sc.podmienkaPoskytnutiaPrispevku.slice(0, 8)) {
      const n = p?.nazovSk ?? "";
      const d = stripHtml(p?.popisSk, 250);
      if (n) parts.push(`  • ${n}${d ? `: ${d}` : ""}`);
    }
  }

  parts.push("", "PROFIL FIRMY:");
  parts.push(`- Právna forma: ${c.pravna_forma ?? "—"}`);
  parts.push(`- Veľkosť: ${c.velkost ?? "—"}`);
  parts.push(`- SK-NACE: ${c.sk_nace ?? "—"}`);
  parts.push(`- Sídlo: ${[c.mesto, c.kraj].filter(Boolean).join(", ") || "—"}`);

  parts.push("", "PREDVÝPOČET (deterministický, ber ako fakt):");
  parts.push(`- Kategória žiadateľa firmy: ${gate.user_category ?? "?"}`);
  parts.push(`- Kategórie žiadateľa výzvy: ${gate.applicant_categories.join(", ") || "?"}`);
  parts.push(`- Zhoda kategórie: ${gate.applicant_match}`);
  parts.push(`- Zhoda regiónu: ${gate.region_match}${gate.region_hint ? ` (${gate.region_hint})` : ""}`);
  if (gate.blocked) parts.push(`- BLOKUJÚCA CHYBA: ${gate.blocking_reason}`);

  return parts.join("\n");
}

// ---------- Prompts (Slovak) ----------

const PROMPT_FINANCED =
  "Zhrň, ČO táto grantová výzva financuje a čo by žiadateľ musel pripraviť. Nie posudzuj vhodnosť projektu (nevieš, aký projekt žiadateľ zamýšľa). Štruktúra: 1) Účel výzvy (2–3 vety). 2) Oprávnené aktivity (bullet). 3) Kľúčové oprávnené výdavky (bullet). 4) Ukazovatele, ktoré sa žiadateľ zaviaže plniť (bullet, ak sú). 5) Termíny a forma podpory (1–2 vety). Vecne, bez marketingu. Slovenčina.";

const PROMPT_FORMAL = `Posudzuješ FORMÁLNU oprávnenosť firmy pre grantovú výzvu.
Máš k dispozícii deterministický predvýpočet — ber ho ako fakt a nevypúšťaj sa do domýšľania.
Dôraz: právna forma, veľkosť podniku, miesto realizácie, sektor (SK-NACE). Nič iné.

Ku každej podmienke urč stav SPĹŇA / HRANIČNÉ / NESPĹŇA / NEMOŽNO POSÚDIŤ + krátke vysvetlenie.
Ak firma nie je oprávneným žiadateľom (predvýpočet 'mismatch' alebo výzva len pre samosprávy), odporúčanie = 'neodporucame' a analýza tu končí.
Ak údaj o firme chýba → 'NEMOŽNO POSÚDIŤ', nie NESPĹŇA.
Vráť JSON: {"posudenia":[{"podmienka":string,"stav":"SPĹŇA"|"HRANIČNÉ"|"NESPĹŇA"|"NEMOŽNO POSÚDIŤ","vysvetlenie":string}],"odporucanie":"odporucame"|"opatrne"|"neodporucame","co_chyba":string,"zhrnutie":string}`;

const PROMPT_INTENT = `Používateľ zadal krátky ZÁMER (čo chce financovať). Posúď súlad zámeru s cieľmi a oprávnenými aktivitami výzvy.
Nedomýšľaj detaily, ktoré zámer neobsahuje. Ak je zámer príliš vágny, povedz to.
Vráť JSON: {"sulad":"vysoky"|"stredny"|"nizky"|"nemozno_posudit","odovodnenie":string,"co_doplnit":string}`;

// ---------- runner ----------

async function runPart(
  model: GeminiModel,
  system: string,
  user: string,
  opts: { json?: boolean; logLabel: string },
) {
  const t0 = Date.now();
  const text = await geminiGenerate(model, user, {
    system,
    temperature: 0.3,
    maxOutputTokens: opts.json ? 3072 : 2048,
    responseJson: !!opts.json,
    disableThinking: model === GEMINI_MODELS.FLASH || model === GEMINI_MODELS.LITE,
    fallback: GEMINI_MODELS.FLASH,
    logLabel: opts.logLabel,
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

async function runAnalysisPipeline(
  grant: GrantRow,
  company: CompanyForAnalysis,
  intent: string | null,
  logPrefix: string,
) {
  const gate = computeFormalGate(grant, company);
  const financial = computeFinancialFeasibility(grant, company);

  const errors: string[] = [];
  const formalCtx = buildFormalContext(grant, company, gate);
  const financedCtx = buildFinancedContext(grant);

  console.log(`[${logPrefix}] gate blocked=${gate.blocked} applicant_match=${gate.applicant_match} region_match=${gate.region_match}`);
  console.log(`[${logPrefix}] financial hodnotenie=${financial.hodnotenie} miera=${financial.miera_spolufinancovania_pct}%`);
  console.log(`[${logPrefix}] context sizes formal=${formalCtx.length} financed=${financedCtx.length} intent=${intent ? intent.length : 0}`);

  // A) formal (Pro — critical eligibility gate)
  let formal: Awaited<ReturnType<typeof runPart>> | null = null;
  try {
    formal = await runPart(GEMINI_MODELS.PRO, PROMPT_FORMAL, formalCtx, { json: true, logLabel: `${logPrefix}:formal` });
  } catch (e) {
    errors.push("Formálna oprávnenosť: " + geminiUserMessage(e));
  }
  const formalParsed = formal ? safeJson<any>(formal.text) : null;

  // Determine early recommendation from deterministic gate + AI
  let recommendation: "odporucame" | "opatrne" | "neodporucame" | null =
    (formalParsed?.odporucanie as any) ?? null;
  if (gate.blocked) recommendation = "neodporucame";

  // B) what is financed (Flash) — always run; useful even when blocked
  let financed: Awaited<ReturnType<typeof runPart>> | null = null;
  try {
    financed = await runPart(GEMINI_MODELS.FLASH, PROMPT_FINANCED, financedCtx, { logLabel: `${logPrefix}:financed` });
  } catch (e) {
    errors.push("Čo výzva financuje: " + geminiUserMessage(e));
  }

  // C) intent match (Flash) — only if intent provided AND not blocked formally
  let intentAI: Awaited<ReturnType<typeof runPart>> | null = null;
  let intentParsed: any = null;
  if (intent && intent.trim().length >= 10 && !gate.blocked) {
    try {
      const intentCtx = `VÝZVA:\n${financedCtx}\n\nZÁMER ŽIADATEĽA:\n${intent.trim()}`;
      intentAI = await runPart(GEMINI_MODELS.FLASH, PROMPT_INTENT, intentCtx, { json: true, logLabel: `${logPrefix}:intent` });
      intentParsed = safeJson<any>(intentAI.text);
    } catch (e) {
      errors.push("Súlad zámeru: " + geminiUserMessage(e));
    }
  }

  return {
    gate,
    financial,
    formal: { model: formal?.model, elapsedMs: formal?.elapsedMs, text: formal?.text, parsed: formalParsed },
    financed: { model: financed?.model, elapsedMs: financed?.elapsedMs, text: financed?.text },
    intent: intent && intent.trim().length >= 10
      ? { provided: intent.trim(), model: intentAI?.model, elapsedMs: intentAI?.elapsedMs, text: intentAI?.text, parsed: intentParsed, skipped: gate.blocked ? "blocked_by_formal_gate" : null }
      : null,
    recommendation,
    errors,
  };
}

export const analyzeGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    grant_id: z.string().uuid(),
    force: z.boolean().optional().default(false),
    intent: z.string().max(1500).optional().nullable(),
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
    const t0 = Date.now();
    const result = await runAnalysisPipeline(grant, companyCtx, data.intent ?? null, `grant:${grant.kod ?? grant.id.slice(0, 8)}`);
    console.log(`[grant-analysis] user=${context.userId.slice(0, 8)} grant=${grant.kod} total_elapsed=${Date.now() - t0}ms errors=${result.errors.length}`);

    // Persist into existing JSONB columns (backward compatible shape).
    const eligibilityJson = {
      formal: {
        gate: result.gate,
        posudenia: result.formal.parsed?.posudenia ?? [],
        odporucanie: result.formal.parsed?.odporucanie ?? null,
      },
      financial: result.financial,
      intent: result.intent
        ? { provided: result.intent.provided, parsed: result.intent.parsed, skipped: result.intent.skipped }
        : null,
      zhrnutie: result.formal.parsed?.zhrnutie ?? (result.gate.blocked ? result.gate.blocking_reason : null),
      co_chyba: result.formal.parsed?.co_chyba ?? null,
      posudenia: result.formal.parsed?.posudenia ?? [], // legacy alias for UI
    };

    const row = {
      user_id: context.userId,
      grant_id: data.grant_id,
      summary: result.financed.text ?? null,
      requirements: {
        format_version: 2,
        financial: result.financial,
      },
      eligibility: eligibilityJson,
      recommendation: result.recommendation,
      overall: eligibilityJson.zhrnutie,
      model_versions: {
        formal: result.formal.model,
        financed: result.financed.model,
        intent: result.intent?.model ?? null,
        errors: result.errors,
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
    intent: z.string().max(1500).optional().nullable(),
    company_override: z.object({
      pravna_forma: z.string().optional(),
      velkost: z.string().optional(),
      sk_nace: z.string().optional(),
      mesto: z.string().optional(),
      kraj: z.string().optional(),
      obrat_posledny: z.number().optional(),
      rok_obratu: z.number().optional(),
    }).optional().nullable(),
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

    const ov = data.company_override ?? {};
    const company: CompanyForAnalysis = {
      ico: data.ico ?? null,
      nazov: "(admin test)",
      pravna_forma: ov.pravna_forma ?? "Spoločnosť s ručením obmedzeným",
      sk_nace: ov.sk_nace ?? null,
      velkost: ov.velkost ?? "mikro",
      mesto: ov.mesto ?? null,
      kraj: ov.kraj ?? null,
      financne_roky: ov.obrat_posledny
        ? [{ rok: ov.rok_obratu ?? new Date().getFullYear() - 1, obrat: ov.obrat_posledny, zamestnanci: null }]
        : [],
      referencie: [],
      certifikaty: [],
    };

    const result = await runAnalysisPipeline(
      grant,
      company,
      data.intent ?? null,
      `admin-grant:${grant.kod ?? grant.id.slice(0, 8)}`,
    );

    return {
      grant: { id: grant.id, kod: grant.kod, title: grant.title, program: grant.program },
      gate: result.gate,
      financial: result.financial,
      recommendation: result.recommendation,
      formal: result.formal,
      financed: result.financed,
      intent: result.intent,
      errors: result.errors,
    };
  });
