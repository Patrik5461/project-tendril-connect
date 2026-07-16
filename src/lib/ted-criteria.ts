// Shared helpers for TED structured_criteria (server + client safe — no runtime imports).
// Runs both in TanStack server functions and React components.

export const TED_LANG_PRIORITY = [
  "eng", "deu", "fra", "pol", "ces", "spa", "ita", "por", "nld", "hun",
  "ron", "swe", "fin", "dan", "ell", "bul", "hrv", "slv", "slk", "sk",
];

/** Pick first string from TED's polymorphic value with a language priority. */
export function firstStringLang(value: unknown, priority: string[] = TED_LANG_PRIORITY): string | { text: string; lang: string | null } | null {
  const r = pickWithLang(value, priority);
  return r;
}

function pickWithLang(value: unknown, priority: string[]): { text: string; lang: string | null } | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const s = value.trim();
    return s ? { text: s, lang: null } : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { text: String(value), lang: null };
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const r = pickWithLang(v, priority);
      if (r) return r;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of priority) {
      if (key in obj) {
        const r = pickWithLang(obj[key], priority);
        if (r) return { text: r.text, lang: r.lang ?? key };
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      const r = pickWithLang(v, priority);
      if (r) return { text: r.text, lang: r.lang ?? k };
    }
    return null;
  }
  return null;
}

/** Collect all strings for a chosen language (or fallback to first). */
export function collectStringsLang(value: unknown, priority: string[] = TED_LANG_PRIORITY): { texts: string[]; lang: string | null } {
  if (value === null || value === undefined) return { texts: [], lang: null };
  if (typeof value === "string") {
    const s = value.trim();
    return { texts: s ? [s] : [], lang: null };
  }
  if (Array.isArray(value)) {
    // Array of strings or array of language objects.
    const flat: string[] = [];
    let lang: string | null = null;
    for (const v of value) {
      const r = collectStringsLang(v, priority);
      if (r.texts.length) {
        flat.push(...r.texts);
        if (!lang) lang = r.lang;
      }
    }
    return { texts: flat, lang };
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of priority) {
      if (key in obj) {
        const arr = obj[key];
        const flat: string[] = [];
        if (Array.isArray(arr)) {
          for (const v of arr) {
            const s = typeof v === "string" ? v.trim() : "";
            if (s) flat.push(s);
          }
        } else if (typeof arr === "string" && arr.trim()) {
          flat.push(arr.trim());
        }
        if (flat.length) return { texts: flat, lang: key };
      }
    }
    // fallback: first key
    for (const [k, v] of Object.entries(obj)) {
      const r = collectStringsLang(v, priority);
      if (r.texts.length) return { texts: r.texts, lang: r.lang ?? k };
    }
  }
  return { texts: [], lang: null };
}

