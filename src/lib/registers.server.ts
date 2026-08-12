// Slovak business registers – identification data only (financial figures & references stay manual).

export type RegistryCompany = {
  ico: string;
  dic?: string | null;
  nazov?: string | null;
  adresa?: string | null;
  psc?: string | null;
  mesto?: string | null;
  pravna_forma?: string | null;
  datum_vzniku?: string | null; // ISO date
  registrovy_sud?: string | null;
  sk_nace_code?: string | null;
  sk_nace_name?: string | null;
  velkost_kategoria?: string | null;
  roky_zavierok?: number[];
  /** Obrat po rokoch z účtovných závierok. Počet zamestnancov registre nedávajú. */
  financne_roky?: { rok: number; obrat: number }[];
  sources: {
    rpo?: any;
    registeruz?: any;
  };
  errors: string[];
};

function normalizeIco(ico: string): string {
  return ico.replace(/\D+/g, "").padStart(8, "0").slice(-8);
}

/**
 * Registre sú cudzie služby a občas visia. Bez limitu by na nich čakal
 * používateľ aj serverový request, tak radšej vrátime null a doplní sa ručne.
 */
const REGISTER_TIMEOUT_MS = 8000;

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * RPO vracia časť polí ako rovný reťazec a časť ako `{value, code}` — mesto
 * dokonca ako objekt, hoci ulica je reťazec. Bez tohto skončí v poli objekt
 * a používateľ vidí prázdno.
 */
function textOf(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object") return textOf(v.value);
  return null;
}

