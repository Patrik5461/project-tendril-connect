import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useIsNative } from "@/lib/native";

import { Button } from "@/components/ui/button";
import { LegalFooter, PaymentBadges } from "@/components/LegalFooter";
import { Check, Sparkles, X } from "lucide-react";
import {
  AI_MONTHLY_LIMIT, TRIAL_AI_ANALYSES, TRIAL_DAYS, formatEur,
  monthlyEquivalentEur, priceEur, tierLabel,
  type BillingPeriod, type SubscriptionTier,
} from "@/lib/subscription";

export const Route = createFileRoute("/cennik")({
  head: () => ({
    meta: [
      { title: "Cenník – Tendrik" },
      {
        name: "description",
        content:
          "Základ 4,99 €/mes (monitoring zákaziek), Prémium 14,99 €/mes s AI analýzou, Komplet 24,99 €/mes so zákazkami aj grantmi. 30 dní zdarma.",
      },
      { property: "og:title", content: "Cenník – Tendrik" },
      {
        property: "og:description",
        content: "Tri plány pre monitoring verejných zákaziek a grantových výziev. 30 dní zdarma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/cennik" }],
  }),
  component: CennikPage,
});

type PlanDef = {
  tier: SubscriptionTier;
  subtitleKey: string;
  highlight?: boolean;
  badgeKey?: string;
  features: { key: string; text?: string; ok: boolean; ai?: boolean }[];
};

const PLANS: PlanDef[] = [
  {
    tier: "basic",
    subtitleKey: "cennik.planSubtitle.basic",
    features: [
      { key: "unlimitedRadars", ok: true },
      { key: "dailyDigests", ok: true },
      { key: "deadlineReminders", ok: true },
      { key: "sourcesCombined", ok: true },
      { key: "noAi", ok: false },
      { key: "noGrants", ok: false },
    ],
  },
  {
    tier: "premium",
    subtitleKey: "cennik.planSubtitle.premium",
    highlight: true,
    badgeKey: "cennik.planBadge.premium",
    features: [
      { key: "everythingBasic", ok: true },
      { key: "aiAnalysesMonthly", ok: true, ai: true },
      { key: "aiTenderAnalysis", ok: true, ai: true },
      { key: "aiSubcontracting", ok: true, ai: true },
      { key: "tedStructured", ok: true },
      { key: "noGrants", ok: false },
    ],
  },
  {
    tier: "komplet",
    subtitleKey: "cennik.planSubtitle.komplet",
    badgeKey: "cennik.planBadge.komplet",
    features: [
      { key: "everythingPremium", ok: true },
      { key: "grantCalls", ok: true },
      { key: "grantRadars", ok: true },
      { key: "aiGrantAnalysis", ok: true, ai: true },
      { key: "aiAnalysesMonthly", ok: true, ai: true },
      { key: "prioritySupport", ok: true },
    ],
  },
];

const COMPARISON_KEYS = [
  "publicMonitoring",
  "grantCalls",
  "aiAnalysesMonthly",
  "aiSubcontracting",
  "digestsReminders",
  "support",
] as const;

