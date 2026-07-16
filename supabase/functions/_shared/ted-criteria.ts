// Deno-side helpers for building TED structured_criteria from a raw notice payload.
// Kept separate from src/lib/ted-criteria.ts because Deno edge functions can't import
// from src/. Any change to language priority or shape must be mirrored in both files.

export const TED_LANG_PRIORITY = [
  "eng", "deu", "fra", "pol", "ces", "spa", "ita", "por", "nld", "hun",
  "ron", "swe", "fin", "dan", "ell", "bul", "hrv", "slv", "slk", "sk",
];

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

// Fields to request from TED API for full structured criteria.
export const TED_STRUCTURED_FIELDS = [
  "description-lot",
  "description-proc",
  "selection-criterion-description-lot",
  "selection-criterion-name-lot",
  "selection-criterion-used-lot",
  "selection-criteria-source",
  "exclusion-grounds",
  "exclusion-grounds-description",
  "award-criterion-description-lot",
  "award-criterion-name-lot",
  "award-criterion-type-lot",
  "award-criterion-number-weight-lot",
  "tenderer-legal-form-description-lot",
  "guarantee-required-description-lot",
  "contract-conditions-description-lot",
];

function pickWithLang(value: unknown, priority: string[]): { text: string; lang: string | null } | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const s = value.trim();
    return s ? { text: s, lang: null } : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return { text: String(value), lang: null };
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
  }
  return null;
}

/** Collect all strings for the first available language (using priority). */
function collectStringsLang(value: unknown, priority: string[]): { texts: string[]; lang: string | null } {
  if (value === null || value === undefined) return { texts: [], lang: null };
  if (typeof value === "string") {
    const s = value.trim();
    return { texts: s ? [s] : [], lang: null };
  }
  if (Array.isArray(value)) {
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
            if (typeof v === "string" && v.trim()) flat.push(v.trim());
          }
        } else if (typeof arr === "string" && arr.trim()) {
          flat.push(arr.trim());
        }
        if (flat.length) return { texts: flat, lang: key };
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      const r = collectStringsLang(v, priority);
      if (r.texts.length) return { texts: r.texts, lang: r.lang ?? k };
    }
  }
  return { texts: [], lang: null };
}

function dedupePreserve<T>(arr: T[]): T[] {
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

function firstString(v: unknown): string | null {
  const r = pickWithLang(v, TED_LANG_PRIORITY);
  return r ? r.text : null;
}

function flatArrayOfStrings(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
    }
    return out;
  }
  return [];
}

/**
 * Build a compact structured_criteria object from one raw TED notice.
 * Returns null when the notice contains no interesting structured fields at all.
 */
export function buildStructuredCriteria(notice: Record<string, unknown>): StructuredCriteria | null {
  const source = firstString(notice["selection-criteria-source"]);
  const excGrounds = dedupePreserve(flatArrayOfStrings(notice["exclusion-grounds"]));
  const excDesc = firstString(notice["exclusion-grounds-description"]);

  const selNames = collectStringsLang(notice["selection-criterion-name-lot"], TED_LANG_PRIORITY);
  const selDescs = collectStringsLang(notice["selection-criterion-description-lot"], TED_LANG_PRIORITY);
  const awdNames = collectStringsLang(notice["award-criterion-name-lot"], TED_LANG_PRIORITY);
  const awdDescs = collectStringsLang(notice["award-criterion-description-lot"], TED_LANG_PRIORITY);
  const awdTypes = flatArrayOfStrings(notice["award-criterion-type-lot"]);

  const legal = firstString(notice["tenderer-legal-form-description-lot"]);
  const guarantee = firstString(notice["guarantee-required-description-lot"]);
  const contract = firstString(notice["contract-conditions-description-lot"]);
  const descLot = collectStringsLang(notice["description-lot"], TED_LANG_PRIORITY);
  const descProc = firstString(notice["description-proc"]);

  const selNamesD = dedupePreserve(selNames.texts);
  const selDescsD = dedupePreserve(selDescs.texts);
  const awdNamesD = dedupePreserve(awdNames.texts);
  // Award types + descriptions must stay aligned (index-by-index) — dedupe as pairs.
  const pairSeen = new Set<string>();
  const awdTypesOut: string[] = [];
  const awdDescsOut: string[] = [];
  const alignedTypes = awdTypes;
  const alignedDescs = awdDescs.texts;
  const n = Math.max(alignedTypes.length, alignedDescs.length);
  for (let i = 0; i < n; i++) {
    const t = alignedTypes[i] ?? "";
    const d = alignedDescs[i] ?? "";
    const k = `${t}|${d}`;
    if (pairSeen.has(k)) continue;
    pairSeen.add(k);
    awdTypesOut.push(t);
    awdDescsOut.push(d);
  }

  const descLotJoined = descLot.texts.length ? dedupePreserve(descLot.texts).join("\n\n") : null;

  // Prefer language actually detected in the largest text field.
  const language =
    selDescs.lang ?? descLot.lang ?? awdDescs.lang ?? awdNames.lang ?? selNames.lang ?? null;

  const anyContent =
    !!source ||
    selNamesD.length > 0 ||
    selDescsD.length > 0 ||
    excGrounds.length > 0 ||
    !!excDesc ||
    awdTypesOut.length > 0 ||
    !!legal ||
    !!guarantee ||
    !!contract ||
    !!descLotJoined ||
    !!descProc;
  if (!anyContent) return null;

  return {
    selection_criteria_source: source,
    selection_criterion_names: selNamesD,
    selection_criterion_descriptions: selDescsD,
    exclusion_grounds: excGrounds,
    exclusion_grounds_description: excDesc,
    award_criterion_types: awdTypesOut.filter((x) => x),
    award_criterion_names: dedupePreserve(awdNamesD),
    award_criterion_descriptions: awdDescsOut.filter((x) => x),
    tenderer_legal_form_description: legal,
    guarantee_required_description: guarantee,
    contract_conditions_description: contract,
    description_lot: descLotJoined,
    description_proc: descProc,
    language,
  };
}
