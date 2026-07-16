// Phase 3 — AI návrh subdodávok, kandidáti z RPO, generovanie oslovení.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GEMINI_MODELS, geminiGenerate, geminiUserMessage } from "./gemini.server";
import { fetchCompanyFromRegisters } from "./registers.server";


// ---------------- Types ----------------
type SuggestedItem = {
  nazov: string;
  dovod: string;
  nace_kod?: string | null;
  hladane_slovo?: string | null;
  hladane_slova?: string[] | null;
  sam_zvladne: boolean;
};

async function requireActive(context: any) {
  const { data: prefs } = await context.supabase
    .from("user_preferences")
    .select("subscription_status")
    .eq("user_id", context.userId)
    .maybeSingle();
  const status = prefs?.subscription_status ?? "trial";
  if (status !== "active") {
    throw new Error("Funkcia je dostupná len s aktívnym predplatným.");
  }
}

function safeJson<T = any>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

// ---------------- Layer A: navrhni subdodávky ----------------

const PROMPT_SUGGEST = `Si expert na verejné obstarávanie a na slovenský obchodný / živnostenský register. Na základe podmienok tejto zákazky a profilu firmy urči, aké plnenia firma pravdepodobne potrebuje zabezpečiť subdodávateľsky alebo cez partnera (činnosti mimo predmetu jej podnikania, chýbajúce certifikáty, chýbajúce kapacity alebo referencie).

Pre každú položku uveď:
- nazov (krátky, konkrétny; napr. "Elektroinštalačné práce" alebo "Doprava a logistika")
- dovod (ktorá podmienka to vyžaduje / prečo firma nezvládne sama)
- nace_kod (odhadovaný 2- alebo 4-miestny SK-NACE kód, napr. "43.21", ak neviete napíšte null)
- hladane_slovo — JEDEN krátky KOREŇ slova, MAXIMÁLNE 10 znakov, BEZ KONCOVKY. Odsekni koncovku! RPO fulltext matchuje presný podreťazec, takže dlhé slová s koncovkou zlyhajú. Nikdy nevracaj slovo dlhšie ako 10 znakov ani slovo končiace na -ácie, -ácia, -ícke, -ické, -níctvo, -tvo, -ské, -ská, -é, -ý, -a, -y. Príklady ÁNO/NIE:
    ÁNO "elektroinštal" — NIE "elektroinštalácie", NIE "elektroinštalačné"
    ÁNO "záhradn" — NIE "záhradnícke", NIE "záhradníctvo"
    ÁNO "stavebn" — NIE "stavebníctvo", NIE "stavebné"
    ÁNO "vodoinštal" — NIE "vodoinštalácie"
    ÁNO "murár" — NIE "murárske práce"
    ÁNO "doprav" — NIE "doprava", NIE "dopravné"
  Koreň zodpovedá tomu, AKO JE ČINNOSŤ ZAPÍSANÁ v slovenskom obchodnom / živnostenskom registri, NIE hovorovému názvu remesla ("elektrikár", "záhradník").
  Príklady správne (formálny koreň):
    elektro → "elektroinštal" / "elektromontáž" / "elektrotechn"
    záhrada → "záhradn" / "záhradníc"
    stavba → "stavebn" / "murárske"
    voda/kúrenie → "vodoinštal" / "kúrenárske"
    stráženie → "stráženie" / "bezpečnost"
    účtovníctvo → "účtovníc" / "audítor"
    kovo → "zvárač" / "kovoobráb"
    obchod → "veľkoobchod" / "maloobchod"
    doprava → "doprav" / "nákladn" / "prepravn"
  Príklady NESPRÁVNE (hovorové alebo celá fráza):
    "elektrikár", "záhradník", "murár", "vodár", "kosač"
    "predaj záhradnej techniky", "elektroinštalačné práce a revízie", "cestná nákladná doprava tovaru"
- hladane_slova — pole 3–4 alternatívnych krátkych koreňov ROZDIELNYCH formálnych formulácií tej istej činnosti (rôzne slovné základy, nie iba iná koncovka). Slúžia ako fallback, ak hlavné slovo nič nenájde.
  Príklady:
    elektro → ["elektroinštal", "elektromontáž", "elektrotechn", "elektro"]
    záhradná technika → ["záhradn", "veľkoobchod", "komunáln", "predaj stroj"]
    doprava → ["doprav", "nákladn", "prepravn", "špedič"]
    stavebné → ["stavebn", "murárske", "stavby", "rekonštruk"]

Diakritiku ponechaj (register ju zvláda). Nepoužívaj úvodzovky ani interpunkciu vo vnútri hľadaných slov.

Ak firma pravdepodobne zvládne všetko sama, vráť prázdny zoznam a firma_zvladne_sama=true s krátkou poznámkou.

Vráť LEN JSON: {"firma_zvladne_sama": boolean, "poznamka": string, "polozky": [{"nazov": string, "dovod": string, "nace_kod": string|null, "hladane_slovo": string, "hladane_slova": string[], "sam_zvladne": false}]}`;

