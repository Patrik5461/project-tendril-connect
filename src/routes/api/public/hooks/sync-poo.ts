// Sync vyziev Planu obnovy a odolnosti (public-api.planobnovy.sk) do grant_calls.
// Volatelne rucne z admina aj nocnym cronom (pg_cron -> POST s apikey headerom).
// ITMS sync ani jeho data nie su dotknute.
import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://public-api.planobnovy.sk";
const UA = "TendrikBot (+https://tendrik.sk)";
const REQ_DELAY_MS = 300;
const MAX_PAGES = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

type ListItem = {
  kod: string;
  vyzvaId: string;
  nazov: string;
  vykonavatel: string | null;
  vyzvaTyp: string | null;
  entitaPovod: string | null;
  sprostredkovatelia: string[] | null;
  datumVyhlasenia: string | null;
  datumCasUzavretia: string | null;
  datumZverejnenia: string | null;
  datumObnovenia: string | null;
  oblast: string | null;
  komponent: string | null;
  opatrenie: string | null;
  stav: string | null;
  zoppmPodanieOd: string | null;
  zoppmPodanieDo: string | null;
};

type Page<T> = {
  content: T[];
  totalPages?: number;
  totalElements?: number;
  number?: number;
  size?: number;
  last?: boolean;
};

// POO pouziva ine hodnoty stavu nez ITMS. stav = zivotny cyklus, typ = format vyzvy.
const STAV_MAP: Record<string, string> = {
  UZATVORENA: "UZAVRETA",
  ZRUSENA: "ZRUSENA",
  ZVEREJNENA: "ZVEREJNENA",
  VYHLASENA: "OTVORENA",
  OTVORENA: "OTVORENA",
  ZMLUVA_UZAVRETA: "ZMLUVA_UZAVRETA",
  PRIPRAVOVANA: "PRIPRAVOVANA",
};

