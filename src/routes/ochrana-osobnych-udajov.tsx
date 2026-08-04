import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import { openCookieSettings } from "@/lib/cookie-consent";

export const Route = createFileRoute("/ochrana-osobnych-udajov")({
  head: () => ({
    meta: [
      { title: "Ochrana osobných údajov – Tendrik" },
      {
        name: "description",
        content:
          "Ako Tendrik spracúva osobné údaje, aké cookies používa a ako môžete svoje voľby kedykoľvek zmeniť.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation("legal");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        to="/"
        className="eyebrow text-muted-foreground hover:text-foreground"
      >
        {t("privacy.backHome")}
      </Link>
      <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight">
        {t("privacy.title")}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {t("privacy.intro")}
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {t("privacy.dataSection.heading")}
        </h2>
        <p className="text-sm leading-relaxed">
          {t("privacy.dataSection.text")}
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {t("privacy.cookiesSection.heading")}
        </h2>
        <p className="text-sm leading-relaxed">
          {t("privacy.cookiesSection.intro")}
        </p>
        <ul className="list-disc pl-6 text-sm leading-relaxed space-y-1">
          <li><Trans t={t} i18nKey="privacy.cookiesSection.necessary" components={[<strong />]} /></li>
          <li><Trans t={t} i18nKey="privacy.cookiesSection.analytics" components={[<strong />]} /></li>
        </ul>
        <p className="text-sm">
          <button
            type="button"
            onClick={openCookieSettings}
            className="underline underline-offset-2 hover:text-primary"
          >
            {t("privacy.cookiesSection.openSettingsButton")}
          </button>
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {t("privacy.rightsSection.heading")}
        </h2>
        <p className="text-sm leading-relaxed">
          {t("privacy.rightsSection.text")}
        </p>
      </section>
    </div>
  );
}