export const suggestSubcontracting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    tender_id: z.string().uuid(),
    force: z.boolean().optional().default(false),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireActive(context);

    // Cache check
    if (!data.force) {
      const { data: cached } = await context.supabase
        .from("tender_subcontracting")
        .select("*")
        .eq("user_id", context.userId)
        .eq("tender_id", data.tender_id)
        .maybeSingle();
      if (cached && Array.isArray((cached as any).suggested) && (cached as any).suggested.length >= 0 && (cached as any).model_versions) {
        return { ...(cached as any), cached: true };
      }
    }

    // Load analysis (need requirements + eligibility co_chyba) + tender + profile
    const [{ data: analysis }, { data: tender }, { data: profile }] = await Promise.all([
      context.supabase.from("tender_analysis").select("summary,requirements,eligibility")
        .eq("user_id", context.userId).eq("tender_id", data.tender_id).maybeSingle(),
      context.supabase.from("tenders")
        .select("id,title,description,cpv_code,region,country")
        .eq("id", data.tender_id).maybeSingle(),
      context.supabase.from("company_profile").select("*").eq("user_id", context.userId).maybeSingle(),
    ]);
    if (!analysis) throw new Error("Najprv spustite AI analýzu zákazky.");
    if (!tender) throw new Error("Zákazka nenájdená.");
    if (!profile) throw new Error("Chýba firemný profil.");

    const req = (analysis as any).requirements ?? {};
    const elig = (analysis as any).eligibility ?? {};
    const p: any = profile;

    const userText = [
      `ZÁKAZKA: ${tender.title}`,
      `CPV: ${tender.cpv_code ?? "—"} | Región: ${tender.region ?? "—"} / ${tender.country ?? "—"}`,
      "",
      "PODMIENKY ÚČASTI (JSON):",
      JSON.stringify(req, null, 2),
      "",
      "ČO FIRME CHÝBA (z analýzy spôsobilosti):",
      elig?.co_chyba ?? "—",
      "",
      "PROFIL FIRMY:",
      `IČO ${p.ico ?? "—"} | Názov ${p.nazov ?? "—"}`,
      `SK-NACE hlavná: ${p.sk_nace_code ?? "—"} — ${p.sk_nace_name ?? "?"}`,
      `Certifikáty: ${(p.certifikaty ?? []).join(", ") || "—"}`,
      `Technické vybavenie: ${p.technicke_vybavenie ?? "—"}`,
      `Kľúčoví odborníci: ${p.kluc_odbornici ?? "—"}`,
    ].join("\n");

    let raw = "";
    try {
      raw = await geminiGenerate(GEMINI_MODELS.FLASH, userText, {
        system: PROMPT_SUGGEST,
        temperature: 0.3,
        maxOutputTokens: 3072,
        responseJson: true,
        disableThinking: true,
        fallback: GEMINI_MODELS.LITE,
      });
    } catch (e) {
      throw new Error(geminiUserMessage(e));
    }

    const parsed = safeJson<{ firma_zvladne_sama: boolean; poznamka: string; polozky: SuggestedItem[] }>(raw);
    const polozky = Array.isArray(parsed?.polozky) ? parsed!.polozky : [];

    // Persist (keep existing selections)
    const { data: existing } = await context.supabase
      .from("tender_subcontracting").select("selections")
      .eq("user_id", context.userId).eq("tender_id", data.tender_id).maybeSingle();

    const row = {
      user_id: context.userId,
      tender_id: data.tender_id,
      suggested: polozky,
      firma_zvladne_sama: !!parsed?.firma_zvladne_sama,
      poznamka: parsed?.poznamka ?? null,
      selections: (existing as any)?.selections ?? [],
      model_versions: { suggest: GEMINI_MODELS.FLASH, raw_len: raw.length },
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await context.supabase
      .from("tender_subcontracting")
      .upsert(row, { onConflict: "user_id,tender_id" })
      .select().maybeSingle();
    if (error) throw error;
    return { ...(saved as any), cached: false };
  });

