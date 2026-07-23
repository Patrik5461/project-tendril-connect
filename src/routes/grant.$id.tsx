import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Calendar, ExternalLink, MapPin, FileText, Infinity as InfinityIcon, Users, Coins, Target, Mail, Phone, User, ChevronDown } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { GrantAnalysisSection } from "@/components/GrantAnalysisSection";

type Grant = {
  id: string;
  kod: string | null;
  title: string;
  program: string | null;
  poskytovatel: string | null;
  vyhlasovatel: string | null;
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
  kontakt: any;
  documents: any;
  structured_conditions: any;
  detail_url: string | null;
};

export const Route = createFileRoute("/grant/$id")({
  head: () => ({
    meta: [
      { title: "Detail grantovej výzvy – Tendrik" },
      { name: "description", content: "Detail grantovej výzvy z ITMS21+ vrátane podmienok, oprávnených výdavkov a AI posúdenia oprávnenosti." },
    ],
  }),
  component: GrantDetail,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Nepodarilo sa načítať výzvu</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button className="mt-6" onClick={() => { router.invalidate(); reset(); }}>Skúsiť znova</Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Výzva neexistuje</h1>
      <Link to="/granty" className="mt-6 inline-block"><Button><ArrowLeft className="h-4 w-4 mr-2" /> Späť na granty</Button></Link>
    </div>
  ),
});

// ---------- HTML / text helpers ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&bdquo;/g, "„").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘").replace(/&rsquo;/g, "’")
    .replace(/&scaron;/g, "š").replace(/&Scaron;/g, "Š")
    .replace(/&aacute;/g, "á").replace(/&Aacute;/g, "Á")
    .replace(/&eacute;/g, "é").replace(/&Eacute;/g, "É")
    .replace(/&iacute;/g, "í").replace(/&Iacute;/g, "Í")
    .replace(/&oacute;/g, "ó").replace(/&Oacute;/g, "Ó")
    .replace(/&uacute;/g, "ú").replace(/&Uacute;/g, "Ú")
    .replace(/&yacute;/g, "ý").replace(/&Yacute;/g, "Ý")
    .replace(/&auml;/g, "ä").replace(/&ocirc;/g, "ô")
    .replace(/&lacute;/g, "ĺ").replace(/&ccaron;/g, "č").replace(/&Ccaron;/g, "Č")
    .replace(/&dcaron;/g, "ď").replace(/&Dcaron;/g, "Ď")
    .replace(/&lcaron;/g, "ľ").replace(/&Lcaron;/g, "Ľ")
    .replace(/&ncaron;/g, "ň").replace(/&Ncaron;/g, "Ň")
    .replace(/&rcaron;/g, "ř").replace(/&tcaron;/g, "ť").replace(/&Tcaron;/g, "Ť")
    .replace(/&zcaron;/g, "ž").replace(/&Zcaron;/g, "Ž")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** HTML → paragraphs (array of trimmed non-empty lines). Drops footnotes like [1]. */
function htmlToParagraphs(s: string | null | undefined): string[] {
  if (!s) return [];
  // strip footnote sections (usually after <hr>)
  let cleaned = String(s).replace(/<hr[^>]*>[\s\S]*$/i, "");
  cleaned = cleaned
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  cleaned = decodeEntities(cleaned);
  cleaned = cleaned.replace(/\[\d+\]/g, ""); // footnote refs
  return cleaned
    .split(/\n+/)
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean);
}

function htmlToPlain(s: string | null | undefined): string {
  return htmlToParagraphs(s).join(" ").trim();
}

// ---------- Co-financing parser ----------

type CoFinRow = { label: string; percent: number };

