import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, Sparkles, CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, Scale, ShieldAlert, FileText } from "lucide-react";
import { toast } from "sonner";
import { analyzeTender, getTenderAnalysis, getCompanyProfile } from "@/lib/tender-analysis.functions";
import { SubcontractingSection } from "@/components/SubcontractingSection";
import {
  awardBreakdown,
  exclusionGroundLabel,
  hasNoticeSelectionCriteria,
  selectionCriteriaAreInAttachments,
  type StructuredCriteria,
} from "@/lib/ted-criteria";

type AnalysisRow = {
  summary: string | null;
  requirements: any;
  eligibility: any;
  recommendation: string | null;
  overall: string | null;
  updated_at?: string;
};

type Props = {
  tenderId: string;
  defaultCity?: string | null;
  source?: string | null;
  structuredCriteria?: StructuredCriteria | null;
};

export function TenderAnalysisSection({ tenderId, defaultCity, source, structuredCriteria }: Props) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tier, setTier] = useState<string>("basic");
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRow | null>(null);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const getA = useServerFn(getTenderAnalysis);
  const getP = useServerFn(getCompanyProfile);
  const runA = useServerFn(analyzeTender);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setAuthed(false); setChecking(false); return; }
      setAuthed(true);
      const [{ data: prefs }, profile, existing] = await Promise.all([
        supabase.from("user_preferences").select("subscription_status,subscription_tier").eq("user_id", u.user.id).maybeSingle(),
        getP().catch(() => null),
        getA({ data: { tender_id: tenderId } }).catch(() => null),
      ]);
      setStatus(prefs?.subscription_status ?? "trial");
      setTier(((prefs as any)?.subscription_tier as string) ?? "basic");
      setHasProfile(!!(profile && profile.ico));
      if (existing) setAnalysis(existing as AnalysisRow);
      setChecking(false);
    })();
  }, [tenderId, getA, getP]);

  useEffect(() => {
    if (!running) return;
    setProgress(5);
    const started = Date.now();
    const iv = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      const pct = Math.min(90, 5 + (elapsed / 35) * 85);
      setProgress(pct);
    }, 400);
    return () => clearInterval(iv);
  }, [running]);

  async function run(force = false) {
    setRunning(true);
    try {
      const res = await runA({ data: { tender_id: tenderId, force } });
      setAnalysis(res as AnalysisRow);
      setProgress(100);
      toast.success(res && (res as any).cached ? "Načítaná uložená analýza" : "Analýza dokončená");
    } catch (e: any) {
      toast.error(e?.message ?? "Analýza zlyhala");
    } finally {
      setRunning(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  if (checking || authed === null) return null;
  if (!authed) return null;

  const hasAiAccess = status === "trial" || (status === "active" && tier === "premium");
  const needsUpgrade = status === "active" && tier !== "premium";
  const isExpired = status === "expired";

  return (
    <div className="mt-12 border-t-2 border-foreground pt-6">
      {source === "TED" && structuredCriteria && (
        <TedStructuredFacts sc={structuredCriteria} />
      )}

      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="eyebrow text-primary">AI analýza spôsobilosti</div>
      </div>

      {!hasAiAccess && !analysis && (
        <LockedTeaser needsUpgrade={needsUpgrade} isExpired={isExpired} />
      )}

      {hasAiAccess && !hasProfile && !analysis && (
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <h3 className="font-display font-semibold text-lg">Vyplňte firemný profil</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Aby AI vedela porovnať podmienky zákazky s vašou firmou, potrebujeme aspoň IČO a základné údaje.
          </p>
          <Link to="/firma"><Button className="mt-4">Otvoriť firemný profil</Button></Link>
        </div>
      )}

      {hasAiAccess && hasProfile && !analysis && !running && (
        <div className="mt-4">
          <Button onClick={() => run(false)} size="lg">
            <Sparkles className="h-4 w-4 mr-2" /> Analyzovať zákazku
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Analýza trvá ~30 sekúnd. Výsledok uložíme, pri ďalšom otvorení sa načíta okamžite.
          </p>
        </div>
      )}

      {running && (
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Analyzujem zákazku… (~30 s)</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <ol className="mt-4 space-y-1 text-xs text-muted-foreground">
            <li>1. Zhrnutie zákazky</li>
            <li>2. Extrakcia podmienok účasti</li>
            <li>3. Porovnanie s vaším firemným profilom (Gemini Pro)</li>
          </ol>
        </div>
      )}

      {analysis && (
        <AnalysisView analysis={analysis} onRerun={() => run(true)} rerunning={running} locked={!hasAiAccess} />
      )}

      <SubcontractingSection
        tenderId={tenderId}
        defaultCity={defaultCity ?? null}
        isActive={hasAiAccess}
        analysisReady={!!analysis}
      />
    </div>
  );
}

function LockedTeaser({ needsUpgrade, isExpired }: { needsUpgrade: boolean; isExpired: boolean }) {
  const title = needsUpgrade
    ? "AI analýza je v balíku Prémium"
    : isExpired
    ? "Ukážka – vyžaduje aktívne predplatné"
    : "Ukážka – vyžaduje aktívne predplatné";
  const cta = needsUpgrade
    ? "Upgradni na Prémium (15 €/mes) a odomkni AI analýzu"
    : "Odomknúť analýzu – aktivovať predplatné";
  const body = needsUpgrade
    ? "V balíku Základ máte monitoring, radary a notifikácie. AI porovnanie podmienok s vašou firmou (spôsobilosť, subdodávky) je súčasťou Prémia."
    : "AI porovná podmienky účasti s vašou firmou a povie, či sa oplatí uchádzať.";
  return (
    <div className="mt-4 relative overflow-hidden rounded-lg border border-border bg-card p-6">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/60 to-card pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-4 w-4" /> {title}
        </div>
        <div className="mt-4 space-y-3 blur-sm select-none">
          <div className="h-4 w-3/4 bg-muted rounded" />
          <div className="h-4 w-5/6 bg-muted rounded" />
          <div className="h-4 w-2/3 bg-muted rounded" />
          <div className="h-4 w-4/5 bg-muted rounded" />
        </div>
        <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground max-w-md">{body}</p>
          <Link to="/predplatne" search={needsUpgrade ? { tier: "premium" } as never : undefined as never}>
            <Button>{cta}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function AnalysisView({ analysis, onRerun, rerunning, locked }: {
  analysis: AnalysisRow; onRerun: () => void; rerunning: boolean; locked: boolean;
}) {
  const req = analysis.requirements ?? {};
  const elig = analysis.eligibility ?? {};
  const posudenia: Array<{ podmienka: string; stav: string; vysvetlenie: string }> = elig?.posudenia ?? [];
  const notedCount = countNoted(req);

  return (
    <div className="mt-4 space-y-6">
      {/* Overall recommendation */}
      {elig?.zhrnutie && (
        <div className={`rounded-lg border p-5 ${recommendationClass(analysis.recommendation)}`}>
          <div className="text-xs uppercase tracking-wide font-semibold">Odporúčanie</div>
          <div className="mt-1 font-display text-lg font-bold">
            {recommendationLabel(analysis.recommendation)}
          </div>
          <p className="mt-2 text-sm">{elig.zhrnutie}</p>
          {elig?.co_chyba && (
            <p className="mt-2 text-sm"><span className="font-medium">Čo firme chýba: </span>{elig.co_chyba}</p>
          )}
        </div>
      )}

      {/* Summary */}
      {analysis.summary && (
        <section>
          <h3 className="font-display font-semibold">Súhrn zákazky</h3>
          <p className="mt-2 whitespace-pre-line text-foreground/90 leading-relaxed">{analysis.summary}</p>
        </section>
      )}

      {/* Requirements */}
      <section>
        <h3 className="font-display font-semibold">Podmienky účasti</h3>
        <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ["Obrat", req.obrat],
            ["Referencie", req.referencie],
            ["Certifikáty", req.certifikaty],
            ["Technická spôsobilosť", req.technicka_sposobilost],
            ["Personálna spôsobilosť", req.personalna_sposobilost],
            ["Zábezpeka", req.zabezpeka],
            ["Ostatné", req.ostatne],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k as string}</dt>
              <dd className="mt-1 text-sm">{(v as string) || <span className="text-muted-foreground italic">neuvedené</span>}</dd>
            </div>
          ))}
        </dl>
        {notedCount >= 4 && (
          <p className="mt-3 text-xs text-muted-foreground rounded border border-dashed border-border p-3">
            <HelpCircle className="inline h-3.5 w-3.5 mr-1" />
            Väčšina podmienok je „neuvedené". Detailné podmienky bývajú v súťažných podkladoch (PDF prílohách),
            ktoré nie sú vo verejnom popise. Táto analýza vychádza z dostupného textu zákazky.
          </p>
        )}
      </section>

      {/* Eligibility */}
      {posudenia.length > 0 && (
        <section>
          <h3 className="font-display font-semibold">Posúdenie spôsobilosti</h3>
          <ul className="mt-3 space-y-2">
            {posudenia.map((p, i) => (
              <li key={i} className="rounded border border-border p-3">
                <div className="flex items-start gap-2">
                  <StavIcon stav={p.stav} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p.podmienka}</div>
                    <div className="text-sm text-muted-foreground mt-1">{p.vysvetlenie}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-border">
        {!locked && (
          <Button variant="outline" onClick={onRerun} disabled={rerunning}>
            {rerunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Analyzovať znova
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Analýza je orientačná, vygenerovaná AI. Overte si podmienky v oficiálnom zadaní.
        </p>
      </div>
    </div>
  );
}

function StavIcon({ stav }: { stav: string }) {
  const s = (stav ?? "").toUpperCase();
  if (s.startsWith("SPĹŇA") || s === "SPLNA") return <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />;
  if (s.startsWith("HRANIČ") || s.startsWith("HRANIC")) return <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />;
  if (s.startsWith("NESPĹŇA") || s.startsWith("NESPLNA")) return <XCircle className="h-5 w-5 text-red-600 shrink-0" />;
  return <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />;
}

function countNoted(req: any): number {
  const keys = ["obrat", "referencie", "certifikaty", "technicka_sposobilost", "personalna_sposobilost", "zabezpeka", "ostatne"];
  let n = 0;
  for (const k of keys) {
    const v = (req?.[k] ?? "").toString().toLowerCase();
    if (!v || v.includes("neuvedené") || v.includes("neuvedene")) n++;
  }
  return n;
}

function recommendationLabel(r: string | null): string {
  if (r === "odporucame") return "Odporúčame sa uchádzať";
  if (r === "neodporucame") return "Neodporúčame sa uchádzať";
  if (r === "opatrne") return "Opatrne – hraničné podmienky";
  return "Vyhodnotenie";
}

function recommendationClass(r: string | null): string {
  if (r === "odporucame") return "border-emerald-600/40 bg-emerald-500/5";
  if (r === "neodporucame") return "border-red-600/40 bg-red-500/5";
  if (r === "opatrne") return "border-amber-500/40 bg-amber-500/5";
  return "border-border bg-card";
}

// ---------- TED structured facts (no AI) ----------
function TedStructuredFacts({ sc }: { sc: StructuredCriteria }) {
  const award = awardBreakdown(sc);
  const exclusions = sc.exclusion_grounds ?? [];
  const inNotice = hasNoticeSelectionCriteria(sc);
  const inAttachments = selectionCriteriaAreInAttachments(sc);

  const hasAnything =
    !!award ||
    exclusions.length > 0 ||
    inNotice ||
    inAttachments ||
    !!sc.guarantee_required_description ||
    !!sc.tenderer_legal_form_description;
  if (!hasAnything) return null;

  return (
    <div className="mb-8 rounded-lg border border-border bg-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <div className="eyebrow text-primary">Podmienky z TED registra</div>
      </div>

      {award && (
        <section>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Scale className="h-4 w-4" /> Kritériá hodnotenia ponúk
          </div>
          <div className="mt-2 text-sm">{award.summary}</div>
          {award.items.length > 1 && (
            <div className="mt-2 flex gap-1 h-2 overflow-hidden rounded bg-secondary">
              {award.items.map((it) => (
                <div
                  key={it.type}
                  className={
                    it.type === "price"
                      ? "bg-primary"
                      : it.type === "quality"
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                  }
                  style={{ width: `${it.weight ?? 100 / award.items.length}%` }}
                  title={`${it.label}${it.weight ? ` — ${it.weight} %` : ""}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {exclusions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4" /> Dôvody vylúčenia uchádzača
          </div>
          <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1 text-xs text-muted-foreground">
            {exclusions.map((code) => (
              <li key={code} className="flex items-start gap-1.5">
                <span className="text-muted-foreground/60 mt-0.5">•</span>
                <span>{exclusionGroundLabel(code)}</span>
              </li>
            ))}
          </ul>
          {sc.exclusion_grounds_description && (
            <p className="mt-2 text-xs text-muted-foreground italic">{sc.exclusion_grounds_description}</p>
          )}
        </section>
      )}

      {inNotice && (sc.selection_criterion_descriptions?.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Podmienky účasti (overené z oznámenia)
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {sc.selection_criterion_descriptions.slice(0, 8).map((d, i) => (
              <li key={i} className="rounded border border-border/70 bg-background/50 p-2">
                {sc.selection_criterion_names?.[i] && (
                  <div className="text-xs font-medium text-muted-foreground">{sc.selection_criterion_names[i]}</div>
                )}
                <div>{d}</div>
              </li>
            ))}
          </ul>
          {sc.language && sc.language !== "slk" && sc.language !== "sk" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Text je v pôvodnom jazyku ({sc.language}). AI analýza nižšie ho spracuje po slovensky.
            </p>
          )}
        </section>
      )}

      {inAttachments && (
        <section className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Podmienky sú v prílohách</div>
              <div className="text-xs text-muted-foreground mt-1">
                TED oznámenie uvádza, že detailné podmienky účasti sú v súťažných podkladoch (prílohách), nie v samotnom oznámení.
                AI analýza pracuje s popisom nižšie; presné podmienky nájdete v priloženej dokumentácii.
              </div>
            </div>
          </div>
        </section>
      )}

      {(sc.guarantee_required_description || sc.tenderer_legal_form_description) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {sc.guarantee_required_description && (
            <div className="rounded border border-border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Zábezpeka</div>
              <div className="mt-1">{sc.guarantee_required_description}</div>
            </div>
          )}
          {sc.tenderer_legal_form_description && (
            <div className="rounded border border-border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Právna forma uchádzača</div>
              <div className="mt-1">{sc.tenderer_legal_form_description}</div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
