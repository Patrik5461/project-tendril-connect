import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, Sparkles, CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, Wallet, Building2, Target } from "lucide-react";
import { WebOnlyPurchase } from "@/components/WebOnlyPurchase";

import { toast } from "sonner";
import { analyzeGrant, getGrantAnalysis } from "@/lib/grant-analysis.functions";
import { getCompanyProfile, getAiCreditStatus } from "@/lib/tender-analysis.functions";
import { trackConversion } from "@/lib/analytics";
import { AI_MONTHLY_LIMIT, formatEur, priceEur } from "@/lib/subscription";
import { useTranslation } from "react-i18next";


type AnalysisRow = {
  summary: string | null;
  requirements: any;
  eligibility: any;
  recommendation: string | null;
  overall: string | null;
};

export function GrantAnalysisSection({ grantId }: { grantId: string }) {
  const { t } = useTranslation("analysis");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
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
      const [ent, profile, existing, creditRes] = await Promise.all([
        fetchEntitlements(),
        getP().catch(() => null),
        getA({ data: { grant_id: grantId } }).catch(() => null),
        getCredit().catch(() => null),
      ]);
      setEntitlements(ent);
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
      toast.success(r?.cached ? t("grant.toastCached") : t("grant.toastDone"));
    } catch (e: any) {
      toast.error(e?.message ?? t("grant.toastFailed"));
    } finally {
      setRunning(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  if (checking || authed === null) return null;
  if (!authed) return null;

  // Jediný zdroj pravdy: get_entitlements() → can_grants / can_ai / ai_remaining.
  const canGrants = entitlements ? !!entitlements.can_grants : true;
  const canAi = entitlements ? !!entitlements.can_ai : true;
  const hasAiAccess = canGrants && canAi;
  const needsUpgrade = !hasAiAccess;
  const status = entitlements?.status ?? "trial";
  const isExpired = status === "expired";
  const isTrial = status === "trial";
  const remaining = credit
    ? credit.remaining
    : entitlements
      ? entitlements.ai_remaining
      : 1;
  const trialExhausted = !(credit?.unlimited) && remaining <= 0;


  return (
    <div className="mt-12 border-t-2 border-foreground pt-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="eyebrow text-primary">{t("grant.eyebrow")}</div>
        {isTrial && credit && !credit.unlimited && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t("grant.trialPrefix")} <b className="text-foreground">{credit.remaining}</b> {t("grant.trialSuffix", { limit: credit.limit })}
          </span>
        )}
      </div>

      {!hasAiAccess && !analysis && (
        <LockedTeaser needsUpgrade={needsUpgrade} isExpired={isExpired} />
      )}

      {hasAiAccess && !hasProfile && !analysis && (
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <h3 className="font-display font-semibold text-lg">{t("grant.fillProfileTitle")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("grant.fillProfileBody")}
          </p>
          <Link to="/firma"><Button className="mt-4">{t("grant.openProfile")}</Button></Link>
        </div>
      )}

      {hasAiAccess && hasProfile && !analysis && !running && !trialExhausted && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <label className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              {t("grant.intentLabel")} <span className="text-xs text-muted-foreground font-normal">{t("grant.intentOptional")}</span>
            </label>
            <Textarea
              className="mt-2"
              rows={3}
              placeholder={t("grant.intentPlaceholder")}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              maxLength={1500}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("grant.intentHelp")}
            </p>
          </div>
          <div>
            <Button onClick={() => run(false)} size="lg">
              <Sparkles className="h-4 w-4 mr-2" /> {t("grant.analyzeButton")}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("grant.analyzeHelp")}
              {isTrial && credit && !credit.unlimited && (
                <> {t("grant.trialCreditNote", { limit: credit.limit })}</>
              )}
            </p>
          </div>
        </div>
      )}

      {hasAiAccess && hasProfile && !analysis && !running && trialExhausted && (
        <TrialExhaustedNotice limit={credit!.limit} isTrial={isTrial} />
      )}

      {running && (
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{t("grant.analyzing")}</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <ol className="mt-4 space-y-1 text-xs text-muted-foreground">
            <li>{t("grant.step1")}</li>
            <li>{t("grant.step2")}</li>
            <li>{t("grant.step3")}</li>
            {intent.trim().length >= 10 && <li>{t("grant.step4")}</li>}
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
              {t("grant.trialExhaustedInline")}{" "}
              <WebOnlyPurchase note={t("grant.webOnlyNote")}>
                <Link to="/cennik" className="underline font-semibold">{t("grant.seePlansLink")}</Link> {t("grant.higherQuota")}
              </WebOnlyPurchase>
            </div>

          )}
        </>
      )}
    </div>
  );
}