export const getSubcontracting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ tender_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("tender_subcontracting").select("*")
      .eq("user_id", context.userId).eq("tender_id", data.tender_id).maybeSingle();
    return row ?? null;
  });

// ---------------- Layer B: kandidáti z RPO ----------------
// RPO /v1/search: mainActivity = fulltext na názov hlavnej ekonomickej činnosti,
// addressMunicipality = fulltext na obec sídla. NACE kód priamo nefunguje —
// používame slovný kľúč (hladane_slovo) z Layer A. Registeruz filter po
// NACE/kraji nefunguje na endpointe /uctovne-jednotky.

type Candidate = {
  ico: string | null;
  nazov: string | null;
  mesto: string | null;
  psc: string | null;
  ulica: string | null;
  hlavna_cinnost: string | null;
};

async function rpoSearch(keyword: string, city?: string | null, limit = 15): Promise<Candidate[]> {
  const params = new URLSearchParams();
  params.set("mainActivity", keyword);
  if (city && city.length >= 3) params.set("addressMunicipality", city);
  params.set("onlyActive", "true");

  const url = `https://api.statistics.sk/rpo/v1/search?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json: any = await res.json();
  const results: any[] = json?.results ?? [];
  const out: Candidate[] = [];
  for (const r of results.slice(0, limit)) {
    const active = (r.addresses ?? []).find((a: any) => !a.validTo) ?? r.addresses?.[0] ?? {};
    const name = (r.fullNames ?? []).find((n: any) => !n.validTo)?.value ?? r.fullNames?.[0]?.value ?? null;
    const ico = (r.identifiers ?? [])[0]?.value ?? null;
    const activity = r.statisticalCodes?.mainActivity?.value ?? null;
    out.push({
      ico,
      nazov: name,
      mesto: active?.municipality?.value ?? null,
      psc: (active?.postalCodes ?? [])[0] ?? null,
      ulica: [active?.street, active?.buildingNumber].filter(Boolean).join(" ") || null,
      hlavna_cinnost: activity,
    });
  }
  return out;
}

// Odsekne bežné slovenské koncovky a vygeneruje kandidátske korene (od najdlhšieho po najkratší).
// RPO fulltext matchuje presný podreťazec, takže "elektroinštalacie" nenájde firmy zapísané ako
// "elektroinštalačné práce"; skrátením na "elektroinštal" ich nájde.
function stemVariants(word: string): string[] {
  const w = (word ?? "").trim();
  if (w.length < 3) return [];
  const suffixes = [
    "ovanie", "ovania", "ovanú", "ovaní",
    "áreň", "árstvo", "íctvo", "níctvo", "stvo", "tvo",
    "ácie", "ácia", "áciu", "ácii",
    "ícke", "ické", "ických", "ickým",
    "árske", "árska", "árskych", "árskej",
    "ovské", "ovská",
    "ské", "ská", "ský", "skych", "skej",
    "né", "ná", "ný", "ných", "nej", "nom",
    "cie", "cia",
    "ov", "om", "och", "ami",
    "y", "e", "a", "u", "i", "o", "í", "á", "é", "ý",
  ];
  const out = new Set<string>();
  let cur = w;
  // Try suffix stripping (multiple rounds)
  for (let round = 0; round < 3; round++) {
    let stripped = false;
    for (const suf of suffixes) {
      if (cur.length - suf.length >= 5 && cur.toLowerCase().endsWith(suf)) {
        cur = cur.slice(0, cur.length - suf.length);
        out.add(cur);
        stripped = true;
        break;
      }
    }
    if (!stripped) break;
  }
  // Also progressively chop 2 chars off the end (safety net) down to ~6 chars.
  let c = w;
  while (c.length > 6) {
    c = c.slice(0, -2);
    out.add(c);
    if (c.length <= 8) break;
  }
  // Cap all variants at 10 chars from the original (matching prompt rule).
  if (w.length > 10) out.add(w.slice(0, 10));
  return Array.from(out).filter((s) => s.length >= 4 && s !== w);
}

async function rpoSearchWithFallback(
  keyword: string,
  alternatives: string[] | undefined,
  city: string | null | undefined,
  limit: number,
): Promise<{ results: Candidate[]; used_keyword: string; used_city: string | null; tried: string[]; dropped_city: boolean }> {
  const tried: string[] = [];
  const seen = new Set<string>();
  const pushVariant = (list: string[], s: string) => {
    const t = (s ?? "").trim();
    if (t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(t);
  };

  const variants: string[] = [];
  // Original inputs first, then their stemmed roots interleaved as fallback.
  for (const raw of [keyword, ...(alternatives ?? [])]) {
    pushVariant(variants, raw);
    for (const stem of stemVariants(raw)) pushVariant(variants, stem);
  }

  const cityStr = city && city.trim().length >= 3 ? city.trim() : null;

  if (cityStr) {
    for (const v of variants) {
      tried.push(v);
      const results = await rpoSearch(v, cityStr, limit);
      if (results.length > 0) return { results, used_keyword: v, used_city: cityStr, tried, dropped_city: false };
    }
  }
  for (const v of variants) {
    if (!cityStr) tried.push(v);
    const results = await rpoSearch(v, null, limit);
    if (results.length > 0) return { results, used_keyword: v, used_city: null, tried, dropped_city: !!cityStr };
  }
  return { results: [], used_keyword: keyword, used_city: cityStr, tried, dropped_city: !!cityStr };
}

export const findSubcontractorCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    keyword: z.string().min(2).max(80),
    alternatives: z.array(z.string().min(2).max(80)).max(6).optional(),
    city: z.string().nullable().optional(),
    limit: z.number().int().min(1).max(30).optional().default(15),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireActive(context);
    try {
      const r = await rpoSearchWithFallback(data.keyword, data.alternatives, data.city ?? null, data.limit);
      const notes: string[] = [];
      if (r.used_keyword !== data.keyword) notes.push(`Použitý alternatívny pojem „${r.used_keyword}".`);
      if (r.dropped_city) notes.push("Filter mesta bol uvoľnený — inak neboli žiadne výsledky.");
      const base = "Firmy podľa registrovanej hlavnej činnosti a obce sídla. Nie sú overení subdodávatelia — overte referencie, kapacitu a spoľahlivosť sami.";
      return {
        results: r.results,
        source: "RPO Štatistický úrad SR",
        used_keyword: r.used_keyword,
        used_city: r.used_city,
        tried: r.tried,
        dropped_city: r.dropped_city,
        note: [notes.join(" "), base].filter(Boolean).join(" "),
      };
    } catch (e: any) {
      return { results: [], source: "RPO", error: e?.message ?? "RPO nedostupné" };
    }
  });

