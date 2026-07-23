import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, Sparkles, CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { analyzeGrant, getGrantAnalysis } from "@/lib/grant-analysis.functions";
import { getCompanyProfile, getAiCreditStatus } from "@/lib/tender-analysis.functions";

type AnalysisRow = {
  summary: string | null;
  requirements: any;
  eligibility: any;
  recommendation: string | null;
  overall: string | null;
};

export function GrantAnalysisSection({ grantId }: { grantId: string }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tier, setTier] = useState<string>("basic");
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRow | null>(null);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [credit, setCredit] = useState<{ unlimited: boolean; remaining: number; limit: number } | null>(null);

  const getA = useServerFn(getGrantAnalysis);
  const getP = useServerFn(getCompanyProfile);
  const runA = useServerFn(analyzeGrant);
  const getCredit = useServerFn(getAiCreditStatus);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setAuthed(false); setChecking(false); return; }
      setAuthed(true);
      const [{ data: prefs }, profile, existing, creditRes] = await Promise.all([
        supabase.from("user_preferences").select("subscription_status,subscription_tier").eq("user_id", u.user.id).maybeSingle(),
        getP().catch(() => null),
        getA({ data: { grant_id: grantId } }).catch(() => null),
        getCredit().catch(() => null),
      ]);
      setStatus(prefs?.subscription_status ?? "trial");
      setTier(((prefs as any)?.subscription_tier as string) ?? "basic");
      setHasProfile(!!(profile && profile.ico));
      if (existing) setAnalysis(existing as AnalysisRow);
      if (creditRes) setCredit({
        unlimited: !!(creditRes as any).unlimited,
        remaining: Number((creditRes as any).remaining ?? 0),
        limit: Number((creditRes as any).limit ?? 5),
      });
      setChecking(false);
    })();
  }, [grantId, getA, getP, getCredit]);

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
      const res = await runA({ data: { grant_id: grantId, force } });
      setAnalysis(res as AnalysisRow);
      setProgress(100);
      const r = res as any;
      if (!r?.cached && !r?.credit_unlimited && typeof r?.credit_remaining === "number") {
        setCredit((prev) => prev ? { ...prev, remaining: r.credit_remaining } : { unlimited: false, remaining: r.credit_remaining, limit: 5 });
      }
      toast.success(r?.cached ? "Načítaná uložená analýza" : "Analýza dokončená");
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
  const isTrial = status === "trial";
  const trialExhausted = isTrial && credit != null && !credit.unlimited && credit.remaining <= 0;

  return (
    <div className="mt-12 border-t-2 border-foreground pt-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="eyebrow text-primary">AI analýza oprávnenosti pre grant</div>
        {isTrial && credit && !credit.unlimited && (
          <span className="ml-auto text-xs text-muted-foreground">
            Trial: <b className="text-foreground">{credit.remaining}</b> z {credit.limit} AI analýz
          </span>
        )}
      </div>

      {!hasAiAccess && !analysis && (
        <LockedTeaser needsUpgrade={needsUpgrade} isExpired={isExpired} />
      )}

      {hasAiAccess && !hasProfile && !analysis && (
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <h3 className="font-display font-semibold text-lg">Vyplňte firemný profil</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Pri grantoch je oprávnenosť žiadateľa (právna forma, veľkosť podniku, sídlo) kľúčová — bez profilu ju AI nevie posúdiť.
          </p>
          <Link to="/firma"><Button className="mt-4">Otvoriť firemný profil</Button></Link>
        </div>
      )}

      {hasAiAccess && hasProfile && !analysis && !running && !trialExhausted && (
        <div className="mt-4">
          <Button onClick={() => run(false)} size="lg">
            <Sparkles className="h-4 w-4 mr-2" /> Analyzovať oprávnenosť
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Analýza trvá ~30 sekúnd. AI overí prioritne oprávnenosť žiadateľa (právna forma, veľkosť, región), potom kapacitu firmy.
            {isTrial && credit && !credit.unlimited && (
              <> Spotrebuje 1 z {credit.limit} trial AI kreditov.</>
            )}
          </p>
        </div>
      )}

      {hasAiAccess && hasProfile && !analysis && !running && trialExhausted && (
        <TrialExhaustedNotice limit={credit!.limit} />
      )}

      {running && (
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Analyzujem grantovú výzvu… (~30 s)</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <ol className="mt-4 space-y-1 text-xs text-muted-foreground">
            <li>1. Zhrnutie výzvy</li>
            <li>2. Extrakcia štruktúrovaných podmienok</li>
            <li>3. Posúdenie oprávnenosti (Gemini Pro) — najprv právna forma & región, potom kapacita</li>
          </ol>
        </div>
      )}

      {analysis && (
        <>
          <AnalysisView analysis={analysis} onRerun={() => run(true)} rerunning={running} locked={!hasAiAccess || trialExhausted} />
          {trialExhausted && (
            <div className="mt-3 rounded-lg border-2 border-primary bg-primary/5 p-3 text-xs">
              Analýzu môžete naďalej prezerať, ale trial AI kredity sú vyčerpané.{" "}
              <Link to="/predplatne" search={{ tier: "premium" } as never} className="underline font-semibold">Aktivujte Prémium</Link> pre neobmedzené analýzy.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TrialExhaustedNotice({ limit }: { limit: number }) {
  return (
    <div className="mt-4 rounded-lg border-2 border-primary bg-primary/5 p-6">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4 text-primary" /> Trial AI kredity vyčerpané
      </div>
      <p className="mt-2 text-sm text-foreground/80">
        Využili ste všetkých {limit} AI analýz z trial verzie. Pre neobmedzené analýzy aktivujte Prémium (14,99 €/mes).
      </p>
      <Link to="/predplatne" search={{ tier: "premium" } as never} className="mt-4 inline-block">
        <Button>Aktivovať Prémium (14,99 €/mes)</Button>
      </Link>
    </div>
  );
}

function LockedTeaser({ needsUpgrade, isExpired }: { needsUpgrade: boolean; isExpired: boolean }) {
  const title = needsUpgrade ? "AI analýza je v balíku Prémium" : isExpired ? "Ukážka – vyžaduje aktívne predplatné" : "Ukážka – vyžaduje aktívne predplatné";
  const cta = needsUpgrade ? "Upgradni na Prémium (14,99 €/mes)" : "Odomknúť analýzu";
  const body = needsUpgrade
    ? "V balíku Základ máte monitoring a filtre. AI posúdenie oprávnenosti pre granty (právna forma, región, kapacita) je súčasťou Prémia."
    : "AI posúdi, či je vaša firma oprávneným žiadateľom a či má šancu uspieť.";
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

  return (
    <div className="mt-4 space-y-6">
      {elig?.zhrnutie && (
        <div className={`rounded-lg border p-5 ${recommendationClass(analysis.recommendation)}`}>
          <div className="text-xs uppercase tracking-wide font-semibold">Odporúčanie</div>
          <div className="mt-1 font-display text-lg font-bold">{recommendationLabel(analysis.recommendation)}</div>
          <p className="mt-2 text-sm">{elig.zhrnutie}</p>
          {elig?.co_chyba && (
            <p className="mt-2 text-sm"><span className="font-medium">Čo firme chýba: </span>{elig.co_chyba}</p>
          )}
        </div>
      )}

      {analysis.summary && (
        <section>
          <h3 className="font-display font-semibold">Súhrn výzvy</h3>
          <p className="mt-2 whitespace-pre-line text-foreground/90 leading-relaxed">{analysis.summary}</p>
        </section>
      )}

      <section>
        <h3 className="font-display font-semibold">Podmienky výzvy</h3>
        <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ["Oprávnený žiadateľ", req.opravneny_ziadatel],
            ["Miesto realizácie", req.miesto_realizacie],
            ["Oprávnené výdavky", req.opravnene_vydavky],
            ["Cieľová skupina", req.cielova_skupina],
            ["Forma podpory", req.forma_podpory],
            ["Miera spolufinancovania", req.miera_spolufinancovania],
            ["Indikátory", req.indikatory],
            ["Podmienky poskytnutia", req.podmienky_poskytnutia],
            ["Ostatné", req.ostatne],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k as string}</dt>
              <dd className="mt-1 text-sm whitespace-pre-line">{(v as string) || <span className="text-muted-foreground italic">neuvedené</span>}</dd>
            </div>
          ))}
        </dl>
      </section>

      {posudenia.length > 0 && (
        <section>
          <h3 className="font-display font-semibold">Posúdenie oprávnenosti</h3>
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
          Analýza je orientačná, vygenerovaná AI. Overte si podmienky v oficiálnej výzve.
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
