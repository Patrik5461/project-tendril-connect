import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
  subtitle: string;
  highlight?: boolean;
  badge?: string;
  features: { text: string; ok: boolean; ai?: boolean }[];
};

const PLANS: PlanDef[] = [
  {
    tier: "basic",
    subtitle: "Monitoring zákaziek",
    features: [
      { text: "Neobmedzené radary a filtre pre zákazky", ok: true },
      { text: "Denné e-mailové digesty", ok: true },
      { text: "Pripomienky pred deadline", ok: true },
      { text: "TED, ÚVO, EKS a JOSEPHINE v jednom", ok: true },
      { text: "Bez AI analýzy", ok: false },
      { text: "Bez grantových výziev", ok: false },
    ],
  },
  {
    tier: "premium",
    subtitle: "Zákazky + AI analýza",
    highlight: true,
    badge: "Najobľúbenejšie",
    features: [
      { text: "Všetko zo Základu", ok: true },
      { text: `${AI_MONTHLY_LIMIT.premium} AI analýz mesačne`, ok: true, ai: true },
      { text: "AI analýza zákazky a spôsobilosti", ok: true, ai: true },
      { text: "AI návrh subdodávok a oslovení", ok: true, ai: true },
      { text: "TED podmienky štruktúrovane", ok: true },
      { text: "Bez grantových výziev", ok: false },
    ],
  },
  {
    tier: "komplet",
    subtitle: "Zákazky + granty + AI",
    badge: "Zákazky aj granty",
    features: [
      { text: "Všetko z Prémia", ok: true },
      { text: "Grantové výzvy (eurofondy, Program Slovensko)", ok: true },
      { text: "Radary a notifikácie pre granty", ok: true },
      { text: "AI analýza grantových výziev", ok: true, ai: true },
      { text: `${AI_MONTHLY_LIMIT.komplet} AI analýz mesačne`, ok: true, ai: true },
      { text: "Prioritná podpora", ok: true },
    ],
  },
];

const COMPARISON: { label: string; values: Record<SubscriptionTier, string> }[] = [
  {
    label: "Monitoring verejných zákaziek",
    values: { basic: "Áno", premium: "Áno", komplet: "Áno" },
  },
  {
    label: "Grantové výzvy a dotácie",
    values: { basic: "—", premium: "—", komplet: "Áno" },
  },
  {
    label: "AI analýzy mesačne",
    values: {
      basic: "—",
      premium: String(AI_MONTHLY_LIMIT.premium),
      komplet: String(AI_MONTHLY_LIMIT.komplet),
    },
  },
  {
    label: "AI subdodávky a oslovenia",
    values: { basic: "—", premium: "Áno", komplet: "Áno" },
  },
  {
    label: "E-mailové digesty a pripomienky",
    values: { basic: "Áno", premium: "Áno", komplet: "Áno" },
  },
  {
    label: "Podpora",
    values: { basic: "Štandardná", premium: "Štandardná", komplet: "Prioritná" },
  },
];

