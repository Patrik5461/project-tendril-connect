import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Calendar, ExternalLink, MapPin, FileText, Infinity as InfinityIcon, Users, Coins, Target } from "lucide-react";
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

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&scaron;/g, "š").replace(/&Scaron;/g, "Š")
    .replace(/&aacute;/g, "á").replace(/&Aacute;/g, "Á")
    .replace(/&eacute;/g, "é").replace(/&Eacute;/g, "É")
    .replace(/&iacute;/g, "í").replace(/&Iacute;/g, "Í")
    .replace(/&oacute;/g, "ó").replace(/&Oacute;/g, "Ó")
    .replace(/&uacute;/g, "ú").replace(/&Uacute;/g, "Ú")
    .replace(/&yacute;/g, "ý").replace(/&Yacute;/g, "Ý")
    .replace(/&auml;/g, "ä").replace(/&ocirc;/g, "ô")
    .replace(/&lacute;/g, "ĺ").replace(/&rcaron;/g, "ř")
    .replace(/&ccaron;/g, "č").replace(/&Ccaron;/g, "Č")
    .replace(/&dcaron;/g, "ď").replace(/&Dcaron;/g, "Ď")
    .replace(/&lcaron;/g, "ľ").replace(/&Lcaron;/g, "Ľ")
    .replace(/&ncaron;/g, "ň").replace(/&Ncaron;/g, "Ň")
    .replace(/&rcaron;/g, "ř").replace(/&tcaron;/g, "ť").replace(/&Tcaron;/g, "Ť")
    .replace(/&zcaron;/g, "ž").replace(/&Zcaron;/g, "Ž")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return decodeEntities(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

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

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-12 text-muted-foreground">Načítavam…</div>;
  if (!grant) return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Výzva neexistuje</h1>
      <Link to="/granty" className="mt-6 inline-block"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Späť na granty</Button></Link>
    </div>
  );

  const deadlineDate = grant.deadline ? parseISO(grant.deadline) : null;
  const daysLeft = deadlineDate ? differenceInDays(deadlineDate, new Date()) : null;
  const rolling = grant.typ === "OTVORENA";
  const sc = grant.structured_conditions ?? {};
  const totalSum = (grant.suma_eu ?? 0) + (grant.suma_sr ?? 0);
  const regions = Array.isArray(grant.miesto_realizacie) ? grant.miesto_realizacie.map((x: any) => x?.nazov).filter(Boolean) : [];
  const ziadatele = Array.isArray(grant.opravneny_ziadatel) ? grant.opravneny_ziadatel.map((x: any) => x?.nazov).filter(Boolean) : [];
  const oblasti = Array.isArray(grant.oblasti) ? grant.oblasti.map((x: any) => x?.nazovSk ?? x?.nazov).filter(Boolean) : [];
  const documents = Array.isArray(grant.documents) ? grant.documents : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <Link to={authed ? "/granty" : "/"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Späť
      </Link>

      <div className="mt-6 flex items-center gap-3 flex-wrap">
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
              {daysLeft === 0 ? "Posledný deň" : `${daysLeft} dní`}
            </span>
          )
        )}
      </div>

      <h1 className="mt-4 font-display text-3xl md:text-5xl font-bold tracking-tight leading-[1.05]">
        {grant.title}
      </h1>

      {grant.program && (
        <div className="mt-3 text-sm text-muted-foreground">{grant.program}</div>
      )}
      {grant.poskytovatel && (
        <div className="mt-2 flex items-center gap-2 text-foreground/80">
          <Building2 className="h-4 w-4" /> <span>{grant.poskytovatel}</span>
        </div>
      )}

      {totalSum > 0 && (
        <div className="mt-8 border-t-2 border-foreground border-b border-border py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="eyebrow text-muted-foreground">Alokácia celkom</div>
            <div className="num mt-1 text-3xl md:text-4xl font-bold text-primary leading-tight">
              {new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 }).format(totalSum)} €
            </div>
          </div>
          <div className="text-sm space-y-1 sm:text-right">
            {grant.suma_eu != null && <div>EÚ: <span className="num font-semibold">{new Intl.NumberFormat("sk-SK").format(grant.suma_eu)} €</span></div>}
            {grant.suma_sr != null && <div>ŠR: <span className="num font-semibold">{new Intl.NumberFormat("sk-SK").format(grant.suma_sr)} €</span></div>}
          </div>
        </div>
      )}

      <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8 border-t border-border pt-6">
        <Field
          icon={<Calendar className="h-4 w-4" />}
          label="Deadline"
          value={deadlineDate ? (
            <><span className="num">{format(deadlineDate, "d.M.yyyy")}</span>
              {daysLeft !== null && (
                <span className={`ml-2 text-xs ${daysLeft < 0 ? "text-muted-foreground" : daysLeft < 7 ? "text-primary" : "text-muted-foreground"}`}>
                  {daysLeft < 0 ? "po termíne" : daysLeft === 0 ? "posledný deň" : `zostáva ${daysLeft} dní`}
                </span>
              )}
            </>
          ) : (
            <span className="text-emerald-700 dark:text-emerald-400 text-sm font-medium">Priebežná výzva (bez fixného termínu)</span>
          )}
        />
        <Field icon={<Calendar className="h-4 w-4" />} label="Vyhlásená" value={grant.datum_vyhlasenia ? <span className="num">{format(parseISO(grant.datum_vyhlasenia), "d.M.yyyy")}</span> : "—"} />
        <Field icon={<MapPin className="h-4 w-4" />} label="Miesto realizácie" value={regions.length === 0 ? "—" : regions.length >= 8 ? "Celé Slovensko" : regions.join(", ")} />
        <Field icon={<Target className="h-4 w-4" />} label="Oblasti intervencie" value={oblasti.length ? oblasti.slice(0, 3).join("; ") + (oblasti.length > 3 ? ` +${oblasti.length - 3}` : "") : "—"} />
      </dl>

      {/* Structured conditions */}
      <section className="mt-10 border-t border-border pt-6 space-y-6">
        <div className="eyebrow text-primary">Podmienky výzvy (ITMS)</div>

        {ziadatele.length > 0 && (
          <Block icon={<Users className="h-4 w-4" />} title="Oprávnený žiadateľ">
            <ul className="list-disc list-inside text-sm space-y-1">
              {ziadatele.map((z, i) => <li key={i}>{z}</li>)}
            </ul>
          </Block>
        )}

        {sc.mieraSpolufinancovania && (
          <Block icon={<Coins className="h-4 w-4" />} title="Miera spolufinancovania">
            <div className="text-sm text-foreground/90 whitespace-pre-line">{stripHtml(sc.mieraSpolufinancovania)}</div>
          </Block>
        )}

        {Array.isArray(sc.formaPodpory) && sc.formaPodpory.length > 0 && (
          <Block title="Forma podpory">
            <ul className="list-disc list-inside text-sm space-y-1">
              {sc.formaPodpory.map((f: any, i: number) => <li key={i}>{f?.nazovSk ?? f?.nazov ?? JSON.stringify(f)}</li>)}
            </ul>
          </Block>
        )}

        {Array.isArray(sc.cielovaSkupina) && sc.cielovaSkupina.length > 0 && (
          <Block title="Cieľová skupina">
            <ul className="list-disc list-inside text-sm space-y-1">
              {sc.cielovaSkupina.map((c: any, i: number) => <li key={i}>{c?.nazovSk ?? c?.nazov ?? JSON.stringify(c)}</li>)}
            </ul>
          </Block>
        )}

        {Array.isArray(sc.opravneneVydavky) && sc.opravneneVydavky.length > 0 && (
          <Block title="Oprávnené výdavky">
            <ul className="list-disc list-inside text-sm space-y-1">
              {sc.opravneneVydavky.map((v: any, i: number) => <li key={i}>{v?.nazovSk ?? v?.nazov ?? JSON.stringify(v)}</li>)}
            </ul>
          </Block>
        )}

        {Array.isArray(sc.merateInyUkazovatel) && sc.merateInyUkazovatel.length > 0 && (
          <Block title="Indikátory (merateľné ukazovatele)">
            <ul className="list-disc list-inside text-sm space-y-1">
              {sc.merateInyUkazovatel.slice(0, 20).map((u: any, i: number) => <li key={i}>{u?.nazovSk ?? u?.nazov ?? JSON.stringify(u)}</li>)}
            </ul>
          </Block>
        )}

        {Array.isArray(sc.podmienkaPoskytnutiaPrispevku) && sc.podmienkaPoskytnutiaPrispevku.length > 0 && (
          <Block title="Podmienky poskytnutia príspevku">
            <div className="space-y-3">
              {sc.podmienkaPoskytnutiaPrispevku.slice(0, 20).map((p: any, i: number) => (
                <details key={i} className="rounded border border-border p-3">
                  <summary className="font-medium text-sm cursor-pointer">{p?.nazovSk ?? "Podmienka"}</summary>
                  <div className="mt-2 text-sm text-foreground/85">{stripHtml(p?.popisSk)}</div>
                </details>
              ))}
            </div>
          </Block>
        )}

        {grant.kontakt && (
          <Block title="Kontakt">
            <pre className="text-xs bg-secondary p-3 rounded overflow-x-auto whitespace-pre-wrap">{JSON.stringify(grant.kontakt, null, 2)}</pre>
          </Block>
        )}
      </section>

      {/* Documents */}
      {documents.length > 0 && (
        <section className="mt-10 border-t border-border pt-6">
          <div className="eyebrow text-primary flex items-center gap-2"><FileText className="h-4 w-4" /> Dokumenty ({documents.length})</div>
          <ul className="mt-3 space-y-2">
            {documents.map((d: any, i: number) => {
              const nazov = d?.nazov ?? d?.title ?? d?.nazovSk ?? `Dokument ${i + 1}`;
              const url = d?.url ?? d?.href ?? d?.link ?? grant.detail_url;
              return (
                <li key={i} className="text-sm">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary underline underline-offset-2">
                      {nazov} <ExternalLink className="inline h-3 w-3 ml-1" />
                    </a>
                  ) : (
                    <span>{nazov}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {grant.detail_url && (
            <p className="mt-3 text-xs text-muted-foreground">
              Kompletné dokumenty aj s prílohami nájdete v <a href={grant.detail_url} target="_blank" rel="noopener noreferrer" className="underline">ITMS21+</a>.
            </p>
          )}
        </section>
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

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">{icon}{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}

function Block({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display font-semibold flex items-center gap-2">{icon}{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}