/** Extract simple co-financing percentages from either plain text or HTML. Returns [] if we can't. */
function parseCoFinancing(raw: string | null | undefined): CoFinRow[] {
  if (!raw) return [];
  const paragraphs = htmlToParagraphs(raw);
  const text = paragraphs.join(" | ");
  // Look for common labels near a percentage.
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /(zdroj\s*(?:E[ÚU]|EU)|E[ÚU]\s*\(?[A-Z+]*\)?)[^%|]{0,60}?(\d{1,3})\s*%/i, label: "EÚ" },
    { re: /(&scaron;t[aá]tny\s*rozpo[čc]et|[šS]t[aá]tny\s*rozpo[čc]et|[ŠŠ]R)[^%|]{0,60}?(\d{1,3})\s*%/i, label: "Štátny rozpočet" },
    { re: /(vlastn[ée]\s*zdroje|spolufinancovanie\s*prij[íi]mate[ľl]a|prij[íi]mate[ľl]|obce\/mest[aá])[^%|]{0,80}?(\d{1,3})\s*%/i, label: "Vlastné zdroje" },
  ];
  const out: CoFinRow[] = [];
  for (const { re, label } of patterns) {
    const m = text.match(re);
    if (m) {
      const pct = parseInt(m[2], 10);
      if (!Number.isNaN(pct) && pct >= 0 && pct <= 100) {
        out.push({ label, percent: pct });
      }
    }
  }
  // Only return if the numbers plausibly sum to ~100
  const sum = out.reduce((a, b) => a + b.percent, 0);
  if (out.length >= 2 && sum >= 95 && sum <= 105) return out;
  return [];
}

// ---------- formaPodpory parser ----------

type FormaPodporyRow = {
  forma: string | null;
  kategorieRegionov: string[];
  specCiel: string | null;
  priorita: string | null;
};

