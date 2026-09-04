/**
 * Import číselníka katastrálnych území (ÚGKK) do tabuľky public.ku_list.
 *
 *   bun run scripts/import-ku-list.ts <subor.csv> [--dry-run] [--delimiter ';']
 *                                     [--map ku_code=KOD,ku_name=NAZOV,okres=OKRES,kraj=KRAJ]
 *
 * Prihlasuje sa service role kľúčom (obchádza RLS), takže SUPABASE_URL a
 * SUPABASE_SERVICE_ROLE_KEY musia byť v prostredí alebo v .env v koreni repa.
 *
 * Presný tvar CSV z ÚGKK nie je dopredu známy, preto sa oddeľovač aj názvy
 * stĺpcov detegujú; keď sa netrafia, prebijú sa parametrom --map.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BATCH = 500;

type Row = { ku_code: string; ku_name: string; okres: string | null; kraj: string | null };

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function detectDelimiter(headerLine: string): string {
  const counts = [";", ",", "\t", "|"].map((d) => [d, headerLine.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ";";
}

/** CSV parser, ktorý zvláda úvodzovky a oddeľovač vo vnútri hodnoty. */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const CANDIDATES: Record<keyof Row, string[]> = {
  ku_code: ["kucode", "kod", "kodku", "kodkatastralnehouzemia", "cislo", "kukod", "ku"],
  ku_name: ["kuname", "nazov", "nazovku", "nazovkatastralnehouzemia", "katastralneuzemie", "meno"],
  okres: ["okres", "nazovokresu", "okresnazov"],
  kraj: ["kraj", "nazovkraja", "krajnazov"],
};

function resolveColumns(header: string[]): Record<keyof Row, number> {
  const normalized = header.map(normalizeHeader);
  const overrides = new Map<string, string>();
  for (const pair of (arg("map") ?? "").split(",")) {
    const [field, column] = pair.split("=");
    if (field && column) overrides.set(field.trim(), normalizeHeader(column));
  }

  const out = {} as Record<keyof Row, number>;
  for (const field of Object.keys(CANDIDATES) as Array<keyof Row>) {
    const forced = overrides.get(field);
    const index = forced
      ? normalized.indexOf(forced)
      : normalized.findIndex((h) => CANDIDATES[field].includes(h));
    out[field] = index;
  }
  return out;
}

async function upsert(url: string, key: string, rows: Row[]) {
  const res = await fetch(`${url}/rest/v1/ku_list?on_conflict=ku_code`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
}

async function main() {
  loadDotEnv();

  const csvPath = process.argv[2];
  if (!csvPath || csvPath.startsWith("--")) {
    console.error("Použitie: bun run scripts/import-ku-list.ts <subor.csv> [--dry-run]");
    process.exit(1);
  }

  const text = readFileSync(resolve(csvPath), "utf8").replace(/^\uFEFF/, "");
  const delimiter = arg("delimiter") ?? detectDelimiter(text.split("\n")[0] ?? "");
  const table = parseCsv(text, delimiter);
  if (table.length < 2) throw new Error("CSV nemá hlavičku a aspoň jeden riadok.");

  const [header, ...body] = table;
  const cols = resolveColumns(header);
  if (cols.ku_code < 0 || cols.ku_name < 0) {
    throw new Error(
      `Nenašiel som stĺpce s kódom a názvom k.ú. Hlavička: ${header.join(" | ")}\n` +
        `Doplň ich cez --map ku_code=<stlpec>,ku_name=<stlpec>`,
    );
  }

  const seen = new Set<string>();
  const rows: Row[] = [];
  let skipped = 0;
  for (const line of body) {
    const code = (line[cols.ku_code] ?? "").trim();
    const name = (line[cols.ku_name] ?? "").trim();
    if (!code || !name || seen.has(code)) {
      skipped++;
      continue;
    }
    seen.add(code);
    rows.push({
      ku_code: code,
      ku_name: name,
      okres: cols.okres >= 0 ? (line[cols.okres] ?? "").trim() || null : null,
      kraj: cols.kraj >= 0 ? (line[cols.kraj] ?? "").trim() || null : null,
    });
  }

  console.log(
    `Oddeľovač "${delimiter}", stĺpce ${JSON.stringify(cols)} → ${rows.length} k.ú. ` +
      `(preskočených ${skipped}).`,
  );
  console.log("Ukážka:", rows.slice(0, 3));

  if (process.argv.includes("--dry-run")) {
    console.log("--dry-run: do databázy sa nič nezapísalo.");
    return;
  }

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.");

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await upsert(url.replace(/\/$/, ""), key, chunk);
    console.log(`Zapísaných ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log("Hotovo.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
