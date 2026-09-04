/**
 * Import zoznamu nezistených vlastníkov od SPF do public.spf_folios.
 *
 *   bun run scripts/import-spf-folios.ts [--dry-run] [--dir <priecinok>] [--files a.csv,b.csv]
 *
 * Bez parametrov si súbory nájde sám cez WordPress media API na pozfond.sk
 * (hľadá najnovšiu sadu "Nezisteni-vlastnici") a stiahne ich do --dir
 * (default ./data/spf). Keď už tam sú, znova ich nesťahuje.
 *
 * Ukladá sa len počet nezistených vlastníkov na list vlastníctva — mená
 * fyzických osôb si do vlastnej databázy nekopírujeme, na hľadanie pozemkov
 * v správe SPF nie sú potrebné.
 *
 * Prihlasuje sa service role kľúčom, takže SUPABASE_URL a
 * SUPABASE_SERVICE_ROLE_KEY musia byť v prostredí alebo v .env.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { basename, resolve } from "node:path";

const MEDIA_API = "https://pozfond.sk/wp-json/wp/v2/media?per_page=100&search=Nezisteni-vlastnici";
const UA = "TendrikBot (+https://tendrik.sk)";
const BATCH = 1000;
const SOURCE = "nezisteni_vlastnici";

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** Dátum platnosti sa dá vytiahnuť z názvu súboru: ...-k-30.06.2026.csv */
function validAsOf(fileName: string): string | null {
  const m = /k-(\d{2})\.(\d{2})\.(\d{4})/.exec(fileName);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function discoverFiles(): Promise<string[]> {
  const res = await fetch(MEDIA_API, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`WP media API -> HTTP ${res.status}`);
  const items = (await res.json()) as Array<{ source_url?: string }>;
  const csvs = items
    .map((i) => i.source_url ?? "")
    .filter((u) => u.toLowerCase().endsWith(".csv") && /Nezisteni-vlastnici/i.test(u));
  if (!csvs.length) throw new Error("Na pozfond.sk som nenašiel žiadne CSV so zoznamom.");
  // Sada sa mení dvakrát ročne — berieme len tú s najnovším dátumom.
  const newest = csvs
    .map((u) => validAsOf(basename(u)) ?? "")
    .sort()
    .at(-1);
  return csvs.filter((u) => (validAsOf(basename(u)) ?? "") === newest).sort();
}

async function download(url: string, dir: string): Promise<string> {
  const target = resolve(dir, basename(url));
  if (existsSync(target)) {
    console.log(`  ${basename(url)} — už stiahnuté`);
    return target;
  }
  process.stdout.write(`  sťahujem ${basename(url)} … `);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(target, buf);
  console.log(`${(buf.length / 1048576).toFixed(1)} MB`);
  return target;
}

async function knownKuCodes(url: string, key: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/ku_list?select=ku_code`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + 999}`,
      },
    });
    if (!res.ok) throw new Error(`ku_list -> HTTP ${res.status}: ${await res.text()}`);
    const rows = (await res.json()) as Array<{ ku_code: string }>;
    rows.forEach((r) => out.add(r.ku_code));
    if (rows.length < 1000) break;
  }
  return out;
}

type Row = {
  ku_code: string;
  lv_number: string;
  owners_count: number;
  source: string;
  valid_as_of: string | null;
  updated_at: string;
};

async function upsert(url: string, key: string, rows: Row[]) {
  const res = await fetch(`${url}/rest/v1/spf_folios?on_conflict=ku_code,lv_number,source`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Jeden súbor = súvislý blok k.ú. podľa abecedy, takže agregovať sa dá po súboroch. */
async function processFile(
  path: string,
  known: Set<string>,
  onBatch: (rows: Row[]) => Promise<void>,
): Promise<{ lines: number; folios: number; skipped: number }> {
  const counts = new Map<string, number>();
  let lines = 0;
  let skipped = 0;
  const asOf = validAsOf(basename(path));

  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  let first = true;
  for await (const raw of rl) {
    if (first) {
      first = false;
      continue;
    }
    if (!raw.trim()) continue;
    lines++;
    const cols = raw.split(";");
    const ku = (cols[1] ?? "").trim();
    const lv = (cols[2] ?? "").trim();
    if (!/^\d{6}$/.test(ku) || !lv || !known.has(ku)) {
      skipped++;
      continue;
    }
    const k = `${ku} ${lv}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const now = new Date().toISOString();
  let batch: Row[] = [];
  for (const [k, owners_count] of counts) {
    const [ku_code, lv_number] = k.split(" ");
    batch.push({
      ku_code,
      lv_number,
      owners_count,
      source: SOURCE,
      valid_as_of: asOf,
      updated_at: now,
    });
    if (batch.length >= BATCH) {
      await onBatch(batch);
      batch = [];
    }
  }
  if (batch.length) await onBatch(batch);
  return { lines, folios: counts.size, skipped };
}

async function main() {
  loadDotEnv();
  const dryRun = process.argv.includes("--dry-run");
  const dir = resolve(arg("dir") ?? "data/spf");
  mkdirSync(dir, { recursive: true });

  const local = arg("files");
  let paths: string[];
  if (local) {
    paths = local.split(",").map((p) => resolve(p.trim()));
  } else {
    console.log("Hľadám najnovšiu sadu na pozfond.sk …");
    const urls = await discoverFiles();
    console.log(
      `Nájdených ${urls.length} súborov, platnosť k ${validAsOf(basename(urls[0])) ?? "?"}.`,
    );
    paths = [];
    for (const u of urls) paths.push(await download(u, dir));
  }

  const url = (process.env["SUPABASE_URL"] ?? "").replace(/\/$/, "");
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (!dryRun && (!url || !key)) {
    throw new Error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.");
  }

  const known = !url || !key ? new Set<string>() : await knownKuCodes(url, key);
  console.log(`Číselník k.ú. v databáze: ${known.size} položiek.`);

  let totalLines = 0;
  let totalFolios = 0;
  let totalSkipped = 0;
  let written = 0;
  for (const p of paths) {
    process.stdout.write(`${basename(p)} … `);
    const stat = await processFile(p, known, async (rows) => {
      if (dryRun) return;
      await upsert(url, key, rows);
      written += rows.length;
    });
    totalLines += stat.lines;
    totalFolios += stat.folios;
    totalSkipped += stat.skipped;
    console.log(
      `${stat.lines.toLocaleString("sk-SK")} riadkov -> ${stat.folios.toLocaleString("sk-SK")} LV` +
        (stat.skipped ? ` (preskočených ${stat.skipped})` : ""),
    );
  }

  console.log(
    `\nSpolu: ${totalLines.toLocaleString("sk-SK")} vlastníkov, ` +
      `${totalFolios.toLocaleString("sk-SK")} listov vlastníctva, preskočených ${totalSkipped}.`,
  );
  console.log(
    dryRun
      ? "--dry-run: do databázy sa nič nezapísalo."
      : `Zapísaných ${written.toLocaleString("sk-SK")} riadkov.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
