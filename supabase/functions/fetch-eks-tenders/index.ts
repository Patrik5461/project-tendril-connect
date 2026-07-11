// Supabase Edge Function: fetch-eks-tenders
// Scrapes ongoing tenders (stav "vyhlásená") from Elektronický kontraktačný
// systém (portal.eks.sk) and upserts them into public.tenders.
//
// Data source: /SpravaZakaziek/Zakazky/VerejnyPrehladZakaziekData (GET, JSON)
// with the same query string the browser DataTable uses. Filter fields are
// comma-separated integer lists.
//
// Design notes (mirrors fetch-uvo-tenders):
// - Deduplicate by publication_number BEFORE downloading details.
// - Polite scraping: browser-like UA, ~500 ms pause between detail fetches,
//   hard cap of MAX_DETAILS detail pages per run.
// - Skip records with missing / past deadline.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";
const BASE = "https://portal.eks.sk";
const LIST_URL = `${BASE}/SpravaZakaziek/Zakazky/VerejnyPrehladZakaziekData`;
const DETAIL_URL_PREFIX = `${BASE}/SpravaZakaziek/Zakazky/Detail/`;
const MAX_LIST_ROWS = 300;
const MAX_DETAILS = 60;
const DETAIL_DELAY_MS = 500;

const REGION_KEYWORDS: Array<[RegExp, string]> = [
  [/Bratislavsk[ýy]/i, "Bratislavský kraj"],
  [/Trnavsk[ýy]/i, "Trnavský kraj"],
  [/Trenčiansk[yi]|Trenciansk/i, "Trenčiansky kraj"],
  [/Nitriansk[yi]/i, "Nitriansky kraj"],
  [/Žilinsk[ýy]|Zilinsk/i, "Žilinský kraj"],
  [/Banskobystrick[ýy]/i, "Banskobystrický kraj"],
  [/Prešovsk[ýy]|Presovsk/i, "Prešovský kraj"],
  [/Košick[ýy]|Kosick/i, "Košický kraj"],
];

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "sk,en;q=0.8",
      Referer: `${BASE}/SpravaZakaziek/Zakazky/Prehlad`,
    },
  });
  return { status: res.status, body: await res.text() };
}

async function fetchListJson(): Promise<any> {
  const qs = new URLSearchParams({
    sEcho: "1",
    iColumns: "8",
    sColumns: ",,,,,,,",
    iDisplayStart: "0",
    iDisplayLength: String(MAX_LIST_ROWS),
    mDataProp_0: "IdZakazka",
    mDataProp_1: "Nazov",
    mDataProp_2: "IdZakazka",
    mDataProp_3: "KlasifikaciaNazov",
    mDataProp_4: "EtZakazkaStavNazov",
    mDataProp_5: "LehotaNaPredkladaniePonuk",
    mDataProp_6: "LehotaPlnenia",
    mDataProp_7: "DatumVyhlasenia",
    iSortCol_0: "7",
    sSortDir_0: "desc",
    iSortingCols: "1",
    // Multi-value filters MUST be comma-separated, not repeated.
    CiselnikStavZakazky: "20", // vyhlásená (active)
    CiselnikDruhZakazky: "10,20,30",
    CiselnikZmluvnePodmienky: "5,6,7,8",
    CiselnikTypyZakaziekPHZ: "5,10,20,40",
    Klasifikacie: "",
    CpvPresne: "false",
    LenHlavneCpv: "false",
    MiestaPlnenia: "",
    _: String(Date.now()),
  });
  const res = await fetch(`${LIST_URL}?${qs.toString()}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE}/SpravaZakaziek/Zakazky/Prehlad`,
    },
  });
  if (!res.ok) throw new Error(`List HTTP ${res.status}`);
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(`List not JSON (status ${res.status}, size ${txt.length})`);
  }
}

type ListRow = {
  IdZakazka: number;
  Identifikator: string;
  Nazov: string;
  KlasifikaciaKod: string | null;
  LehotaNaPredkladaniePonuk: string | null;
  DatumVyhlasenia: string | null;
  IdEtZakazkaStav: number;
};

type DetailFields = {
  buyer: string | null;
  region: string | null;
  description: string | null;
  estimated_value: number | null;
  currency: string | null;
};

