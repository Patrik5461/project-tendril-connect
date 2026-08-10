import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { getWhatsAppUrl } from "@/lib/whatsapp";

export function PaymentBadges({ className = "" }: { className?: string }) {
  const { t } = useTranslation("legal");
  return (
    <div className={"flex flex-wrap items-center gap-2 " + className} aria-label={t("footer.paymentBadgesAria")}>
      <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
        GoPay
      </span>
      <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
        VISA
      </span>
      <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
        Mastercard
      </span>
      <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
        3D&nbsp;Secure
      </span>
    </div>
  );
}

export function LegalFooter() {
  const { t } = useTranslation(["legal", "public"]);
  return (
    <footer className="mt-16 border-t-2 border-foreground bg-background">
      <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <div className="font-display font-bold text-foreground">Tendrik.sk</div>
          <p className="mt-2 text-muted-foreground">
            {t("footer.brandDescription")}
          </p>
          <p className="mt-3 text-muted-foreground">
            {t("footer.operator")}<br />
            <b className="text-foreground">Tobify s. r. o.</b><br />
            Športová 707/43<br />
            919 26 Zavar, SR<br />
            IČO: 56607016<br />
            {t("footer.vatFree")}
          </p>
        </div>
        <div>
          <div className="eyebrow text-foreground">{t("footer.contact")}</div>
          <ul className="mt-3 space-y-1.5 text-muted-foreground">
            <li>
              <a href="mailto:info@tendrik.sk" className="hover:text-foreground">info@tendrik.sk</a>
            </li>
            <li>
              <a href="tel:+421902067956" className="hover:text-foreground">+421 902 067 956</a>
            </li>
            <li>
              <a
                href={getWhatsAppUrl(t("public:whatsapp.message"))}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                {t("footer.whatsapp")}
              </a>
            </li>
            <li>
              <Link to="/kontakt" className="hover:text-foreground">{t("footer.contactForm")}</Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="eyebrow text-foreground">{t("footer.legal")}</div>
          <ul className="mt-3 space-y-1.5 text-muted-foreground">
            <li><Link to="/pravne/obchodne-podmienky" className="hover:text-foreground">{t("footer.terms")}</Link></li>
            <li><Link to="/pravne/opakovane-platby" className="hover:text-foreground">{t("footer.recurringPayments")}</Link></li>
            <li><Link to="/pravne/gdpr" className="hover:text-foreground">{t("footer.gdpr")}</Link></li>
            <li><Link to="/pravne/reklamacny-poriadok" className="hover:text-foreground">{t("footer.complaints")}</Link></li>
            <li><Link to="/pravne/cookies" className="hover:text-foreground">{t("footer.cookies")}</Link></li>
          </ul>
        </div>
        <div>
          <div className="eyebrow text-foreground">{t("footer.payments")}</div>
          <PaymentBadges className="mt-3" />
          <p className="mt-3 text-xs text-muted-foreground">
            {t("footer.paymentsNote")}
          </p>
        </div>
      </div>
      <div className="border-t border-border py-4 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col md:flex-row items-start md:items-center justify-between gap-2 px-4">
          <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
          <span>{t("footer.tagline")}</span>
        </div>
      </div>
    </footer>
  );
}