// ---------------- Layer C: generovanie oslovení ----------------

const PROMPT_OUTREACH = `Si obchodný asistent firmy. Napíš profesionálny slovenský obchodný e-mail — dve verzie:

VERZIA 1 — NEUTRÁLNY DOPYT NA CENOVÚ PONUKU:
Predstav odosielateľa, uveď čo firma potrebuje (konkrétna špecifikácia, orientačný rozsah, požadovaný termín dodania), požiadaj o cenovú ponuku do konkrétneho dátumu, poďakuj. Nespomínaj konkrétny tender.

VERZIA 2 — DOPYT + VÝZVA NA SPOLUPRÁCU:
To isté ako verzia 1, ale spomeň konkrétnu zákazku (názov / obstarávateľ) a navrhni spoluprácu — firma sa uchádza o túto zákazku a hľadá subdodávateľa/partnera na túto časť plnenia.

Pravidlá:
- profesionálny, vecný tón, bez marketingových fráz
- konkrétne dátumy a čísla, ktoré ti dodá kontext
- oslovenie "Vážení, / Dobrý deň," podľa vhodnosti
- podpis: iba "S pozdravom,\\n{odosielateľ_nazov}" (bez vymyslených mien/kontaktov)
- predmet e-mailu na prvom riadku vo formáte "Predmet: …"

Vráť LEN JSON: {"neutralne": {"predmet": string, "telo": string}, "spolupraca": {"predmet": string, "telo": string}}`;