function TrialExhaustedNotice({ limit, isTrial }: { limit: number; isTrial: boolean }) {
  const { t } = useTranslation("analysis");
  return (
    <div className="mt-4 rounded-lg border-2 border-primary bg-primary/5 p-6">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4 text-primary" />
        {isTrial ? t("grant.trialExhaustedTitle") : t("grant.monthlyExhaustedTitle")}
      </div>
      <p className="mt-2 text-sm text-foreground/80">
        {isTrial
          ? t("grant.trialExhaustedBody", { limit, price: formatEur(priceEur("komplet")), limit2: AI_MONTHLY_LIMIT.komplet })
          : t("grant.monthlyExhaustedBody", { limit })}
      </p>
      <WebOnlyPurchase className="mt-4">
        <Link to="/cennik" className="mt-4 inline-block">
          <Button>{t("grant.seePlans")}</Button>
        </Link>
      </WebOnlyPurchase>

    </div>
  );
}

function LockedTeaser({ needsUpgrade, isExpired }: { needsUpgrade: boolean; isExpired: boolean }) {
  const { t } = useTranslation("analysis");
  const title = needsUpgrade ? t("grant.lockedNeedsUpgradeTitle") : t("grant.lockedDemoTitle");
  const cta = needsUpgrade ? t("grant.lockedUpgradeCta", { price: formatEur(priceEur("komplet")) }) : t("grant.lockedUnlockCta");
  const body = needsUpgrade
    ? t("grant.lockedUpgradeBody")
    : t("grant.lockedDemoBody");

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
          <WebOnlyPurchase>
            <Link to="/predplatne" search={needsUpgrade ? { tier: "komplet" } as never : undefined as never}>
              <Button>{cta}</Button>
            </Link>
          </WebOnlyPurchase>

        </div>
      </div>
    </div>
  );
}