function CennikPage() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const yearly = period === "yearly";
  const native = useIsNative();

  if (native) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center safe-top">
        <h1 className="font-display text-2xl font-bold tracking-tight">Predplatné</h1>
        <p className="mt-4 text-sm text-muted-foreground">Predplatné spravuješ na tendrik.sk</p>
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
          <Link to="/" className="eyebrow text-muted-foreground hover:text-foreground">← Späť na úvod</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-14">
        <div className="eyebrow flex items-center text-foreground">
          <span className="red-square" aria-hidden="true" /> Cenník
        </div>
        <h1 className="mt-4 font-display text-4xl md:text-5xl font-bold tracking-tight">
          Tri plány. <span className="hero-underline">Vy si vyberáte.</span>
        </h1>
        <p className="mt-4 text-lg text-foreground/80">
          {TRIAL_DAYS} dní zdarma na vyskúšanie. Potom si vyberiete Základ, Prémium alebo Komplet.
        </p>

        {/* Prepínač obdobia */}
        <div className="mt-8 inline-flex items-center border-2 border-foreground p-1">
          <button
            type="button"
            onClick={() => setPeriod("monthly")}
            className={`px-4 py-2 text-sm font-semibold ${!yearly ? "bg-foreground text-background" : "text-foreground"}`}
          >
            Mesačne
          </button>
          <button
            type="button"
            onClick={() => setPeriod("yearly")}
            className={`px-4 py-2 text-sm font-semibold ${yearly ? "bg-foreground text-background" : "text-foreground"}`}
          >
            Ročne <span className="text-primary">−2 mesiace</span>
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
                {plan.badge && (
                  <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider px-2 py-0.5">
                    {plan.badge}
                  </span>
                )}
                <div className={`eyebrow ${plan.highlight ? "text-primary" : ""}`}>{tierLabel(plan.tier)}</div>
                <h2 className="mt-2 font-display text-2xl font-bold">{plan.subtitle}</h2>
                <p className="mt-4 num text-4xl font-bold">
                  {formatEur(price)}{" "}
                  <span className="text-base font-medium text-muted-foreground">/ mes</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {yearly
                    ? `Konečná cena · ${formatEur(priceEur(plan.tier, "yearly"))} ročne, jednorazovo`
                    : "Konečná cena · fakturované mesačne"}
                </p>
                <ul className="mt-6 space-y-2 text-sm flex-1">
                  {plan.features.map((f) => (
                    <li key={f.text} className={`flex gap-2 ${f.ok ? "" : "text-muted-foreground"}`}>
                      {f.ok
                        ? f.ai
                          ? <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          : <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        : <X className="h-4 w-4 mt-0.5 shrink-0" />}
                      {f.text}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/predplatne"
                  search={{ tier: plan.tier, period }}
                  className="mt-6 block"
                >
                  <Button variant={plan.highlight ? "default" : "outline"} className="w-full">
                    Vybrať {tierLabel(plan.tier)}
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>

        <PaymentBadges className="mt-6 justify-center" />


        {/* Porovnanie */}
        <h2 className="mt-14 font-display text-2xl font-bold">Porovnanie plánov</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-foreground text-left">
                <th className="py-3 pr-4 font-semibold">Funkcia</th>
                <th className="py-3 px-4 font-semibold">Základ</th>
                <th className="py-3 px-4 font-semibold text-primary">Prémium</th>
                <th className="py-3 px-4 font-semibold">Komplet</th>
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
                <td className="py-3 pr-4 font-semibold">Cena mesačne</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("basic", "monthly"))}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("premium", "monthly"))}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("komplet", "monthly"))}</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-semibold">Cena ročne</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("basic", "yearly"))}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("premium", "yearly"))}</td>
                <td className="py-3 px-4 num">{formatEur(priceEur("komplet", "yearly"))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-10 rounded-lg border-2 border-primary bg-primary/5 p-4 text-sm">
          <b className="text-primary">{TRIAL_DAYS} dní zdarma:</b> Vyskúšajte monitoring zákaziek,
          grantov, radary a e-maily neobmedzene a AI analýzu ({TRIAL_AI_ANALYSES} analýz zdarma).
          Po skončení trialu si vyberiete plán.
        </div>

        <div className="mt-6 rounded-lg border-2 border-foreground/20 bg-background p-4 text-sm">
          <b>Platby:</b> Mesačné predplatné sa môže <b>automaticky obnovovať</b> cez platobnú bránu
          GoPay. Ročné predplatné je <b>jednorazová platba na 12 mesiacov</b>. Zrušenie kedykoľvek
          v nastaveniach účtu. Podrobnosti v{" "}
          <Link to="/pravne/opakovane-platby" className="underline">Opakované platby</Link>.
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Prevádzkovateľ: Tobify s. r. o., IČO 56607016 (neplatca DPH). Platby spracúva
          GoPay s. r. o. Podmienky:{" "}
          <Link to="/pravne/obchodne-podmienky" className="underline">Obchodné podmienky</Link> ·{" "}
          <Link to="/pravne/opakovane-platby" className="underline">Opakované platby</Link>.
        </p>
      </main>

      <LegalFooter />
    </div>
  );
}
