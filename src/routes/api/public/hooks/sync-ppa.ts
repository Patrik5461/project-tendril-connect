// Sync vyziev Podohospodarskej platobnej agentury (apa.sk) do grant_calls.
// Volatelne rucne z admina aj nocnym cronom (pg_cron -> POST s apikey headerom).
// ITMS ani POO sync nie su dotknute.
import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://apa.sk";
const UA = "TendrikBot (+https://tendrik.sk)";
const REQ_DELAY_MS = 500;
const PER_PAGE = 100;
const MAX_PAGES = 20;

const CATEGORIES = ["projektove_podpory", "priame_podpory", "organizacia_trhu"] as const;

const CATEGORY_PROGRAM: Record<string, string> = {
  projektove_podpory: "PPA – projektové podpory",
  priame_podpory: "PPA – priame podpory",
  organizacia_trhu: "PPA – organizácia trhu",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ListItem = {
  id: string;
  title: string;
  path?: { alias?: string | null } | null;
  field_opportunity_category?: string | null;
  field_valid_from?: string | null;
  field_valid_to?: string | null;
  changed?: string | null;
  drupal_internal__vid?: number | null;
  drupal_internal__nid?: number | null;
  [k: string]: unknown;
};

async function fetchBuildId(): Promise<string> {
  const res = await fetch(`${BASE}/`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`homepage -> HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("__NEXT_DATA__ sa nenasiel v HTML");
  const data = JSON.parse(m[1]!) as { buildId?: string };
  if (!data.buildId) throw new Error("buildId chyba v __NEXT_DATA__");
  return data.buildId;
}

async function fetchListPage(category: string, page: number): Promise<ListItem[]> {
  const res = await fetch(`${BASE}/api/fetch-opportunities`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ page, perPage: PER_PAGE, category, defaultLocale: "sk", locale: "sk" }),
  });
  if (!res.ok) throw new Error(`fetch-opportunities(${category},${page}) -> HTTP ${res.status}`);
  const json = (await res.json()) as { results?: ListItem[] };
  return json.results ?? [];
}

async function fetchDetail(buildId: string, alias: string): Promise<any | null> {
  const url = `${BASE}/_next/data/${buildId}/sk${alias}.json`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`detail ${alias} -> HTTP ${res.status}`);
  const json = (await res.json()) as any;
  return json?.pageProps?.resource ?? null;
}

function stripTags(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function publicFileUrl(internalUrl: string): string {
  return `${BASE}/api/files?url=${encodeURIComponent(internalUrl)}`;
}

// field_components su vnorene cez paragraph_childs -> rekurzivny zber.
function collectBlocks(root: unknown) {
  const texts: string[] = [];
  const documents: Array<Record<string, unknown>> = [];
  const seenDocs = new Set<string>();

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, any>;
    const type = typeof o["type"] === "string" ? (o["type"] as string) : "";

    if (type === "paragraph--text") {
      const html = o["field_content"]?.processed ?? o["field_content"]?.value ?? "";
      const plain = stripTags(html);
      if (plain) texts.push(plain);
    }

    if (type === "paragraph--attachments") {
      const media = Array.isArray(o["field_attachment_media"]) ? o["field_attachment_media"] : [];
      for (const m of media) {
        const files = Array.isArray(m?.field_media_documents) ? m.field_media_documents : [];
        for (const f of files) {
          const internal = f?.uri?.url ?? null;
          const key = String(f?.id ?? internal ?? "");
          if (!key || seenDocs.has(key)) continue;
          seenDocs.add(key);
          documents.push({
            dokumentId: f?.id ?? null,
            nazov: m?.name ?? f?.filename ?? key,
            filename: f?.filename ?? null,
            format: f?.filemime ?? null,
            velkost: typeof f?.filesize === "number" ? f.filesize : null,
            url: internal ? publicFileUrl(String(internal)) : null,
          });
        }
      }
    }

    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walk(v);
    }
  };

  walk(root);
  return { texts, documents };
}

function extractKod(title: string): string | null {
  const m = title.match(/(\d{1,2})\s*\/\s*(SP|PRV)\s*\/\s*(\d{4})\s*-\s*([\d.]+)/i);
  if (!m) return null;
  const cislo = String(Number(m[1]));
  return `${cislo}/${m[2]!.toUpperCase()}/${m[3]}-${m[4]}`;
}

function cleanTitle(title: string): string {
  return title.replace(/\u00a0/g, " ").replace(/^\s*VÝZVA:\s*/i, "").trim();
}

function deriveStav(validTo: string | null, haystack: string): string {
  if (/zrušen/i.test(haystack)) return "ZRUSENA";
  if (!validTo) return "OTVORENA";
  const d = new Date(validTo);
  if (Number.isNaN(d.getTime())) return "OTVORENA";
  return d.getTime() >= Date.now() ? "OTVORENA" : "UZAVRETA";
}

function toTs(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function deriveProgram(kod: string | null, category: string | null): string {
  if (kod?.includes("/SP/")) return "Strategický plán SPP 2023-2027";
  if (kod?.includes("/PRV/")) return "PRV 2014-2022";
  return (category && CATEGORY_PROGRAM[category]) || "Pôdohospodárska platobná agentúra";
}

async function runSync(opts: { force: boolean; limit: number | null }) {
  const startedAt = Date.now();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let buildId = await fetchBuildId();

  const existing = new Map<string, any>();
  {
    const { data, error } = await supabaseAdmin
      .from("grant_calls")
      .select("source_id,itms_updated_at,stav,deadline,oblasti")
      .eq("source", "PPA")
      .limit(2000);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) existing.set(String((r as any).source_id), r);
  }

  let totalApi = 0;
  let skipped = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;
  let detailFallbacks = 0;
  const errors: string[] = [];
  const changes: Array<{ kod: string | null; title: string; fields: string[] }> = [];

  // 1) listing
  const items: ListItem[] = [];
  for (const category of CATEGORIES) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetchListPage(category, page);
      items.push(...res);
      if (res.length < PER_PAGE) break;
      await sleep(REQ_DELAY_MS);
    }
    await sleep(REQ_DELAY_MS);
  }
  totalApi = items.length;

  let processed = 0;
  for (const item of items) {
    if (opts.limit !== null && processed >= opts.limit) break;
    processed++;

    const sourceId = String(item.id ?? "");
    if (!sourceId) continue;
    const prev = existing.get(sourceId);
    const remoteTs = toTs(item.changed);
    const prevTs = prev?.itms_updated_at ? toTs(prev.itms_updated_at) : null;

    if (!opts.force && prev && remoteTs && prevTs && remoteTs === prevTs) {
      skipped++;
      continue;
    }

    try {
      const alias = item.path?.alias ?? null;
      let detail: any = null;

      if (alias) {
        await sleep(REQ_DELAY_MS);
        detail = await fetchDetail(buildId, alias);
        if (detail === null) {
          // buildId je zastarany (medzitym prebehol deploy) — nacitaj znova a skus raz.
          buildId = await fetchBuildId();
          await sleep(REQ_DELAY_MS);
          detail = await fetchDetail(buildId, alias);
          if (detail === null) {
            detailFallbacks++;
            console.warn(`[sync-ppa] detail nedostupny (404 aj po refreshi buildId): ${alias}`);
          }
        }
      }

      const { texts, documents } = detail ? collectBlocks(detail.field_components) : { texts: [], documents: [] };

      const title = cleanTitle(String(item.title ?? ""));
      const kod = extractKod(String(item.title ?? ""));
      const category = item.field_opportunity_category ?? null;
      const deadline = toTs(item.field_valid_to);
      const vid = item.drupal_internal__vid ?? null;
      const stav = deriveStav(deadline, `${title} ${texts.join(" ")}`);

      const search_text = [title, kod, category, ...texts].filter(Boolean).join(" ").slice(0, 20000);

      const changedFields: string[] = [];
      if (prev) {
        const prevDeadline = toTs(prev.deadline);
        if (prevDeadline !== deadline) {
          changedFields.push("deadline");
          console.log(
            `[sync-ppa] zmena deadline ${kod ?? sourceId}: ${prevDeadline ?? "null"} -> ${deadline ?? "null"}`,
          );
        }
        if (prev.stav !== stav) changedFields.push("stav");
        if ((prev.oblasti as any)?.vid !== vid) changedFields.push("vid");
      }

      const row: Record<string, unknown> = {
        source: "PPA",
        source_id: sourceId,
        kod,
        title,
        program: deriveProgram(kod, category),
        poskytovatel: "Pôdohospodárska platobná agentúra",
        vyhlasovatel: "Pôdohospodárska platobná agentúra",
        zameranie: category,
        stav,
        datum_vyhlasenia: toTs(item.field_valid_from),
        deadline,
        suma_eu: null,
        currency: "EUR",
        detail_url: alias ? `${BASE}${alias}` : BASE,
        itms_updated_at: remoteTs,
        oblasti: {
          kategoria: category,
          nid: item.drupal_internal__nid ?? null,
          vid,
        },
        documents,
        structured_conditions: { text_blokov: texts, vid },
        search_text,
        raw: { list: item, detail: detail ?? null },
        updated_at: new Date().toISOString(),
      };
      if (!prev || changedFields.length) row["last_change_at"] = new Date().toISOString();

      const { error } = await supabaseAdmin
        .from("grant_calls")
        .upsert(row as any, { onConflict: "source,source_id" });
      if (error) throw new Error(error.message);

      if (prev) {
        updated++;
        if (changedFields.length) changes.push({ kod, title, fields: changedFields });
      } else {
        created++;
      }
    } catch (e) {
      failed++;
      const msg = `${item.title ?? item.id}: ${(e as Error).message}`;
      errors.push(msg);
      console.error("[sync-ppa]", msg);
    }
  }

  const result = {
    build_id: buildId,
    total_api: totalApi,
    processed,
    unchanged: skipped,
    created,
    updated,
    failed,
    detail_fallbacks: detailFallbacks,
    changes,
    errors: errors.slice(0, 20),
    duration_ms: Date.now() - startedAt,
  };
  console.log("sync-ppa", JSON.stringify(result));
  return result;
}

export const Route = createFileRoute("/api/public/hooks/sync-ppa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        const expected =
          process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!expected || apikey !== expected) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        try {
          const result = await runSync({
            force: body["force"] === true,
            limit: typeof body["limit"] === "number" ? (body["limit"] as number) : null,
          });
          return Response.json(result);
        } catch (e) {
          console.error("sync-ppa failed", e);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