function AnalysisView({ analysis, onRerun, rerunning, locked, intent, onIntentChange }: {
  analysis: AnalysisRow; onRerun: () => void; rerunning: boolean; locked: boolean;
  intent: string; onIntentChange: (v: string) => void;
}) {
  const { t } = useTranslation("analysis");
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
        <div className="text-xs uppercase tracking-wide font-semibold">{t("grant.recommendation")}</div>
        <div className="mt-1 font-display text-lg font-bold">{recommendationLabel(analysis.recommendation, t)}</div>
        {gate.blocked && gate.blocking_reason && (
          <p className="mt-2 text-sm"><span className="font-medium">{t("grant.blockingObstacle")}</span>{gate.blocking_reason}</p>
        )}
        {elig.zhrnutie && <p className="mt-2 text-sm">{elig.zhrnutie}</p>}
        {elig.co_chyba && <p className="mt-2 text-sm"><span className="font-medium">{t("grant.whatMissing")}</span>{elig.co_chyba}</p>}
      </div>

      {/* 1) Formal eligibility */}
      <section>
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> {t("grant.section1Title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("grant.section1Desc")}
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <GateCard label={t("grant.applicantCategory")} status={gate.applicant_match} detail={t("grant.applicantCategoryDetail", { user: gate.user_category ?? "?", allowed: (gate.applicant_categories ?? []).join(", ") || "?" })} />
          <GateCard label={t("grant.regionOfImplementation")} status={gate.region_match} detail={gate.region_hint ?? (gate.region_match === "nationwide" ? t("grant.regionNationwide") : gate.region_match === "match" ? t("grant.regionMatch") : t("grant.regionUnspecified"))} />
          <GateCard label={t("grant.blockingError")} status={gate.blocked ? "mismatch" : "match"} detail={gate.blocked ? gate.blocking_reason ?? t("grant.blockingYes") : t("grant.blockingNone")} />
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
          <Wallet className="h-4 w-4 text-primary" /> {t("grant.section2Title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("grant.section2Desc")}
        </p>
        <div className={`mt-3 rounded-lg border p-4 ${financialClass(financial.hodnotenie)}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("grant.cofinancingRate")}</div>
              <div className="mt-1 font-semibold text-base">{financial.miera_spolufinancovania_pct != null ? `${financial.miera_spolufinancovania_pct} %` : t("grant.notSpecified")}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("grant.totalAllocation")}</div>
              <div className="mt-1 font-semibold text-base">{financial.alokacia_eur != null ? `${Math.round(financial.alokacia_eur).toLocaleString("sk-SK")} €` : t("grant.dash")}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("grant.lastRevenue")}</div>
              <div className="mt-1 font-semibold text-base">{financial.posledny_obrat ? `${Math.round(financial.posledny_obrat.obrat).toLocaleString("sk-SK")} € (${financial.posledny_obrat.rok})` : t("grant.notFilled")}</div>
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
            <Sparkles className="h-4 w-4 text-primary" /> {t("grant.section3Title")}
          </h3>
          <p className="mt-2 whitespace-pre-line text-foreground/90 leading-relaxed">{analysis.summary}</p>
        </section>
      )}

      {/* 4) Intent match (optional) */}
      {intentBlock && (
        <section>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> {t("grant.section4Title")}
          </h3>
          {intentBlock.provided && (
            <div className="mt-2 rounded border border-border bg-muted/40 p-3 text-sm italic">
              „{intentBlock.provided}"
            </div>
          )}
          {intentBlock.skipped ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("grant.intentSkipped")}
            </p>
          ) : intentBlock.parsed ? (
            <div className={`mt-3 rounded-lg border p-4 ${intentSuladClass(intentBlock.parsed.sulad)}`}>
              <div className="text-xs uppercase tracking-wide font-semibold">{t("grant.intentCompliance", { level: intentSuladLabel(intentBlock.parsed.sulad, t) })}</div>
              {intentBlock.parsed.odovodnenie && <p className="mt-2 text-sm">{intentBlock.parsed.odovodnenie}</p>}
              {intentBlock.parsed.co_doplnit && (
                <p className="mt-2 text-sm"><span className="font-medium">{t("grant.intentWhatToAdd")}</span>{intentBlock.parsed.co_doplnit}</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t("grant.intentUnable")}</p>
          )}
        </section>
      )}

      {/* Re-run + optional new intent */}
      {!locked && (
        <div className="border-t border-border pt-4 space-y-3">
          <label className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" /> {t("grant.editIntentLabel")} <span className="text-xs text-muted-foreground font-normal">{t("grant.editIntentOptional")}</span>
          </label>
          <Textarea
            rows={3}
            placeholder={t("grant.editIntentPlaceholder")}
            value={intent}
            onChange={(e) => onIntentChange(e.target.value)}
            maxLength={1500}
          />
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="outline" onClick={onRerun} disabled={rerunning}>
              {rerunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {t("grant.rerunButton")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("grant.disclaimer")}
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
  const { t } = useTranslation("analysis");
  if (hodnotenie === "realizovatelne") return <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {t("grant.financeRealizable")}</span>;
  if (hodnotenie === "hranicne") return <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {t("grant.financeBorderline")}</span>;
  if (hodnotenie === "rizikove") return <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-3.5 w-3.5" /> {t("grant.financeRisky")}</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><HelpCircle className="h-3.5 w-3.5" /> {t("grant.financeUnknown")}</span>;
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

function intentSuladLabel(s: string, t: (k: string) => string): string {
  if (s === "vysoky") return t("grant.intentHigh");
  if (s === "stredny") return t("grant.intentMedium");
  if (s === "nizky") return t("grant.intentLow");
  return t("grant.intentUnknown");
}

function StavIcon({ stav }: { stav: string }) {
  const s = (stav ?? "").toUpperCase();
  if (s.startsWith("SPĹŇA") || s === "SPLNA") return <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />;
  if (s.startsWith("HRANIČ") || s.startsWith("HRANIC")) return <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />;
  if (s.startsWith("NESPĹŇA") || s.startsWith("NESPLNA")) return <XCircle className="h-5 w-5 text-red-600 shrink-0" />;
  return <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />;
}

function recommendationLabel(r: string | null, t: (k: string) => string): string {
  if (r === "odporucame") return t("grant.recommendationRecommend");
  if (r === "neodporucame") return t("grant.recommendationNotRecommend");
  if (r === "opatrne") return t("grant.recommendationCautious");
  return t("grant.recommendationEvaluation");
}

function recommendationClass(r: string | null): string {
  if (r === "odporucame") return "border-emerald-600/40 bg-emerald-500/5";
  if (r === "neodporucame") return "border-red-600/40 bg-red-500/5";
  if (r === "opatrne") return "border-amber-500/40 bg-amber-500/5";
  return "border-border bg-card";
}
