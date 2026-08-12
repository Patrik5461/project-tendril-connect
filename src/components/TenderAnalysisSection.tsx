import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, Sparkles, CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, Scale, ShieldAlert, FileText } from "lucide-react";
import { WebOnlyPurchase } from "@/components/WebOnlyPurchase";

import { toast } from "sonner";
import { analyzeTender, getTenderAnalysis, getCompanyProfile, getAiCreditStatus } from "@/lib/tender-analysis.functions";
import { SubcontractingSection } from "@/components/SubcontractingSection";
import { trackConversion } from "@/lib/analytics";
import { AI_MONTHLY_LIMIT, formatEur, priceEur } from "@/lib/subscription";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("analysis");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tier, setTier] = useState<string>("basic");
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRow | null>(null);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [credit, setCredit] = useState<{ unlimited: boolean; remaining: number; limit: number } | null>(null);

  const getA = useServerFn(getTenderAnalysis);
  const getP = useServerFn(getCompanyProfile);
  const runA = useServerFn(analyzeTender);
  const getCredit = useServerFn(getAiCreditStatus);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setAuthed(false); setChecking(false); return; }
      setAuthed(true);
      const [{ data: prefs }, profile, existing, creditRes] = await Promise.all([
        supabase.from("user_preferences").select("subscription_status,subscription_tier").eq("user_id", u.user.id).maybeSingle(),
        getP().catch(() => null),
        getA({ data: { tender_id: tenderId } }).catch(() => null),
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
  }, [tenderId, getA, getP, getCredit]);

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

  /**
   * Analýza trvá cez 30 sekúnd a spojenie ju občas nestihne — server ju však
   * dobehne a uloží aj potom, čo prehliadač request vzdal. Namiesto chyby si
   * teda chvíľu pýtame uložený výsledok; „failed to fetch" je tu takmer vždy
   * len prerušené spojenie, nie neúspešná analýza.
   */
  async function waitForStoredAnalysis(before: string | undefined): Promise<AnalysisRow | null> {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const row = (await getA({ data: { tender_id: tenderId } }).catch(() => null)) as AnalysisRow | null;
      if (row && row.updated_at !== before) return row;
    }
    return null;
  }

  async function run(force = false) {
    const before = analysis?.updated_at;
    setRunning(true);
    try {
      const res = await runA({ data: { tender_id: tenderId, force } });
      setAnalysis(res as AnalysisRow);
      setProgress(100);
      const r = res as any;
      if (!r?.cached && !r?.credit_unlimited && typeof r?.credit_remaining === "number") {
        setCredit((prev) => prev ? { ...prev, remaining: r.credit_remaining } : { unlimited: false, remaining: r.credit_remaining, limit: 5 });
      }
      if (!r?.cached) trackConversion("ai_analysis", { analysis_type: "tender" });
      toast.success(r?.cached ? t("tender.toastCached") : t("tender.toastDone"));
    } catch (e: any) {
      const recovered = await waitForStoredAnalysis(before);
      if (recovered) {
        setAnalysis(recovered);
        setProgress(100);
        trackConversion("ai_analysis", { analysis_type: "tender" });
        toast.success(t("tender.toastDone"));
        return;
      }
      toast.error(e?.message ?? t("tender.toastFailed"));
    } finally {
      setRunning(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  if (checking || authed === null) return null;
  if (!authed) return null;

  const hasAiAccess = status === "trial" || (status === "active" && (tier === "premium" || tier === "komplet"));
  const needsUpgrade = status === "active" && tier !== "premium" && tier !== "komplet";
  const isExpired = status === "expired";
  const isTrial = status === "trial";
  // Vyčerpaná kvóta blokuje len NOVÉ analýzy; uložené sa dajú prezerať.
  const trialExhausted = credit != null && !credit.unlimited && credit.remaining <= 0;


  return (
    <div className="mt-12 border-t-2 border-foreground pt-6">
      {source === "TED" && structuredCriteria && (
        <TedStructuredFacts sc={structuredCriteria} />
      )}

      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="eyebrow text-primary">{t("tender.eyebrow")}</div>
        {isTrial && credit && !credit.unlimited && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t("tender.trialPrefix")} <b className="text-foreground">{credit.remaining}</b> {t("tender.trialSuffix", { limit: credit.limit })}
          </span>
        )}
      </div>

      {!hasAiAccess && !analysis && (
        <LockedTeaser needsUpgrade={needsUpgrade} isExpired={isExpired} />
      )}

      {hasAiAccess && !hasProfile && !analysis && (
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <h3 className="font-display font-semibold text-lg">{t("tender.fillProfileTitle")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("tender.fillProfileBody")}
          </p>
          <Link to="/firma"><Button className="mt-4">{t("tender.openProfile")}</Button></Link>
        </div>
      )}

      {hasAiAccess && hasProfile && !analysis && !running && !trialExhausted && (
        <div className="mt-4">
          <Button onClick={() => run(false)} size="lg">
            <Sparkles className="h-4 w-4 mr-2" /> {t("tender.analyzeButton")}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("tender.analyzeHelp")}
            {isTrial && credit && !credit.unlimited && (
              <> {t("tender.trialCreditNote", { limit: credit.limit })}</>
            )}
          </p>
        </div>
      )}

      {hasAiAccess && hasProfile && !analysis && !running && trialExhausted && (
        <TrialExhaustedNotice limit={credit!.limit} isTrial={isTrial} />
      )}

      {running && (
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{t("tender.analyzing")}</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <ol className="mt-4 space-y-1 text-xs text-muted-foreground">
            <li>{t("tender.step1")}</li>
            <li>{t("tender.step2")}</li>
            <li>{t("tender.step3")}</li>
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
          />
          {trialExhausted && (
            <div className="mt-3 rounded-lg border-2 border-primary bg-primary/5 p-3 text-xs">
              {t("tender.trialExhaustedInline")}{" "}
              <WebOnlyPurchase note={t("tender.webOnlyNote")}>
                <Link to="/cennik" className="underline font-semibold">{t("tender.seePlansLink")}</Link> {t("tender.higherQuota")}
              </WebOnlyPurchase>
            </div>

          )}
        </>
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

function TrialExhaustedNotice({ limit, isTrial }: { limit: number; isTrial: boolean }) {
  const { t } = useTranslation("analysis");
  return (
    <div className="mt-4 rounded-lg border-2 border-primary bg-primary/5 p-6">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4 text-primary" />
        {isTrial ? t("tender.trialExhaustedTitle") : t("tender.monthlyExhaustedTitle")}
      </div>
      <p className="mt-2 text-sm text-foreground/80">
        {isTrial
          ? t("tender.trialExhaustedBody", { limit, premiumPrice: formatEur(priceEur("premium")), premiumLimit: AI_MONTHLY_LIMIT.premium, kompletPrice: formatEur(priceEur("komplet")), kompletLimit: AI_MONTHLY_LIMIT.komplet })
          : t("tender.monthlyExhaustedBody", { limit })}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("tender.alreadySavedNote")}
      </p>
      <WebOnlyPurchase className="mt-4">
        <Link to="/cennik" className="mt-4 inline-block">
          <Button>{t("tender.seePlans")}</Button>
        </Link>
      </WebOnlyPurchase>

    </div>
  );
}


function LockedTeaser({ needsUpgrade, isExpired }: { needsUpgrade: boolean; isExpired: boolean }) {
  const { t } = useTranslation("analysis");
  const title = needsUpgrade
    ? t("tender.lockedNeedsUpgradeTitle")
    : t("tender.lockedDemoTitle");
  const cta = needsUpgrade
    ? t("tender.lockedUpgradeCta", { price: formatEur(priceEur("premium")) })
    : t("tender.lockedUnlockCta");
  const body = needsUpgrade
    ? t("tender.lockedUpgradeBody")
    : t("tender.lockedDemoBody");

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
          <WebOnlyPurchase>
            <Link to="/predplatne" search={needsUpgrade ? { tier: "premium" } as never : undefined as never}>
              <Button>{cta}</Button>
            </Link>
          </WebOnlyPurchase>

        </div>
      </div>
    </div>
  );
}

function AnalysisView({ analysis, onRerun, rerunning, locked }: {
  analysis: AnalysisRow; onRerun: () => void; rerunning: boolean; locked: boolean;
}) {
  const { t } = useTranslation("analysis");
  const req = analysis.requirements ?? {};
  const elig = analysis.eligibility ?? {};
  const posudenia: Array<{ podmienka: string; stav: string; vysvetlenie: string }> = elig?.posudenia ?? [];
  const notedCount = countNoted(req);

  return (
    <div className="mt-4 space-y-6">
      {/* Overall recommendation */}
      {elig?.zhrnutie && (
        <div className={`rounded-lg border p-5 ${recommendationClass(analysis.recommendation)}`}>
          <div className="text-xs uppercase tracking-wide font-semibold">{t("tender.recommendation")}</div>
          <div className="mt-1 font-display text-lg font-bold">
            {recommendationLabel(analysis.recommendation, t)}
          </div>
          <p className="mt-2 text-sm">{elig.zhrnutie}</p>
          {elig?.co_chyba && (
            <p className="mt-2 text-sm"><span className="font-medium">{t("tender.whatMissing")}</span>{elig.co_chyba}</p>
          )}
        </div>
      )}

      {/* Summary */}
      {analysis.summary && (
        <section>
          <h3 className="font-display font-semibold">{t("tender.summaryTitle")}</h3>
          <p className="mt-2 whitespace-pre-line text-foreground/90 leading-relaxed">{analysis.summary}</p>
        </section>
      )}

      {/* Requirements */}
      <section>
        <h3 className="font-display font-semibold">{t("tender.requirementsTitle")}</h3>
        <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            [t("tender.reqTurnover"), req.obrat],
            [t("tender.reqReferences"), req.referencie],
            [t("tender.reqCertificates"), req.certifikaty],
            [t("tender.reqTechnicalCapacity"), req.technicka_sposobilost],
            [t("tender.reqPersonnelCapacity"), req.personalna_sposobilost],
            [t("tender.reqGuarantee"), req.zabezpeka],
            [t("tender.reqOther"), req.ostatne],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k as string}</dt>
              <dd className="mt-1 text-sm">{(v as string) || <span className="text-muted-foreground italic">{t("tender.notSpecified")}</span>}</dd>
            </div>
          ))}
        </dl>
        {notedCount >= 4 && (
          <p className="mt-3 text-xs text-muted-foreground rounded border border-dashed border-border p-3">
            <HelpCircle className="inline h-3.5 w-3.5 mr-1" />
            {t("tender.mostlyUnspecifiedNote")}
          </p>
        )}
      </section>

      {/* Eligibility */}
      {posudenia.length > 0 && (
        <section>
          <h3 className="font-display font-semibold">{t("tender.eligibilityTitle")}</h3>
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
            {t("tender.rerunButton")}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {t("tender.disclaimer")}
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

function recommendationLabel(r: string | null, t: (k: string) => string): string {
  if (r === "odporucame") return t("tender.recommendationRecommend");
  if (r === "neodporucame") return t("tender.recommendationNotRecommend");
  if (r === "opatrne") return t("tender.recommendationCautious");
  return t("tender.recommendationEvaluation");
}

function recommendationClass(r: string | null): string {
  if (r === "odporucame") return "border-emerald-600/40 bg-emerald-500/5";
  if (r === "neodporucame") return "border-red-600/40 bg-red-500/5";
  if (r === "opatrne") return "border-amber-500/40 bg-amber-500/5";
  return "border-border bg-card";
}

// ---------- TED structured facts (no AI) ----------
function TedStructuredFacts({ sc }: { sc: StructuredCriteria }) {
  const { t } = useTranslation("analysis");
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
        <div className="eyebrow text-primary">{t("tender.tedEyebrow")}</div>
      </div>

      {award && (
        <section>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Scale className="h-4 w-4" /> {t("tender.tedAwardTitle")}
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
            <ShieldAlert className="h-4 w-4" /> {t("tender.tedExclusionTitle")}
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
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {t("tender.tedSelectionVerifiedTitle")}
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
              {t("tender.tedLanguageNote", { language: sc.language })}
            </p>
          )}
        </section>
      )}

      {inAttachments && (
        <section className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">{t("tender.tedInAttachmentsTitle")}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {t("tender.tedInAttachmentsBody")}
              </div>
            </div>
          </div>
        </section>
      )}

      {(sc.guarantee_required_description || sc.tenderer_legal_form_description) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {sc.guarantee_required_description && (
            <div className="rounded border border-border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("tender.tedGuarantee")}</div>
              <div className="mt-1">{sc.guarantee_required_description}</div>
            </div>
          )}
          {sc.tenderer_legal_form_description && (
            <div className="rounded border border-border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("tender.tedLegalForm")}</div>
              <div className="mt-1">{sc.tenderer_legal_form_description}</div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