export const generateOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    tender_id: z.string().uuid(),
    need_nazov: z.string().min(2),
    specifikacia: z.string().min(2),
    subcontractor_nazov: z.string().min(2),
    termin_ponuky: z.string().nullable().optional(),
    termin_dodania: z.string().nullable().optional(),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireActive(context);

    const [{ data: tender }, { data: profile }] = await Promise.all([
      context.supabase.from("tenders").select("title,contracting_authority,deadline,source_url").eq("id", data.tender_id).maybeSingle(),
      context.supabase.from("company_profile").select("nazov,ico").eq("user_id", context.userId).maybeSingle(),
    ]);
    if (!tender) throw new Error("Zákazka nenájdená.");

    const userText = [
      `ODOSIELATEĽ (naša firma):`,
      `  Názov: ${(profile as any)?.nazov ?? "—"}`,
      `  IČO: ${(profile as any)?.ico ?? "—"}`,
      "",
      `ADRESÁT (subdodávateľ): ${data.subcontractor_nazov}`,
      "",
      `ČO POTREBUJEME (plnenie): ${data.need_nazov}`,
      `ŠPECIFIKÁCIA / ROZSAH: ${data.specifikacia}`,
      `TERMÍN PRE ZASLANIE CENOVEJ PONUKY: ${data.termin_ponuky ?? "do 7 pracovných dní"}`,
      `POŽADOVANÝ TERMÍN DODANIA: ${data.termin_dodania ?? "podľa dohody"}`,
      "",
      `KONTEXT ZÁKAZKY (len pre verziu 2):`,
      `  Názov: ${tender.title}`,
      `  Obstarávateľ: ${tender.contracting_authority}`,
      `  Termín predkladania ponúk: ${tender.deadline ?? "—"}`,
    ].join("\n");

    let raw = "";
    try {
      raw = await geminiGenerate(GEMINI_MODELS.FLASH, userText, {
        system: PROMPT_OUTREACH,
        temperature: 0.5,
        maxOutputTokens: 2048,
        responseJson: true,
        disableThinking: true,
        fallback: GEMINI_MODELS.LITE,
      });
    } catch (e) {
      throw new Error(geminiUserMessage(e));
    }

    const parsed = safeJson<{ neutralne: { predmet: string; telo: string }; spolupraca: { predmet: string; telo: string } }>(raw);
    if (!parsed?.neutralne || !parsed?.spolupraca) {
      throw new Error("AI vrátila neočakávaný formát oslovenia.");
    }
    return parsed;
  });