function CennikPage() {
  const { t } = useTranslation("public");
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const yearly = period === "yearly";
  const native = useIsNative();

  const COMPARISON: { label: string; values: Record<SubscriptionTier, string> }[] = [
    {
      label: t("cennik.comparisonRows.publicMonitoring"),
      values: { basic: t("cennik.yes"), premium: t("cennik.yes"), komplet: t("cennik.yes") },
    },
    {
      label: t("cennik.comparisonRows.grantCalls"),
      values: { basic: t("cennik.no"), premium: t("cennik.no"), komplet: t("cennik.yes") },
    },
    {
      label: t("cennik.comparisonRows.aiAnalysesMonthly"),
      values: {
        basic: t("cennik.no"),
        premium: String(AI_MONTHLY_LIMIT.premium),
        komplet: String(AI_MONTHLY_LIMIT.komplet),
      },
    },
    {
      label: t("cennik.comparisonRows.aiSubcontracting"),
      values: { basic: t("cennik.no"), premium: t("cennik.yes"), komplet: t("cennik.yes") },
    },
    {
      label: t("cennik.comparisonRows.digestsReminders"),
      values: { basic: t("cennik.yes"), premium: t("cennik.yes"), komplet: t("cennik.yes") },
    },
    {
      label: t("cennik.comparisonRows.support"),
      values: { basic: t("cennik.supportStandard"), premium: t("cennik.supportStandard"), komplet: t("cennik.supportPriority") },
    },
  ];

  if (native) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center safe-top">
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("cennik.nativeTitle")}</h1>
        <p className="mt-4 text-sm text-muted-foreground">{t("cennik.nativeNote")}</p>
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display font-bold text-xl">
            <span className="inline-flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground font-display font-bold">T</span>
            Tendrik
          </Link>
          <Link to="/" className="eyebrow text-muted-foreground hover:text-foreground">{t("cennik.backToHome")}</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-14">
        <div className="eyebrow flex items-center text-foreground">
          <span className="red-square" aria-hidden="true" /> {t("cennik.eyebrow")}
        </div>
        <h1 className="mt-4 font-display text-4xl md:text-5xl font-bold tracking-tight">
          <Trans i18nKey="cennik.heading" ns="public" components={{ underline: <span className="hero-underline" /> }} />
        </h1>
        <p className="mt-4 text-lg text-foreground/80">
          {t("cennik.subheading", { days: TRIAL_DAYS })}
        </p>

        {/* Prepínač obdobia */}
        <div className="mt-8 inline-flex items-center border-2 border-foreground p-1">
          <button
            type="button"
            onClick={() => setPeriod("monthly")}
            className={`px-4 py-2 text-sm font-semibold ${!yearly ? "bg-foreground text-background" : "text-foreground"}`}
          >
            {t("cennik.periodMonthly")}
          </button>
          <button
            type="button"
            onClick={() => setPeriod("yearly")}
            className={`px-4 py-2 text-sm font-semibold ${yearly ? "bg-foreground text-background" : "text-foreground"}`}
          >
            {t("cennik.periodYearly")} <span className="text-primary">{t("cennik.periodYearlyDiscount")}</span>
          </button>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const price = yearly ? monthlyEquivalentEur(plan.tier) : priceEur(plan.tier, "monthly");
            return (
              <div
                key={plan.tier}
                className={`rounded-lg bg-card p-6 flex flex-col relative ${
                  plan.highlight ? "border-2 border-primary" : "border border-border"
                }`}
              >
                {plan.badgeKey && (
                  <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider px-2 py-0.5">
                    {t(plan.badgeKey)}
                  </span>
                )}
                <div className={`eyebrow ${plan.highlight ? "text-primary" : ""}`}>{tierLabel(plan.tier)}</div>
                <h2 className="mt-2 font-display text-2xl font-bold">{t(plan.subtitleKey)}</h2>
                <p className="mt-4 num text-4xl font-bold">
                  {formatEur(price)}{" "}
                  <span className="text-base font-medium text-muted-foreground">{t("cennik.priceSuffixMonth")}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {yearly
                    ? t("cennik.finalPriceYearly", { price: formatEur(priceEur(plan.tier, "yearly")) })
                    : t("cennik.finalPriceMonthly")}
                </p>
                <ul className="mt-6 space-y-2 text-sm flex-1">
                  {plan.features.map((f) => (
                    <li key={f.key} className={`flex gap-2 ${f.ok ? "" : "text-muted-foreground"}`}>
                      {f.ok
                        ? f.ai
                          ? <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          : <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        : <X className="h-4 w-4 mt-0.5 shrink-0" />}
                      {f.key === "aiAnalysesMonthly"
                        ? t(`cennik.features.${f.key}`, { count: AI_MONTHLY_LIMIT[plan.tier as "premium" | "komplet"] })
                        : t(`cennik.features.${f.key}`)}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/predplatne"
                  search={{ tier: plan.tier, period }}
                  className="mt-6 block"
                >
                  <Button variant={plan.highlight ? "default" : "outline"} className="w-full">
                    {t("cennik.selectPlan", { tier: tierLabel(plan.tier) })}
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>

        <PaymentBadges className="mt-6 justify-center" />


        {/* Porovnanie */}
        <h2 className="mt-14 font-display text-2xl font-bold">{t("cennik.comparisonTitle")}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-foreground text-left">
                <th className="py-3 pr-4 font-semibold">{t("cennik.comparisonHeaders.feature")}</th>
                <th className="py-3 px-4 font-semibold">{t("cennik.comparisonHeaders.basic")}</th>
                <th className="py-3 px-4 font-semibold text-primary">{t("cennik.comparisonHeaders.premium")}</th>
                <th className="py-3 px-4 font-semibold">{t("cennik.comparisonHeaders.komplet")}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-border">
                  <td className="py-3 pr-4">{row.label}</td>
                  <td className="py-3 px-4">{row.values.basic}</td>
                  <td className="py-3 px-4">{row.values.premium}</td>
                  <td className="py-3 px-4">{row.values.komplet}</td>
                </tr>
              ))}
              <tr className="border-b border-border">
                <td className="py-3 pr-4 font-semibold">{t("cennik.priceMonthlyLabel")}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("basic", "monthly"))}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("premium", "monthly"))}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("komplet", "monthly"))}</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-semibold">{t("cennik.priceYearlyLabel")}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("basic", "yearly"))}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("premium", "yearly"))}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("komplet", "yearly"))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-10 rounded-lg border-2 border-primary bg-primary/5 p-4 text-sm">
          <b className="text-primary">{t("cennik.trialBoxTitle", { days: TRIAL_DAYS })}</b>{" "}
          {t("cennik.trialBoxText", { count: TRIAL_AI_ANALYSES })}
        </div>

        <div className="mt-6 rounded-lg border-2 border-foreground/20 bg-background p-4 text-sm">
          <b>{t("cennik.paymentsBoxTitle")}</b>{" "}
          <Trans
            i18nKey="cennik.paymentsBoxText"
            ns="public"
            components={{ b: <b />, b2: <b />, link: <Link to="/pravne/opakovane-platby" className="underline" /> }}
          />
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          <Trans
            i18nKey="cennik.operatorNote"
            ns="public"
            components={{
              terms: <Link to="/pravne/obchodne-podmienky" className="underline" />,
              recurring: <Link to="/pravne/opakovane-platby" className="underline" />,
            }}
          />
        </p>
      </main>

      <LegalFooter />
    </div>
  );
}