function parseFormaPodpory(raw: unknown): FormaPodporyRow[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FormaPodporyRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as any;
    const forma: string | null = o.formaPodpory?.nazovSk ?? o.formaPodpory?.nazov ?? null;
    const specCiel: string | null = o.specifickyCielProgramu?.nazovSk ?? null;
    const priorita: string | null = o.specifickyCielProgramu?.priorita?.nazovSk ?? null;
    const kategorieRegionov = new Set<string>();
    if (o.kategoriaRegionov?.nazovSk) kategorieRegionov.add(o.kategoriaRegionov.nazovSk);
    if (Array.isArray(o.specifickyCielProgramu?.kategoriaRegionov)) {
      for (const k of o.specifickyCielProgramu.kategoriaRegionov) {
        if (k?.nazovSk) kategorieRegionov.add(k.nazovSk);
      }
    }
    const key = `${forma}|${specCiel}|${priorita}|${Array.from(kategorieRegionov).sort().join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!forma && !specCiel && !priorita && kategorieRegionov.size === 0) continue;
    out.push({ forma, kategorieRegionov: Array.from(kategorieRegionov), specCiel, priorita });
  }
  return out;
}

function pickName(item: any): string | null {
  if (!item) return null;
  if (typeof item === "string") return item;
  return item.nazovSk ?? item.nazov ?? item.popisSk ?? null;
}

function collectNames(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of arr) {
    const n = pickName(it);
    if (n && !seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}

// ---------- Kontakt ----------

type Kontakt = {
  nazov: string | null;
  email: string | null;
  telefon: string | null;
  osoba: Array<{ meno: string | null; email: string | null; telefon: string | null }>;
};

function parseKontakt(raw: unknown): Kontakt | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as any;
  const osobaArr = Array.isArray(o.osoba) ? o.osoba : [];
  const osoba = osobaArr
    .map((p: any) => ({
      meno: p?.meno ?? ([p?.titulPred, p?.krstneMeno, p?.priezvisko, p?.titulZa].filter(Boolean).join(" ") || null),
      email: p?.email ?? null,
      telefon: p?.telefon ?? null,
    }))
    .filter((p: any) => p.meno || p.email || p.telefon);
  const k: Kontakt = {
    nazov: o.nazov ?? null,
    email: o.email ?? null,
    telefon: o.telefon ?? null,
    osoba,
  };
  if (!k.nazov && !k.email && !k.telefon && k.osoba.length === 0) return null;
  return k;
}

// ---------- Component ----------

function GrantDetail() {
  const { id } = Route.useParams();
  const [grant, setGrant] = useState<Grant | null>(null);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data }, { data: u }] = await Promise.all([
        supabase.from("grant_calls").select("*").eq("id", id).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      setGrant((data as Grant) ?? null);
      setAuthed(!!u.user);
      setLoading(false);
    })();
  }, [id]);

  const derived = useMemo(() => {
    if (!grant) return null;
    const sc = grant.structured_conditions ?? {};
    const regions = collectNames(grant.miesto_realizacie);
    const ziadatele = collectNames(grant.opravneny_ziadatel);
    const cielovaSkupina = collectNames(sc.cielovaSkupina);
    const opravneneVydavky = collectNames(sc.opravneneVydavky).filter((n) => n.toLowerCase() !== "bez výdavkov");
    const oblasti = collectNames(grant.oblasti);
    const formaPodporyRows = parseFormaPodpory(sc.formaPodpory);
    const coFin = parseCoFinancing(sc.mieraSpolufinancovania);
    const coFinParagraphs = coFin.length === 0 ? htmlToParagraphs(sc.mieraSpolufinancovania) : [];
    const podmienky = Array.isArray(sc.podmienkaPoskytnutiaPrispevku) ? sc.podmienkaPoskytnutiaPrispevku : [];
    const indikatoryVystup = collectNames(sc.ukazovatelVystupovy).slice(0, 20);
    const indikatoryVysledok = collectNames(sc.ukazovatelVysledkovy).slice(0, 20);
    const kontakt = parseKontakt(grant.kontakt);
    const documents = Array.isArray(grant.documents) ? grant.documents : [];
    return {
      sc, regions, ziadatele, cielovaSkupina, opravneneVydavky, oblasti,
      formaPodporyRows, coFin, coFinParagraphs, podmienky,
      indikatoryVystup, indikatoryVysledok, kontakt, documents,
    };
  }, [grant]);

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-12 text-muted-foreground">Načítavam…</div>;
  if (!grant || !derived) return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Výzva neexistuje</h1>
      <Link to="/granty" className="mt-6 inline-block"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Späť na granty</Button></Link>
    </div>
  );

  const deadlineDate = grant.deadline ? parseISO(grant.deadline) : null;
  const daysLeft = deadlineDate ? differenceInDays(deadlineDate, new Date()) : null;
  const rolling = grant.typ === "OTVORENA";
  const totalSum = (grant.suma_eu ?? 0) + (grant.suma_sr ?? 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <Link to={authed ? "/granty" : "/"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Späť
      </Link>

      {/* --------- Hlavička --------- */}
      <header className="mt-6">
        <div className="flex items-center gap-2 flex-wrap">
          {grant.kod && <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded">{grant.kod}</span>}
          {rolling ? (
            <span className="eyebrow inline-flex items-center border border-emerald-600 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
              <InfinityIcon className="h-3 w-3 mr-1" /> Priebežná výzva
            </span>
          ) : (
            <span className="eyebrow inline-flex items-center border border-primary text-primary px-2 py-0.5">One-shot výzva</span>
          )}
          {grant.stav && (
            <span className="eyebrow inline-flex items-center border border-border px-2 py-0.5 text-muted-foreground">{grant.stav}</span>
          )}
          {daysLeft !== null && (
            daysLeft < 0 ? (
              <span className="eyebrow border border-border bg-secondary px-2 py-0.5 text-muted-foreground">Po termíne</span>
            ) : (
              <span className={`eyebrow px-2 py-0.5 ${daysLeft < 7 ? "border border-primary bg-primary text-primary-foreground" : "border border-foreground"}`}>
                {daysLeft === 0 ? "Posledný deň" : `Zostáva ${daysLeft} dní`}
              </span>
            )
          )}
        </div>

        <h1 className="mt-4 font-display text-3xl md:text-5xl font-bold tracking-tight leading-[1.05] max-w-[38ch]">
          {grant.title}
        </h1>

        {grant.program && (
          <div className="mt-3 text-sm text-muted-foreground">{grant.program}</div>
        )}
        {grant.poskytovatel && (
          <div className="mt-2 flex items-center gap-2 text-foreground/80">
            <Building2 className="h-4 w-4 flex-none" /> <span>{grant.poskytovatel}</span>
          </div>
        )}
      </header>

      {/* --------- Kľúčové čísla (karty) --------- */}
      <section className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
        {totalSum > 0 && (
          <StatCard label="Alokácia (EÚ + ŠR)">
            <div className="num text-2xl font-bold text-primary leading-tight">
              {new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 }).format(totalSum)} €
            </div>
            <div className="mt-1 text-xs text-muted-foreground space-x-2">
              {grant.suma_eu != null && <span>EÚ <span className="num font-medium text-foreground">{new Intl.NumberFormat("sk-SK").format(grant.suma_eu)} €</span></span>}
              {grant.suma_sr != null && <span>· ŠR <span className="num font-medium text-foreground">{new Intl.NumberFormat("sk-SK").format(grant.suma_sr)} €</span></span>}
            </div>
          </StatCard>
        )}

        <StatCard label="Deadline">
          {deadlineDate ? (
            <>
              <div className="num text-2xl font-bold leading-tight">{format(deadlineDate, "d.M.yyyy")}</div>
              {daysLeft !== null && (
                <div className={`mt-1 text-xs ${daysLeft < 0 ? "text-muted-foreground" : daysLeft < 7 ? "text-primary" : "text-muted-foreground"}`}>
                  {daysLeft < 0 ? "po termíne" : daysLeft === 0 ? "posledný deň" : `zostáva ${daysLeft} dní`}
                </div>
              )}
            </>
          ) : (
            <div className="text-emerald-700 dark:text-emerald-400 font-medium">Priebežná výzva</div>
          )}
          {grant.datum_vyhlasenia && (
            <div className="mt-1 text-xs text-muted-foreground">
              vyhlásená <span className="num">{format(parseISO(grant.datum_vyhlasenia), "d.M.yyyy")}</span>
            </div>
          )}
        </StatCard>

        {derived.coFin.length > 0 && (
          <StatCard label="Miera spolufinancovania">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {derived.coFin.map((r) => (
                <div key={r.label} className="flex items-baseline gap-1">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="num font-semibold">{r.percent}&nbsp;%</span>
                </div>
              ))}
            </div>
          </StatCard>
        )}
      </section>

      {/* --------- Pre koho je výzva --------- */}
      <Section title="Pre koho je výzva">
        {derived.ziadatele.length > 0 && (
          <Row label="Oprávnený žiadateľ">
            <Chips items={derived.ziadatele} initial={8} />
          </Row>
        )}
        {derived.regions.length > 0 && (
          <Row label="Miesto realizácie">
            <div className="text-sm">
              {derived.regions.length >= 8 ? "Celé Slovensko" : derived.regions.join(", ")}
            </div>
          </Row>
        )}
        {derived.cielovaSkupina.length > 0 && (
          <Row label="Cieľová skupina">
            <Chips items={derived.cielovaSkupina} initial={8} />
          </Row>
        )}
        {derived.oblasti.length > 0 && (
          <Row label="Oblasti intervencie">
            <Chips items={derived.oblasti} initial={6} />
          </Row>
        )}
      </Section>

      {/* --------- Forma podpory + priorita --------- */}
      {derived.formaPodporyRows.length > 0 && (
        <Section title="Forma podpory a zaradenie">
          <div className="space-y-3">
            {derived.formaPodporyRows.map((r, i) => (
              <div key={i} className="border border-border p-3">
                <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-1 text-sm">
                  {r.forma && (<><dt className="text-muted-foreground">Forma podpory</dt><dd>{r.forma}</dd></>)}
                  {r.kategorieRegionov.length > 0 && (<><dt className="text-muted-foreground">Kategória regiónov</dt><dd>{r.kategorieRegionov.join(", ")}</dd></>)}
                  {r.specCiel && (<><dt className="text-muted-foreground">Špecifický cieľ</dt><dd className="max-w-[62ch]">{r.specCiel}</dd></>)}
                  {r.priorita && (<><dt className="text-muted-foreground">Priorita</dt><dd className="max-w-[62ch]">{r.priorita}</dd></>)}
                </dl>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* --------- Miera spolufinancovania – detailný popis (ak nešlo do karty) --------- */}
      {derived.coFin.length === 0 && derived.coFinParagraphs.length > 0 && (
        <Section title="Miera spolufinancovania" icon={<Coins className="h-4 w-4" />}>
          <LongText paragraphs={derived.coFinParagraphs} collapseAfter={4} />
        </Section>
      )}

      {/* --------- Podmienky poskytnutia príspevku --------- */}
      {derived.podmienky.length > 0 && (
        <Section title="Podmienky poskytnutia príspevku">
          <div className="space-y-3">
            {derived.podmienky.slice(0, 25).map((p: any, i: number) => {
              const title = p?.nazovSk ?? `Podmienka ${i + 1}`;
              const paragraphs = htmlToParagraphs(p?.popisSk);
              const priloha: string[] = Array.isArray(p?.priloha)
                ? p.priloha.map((x: any) => x?.nazovSk).filter(Boolean) : [];
              return (
                <details key={i} className="border border-border">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-3 hover:bg-secondary/40">
                    <span className="font-medium text-sm">{title}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-border p-3 space-y-2">
                    <LongText paragraphs={paragraphs} collapseAfter={4} />
                    {priloha.length > 0 && (
                      <div className="pt-2 mt-2 border-t border-border">
                        <div className="eyebrow text-muted-foreground mb-1">Prílohy</div>
                        <ul className="text-sm space-y-1">
                          {priloha.map((n, j) => <li key={j} className="flex items-start gap-2"><FileText className="h-3 w-3 mt-1 text-muted-foreground shrink-0" /><span>{n}</span></li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </Section>
      )}

      {/* --------- Oprávnené výdavky + Indikátory --------- */}
      {(derived.opravneneVydavky.length > 0 || derived.indikatoryVystup.length > 0 || derived.indikatoryVysledok.length > 0) && (
        <Section title="Oprávnené výdavky a indikátory">
          {derived.opravneneVydavky.length > 0 && (
            <Row label="Oprávnené výdavky">
              <Chips items={derived.opravneneVydavky} initial={8} />
            </Row>
          )}
          {derived.indikatoryVystup.length > 0 && (
            <Row label="Výstupové ukazovatele">
              <ul className="list-disc list-inside text-sm space-y-1 max-w-[62ch]">
                {derived.indikatoryVystup.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </Row>
          )}
          {derived.indikatoryVysledok.length > 0 && (
            <Row label="Výsledkové ukazovatele">
              <ul className="list-disc list-inside text-sm space-y-1 max-w-[62ch]">
                {derived.indikatoryVysledok.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </Row>
          )}
        </Section>
      )}

      {/* --------- Dokumenty --------- */}
      {derived.documents.length > 0 && (
        <Section title={`Dokumenty (${derived.documents.length})`} icon={<FileText className="h-4 w-4" />}>
          <ul className="space-y-2">
            {derived.documents.map((d: any, i: number) => {
              const nazov = d?.nazov ?? d?.title ?? d?.nazovSk ?? `Dokument ${i + 1}`;
              const url = d?.url ?? d?.href ?? d?.link ?? grant.detail_url;
              const typ = (d?.typ ?? d?.type ?? "").toString().toUpperCase();
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary underline underline-offset-2 break-words">
                        {nazov} <ExternalLink className="inline h-3 w-3 ml-0.5" />
                      </a>
                    ) : (
                      <span className="break-words">{nazov}</span>
                    )}
                    {typ && <span className="ml-2 text-xs text-muted-foreground uppercase">{typ}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {grant.detail_url && (
            <p className="mt-3 text-xs text-muted-foreground">
              Kompletné dokumenty aj s prílohami nájdete v <a href={grant.detail_url} target="_blank" rel="noopener noreferrer" className="underline">ITMS21+</a>.
            </p>
          )}
        </Section>
      )}

      {/* --------- Kontakt --------- */}
      {derived.kontakt && (
        <Section title="Kontakt">
          <div className="space-y-2 text-sm">
            {derived.kontakt.nazov && (
              <div className="flex items-start gap-2"><Building2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" /><span>{derived.kontakt.nazov}</span></div>
            )}
            {derived.kontakt.email && (
              <div className="flex items-start gap-2"><Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <a className="hover:text-primary underline underline-offset-2 break-words" href={`mailto:${derived.kontakt.email}`}>{derived.kontakt.email}</a>
              </div>
            )}
            {derived.kontakt.telefon && (
              <div className="flex items-start gap-2"><Phone className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <a className="hover:text-primary underline underline-offset-2" href={`tel:${derived.kontakt.telefon}`}>{derived.kontakt.telefon}</a>
              </div>
            )}
            {derived.kontakt.osoba.map((p, i) => (
              <div key={i} className="pt-2 mt-2 border-t border-border">
                {p.meno && <div className="flex items-start gap-2"><User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />{p.meno}</div>}
                {p.email && <div className="mt-1 flex items-start gap-2 pl-6"><Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" /><a className="hover:text-primary underline underline-offset-2" href={`mailto:${p.email}`}>{p.email}</a></div>}
                {p.telefon && <div className="mt-1 flex items-start gap-2 pl-6"><Phone className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" /><a className="hover:text-primary underline underline-offset-2" href={`tel:${p.telefon}`}>{p.telefon}</a></div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {authed && <GrantAnalysisSection grantId={grant.id} />}

      <div className="mt-10 flex flex-wrap gap-3">
        {grant.detail_url && (
          <a href={grant.detail_url} target="_blank" rel="noopener noreferrer">
            <Button>Otvoriť v ITMS21+ <ExternalLink className="h-4 w-4 ml-2" /></Button>
          </a>
        )}
        <Link to={authed ? "/granty" : "/"}>
          <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Späť</Button>
        </Link>
      </div>
    </div>
  );
}

// ---------- Presentational primitives ----------

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="font-display text-xl font-semibold flex items-center gap-2">
        {icon}<span>{title}</span>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="eyebrow text-muted-foreground mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="eyebrow text-muted-foreground">{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Chips({ items, initial = 8 }: { items: string[]; initial?: number }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = Math.max(0, items.length - initial);
  const shown = expanded ? items : items.slice(0, initial);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((s, i) => (
        <span key={i} className="inline-block border border-border bg-secondary/50 text-foreground text-xs px-2 py-1 leading-tight">
          {s}
        </span>
      ))}
      {hidden > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-block border border-dashed border-border text-muted-foreground text-xs px-2 py-1 hover:text-foreground hover:border-foreground"
        >
          + ďalších {hidden}
        </button>
      )}
    </div>
  );
}

function LongText({ paragraphs, collapseAfter = 4 }: { paragraphs: string[]; collapseAfter?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (paragraphs.length === 0) return null;
  const overflow = paragraphs.length > collapseAfter;
  const shown = expanded || !overflow ? paragraphs : paragraphs.slice(0, collapseAfter);
  return (
    <div className="text-sm text-foreground/90 space-y-2 max-w-[70ch]">
      {shown.map((p, i) => (
        <p key={i} className="leading-relaxed">{p}</p>
      ))}
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {expanded ? "Zobraziť menej" : "Zobraziť celé"}
        </button>
      )}
    </div>
  );
}