/** Preserve order deduplication. */
export function dedupe<T>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of arr) {
    const k = typeof v === "string" ? v : JSON.stringify(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

// ---------- Exclusion grounds mapping ----------
// EU standard exclusion grounds per Directive 2014/24/EU
export const EXCLUSION_GROUNDS_SK: Record<string, string> = {
  "exg-crim-corrpt": "Korupcia",
  "exg-crim-fraud": "Podvod",
  "exg-crim-laund": "Legalizácia príjmov z trestnej činnosti",
  "exg-crim-terror": "Financovanie terorizmu / terorizmus",
  "exg-crim-part": "Účasť v zločineckej organizácii",
  "exg-crim-traffick": "Obchodovanie s ľuďmi",
  "exg-mis-distortion": "Skresľovanie hospodárskej súťaže",
  "exg-mis-bre-env-law": "Porušenie environmentálneho práva",
  "exg-mis-bre-lab-law": "Porušenie pracovného práva",
  "exg-mis-bre-soc-law": "Porušenie sociálneho práva",
  "exg-mis-misrepresent": "Skreslenie informácií pred obstarávateľom",
  "exg-mis-partic-confl": "Konflikt záujmov pri účasti",
  "exg-mis-prep-confl": "Konflikt záujmov pri príprave zákazky",
  "exg-mis-misconduct": "Závažné odborné pochybenie",
  "exg-mis-sanction": "Nedodržanie sankcií",
  "exg-sitn-insolvency": "Insolvencia / úpadok",
  "exg-sitn-liq-admin": "Likvidácia alebo nútená správa",
  "exg-sitn-as-susp": "Pozastavenie podnikateľskej činnosti",
  "exg-sitn-other": "Iná situácia znemožňujúca účasť",
  "exg-pmt-bre-ssc": "Nezaplatené odvody na sociálne poistenie",
  "exg-pmt-bre-tax": "Nezaplatené dane",
  "exg-natl-bre-nat-law": "Porušenie iných predpisov národného práva",
};

export function exclusionGroundLabel(code: string): string {
  return EXCLUSION_GROUNDS_SK[code] ?? code;
}

// ---------- Structured criteria shape ----------
export type StructuredCriteria = {
  selection_criteria_source: string | null;
  selection_criterion_names: string[];
  selection_criterion_descriptions: string[];
  exclusion_grounds: string[];
  exclusion_grounds_description: string | null;
  award_criterion_types: string[];
  award_criterion_names: string[];
  award_criterion_descriptions: string[];
  tenderer_legal_form_description: string | null;
  guarantee_required_description: string | null;
  contract_conditions_description: string | null;
  description_lot: string | null;
  description_proc: string | null;
  language: string | null;
};

// ---------- Award criteria breakdown ----------
export type AwardBreakdownItem = { type: string; label: string; weight: number | null };

export function awardBreakdown(sc: StructuredCriteria | null | undefined): {
  items: AwardBreakdownItem[];
  summary: string;
} | null {
  if (!sc) return null;
  const types = sc.award_criterion_types ?? [];
  if (!types.length) return null;

  const typeLabel = (t: string) =>
    t === "price" ? "cena" : t === "quality" ? "kvalita" : t === "cost" ? "náklady" : t;

  // Aggregate weights per type by parsing description strings as numbers.
  const buckets = new Map<string, { total: number; count: number; parsed: number }>();
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const b = buckets.get(t) ?? { total: 0, count: 0, parsed: 0 };
    b.count += 1;
    const desc = sc.award_criterion_descriptions?.[i];
    const n = typeof desc === "string" ? Number(desc.replace(",", ".").replace(/[^\d.]/g, "")) : NaN;
    if (Number.isFinite(n) && n > 0 && n <= 100) {
      b.total += n;
      b.parsed += 1;
    }
    buckets.set(t, b);
  }

  const uniqueTypes = [...buckets.keys()];

  // Single type — 100 % of that type.
  if (uniqueTypes.length === 1) {
    const t = uniqueTypes[0];
    return {
      items: [{ type: t, label: typeLabel(t), weight: 100 }],
      summary: `100 % ${typeLabel(t)}`,
    };
  }

  // Multiple types with parsed numeric weights (average per type, then normalize).
  const withNumbers = uniqueTypes.filter((t) => (buckets.get(t)?.parsed ?? 0) > 0);
  if (withNumbers.length === uniqueTypes.length) {
    const raw = uniqueTypes.map((t) => {
      const b = buckets.get(t)!;
      return { t, w: b.parsed ? b.total / b.parsed : 0 };
    });
    const sum = raw.reduce((s, r) => s + r.w, 0);
    if (sum > 0) {
      const norm = raw.map((r) => ({ t: r.t, w: Math.round((r.w / sum) * 100) }));
      // fix rounding to 100
      const diff = 100 - norm.reduce((s, r) => s + r.w, 0);
      if (norm.length) norm[0].w += diff;
      const items = norm.map((r) => ({ type: r.t, label: typeLabel(r.t), weight: r.w }));
      return {
        items,
        summary: items.map((i) => `${i.weight} % ${i.label}`).join(" / "),
      };
    }
  }

  // Fallback: types without reliable weights.
  const items = uniqueTypes.map((t) => ({ type: t, label: typeLabel(t), weight: null }));
  return {
    items,
    summary: items.map((i) => i.label).join(" + ") + " (presné váhy nie sú uvedené v oznámení)",
  };
}

// ---------- Selection criteria (verified from notice) ----------
export function hasNoticeSelectionCriteria(sc: StructuredCriteria | null | undefined): boolean {
  if (!sc) return false;
  return (
    sc.selection_criteria_source === "epo-notice" &&
    (sc.selection_criterion_descriptions?.length ?? 0) > 0
  );
}

export function selectionCriteriaAreInAttachments(sc: StructuredCriteria | null | undefined): boolean {
  if (!sc) return false;
  return sc.selection_criteria_source === "epo-procurement-document";
}
