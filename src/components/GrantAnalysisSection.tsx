import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, Sparkles, CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, Wallet, Building2, Target } from "lucide-react";
import { toast } from "sonner";
import { analyzeGrant, getGrantAnalysis } from "@/lib/grant-analysis.functions";
import { getCompanyProfile, getAiCreditStatus } from "@/lib/tender-analysis.functions";
import { trackConversion } from "@/lib/analytics";
import { AI_MONTHLY_LIMIT, formatEur, priceEur } from "@/lib/subscription";


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
  const [intent, setIntent] = useState("");

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
      if (existing) {
        setAnalysis(existing as AnalysisRow);
        const prevIntent = (existing as any)?.eligibility?.intent?.provided;
        if (typeof prevIntent === "string") setIntent(prevIntent);
      }
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
      const res = await runA({ data: { grant_id: grantId, force, intent: intent.trim() || null } });
      setAnalysis(res as AnalysisRow);
      setProgress(100);
      const r = res as any;
      if (!r?.cached && !r?.credit_unlimited && typeof r?.credit_remaining === "number") {
        setCredit((prev) => prev ? { ...prev, remaining: r.credit_remaining } : { unlimited: false, remaining: r.credit_remaining, limit: 5 });
      }
      if (!r?.cached) trackConversion("ai_analysis", { analysis_type: "grant" });
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

  // Granty sú súčasťou balíka Komplet (trial má prístup ku všetkému).
  const hasAiAccess = status === "trial" || (status === "active" && tier === "komplet");
  const needsUpgrade = status === "active" && tier !== "komplet";
  const isExpired = status === "expired";
  const isTrial = status === "trial";
  const trialExhausted = credit != null && !credit.unlimited && credit.remaining <= 0;


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
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <label className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Čo chcete financovať? <span className="text-xs text-muted-foreground font-normal">(voliteľné, 2–3 vety)</span>
            </label>
            <Textarea
              className="mt-2"
              rows={3}
              placeholder="Napr. Chceme kúpiť fotovoltiku na strechu výrobnej haly a batériové úložisko; predpokladaný rozpočet 120 000 €."
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              maxLength={1500}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Ak vyplníte, AI navyše posúdi, či zámer sedí na ciele výzvy. Bez zámeru posúdi len formálnu oprávnenosť a finančnú realizovateľnosť.
            </p>
          </div>
          <div>
            <Button onClick={() => run(false)} size="lg">
              <Sparkles className="h-4 w-4 mr-2" /> Analyzovať oprávnenosť
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Analýza trvá ~30 sekúnd. Rozdelená do 3 častí: formálna oprávnenosť, finančná realizovateľnosť, čo výzva financuje.
              {isTrial && credit && !credit.unlimited && (
                <> Spotrebuje 1 z {credit.limit} trial AI kreditov.</>
              )}
            </p>
          </div>
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
            <li>1. Formálna oprávnenosť (Gemini Pro) — právna forma, región, sektor</li>
            <li>2. Finančná realizovateľnosť — miera spolufinancovania vs obrat firmy</li>
            <li>3. Čo výzva financuje (Gemini Flash) — aktivity, výdavky, ukazovatele</li>
            {intent.trim().length >= 10 && <li>4. Súlad zámeru s cieľmi výzvy</li>}
          </ol>
        </div>
      )}

      {analysis && (
        <>
          <AnalysisView
            analysis={analysis}
            onRerun={() => run(true)}
            rerunning={running}
            locked={!hasAiAccess || trialExhausted}
            intent={intent}
            onIntentChange={setIntent}
          />
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
    ? "V balíku Základ máte monitoring a filtre. AI posúdenie oprávnenosti pre granty (právna forma, región, financovanie) je súčasťou Prémia."
    : "AI posúdi formálnu oprávnenosť, finančnú realizovateľnosť aj súlad zámeru s cieľmi výzvy.";
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

function AnalysisView({ analysis, onRerun, rerunning, locked, intent, onIntentChange }: {
  analysis: AnalysisRow; onRerun: () => void; rerunning: boolean; locked: boolean;
  intent: string; onIntentChange: (v: string) => void;
}) {
  const elig = analysis.eligibility ?? {};
  const formal = elig.formal ?? {};
  const gate = formal.gate ?? {};
  const financial = elig.financial ?? analysis.requirements?.financial ?? {};
  const intentBlock = elig.intent ?? null;
  const posudenia: Array<{ podmienka: string; stav: string; vysvetlenie: string }> = formal.posudenia ?? elig.posudenia ?? [];

  return (
    <div className="mt-4 space-y-6">
      {/* Overall recommendation */}
      <div className={`rounded-lg border p-5 ${recommendationClass(analysis.recommendation)}`}>
        <div className="text-xs uppercase tracking-wide font-semibold">Odporúčanie</div>
        <div className="mt-1 font-display text-lg font-bold">{recommendationLabel(analysis.recommendation)}</div>
        {gate.blocked && gate.blocking_reason && (
          <p className="mt-2 text-sm"><span className="font-medium">Blokujúca prekážka: </span>{gate.blocking_reason}</p>
        )}
        {elig.zhrnutie && <p className="mt-2 text-sm">{elig.zhrnutie}</p>}
        {elig.co_chyba && <p className="mt-2 text-sm"><span className="font-medium">Čo firme chýba: </span>{elig.co_chyba}</p>}
      </div>

      {/* 1) Formal eligibility */}
      <section>
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> 1. Formálna oprávnenosť
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Binárna brána: bez toho, aby ste boli oprávneným žiadateľom (právna forma, región, sektor), sa výzvy nemôžete zúčastniť.
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <GateCard label="Kategória žiadateľa" status={gate.applicant_match} detail={`Vy: ${gate.user_category ?? "?"} · Výzva: ${(gate.applicant_categories ?? []).join(", ") || "?"}`} />
          <GateCard label="Miesto realizácie" status={gate.region_match} detail={gate.region_hint ?? (gate.region_match === "nationwide" ? "celé Slovensko" : gate.region_match === "match" ? "váš kraj je pokrytý" : "neuvedené")} />
          <GateCard label="Blokujúca chyba" status={gate.blocked ? "mismatch" : "match"} detail={gate.blocked ? gate.blocking_reason ?? "áno" : "žiadna"} />
        </div>
        {posudenia.length > 0 && (
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
        )}
      </section>

      {/* 2) Financial feasibility */}
      <section>
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> 2. Finančná realizovateľnosť
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Odhad vlastného vkladu z miery spolufinancovania a jeho porovnanie s obratom firmy.
        </p>
        <div className={`mt-3 rounded-lg border p-4 ${financialClass(financial.hodnotenie)}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Miera spolufinancovania žiadateľa</div>
              <div className="mt-1 font-semibold text-base">{financial.miera_spolufinancovania_pct != null ? `${financial.miera_spolufinancovania_pct} %` : "neuvedené"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Celková alokácia výzvy</div>
              <div className="mt-1 font-semibold text-base">{financial.alokacia_eur != null ? `${Math.round(financial.alokacia_eur).toLocaleString("sk-SK")} €` : "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Posledný obrat firmy</div>
              <div className="mt-1 font-semibold text-base">{financial.posledny_obrat ? `${Math.round(financial.posledny_obrat.obrat).toLocaleString("sk-SK")} € (${financial.posledny_obrat.rok})` : "nevyplnené"}</div>
            </div>
          </div>
          {financial.poznamka && <p className="mt-3 text-sm whitespace-pre-line">{financial.poznamka}</p>}
          <div className="mt-2 text-xs">
            <FinancialBadge hodnotenie={financial.hodnotenie} />
          </div>
        </div>
      </section>

      {/* 3) What is financed */}
      {analysis.summary && (
        <section>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> 3. Čo výzva financuje
          </h3>
          <p className="mt-2 whitespace-pre-line text-foreground/90 leading-relaxed">{analysis.summary}</p>
        </section>
      )}

      {/* 4) Intent match (optional) */}
      {intentBlock && (
        <section>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> 4. Súlad vášho zámeru s výzvou
          </h3>
          {intentBlock.provided && (
            <div className="mt-2 rounded border border-border bg-muted/40 p-3 text-sm italic">
              „{intentBlock.provided}"
            </div>
          )}
          {intentBlock.skipped ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Zámer sa neposudzoval — firma nie je oprávneným žiadateľom výzvy.
            </p>
          ) : intentBlock.parsed ? (
            <div className={`mt-3 rounded-lg border p-4 ${intentSuladClass(intentBlock.parsed.sulad)}`}>
              <div className="text-xs uppercase tracking-wide font-semibold">Súlad: {intentSuladLabel(intentBlock.parsed.sulad)}</div>
              {intentBlock.parsed.odovodnenie && <p className="mt-2 text-sm">{intentBlock.parsed.odovodnenie}</p>}
              {intentBlock.parsed.co_doplnit && (
                <p className="mt-2 text-sm"><span className="font-medium">Čo v zámere doplniť: </span>{intentBlock.parsed.co_doplnit}</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Súlad zámeru sa nepodarilo vyhodnotiť.</p>
          )}
        </section>
      )}

      {/* Re-run + optional new intent */}
      {!locked && (
        <div className="border-t border-border pt-4 space-y-3">
          <label className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" /> Upraviť zámer a analyzovať znova <span className="text-xs text-muted-foreground font-normal">(voliteľné)</span>
          </label>
          <Textarea
            rows={3}
            placeholder="Napr. kúpa fotovoltiky a batériového úložiska…"
            value={intent}
            onChange={(e) => onIntentChange(e.target.value)}
            maxLength={1500}
          />
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="outline" onClick={onRerun} disabled={rerunning}>
              {rerunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Analyzovať znova
            </Button>
            <p className="text-xs text-muted-foreground">
              Analýza je orientačná, vygenerovaná AI. Overte si podmienky v oficiálnej výzve.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function GateCard({ label, status, detail }: { label: string; status: string; detail: string }) {
  const color =
    status === "match" || status === "nationwide" ? "border-emerald-500/40 bg-emerald-500/5"
    : status === "mismatch" ? "border-red-500/40 bg-red-500/5"
    : "border-border bg-card";
  return (
    <div className={`rounded border p-3 ${color}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{detail}</div>
    </div>
  );
}

function FinancialBadge({ hodnotenie }: { hodnotenie: string }) {
  if (hodnotenie === "realizovatelne") return <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Finančne realizovateľné</span>;
  if (hodnotenie === "hranicne") return <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Hraničné — vyžaduje plánovanie cash-flow</span>;
  if (hodnotenie === "rizikove") return <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-3.5 w-3.5" /> Rizikové — vysoký vlastný vklad</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><HelpCircle className="h-3.5 w-3.5" /> Nemožno posúdiť (doplňte financné roky v /firma)</span>;
}

function financialClass(h: string): string {
  if (h === "realizovatelne") return "border-emerald-500/40 bg-emerald-500/5";
  if (h === "hranicne") return "border-amber-500/40 bg-amber-500/5";
  if (h === "rizikove") return "border-red-500/40 bg-red-500/5";
  return "border-border bg-card";
}

function intentSuladClass(s: string): string {
  if (s === "vysoky") return "border-emerald-500/40 bg-emerald-500/5";
  if (s === "stredny") return "border-amber-500/40 bg-amber-500/5";
  if (s === "nizky") return "border-red-500/40 bg-red-500/5";
  return "border-border bg-card";
}

function intentSuladLabel(s: string): string {
  if (s === "vysoky") return "vysoký";
  if (s === "stredny") return "stredný";
  if (s === "nizky") return "nízky";
  return "nemožno posúdiť";
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
