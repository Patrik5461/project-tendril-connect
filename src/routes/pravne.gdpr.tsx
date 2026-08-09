import { createFileRoute } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/pravne/gdpr")({
  head: () => ({
    meta: [
      { title: "GDPR – ochrana osobných údajov – Tendrik" },
      { name: "description", content: "Ako Tendrik.sk (Tobify s. r. o.) spracúva osobné údaje v súlade s nariadením GDPR." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/pravne/gdpr" }],
  }),
  component: Page,
});

function Page() {
  const { t } = useTranslation("legal");
  return (
    <LegalPage title={t("gdpr.title")} intro={t("gdpr.intro")}>
      <section>
        <h2>{t("gdpr.s1.heading")}</h2>
        <ul>
          <li><Trans t={t} i18nKey="gdpr.s1.company" components={[<b />]} /></li>
          <li>{t("gdpr.s1.ico")}</li>
          <li><Trans t={t} i18nKey="gdpr.s1.email" components={[<a href="mailto:info@tendrik.sk" />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s1.phone" components={[<a href="tel:+421902067956" />]} /></li>
        </ul>
      </section>

      <section>
        <h2>{t("gdpr.s2.heading")}</h2>
        <ul>
          <li><Trans t={t} i18nKey="gdpr.s2.reg" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s2.optional" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s2.billing" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s2.payment" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s2.prefs" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s2.technical" components={[<b />, <a href="/pravne/cookies" />]} /></li>
        </ul>
      </section>

      <section>
        <h2>{t("gdpr.s3.heading")}</h2>
        <ul>
          <li><Trans t={t} i18nKey="gdpr.s3.contract" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s3.legalObligation" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s3.legitimateInterest" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s3.consent" components={[<b />]} /></li>
        </ul>
      </section>

      <section>
        <h2>{t("gdpr.s4.heading")}</h2>
        <ul>
          <li>{t("gdpr.s4.account")}</li>
          <li>{t("gdpr.s4.invoices")}</li>
          <li>{t("gdpr.s4.analytics")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("gdpr.s5.heading")}</h2>
        <ul>
          <li><Trans t={t} i18nKey="gdpr.s5.supabase" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s5.gopay" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="gdpr.s5.resend" components={[<b />]} /></li>
          <li>{t("gdpr.s5.accounting")}</li>
        </ul>
        <p>{t("gdpr.s5.noTransfer")}</p>
      </section>

      <section>
        <h2>{t("gdpr.s6.heading")}</h2>
        <p>{t("gdpr.s6.intro")}</p>
        <ul>
          <li>{t("gdpr.s6.access")}</li>
          <li>{t("gdpr.s6.correction")}</li>
          <li>{t("gdpr.s6.erasure")}</li>
          <li>{t("gdpr.s6.restriction")}</li>
          <li>{t("gdpr.s6.portability")}</li>
          <li>{t("gdpr.s6.object")}</li>
          <li>{t("gdpr.s6.withdraw")}</li>
          <li>
            <Trans
              t={t}
              i18nKey="gdpr.s6.complaint"
              components={[<b />, <a href="https://dataprotection.gov.sk" target="_blank" rel="noreferrer" />]}
            />
          </li>
        </ul>
        <p><Trans t={t} i18nKey="gdpr.s6.exercise" components={[<a href="mailto:info@tendrik.sk" />]} /></p>
      </section>

      <section>
        <h2>{t("gdpr.s7.heading")}</h2>
        <p><Trans t={t} i18nKey="gdpr.s7.text" components={[<a href="mailto:info@tendrik.sk" />]} /></p>
      </section>

      <section>
        <h2>{t("gdpr.s8.heading")}</h2>
        <p>{t("gdpr.s8.text")}</p>
      </section>
    </LegalPage>
  );
}
