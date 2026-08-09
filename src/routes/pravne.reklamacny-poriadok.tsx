import { createFileRoute } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/pravne/reklamacny-poriadok")({
  head: () => ({
    meta: [
      { title: "Reklamačný poriadok – Tendrik" },
      { name: "description", content: "Ako reklamovať službu Tendrik.sk. Lehota vybavenia 30 dní." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/pravne/reklamacny-poriadok" }],
  }),
  component: Page,
});

function Page() {
  const { t } = useTranslation("legal");
  return (
    <LegalPage title={t("complaints.title")} intro={t("complaints.intro")}>
      <section>
        <h2>{t("complaints.s1.heading")}</h2>
        <p>
          <Trans
            t={t}
            i18nKey="complaints.s1.text"
            components={[<b />, <a href="mailto:info@tendrik.sk" />, <a href="tel:+421902067956" />]}
          />
        </p>
      </section>

      <section>
        <h2>{t("complaints.s2.heading")}</h2>
        <p>{t("complaints.s2.intro")}</p>
        <ul>
          <li>{t("complaints.s2.item1")}</li>
          <li>{t("complaints.s2.item2")}</li>
          <li>{t("complaints.s2.item3")}</li>
          <li>{t("complaints.s2.item4")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("complaints.s3.heading")}</h2>
        <p>{t("complaints.s3.intro")}</p>
        <ul>
          <li><Trans t={t} i18nKey="complaints.s3.email" components={[<b />, <a href="mailto:info@tendrik.sk" />]} /></li>
          <li><Trans t={t} i18nKey="complaints.s3.post" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="complaints.s3.phone" components={[<b />, <a href="tel:+421902067956" />]} /></li>
        </ul>
        <p>{t("complaints.s3.note")}</p>
      </section>

      <section>
        <h2>{t("complaints.s4.heading")}</h2>
        <ul>
          <li><Trans t={t} i18nKey="complaints.s4.confirm" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="complaints.s4.resolve" components={[<b />]} /></li>
          <li>{t("complaints.s4.notify")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("complaints.s5.heading")}</h2>
        <ul>
          <li>{t("complaints.s5.item1")}</li>
          <li>{t("complaints.s5.item2")}</li>
          <li>{t("complaints.s5.item3")}</li>
          <li>{t("complaints.s5.item4")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("complaints.s6.heading")}</h2>
        <p>
          <Trans
            t={t}
            i18nKey="complaints.s6.text"
            components={[
              <a href="https://www.soi.sk" target="_blank" rel="noreferrer" />,
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" />,
            ]}
          />
        </p>
      </section>
    </LegalPage>
  );
}