// ---------------- Uloženie výberu (subdodávatelia + oslovenia) ----------------

const SelectionSchema = z.object({
  key: z.string(),
  need_nazov: z.string(),
  nazov_firmy: z.string(),
  ico: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  mesto: z.string().nullable().optional(),
  co_dopyt: z.string().nullable().optional(),
  oslovenia: z.object({
    neutralne: z.object({ predmet: z.string(), telo: z.string() }).nullable().optional(),
    spolupraca: z.object({ predmet: z.string(), telo: z.string() }).nullable().optional(),
  }).nullable().optional(),
  vybrana_verzia: z.enum(["neutralne", "spolupraca"]).nullable().optional(),
  vlastny_text: z.string().nullable().optional(),
});

export const saveSubcontractingSelections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    tender_id: z.string().uuid(),
    selections: z.array(SelectionSchema),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireActive(context);
    const { data: saved, error } = await context.supabase
      .from("tender_subcontracting")
      .upsert(
        {
          user_id: context.userId,
          tender_id: data.tender_id,
          selections: data.selections,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,tender_id" },
      )
      .select().maybeSingle();
    if (error) throw error;
    return saved;
  });

// ============================================================
// ADMIN VARIANTS (Phase 3) — testovanie bez firemného profilu a bez ukladania
// ============================================================

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("forbidden");
}

// Layer A — návrhy subdodávok bez profilu, bez ukladania
export const adminSuggestSubcontracting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    tender_id: z.string().uuid(),
    ico: z.string().min(6).max(12),
    requirements: z.any().optional(),
    eligibility: z.any().optional(),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: tender } = await context.supabase
      .from("tenders")
      .select("id,title,description,cpv_code,region,country")
      .eq("id", data.tender_id).maybeSingle();
    if (!tender) throw new Error("Zákazka nenájdená");

    const registry = await fetchCompanyFromRegisters(data.ico, context.supabase);

    const req = data.requirements ?? {};
    const elig = data.eligibility ?? {};

    const userText = [
      `ZÁKAZKA: ${tender.title}`,
      `CPV: ${tender.cpv_code ?? "—"} | Región: ${tender.region ?? "—"} / ${tender.country ?? "—"}`,
      "",
      "POPIS ZÁKAZKY:",
      (tender.description ?? "").slice(0, 4000),
      "",
      "PODMIENKY ÚČASTI (JSON, ak k dispozícii):",
      JSON.stringify(req, null, 2),
      "",
      "ČO FIRME CHÝBA (z analýzy spôsobilosti):",
      elig?.co_chyba ?? "—",
      "",
      "PROFIL FIRMY (z registrov, bez doplnkových údajov):",
      `IČO ${registry.ico} | Názov ${registry.nazov ?? "—"}`,
      `SK-NACE hlavná: ${registry.sk_nace_code ?? "—"} — ${registry.sk_nace_name ?? "?"}`,
      `Právna forma: ${registry.pravna_forma ?? "—"} | Veľkosť: ${registry.velkost_kategoria ?? "—"}`,
    ].join("\n");

    const t0 = Date.now();
    let raw = "";
    try {
      raw = await geminiGenerate(GEMINI_MODELS.FLASH, userText, {
        system: PROMPT_SUGGEST,
        temperature: 0.3,
        maxOutputTokens: 3072,
        responseJson: true,
        disableThinking: true,
        fallback: GEMINI_MODELS.LITE,
      });
    } catch (e) {
      throw new Error(geminiUserMessage(e));
    }
    const parsed = safeJson<{ firma_zvladne_sama: boolean; poznamka: string; polozky: SuggestedItem[] }>(raw);
    return {
      registry: {
        ico: registry.ico,
        nazov: registry.nazov,
        sk_nace: registry.sk_nace_code ? `${registry.sk_nace_code} — ${registry.sk_nace_name ?? "?"}` : null,
        mesto: registry.mesto,
      },
      model: GEMINI_MODELS.FLASH,
      elapsedMs: Date.now() - t0,
      raw,
      parsed,
      polozky: Array.isArray(parsed?.polozky) ? parsed!.polozky : [],
      firma_zvladne_sama: !!parsed?.firma_zvladne_sama,
      poznamka: parsed?.poznamka ?? null,
    };
  });