/** PSČ chodí raz ako „902 01", raz ako „91926" — zjednotíme na formát s medzerou. */
function normalizePsc(v: unknown): string | null {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (digits.length !== 5) return textOf(v);
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

// Číselník právnych foriem je malý a nemenný — načítame ho raz za beh procesu.
let pravneFormyPromise: Promise<Map<string, string>> | null = null;

async function pravnaFormaNazov(kod: unknown): Promise<string | null> {
  const key = String(kod ?? "").trim();
  if (!key) return null;
  // Ak by tam už bol text (napr. z RPO), nechávame ho tak.
  if (!/^\d+$/.test(key)) return key;

  pravneFormyPromise ??= (async () => {
    const json = await fetchJson("https://www.registeruz.sk/cruz-public/api/pravne-formy");
    const map = new Map<string, string>();
    for (const item of json?.klasifikacie ?? []) {
      const nazov = item?.nazov?.sk;
      if (item?.kod && nazov) map.set(String(item.kod), String(nazov));
    }
    return map;
  })();

  const map = await pravneFormyPromise;
  // Prázdna mapa = číselník sa nepodarilo stiahnuť; nekešujeme neúspech.
  if (map.size === 0) pravneFormyPromise = null;
  return map.get(key) ?? null;
}

async function fetchRpo(ico: string): Promise<any | null> {
  const json = await fetchJson(
    `https://api.statistics.sk/rpo/v1/search?identifier=${encodeURIComponent(ico)}`,
  );
  return json?.results?.[0] ?? null;
}

async function fetchRegisteruz(ico: string): Promise<any | null> {
  // registeruz.sk – Register účtovných závierok, verejné JSON API
  const idxJson = await fetchJson(
    `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${encodeURIComponent(ico)}&zmenene-od=2000-01-01`,
  );
  if (!idxJson) return null;
  const idList: number[] = idxJson?.id ?? idxJson?.ids ?? [];
  if (!idList.length) return null;

  const detail = await fetchJson(
    `https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${idList[0]}`,
  );
  if (!detail) return null;
  return { detail };
}

// ── Obrat z účtovných závierok ────────────────────────────────────────────────

/** Registeruz neznesie desiatky súbežných requestov, tak ich držíme na uzde. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// Šablóny výkazov sa nemenia, tak ich držíme v pamäti procesu.
const sablonaCache = new Map<string, any>();

async function fetchSablona(id: string | number): Promise<any | null> {
  const key = String(id);
  if (!sablonaCache.has(key)) {
    sablonaCache.set(
      key,
      await fetchJson(`https://www.registeruz.sk/cruz-public/api/sablona?id=${key}`),
    );
  }
  return sablonaCache.get(key) ?? null;
}

function parseAmount(raw: unknown): number | null {
  // Zvyčajne prídu celé čísla, ale desatinná čiarka by Number() rozbila.
  const text = String(raw ?? "").replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * Obrat z jedného výkazu ziskov a strát.
 *
 * Hodnoty prídu ako plochý zoznam (riadok × počet dátových stĺpcov), význam
 * riadkov popisuje až šablóna — bez nej sa čísla priradiť nedajú. Šablón je
 * viac (bežná účtovná jednotka, mikro, staršie ročníky), preto sa riadky
 * hľadajú podľa textu, nie podľa pevného indexu.
 */
async function obratFromVykaz(vykazId: number): Promise<number | null> {
  const vykaz = await fetchJson(
    `https://www.registeruz.sk/cruz-public/api/uctovny-vykaz?id=${vykazId}`,
  );
  const tabulky = vykaz?.obsah?.tabulky;
  // Firmy účtujúce podľa IFRS prikladajú len PDF — štruktúrované dáta nemajú.
  if (!Array.isArray(tabulky) || tabulky.length === 0) return null;

  const sablona = await fetchSablona(vykaz.idSablony);
  if (!Array.isArray(sablona?.tabulky)) return null;

  for (let ti = 0; ti < tabulky.length; ti++) {
    const predpis = sablona.tabulky[ti];
    const nazov: string = (predpis?.nazov?.sk ?? "").toLowerCase();
    if (!nazov.includes("ziskov a strát")) continue;

    const riadky: any[] = predpis.riadky ?? [];
    const stlpcov: number = predpis.pocetDatovychStlpcov ?? 1;
    const data: unknown[] = tabulky[ti]?.data ?? [];
    const hodnota = (i: number) => parseAmount(data[i * stlpcov]);

    // Bežná šablóna má obrat priamo ako prvý riadok.
    for (let i = 0; i < riadky.length; i++) {
      const text: string = (riadky[i]?.text?.sk ?? "").toLowerCase();
      if (text.startsWith("čistý obrat")) {
        const v = hodnota(i);
        if (v !== null) return v;
      }
    }

    // Mikro a staršie šablóny riadok „Čistý obrat" nemajú — sčítame tržby.
    let sucet: number | null = null;
    for (let i = 0; i < riadky.length; i++) {
      const text: string = (riadky[i]?.text?.sk ?? "").toLowerCase();
      if (
        text.startsWith("tržby z predaja tovaru") ||
        text.startsWith("tržby z predaja vlastných") ||
        text.startsWith("tržby z predaja služieb")
      ) {
        const v = hodnota(i);
        if (v !== null) sucet = (sucet ?? 0) + v;
      }
    }
    if (sucet !== null) return sucet;
  }
  return null;
}

/**
 * Obrat za posledné roky. Vracia len roky, ku ktorým sa naozaj podarilo číslo
 * nájsť — prázdna podaná závierka alebo IFRS výkaz sa vynechá, nech sa
 * používateľovi nepredvyplní nula, ktorá by v analýze zavádzala.
 */
async function fetchFinancialYears(
  ujDetail: any,
  maxYears: number,
): Promise<{ rok: number; obrat: number }[]> {
  const ids: number[] = ujDetail?.idUctovnychZavierok ?? [];
  if (!ids.length) return [];

  // Poradie v poli nie je chronologické, ale vyššie id znamená neskôr pridanú
  // závierku — pri firmách s dlhou históriou tak netreba ťahať všetky.
  const kandidati = [...ids].sort((a, b) => b - a).slice(0, 40);

  const zavierky = (await mapLimit(kandidati, 8, (id) =>
    fetchJson(`https://www.registeruz.sk/cruz-public/api/uctovna-zavierka?id=${id}`),
  )).filter((z: any) => z && z.typ === "Riadna" && z.obdobieDo);

  // Za jeden rok môže byť podaných viac závierok (opravy) — berieme najnovšiu.
  const podlaRoku = new Map<number, any>();
  for (const z of zavierky) {
    const rok = Number(String(z.obdobieDo).slice(0, 4));
    if (!Number.isFinite(rok)) continue;
    const doteraz = podlaRoku.get(rok);
    if (!doteraz || String(z.datumPoslednejUpravy ?? "") > String(doteraz.datumPoslednejUpravy ?? "")) {
      podlaRoku.set(rok, z);
    }
  }

  const roky = [...podlaRoku.keys()].sort((a, b) => b - a).slice(0, maxYears);
  const vysledky = await mapLimit(roky, 3, async (rok) => {
    for (const vykazId of podlaRoku.get(rok)?.idUctovnychVykazov ?? []) {
      const obrat = await obratFromVykaz(vykazId);
      if (obrat !== null) return { rok, obrat };
    }
    return { rok, obrat: null };
  });

  return vysledky.filter((r): r is { rok: number; obrat: number } => r.obrat !== null);
}

/** Lookup SK-NACE name for a code (e.g. "62.01" → "Počítačové programovanie…"). Prefix match on 2-digit division. */
export async function lookupSkNaceName(
  code: string | null | undefined,
  sb: any,
): Promise<string | null> {
  if (!code) return null;
  const twoDigit = String(code).replace(/\D/g, "").slice(0, 2);
  if (!twoDigit) return null;
  const { data } = await sb.from("sk_nace").select("code,name").eq("code", twoDigit).maybeSingle();
  return data?.name ?? null;
}

/**
 * Fetch identification data for an IČO from Slovak business registers.
 * S `financneRoky` doťahuje aj obrat z účtovných závierok; počet zamestnancov
 * registre nezverejňujú, ten ostáva na ručné vyplnenie.
 */
export async function fetchCompanyFromRegisters(
  icoInput: string,
  sb: any,
  opts: { financneRoky?: number } = {},
): Promise<RegistryCompany> {
  const ico = normalizeIco(icoInput);
  const errors: string[] = [];

  const [rpo, ruz] = await Promise.all([fetchRpo(ico), fetchRegisteruz(ico)]);

  if (!rpo) errors.push("RPO: firma nenájdená alebo API nedostupné");
  if (!ruz) errors.push("registeruz: firma nenájdená alebo bez záznamov");

  const rpoAddr = rpo?.addresses?.[0] ?? {};
  const ruzDetail = ruz?.detail ?? {};

  const financne_roky =
    opts.financneRoky && ruz
      ? await fetchFinancialYears(ruzDetail, opts.financneRoky)
      : [];
  const roky_zavierok: number[] = financne_roky.map((r) => r.rok);

  const skNaceCode =
    ruzDetail?.skNace ?? ruzDetail?.sknace ?? rpo?.mainActivityCode ?? null;
  const skNaceName = await lookupSkNaceName(skNaceCode, sb);

  return {
    ico,
    dic: textOf(ruzDetail?.dic),
    nazov: textOf(rpo?.fullNames?.[0]) ?? textOf(ruzDetail?.nazovUJ),
    adresa:
      [textOf(rpoAddr?.street), textOf(rpoAddr?.buildingNumber)].filter(Boolean).join(" ") ||
      textOf(ruzDetail?.ulica),
    psc: normalizePsc(rpoAddr?.postalCodes?.[0] ?? ruzDetail?.psc),
    mesto: textOf(rpoAddr?.municipality) ?? textOf(ruzDetail?.mesto),
    // registeruz dáva len číselný kód (napr. „112"), ktorý zvyšok appky
    // porovnáva ako text — bez prekladu nesadne kategória žiadateľa grantu.
    pravna_forma:
      textOf(rpo?.legalForms?.[0]) ?? (await pravnaFormaNazov(ruzDetail?.pravnaForma)),
    datum_vzniku: textOf(rpo?.establishment),
    registrovy_sud: textOf(rpo?.sourceRegister),
    sk_nace_code: skNaceCode ? String(skNaceCode) : null,
    sk_nace_name: skNaceName,
    velkost_kategoria: ruzDetail?.velkostOrganizacie ?? null,
    roky_zavierok,
    financne_roky,
    sources: { rpo, registeruz: ruz },
    errors,
  };
}