function normalizeStav(raw: string | null | undefined, warned: Set<string>): string {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return "NEZNAMA";
  const mapped = STAV_MAP[v];
  if (mapped) return mapped;
  if (!warned.has(v)) {
    warned.add(v);
    console.warn(`[sync-poo] neznamy stav "${v}" — ukladam 1:1, doplnit mapovanie`);
  }
  return v;
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

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toTs(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildDocuments(detail: any, docsList: any[], vyzvaId: string) {
  const raw: any[] = [
    ...(Array.isArray(detail?.plneZnenie?.dokumenty) ? detail.plneZnenie.dokumenty : []),
    ...docsList,
  ];
  const seen = new Set<string>();
  const out: any[] = [];
  for (const d of raw) {
    const id = String(d?.dokumentId ?? d?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      dokumentId: id,
      nazov: d?.nazov ?? d?.originalFileName ?? id,
      format: d?.format ?? null,
      datumVzniku: d?.datumVzniku ?? null,
      povod: d?.povod ?? null,
      url: `${BASE}/public/vyzva/${vyzvaId}/plne-znenie/dokumenty/${id}/content`,
    });
  }
  return out;
}

async function runSync(opts: { force: boolean; limit: number | null }) {
  const startedAt = Date.now();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const warned = new Set<string>();

  const existing = new Map<string, any>();
  {
    const { data, error } = await supabaseAdmin
      .from("grant_calls")
      .select("source_id,itms_updated_at,stav,deadline,suma_eu,opravneny_ziadatel,structured_conditions")
      .eq("source", "POO")
      .limit(2000);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) existing.set(String((r as any).source_id), r);
  }

  let totalApi = 0;
  let skipped = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  const changes: Array<{ kod: string; fields: string[] }> = [];

  let page = 0;
  let pageSize = 100;
  let processedItems = 0;

  outer: while (page < MAX_PAGES) {
    const p = await api<Page<ListItem>>(`/public/vyzva?page=${page}&size=${pageSize}`);
    if (typeof p.size === "number" && p.size > 0) pageSize = p.size;
    if (typeof p.totalElements === "number") totalApi = p.totalElements;
    const items = p.content ?? [];
    if (!items.length) break;

    for (const item of items) {
      if (opts.limit !== null && processedItems >= opts.limit) break outer;
      processedItems++;

      const prev = existing.get(String(item.kod));
      const remoteTs = toTs(item.datumObnovenia);
      const prevTs = prev?.itms_updated_at ? toTs(prev.itms_updated_at) : null;
      if (!opts.force && prev && remoteTs && prevTs && remoteTs <= prevTs) {
        skipped++;
        continue;
      }

      try {
        await sleep(REQ_DELAY_MS);
        const detail = await api<any>(`/public/vyzva/${item.vyzvaId}`);
        await sleep(REQ_DELAY_MS);
        const docsPage = await api<Page<any>>(
          `/public/vyzva/${item.vyzvaId}/plne-znenie/dokumenty`,
        ).catch(() => ({ content: [] }) as Page<any>);

        const documents = buildDocuments(detail, docsPage.content ?? [], item.vyzvaId);

        const structured_conditions = {
          pppm: detail?.dalsiePodmienkyPoskytnutiaProstriedkov ?? null,
          kriteria: detail?.kriteriaHodnoteniaZoPPM ?? null,
          sposobHodnotenia: detail?.sposobHodnoteniaZoPPM ?? null,
          miestoPodania: detail?.miestoPodaniaZoPPM ?? null,
          ciel: detail?.ciel ?? null,
          uzavretieText: detail?.uzavretieText ?? null,
          dovodUzatvorenia: detail?.dovodUzatvorenia ?? null,
          mieraSpolufinancovania: detail?.mieraSpolufinancovania ?? null,
          mieraSpolufinancovaniaUpresnenie: detail?.mieraSpolufinancovaniaUpresnenie ?? null,
          sumOpravneneVydavkyMin: num(detail?.sumOpravneneVydavkyMin),
          sumOpravneneVydavkyMax: num(detail?.sumOpravneneVydavkyMax),
          ukazovatele: detail?.ukazovatelList ?? null,
          zoppmPodanieOd: item.zoppmPodanieOd ?? detail?.zoppmPodanieOd ?? null,
          zoppmPodanieDo: item.zoppmPodanieDo ?? detail?.zoppmPodanieDo ?? null,
          schemaStatnejPomoci: detail?.schemaStatnejPomoci ?? null,
          podmienkyStatnejPomoci: detail?.podmienkyStatnejPomoci ?? null,
        };

        const opravneny_ziadatel = {
          html: detail?.opravneniZiadatelia ?? null,
          subjekty: detail?.opravneneSubjekty ?? null,
        };

        const stav = normalizeStav(item.stav ?? detail?.stav, warned);
        const suma_eu = num(detail?.sumVyskaProstriedkov);
        const deadline = toTs(item.datumCasUzavretia ?? detail?.datumCasUzavretia);

        const search_text = [
          item.nazov,
          item.kod,
          item.oblast,
          item.komponent,
          item.opatrenie,
          stripTags(detail?.ciel),
          stripTags(detail?.opravneniZiadatelia),
          stripTags(detail?.dalsiePodmienkyPoskytnutiaProstriedkov),
          stripTags(detail?.kriteriaHodnoteniaZoPPM),
        ]
          .filter(Boolean)
          .join(" ")
          .slice(0, 20000);

        const changedFields: string[] = [];
        if (prev) {
          const prevPppm = await sha256(stripTags((prev.structured_conditions as any)?.pppm ?? ""));
          const newPppm = await sha256(stripTags(structured_conditions.pppm ?? ""));
          if (prev.stav !== stav) changedFields.push("stav");
          if (toTs(prev.deadline) !== deadline) changedFields.push("deadline");
          if (num(prev.suma_eu) !== suma_eu) changedFields.push("suma_eu");
          if (JSON.stringify(prev.opravneny_ziadatel ?? null) !== JSON.stringify(opravneny_ziadatel))
            changedFields.push("opravneny_ziadatel");
          if (prevPppm !== newPppm) changedFields.push("pppm");
        }

        const row: Record<string, unknown> = {
          source: "POO",
          source_id: item.kod,
          kod: item.kod,
          title: item.nazov,
          program: "Plán obnovy a odolnosti",
          poskytovatel: detail?.vyhlasovatel ?? null,
          vyhlasovatel: detail?.vykonavatel ?? item.vykonavatel ?? null,
          typ: item.vyzvaTyp ?? detail?.vyzvaTyp ?? null,
          stav,
          zameranie: item.oblast ?? null,
          datum_vyhlasenia: toTs(item.datumVyhlasenia),
          deadline,
          suma_eu,
          currency: "EUR",
          detail_url: `https://ispo.planobnovy.sk/app/vyzvy/${item.vyzvaId}`,
          itms_updated_at: remoteTs,
          kontakt: {
            ...(detail?.vykonavatelKontakt ?? {}),
            adresa: detail?.vykonavatelAdresa ?? null,
          },
          oblasti: {
            oblast: item.oblast ?? null,
            komponent: item.komponent ?? null,
            opatrenie: item.opatrenie ?? null,
            sprostredkovatelia: item.sprostredkovatelia ?? [],
          },
          opravneny_ziadatel,
          structured_conditions,
          documents,
          raw: detail,
          search_text,
          updated_at: new Date().toISOString(),
        };
        if (!prev || changedFields.length) row['last_change_at'] = new Date().toISOString();

        const { error } = await supabaseAdmin
          .from("grant_calls")
          .upsert(row as any, { onConflict: "source,source_id" });
        if (error) throw new Error(error.message);

        if (prev) {
          updated++;
          if (changedFields.length) {
            changes.push({ kod: item.kod, fields: changedFields });
            console.log(`[sync-poo] zmena ${item.kod}: ${changedFields.join(", ")}`);
          }
        } else {
          created++;
        }
      } catch (e) {
        failed++;
        const msg = `${item.kod}: ${(e as Error).message}`;
        errors.push(msg);
        console.error("[sync-poo]", msg);
      }
    }

    if (p.last === true) break;
    if (typeof p.totalPages === "number" && page + 1 >= p.totalPages) break;
    page++;
  }

  const result = {
    total_api: totalApi,
    unchanged: skipped,
    created,
    updated,
    failed,
    changes,
    errors: errors.slice(0, 20),
    duration_ms: Date.now() - startedAt,
  };
  console.log("sync-poo", JSON.stringify(result));
  return result;
}

export const Route = createFileRoute("/api/public/hooks/sync-poo")({
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
          console.error("sync-poo failed", e);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