// Layer B — kandidáti z RPO bez subscription checku
export const adminFindSubcontractorCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    keyword: z.string().min(2).max(80),
    alternatives: z.array(z.string().min(2).max(80)).max(6).optional(),
    city: z.string().nullable().optional(),
    limit: z.number().int().min(1).max(30).optional().default(15),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const t0 = Date.now();
    try {
      const r = await rpoSearchWithFallback(data.keyword, data.alternatives, data.city ?? null, data.limit);
      return {
        results: r.results,
        elapsedMs: Date.now() - t0,
        source: "RPO Štatistický úrad SR",
        used_keyword: r.used_keyword,
        used_city: r.used_city,
        tried: r.tried,
        dropped_city: r.dropped_city,
      };
    } catch (e: any) {
      return { results: [], elapsedMs: Date.now() - t0, source: "RPO", error: e?.message ?? "RPO nedostupné" };
    }
  });

// Layer C — generovanie oslovení bez profilu a bez ukladania
export const adminGenerateOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    tender_id: z.string().uuid(),
    need_nazov: z.string().min(2),
    specifikacia: z.string().min(2),
    subcontractor_nazov: z.string().min(2),
    our_firm_nazov: z.string().min(2),
    our_firm_ico: z.string().nullable().optional(),
    termin_ponuky: z.string().nullable().optional(),
    termin_dodania: z.string().nullable().optional(),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: tender } = await context.supabase
      .from("tenders")
      .select("title,contracting_authority,deadline,source_url")
      .eq("id", data.tender_id).maybeSingle();
    if (!tender) throw new Error("Zákazka nenájdená");

    const userText = [
      `ODOSIELATEĽ (naša firma):`,
      `  Názov: ${data.our_firm_nazov}`,
      `  IČO: ${data.our_firm_ico ?? "—"}`,
      "",
      `ADRESÁT (subdodávateľ): ${data.subcontractor_nazov}`,
      "",
      `ČO POTREBUJEME (plnenie): ${data.need_nazov}`,
      `ŠPECIFIKÁCIA / ROZSAH: ${data.specifikacia}`,
      `TERMÍN PRE ZASLANIE CENOVEJ PONUKY: ${data.termin_ponuky ?? "do 7 pracovných dní"}`,
      `POŽADOVANÝ TERMÍN DODANIA: ${data.termin_dodania ?? "podľa dohody"}`,
      "",
      `KONTEXT ZÁKAZKY (len pre verziu 2):`,
      `  Názov: ${tender.title}`,
      `  Obstarávateľ: ${tender.contracting_authority}`,
      `  Termín predkladania ponúk: ${tender.deadline ?? "—"}`,
    ].join("\n");

    const t0 = Date.now();
    let raw = "";
    try {
      raw = await geminiGenerate(GEMINI_MODELS.FLASH, userText, {
        system: PROMPT_OUTREACH,
        temperature: 0.5,
        maxOutputTokens: 2048,
        responseJson: true,
        disableThinking: true,
        fallback: GEMINI_MODELS.LITE,
      });
    } catch (e) {
      throw new Error(geminiUserMessage(e));
    }
    const parsed = safeJson<{ neutralne: { predmet: string; telo: string }; spolupraca: { predmet: string; telo: string } }>(raw);
    return { model: GEMINI_MODELS.FLASH, elapsedMs: Date.now() - t0, raw, parsed };
  });

