import { Link } from "@tanstack/react-router";

export function PaymentBadges({ className = "" }: { className?: string }) {
  return (
    <div className={"flex flex-wrap items-center gap-2 " + className} aria-label="Podporované spôsoby platby">
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
  return (
    <footer className="mt-16 border-t-2 border-foreground bg-background">
      <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <div className="font-display font-bold text-foreground">Tendrik.sk</div>
          <p className="mt-2 text-muted-foreground">
            Monitoring verejného obstarávania z TED, ÚVO, EKS a JOSEPHINE.
          </p>
          <p className="mt-3 text-muted-foreground">
            Prevádzkovateľ:<br />
            <b className="text-foreground">Tobify s. r. o.</b><br />
            Športová 707/43<br />
            919 26 Zavar, SR<br />
            IČO: 56607016<br />
            Neplatiteľ DPH
          </p>
        </div>
        <div>
          <div className="eyebrow text-foreground">Kontakt</div>
          <ul className="mt-3 space-y-1.5 text-muted-foreground">
            <li>
              <a href="mailto:info@tendrik.sk" className="hover:text-foreground">info@tendrik.sk</a>
            </li>
            <li>
              <a href="tel:+421907702422" className="hover:text-foreground">+421 907 702 422</a>
            </li>
            <li>
              <Link to="/kontakt" className="hover:text-foreground">Kontaktný formulár</Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="eyebrow text-foreground">Právne</div>
          <ul className="mt-3 space-y-1.5 text-muted-foreground">
            <li><Link to="/pravne/obchodne-podmienky" className="hover:text-foreground">Obchodné podmienky</Link></li>
            <li><Link to="/pravne/opakovane-platby" className="hover:text-foreground">Opakované platby</Link></li>
            <li><Link to="/pravne/gdpr" className="hover:text-foreground">GDPR</Link></li>
            <li><Link to="/pravne/reklamacny-poriadok" className="hover:text-foreground">Reklamačný poriadok</Link></li>
            <li><Link to="/pravne/cookies" className="hover:text-foreground">Cookies</Link></li>
          </ul>
        </div>
        <div>
          <div className="eyebrow text-foreground">Platby</div>
          <PaymentBadges className="mt-3" />
          <p className="mt-3 text-xs text-muted-foreground">
            Platby spracúva GoPay s.r.o. cez zabezpečenú platobnú bránu s podporou 3D&nbsp;Secure.
          </p>
        </div>
      </div>
      <div className="border-t border-border py-4 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col md:flex-row items-start md:items-center justify-between gap-2 px-4">
          <span>© {new Date().getFullYear()} Tobify s. r. o. Všetky práva vyhradené.</span>
          <span>Tendrik.sk – monitoring verejného obstarávania</span>
        </div>
      </div>
    </footer>
  );
}
