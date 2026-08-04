import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LegalFooter, PaymentBadges } from "@/components/LegalFooter";
import { Check, Info } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

export const Route = createFileRoute("/objednavka")({
  head: () => ({
    meta: [
      { title: "Objednávka predplatného – Tendrik" },
      { name: "description", content: "Objednajte si Tendrik Premium za 14,99 € mesačne. 30 dní zdarma na vyskúšanie. Platba cez GoPay." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/objednavka" }],
  }),
  component: ObjednavkaPage,
});

function ObjednavkaPage() {
  const { t } = useTranslation("public");
  const [plan, setPlan] = useState<"trial" | "premium">("premium");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display font-bold text-xl">
            <span className="inline-flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground font-display font-bold">T</span>
            Tendrik
          </Link>
          <Link to="/" className="eyebrow text-muted-foreground hover:text-foreground">{t("objednavka.backToHome")}</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="eyebrow flex items-center text-foreground">
          <span className="red-square" aria-hidden="true" /> {t("objednavka.eyebrow")}
        </div>
        <h1 className="mt-4 font-display text-3xl md:text-5xl font-bold tracking-tight">
          {t("objednavka.heading")}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {t("objednavka.subheading")}
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setPlan("trial")}
            className={`text-left rounded-lg border-2 p-6 transition ${plan === "trial" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-foreground/40"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="eyebrow">{t("objednavka.trialEyebrow")}</div>
                <div className="mt-1 font-display text-2xl font-bold">{t("objednavka.trialTitle")}</div>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 ${plan === "trial" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
            </div>
            <p className="mt-2 num text-3xl font-bold">{t("objednavka.trialPrice")}</p>
            <p className="text-sm text-muted-foreground">{t("objednavka.trialNote")}</p>
          </button>

          <button
            type="button"
            onClick={() => setPlan("premium")}
            className={`text-left rounded-lg border-2 p-6 transition ${plan === "premium" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-foreground/40"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="eyebrow text-primary">{t("objednavka.premiumEyebrow")}</div>
                <div className="mt-1 font-display text-2xl font-bold">{t("objednavka.premiumTitle")}</div>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 ${plan === "premium" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
            </div>
            <p className="mt-2 num text-3xl font-bold">14,99 € <span className="text-base font-medium text-muted-foreground">{t("objednavka.premiumPriceSuffix")}</span></p>
            <p className="text-sm text-muted-foreground">{t("objednavka.premiumNote")}</p>
          </button>
        </div>

        <div className="mt-8 rounded-lg border-2 border-primary bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <b className="text-primary">{t("objednavka.recurringNoticeTitle")}</b>{" "}
              <Trans
                i18nKey="objednavka.recurringNoticeText"
                ns="public"
                components={{
                  b: <b />,
                  mail: <a href="mailto:info@tendrik.sk" className="underline" />,
                  recurring: <Link to="/pravne/opakovane-platby" className="underline" />,
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">{t("objednavka.summaryEyebrow")}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {plan === "trial" ? t("objednavka.summaryTrial") : t("objednavka.summaryPremium")}
              </p>
            </div>
            <p className="num text-2xl font-bold">
              {plan === "trial" ? t("objednavka.summaryTrialPrice") : t("objednavka.summaryPremiumPrice")}
            </p>
          </div>
          {plan === "premium" && (
            <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary" />{t("objednavka.featureFinalPrice")}</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary" />{t("objednavka.featureNoVat")}</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary" />{t("objednavka.featureGopay")}</li>
            </ul>
          )}
          <PaymentBadges className="mt-4" />
          <Link to="/auth" search={{ mode: "signup" }} className="mt-6 block">
            <Button className="w-full" size="lg">
              {plan === "trial" ? t("objednavka.ctaTrial") : t("objednavka.ctaPremium")}
            </Button>
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            <Trans
              i18nKey="objednavka.agreementNote"
              ns="public"
              components={{
                terms: <Link to="/pravne/obchodne-podmienky" className="underline" />,
                recurring: <Link to="/pravne/opakovane-platby" className="underline" />,
                gdpr: <Link to="/pravne/gdpr" className="underline" />,
              }}
            />
          </p>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          <Trans i18nKey="objednavka.sellerNote" ns="public" components={{ b: <b /> }} />
        </p>
      </main>

      <LegalFooter />
    </div>
  );
}