function parseDetail(html: string): DetailFields {
  const norm = html;

  // Buyer name — inside the "Objednávateľ" section, labelled "Názov".
  let buyer: string | null = null;
  const oIdx = norm.indexOf('id="objednavatel"');
  if (oIdx > -1) {
    const slice = norm.slice(oIdx, oIdx + 3000);
    const text = stripTags(slice);
    // "Objednávateľ IČO <ico> Názov <buyer> Sídlo ..."
    const m = text.match(/N[áa]zov\s+(.+?)\s+S[íi]dlo/);
    if (m) buyer = m[1].trim();
  }

  // Miesto plnenia — free-text; map keyword to slovak kraj.
  let region: string | null = null;
  const miestoIdx = norm.search(/Miesto\s+plnenia/i);
  if (miestoIdx > -1) {
    const slice = stripTags(norm.slice(miestoIdx, miestoIdx + 800));
    for (const [re, name] of REGION_KEYWORDS) {
      if (re.test(slice)) {
        region = name;
        break;
      }
    }
    if (!region && /Slovensk[áa]/i.test(slice)) region = "celé Slovensko";
  }
  if (!region) region = "celé Slovensko";

  // Predpokladaná hodnota zákazky (PHZ)
  let estimated_value: number | null = null;
  const phzMatch = norm.match(
    /Predpokladan[áa]\s+hodnota[^<]*?<[\s\S]{0,400}?([\d\s.,]+)\s*(?:EUR|€)/i,
  );
  if (phzMatch) {
    const raw = phzMatch[1].replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(raw);
    if (!isNaN(n) && n > 0) estimated_value = n;
  }
  const currency = estimated_value != null ? "EUR" : null;

  // Description — "Všeobecná špecifikácia predmetu zákazky" block. Best effort.
  let description: string | null = null;
  const specIdx = norm.search(/Kľúčové\s+slová|Kľ&#250;čov&#233;\s+slov&#225;/);
  if (specIdx > -1) {
    const slice = stripTags(norm.slice(Math.max(0, specIdx - 800), specIdx + 400));
    // grab last ~500 chars
    description = slice.slice(-600).trim() || null;
  }

  return { buyer, region, description, estimated_value, currency };
}

function toIsoLocalSk(dtString: string | null): string | null {
  if (!dtString) return null;
  // EKS returns "2026-07-14T16:30:00" (local SK time, no tz).
  const m = dtString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  // Attach +02:00 (Slovakia). Storing as timestamptz — DB normalizes to UTC.
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+02:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const list = await fetchListJson();
    const rows: ListRow[] = (list.aaData ?? []).filter(
      (r: ListRow) => r.IdEtZakazkaStav === 20,
    );
    const total = list.iTotalRecords ?? rows.length;
    console.log(`EKS list: totalRecords=${total} rows_active=${rows.length}`);

    const now = Date.now();
    // Only keep tenders whose deadline is still in the future.
    const futureRows = rows.filter((r) => {
      const d = toIsoLocalSk(r.LehotaNaPredkladaniePonuk);
      return d && new Date(d).getTime() > now;
    });

    const publications = futureRows.map((r) => `EKS-${r.Identifikator}`);
    let existingSet = new Set<string>();
    if (publications.length > 0) {
      const { data: existing, error: exErr } = await supabase
        .from("tenders")
        .select("publication_number")
        .in("publication_number", publications);
      if (exErr) throw exErr;
      existingSet = new Set(
        (existing ?? []).map((r: any) => r.publication_number),
      );
    }

    const todo = futureRows
      .filter((r) => !existingSet.has(`EKS-${r.Identifikator}`))
      .slice(0, MAX_DETAILS);

    let saved = 0;
    let skippedMissingDeadline = 0;
    let errors = 0;

    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      try {
        if (i > 0) await sleep(DETAIL_DELAY_MS);
        const detailUrl = `${DETAIL_URL_PREFIX}${r.IdZakazka}`;
        const { status, body } = await fetchText(detailUrl);
        if (status !== 200) {
          console.warn(`Detail HTTP ${status} for ${r.Identifikator}`);
          errors += 1;
          continue;
        }
        const d = parseDetail(body);

        const deadline = toIsoLocalSk(r.LehotaNaPredkladaniePonuk);
        const publishedAt = toIsoLocalSk(r.DatumVyhlasenia) ?? new Date().toISOString();
        if (!deadline || new Date(deadline).getTime() < new Date(publishedAt).getTime()) {
          skippedMissingDeadline += 1;
          continue;
        }

        const { error: upErr } = await supabase.from("tenders").upsert(
          {
            publication_number: `EKS-${r.Identifikator}`,
            title: r.Nazov,
            description: d.description,
            contracting_authority: d.buyer || "—",
            cpv_code: r.KlasifikaciaKod,
            region: d.region,
            country: "SK",
            country_name: "Slovensko",
            deadline,
            estimated_value: d.estimated_value,
            currency: d.currency,
            source: "EKS",
            source_url: detailUrl,
            published_at: publishedAt,
          },
          { onConflict: "publication_number" },
        );
        if (upErr) {
          console.error(`Upsert error ${r.Identifikator}`, upErr);
          errors += 1;
          continue;
        }
        saved += 1;
      } catch (e) {
        errors += 1;
        console.error(`Detail failed ${r.Identifikator}`, (e as Error).message);
      }
    }

    const result = {
      listed: rows.length,
      future: futureRows.length,
      saved,
      skipped_existing: existingSet.size,
      skipped_missing_deadline: skippedMissingDeadline,
      errors,
    };
    console.log("fetch-eks-tenders result", result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-eks-tenders failed", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
