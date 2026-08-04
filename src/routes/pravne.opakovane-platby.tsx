import { createFileRoute } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import { LegalPage } from "@/components/LegalPage";
import { PaymentBadges } from "@/components/LegalFooter";

export const Route = createFileRoute("/pravne/opakovane-platby")({
  head: () => ({
    meta: [
      { title: "Opakované platby – Tendrik" },
      { name: "description", content: "Ako fungujú opakované mesačné platby v službe Tendrik.sk cez platobnú bránu GoPay." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/pravne/opakovane-platby" }],
  }),
  component: Page,
});

function Page() {
  const { t } = useTranslation("legal");
  return (
    <LegalPage title={t("recurringPayments.title")} intro={t("recurringPayments.intro")}>
      <div className="rounded-lg border-2 border-primary bg-primary/5 p-5">
        <div className="eyebrow text-primary">{t("recurringPayments.summary.eyebrow")}</div>
        <ul className="mt-2 space-y-1 text-foreground">
          <li><Trans t={t} i18nKey="recurringPayments.summary.amount" components={[<b />, <b />]} /></li>
          <li><Trans t={t} i18nKey="recurringPayments.summary.frequency" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="recurringPayments.summary.trial" components={[<b />]} /></li>
          <li>{t("recurringPayments.summary.cancel")}</li>
        </ul>
        <PaymentBadges className="mt-4" />
      </div>

      <section>
        <h2>{t("recurringPayments.s1.heading")}</h2>
        <p><Trans t={t} i18nKey="recurringPayments.s1.text" components={[<b />]} /></p>
      </section>

      <section>
        <h2>{t("recurringPayments.s2.heading")}</h2>
        <ul>
          <li><Trans t={t} i18nKey="recurringPayments.s2.basic" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="recurringPayments.s2.premium" components={[<b />]} /></li>
          <li>{t("recurringPayments.s2.vatNote")}</li>
        </ul>
        <p>{t("recurringPayments.s2.changeNotice")}</p>
      </section>

      <section>
        <h2>{t("recurringPayments.s3.heading")}</h2>
        <ul>
          <li><Trans t={t} i18nKey="recurringPayments.s3.first" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="recurringPayments.s3.next" components={[<b />]} /></li>
          <li>{t("recurringPayments.s3.invoice")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("recurringPayments.s4.heading")}</h2>
        <p>{t("recurringPayments.s4.intro")}</p>
        <ol>
          <li><Trans t={t} i18nKey="recurringPayments.s4.way1" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="recurringPayments.s4.way2" components={[<a href="mailto:info@tendrik.sk" />]} /></li>
        </ol>
        <p>{t("recurringPayments.s4.afterCancel")}</p>
      </section>

      <section>
        <h2>{t("recurringPayments.s5.heading")}</h2>
        <p>
          <Trans
            t={t}
            i18nKey="recurringPayments.s5.text"
            components={[<b />, <b />, <b />]}
          />
        </p>
      </section>

      <section>
        <h2>{t("recurringPayments.s6.heading")}</h2>
        <p>
          <Trans
            t={t}
            i18nKey="recurringPayments.s6.text"
            components={[<a href="mailto:info@tendrik.sk" />, <a href="tel:+421907702422" />]}
          />
        </p>
      </section>
    </LegalPage>
  );
}
