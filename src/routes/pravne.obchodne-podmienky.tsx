import { createFileRoute } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/pravne/obchodne-podmienky")({
  head: () => ({
    meta: [
      { title: "Obchodné podmienky – Tendrik" },
      { name: "description", content: "Obchodné podmienky služby Tendrik.sk – monitoring verejného obstarávania. Prevádzkovateľ Tobify s. r. o." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/pravne/obchodne-podmienky" }],
  }),
  component: Page,
});

function Page() {
  const { t } = useTranslation("legal");
  return (
    <LegalPage title={t("terms.title")} intro={t("terms.intro")}>
      <section>
        <h2>{t("terms.s1.heading")}</h2>
        <p>{t("terms.s1.p")}</p>
        <ul>
          <li><Trans t={t} i18nKey="terms.s1.company" components={[<b />]} /></li>
          <li>{t("terms.s1.seat")}</li>
          <li>{t("terms.s1.ico")}</li>
          <li>{t("terms.s1.dic")}</li>
          <li>{t("terms.s1.vat")}</li>
          <li><Trans t={t} i18nKey="terms.s1.email" components={[<a href="mailto:info@tendrik.sk" />]} /></li>
          <li><Trans t={t} i18nKey="terms.s1.phone" components={[<a href="tel:+421902067956" />]} /></li>
        </ul>
        <p><Trans t={t} i18nKey="terms.s1.vatNote" components={[<b />]} /></p>
      </section>

      <section>
        <h2>{t("terms.s2.heading")}</h2>
        <p>{t("terms.s2.p")}</p>
        <ul>
          <li>{t("terms.s2.item1")}</li>
          <li>{t("terms.s2.item2")}</li>
          <li>{t("terms.s2.item3")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("terms.s3.heading")}</h2>
        <p>{t("terms.s3.p")}</p>
        <ul>
          <li><Trans t={t} i18nKey="terms.s3.basic" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="terms.s3.premium" components={[<b />]} /></li>
          <li><Trans t={t} i18nKey="terms.s3.vatNote" components={[<b />]} /></li>
        </ul>
        <p>
          <Trans
            t={t}
            i18nKey="terms.s3.payment"
            components={[<b />, <a href="/pravne/opakovane-platby" />]}
          />
        </p>
      </section>

      <section>
        <h2>{t("terms.s4.heading")}</h2>
        <p><Trans t={t} i18nKey="terms.s4.text" components={[<b />, <b />]} /></p>
      </section>

      <section>
        <h2>{t("terms.s5.heading")}</h2>
        <p>{t("terms.s5.text")}</p>
      </section>

      <section>
        <h2>{t("terms.s6.heading")}</h2>
        <p>
          <Trans t={t} i18nKey="terms.s6.text" components={[<b />, <a href="mailto:info@tendrik.sk" />]} />
        </p>
      </section>

      <section>
        <h2>{t("terms.s7.heading")}</h2>
        <p>
          <Trans
            t={t}
            i18nKey="terms.s7.text"
            components={[<b />, <a href="mailto:info@tendrik.sk" />, <b />]}
          />
        </p>
      </section>

      <section>
        <h2>{t("terms.s8.heading")}</h2>
        <p>
          <Trans
            t={t}
            i18nKey="terms.s8.text"
            components={[<a href="mailto:info@tendrik.sk" />, <b />, <a href="/pravne/reklamacny-poriadok" />]}
          />
        </p>
      </section>

      <section>
        <h2>{t("terms.s9.heading")}</h2>
        <p>{t("terms.s9.text")}</p>
      </section>

      <section>
        <h2>{t("terms.s10.heading")}</h2>
        <p>
          <Trans t={t} i18nKey="terms.s10.text" components={[<a href="/pravne/gdpr" />]} />
        </p>
      </section>

      <section>
        <h2>{t("terms.s11.heading")}</h2>
        <p>
          <Trans
            t={t}
            i18nKey="terms.s11.text"
            components={[
              <a href="https://www.soi.sk" target="_blank" rel="noreferrer" />,
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" />,
            ]}
          />
        </p>
      </section>

      <section>
        <h2>{t("terms.s12.heading")}</h2>
        <p>{t("terms.s12.text")}</p>
      </section>
    </LegalPage>
  );
}
