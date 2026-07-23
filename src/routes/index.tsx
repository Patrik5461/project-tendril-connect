import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Search, Bell, Filter } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

function formatSk(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

function formatBigEur(n: number): string {
  if (n >= 1_000_000_000) {
    const v = n / 1_000_000_000;
    return `${v.toFixed(1).replace(".", ",")} mld €`;
  }
  const v = n / 1_000_000;
  return `${v.toFixed(0)} mil. €`;
}

function ActiveTendersBlock() {
  const { t } = useTranslation("marketing");
  const [count, setCount] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [grantsCount, setGrantsCount] = useState<number | null>(null);
  const [grantsAlloc, setGrantsAlloc] = useState<number | null>(null);
  const [display, setDisplay] = useState(0);
  const [displayGrants, setDisplayGrants] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (cancelled) return;
        if (typeof d?.active_tenders === "number") setCount(d.active_tenders);
        else setFailed(true);
        if (typeof d?.total_value_eur === "number") setTotal(d.total_value_eur);
        if (typeof d?.open_grants === "number") setGrantsCount(d.open_grants);
        if (typeof d?.open_grants_alloc_eur === "number") setGrantsAlloc(d.open_grants_alloc_eur);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (count === null) return;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(count * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count]);

  useEffect(() => {
    if (grantsCount === null) return;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayGrants(Math.round(grantsCount * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [grantsCount]);

  if (failed) return null;

  const hasGrants = grantsCount != null && grantsCount > 0;

  return (
    <div className="mt-8 pt-6 border-t border-border">
      <div
        className={`grid grid-cols-1 gap-8 ${
          hasGrants ? "md:grid-cols-2 md:gap-10 md:divide-x md:divide-border" : ""
        }`}
      >
        {/* Tenders block */}
        <div className="flex flex-col items-start gap-1 md:pr-10">
          {count === null ? (
            <span className="inline-block h-16 w-32 bg-muted" />
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-2">
              <span className="num text-5xl md:text-6xl font-bold text-primary leading-none">
                {formatSk(display)}
              </span>
              <span className="text-sm sm:text-base font-semibold text-foreground pb-1">
                {t("stats.activeSuffix")}
              </span>
            </div>
          )}
          <span className="text-base md:text-lg text-foreground min-h-[1.75rem]">
            {total != null && total > 0 ? (
              <>
                {t("stats.valuePrefix")}{" "}
                <span className="num font-semibold text-foreground">{formatBigEur(total)}</span>
              </>
            ) : null}
          </span>
          <span className="eyebrow text-muted-foreground mt-1">{t("stats.sources")}</span>
        </div>

        {/* Grants block */}
        {hasGrants && (
          <div className="flex flex-col items-start gap-1 pt-8 border-t border-border md:pt-0 md:pl-10 md:border-t-0">
            <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-2">
              <span className="num text-5xl md:text-6xl font-bold text-primary leading-none">
                {formatSk(displayGrants)}
              </span>
              <span className="text-sm sm:text-base font-semibold text-foreground pb-1">
                {t("stats.grantsSuffix")}
              </span>
            </div>
            <span className="text-base md:text-lg text-foreground min-h-[1.75rem]">
              {grantsAlloc != null && grantsAlloc > 0 ? (
                <>
                  {t("stats.grantsAllocPrefix")}{" "}
                  <span className="num font-semibold text-foreground">{formatBigEur(grantsAlloc)}</span>
                </>
              ) : null}
            </span>
            <span className="eyebrow text-muted-foreground mt-1">{t("stats.grantsSources")}</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs md:text-sm text-muted-foreground max-w-md leading-relaxed">
        {t("stats.note")}
      </p>
    </div>
  );
}


function TenderMock() {
  const { t } = useTranslation("marketing");
  return (
    <aside
      aria-hidden="true"
      className="hidden md:block relative rounded-lg border border-foreground bg-card p-6 rotate-[-0.6deg]"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center rounded-sm border border-primary text-primary text-[0.68rem] font-semibold uppercase tracking-[0.16em] px-1.5 py-0.5">
          ÚVO
        </span>
        <span className="eyebrow text-muted-foreground">{t("mock.number")}</span>
      </div>
      <h3 className="mt-5 font-display font-bold text-2xl leading-tight text-foreground">
        {t("mock.title")}
      </h3>
      <p className="mt-2 text-sm text-foreground/70">{t("mock.location")}</p>
      <hr className="my-5 border-border" />
      <dl className="grid grid-cols-2 gap-y-3 gap-x-4">
        <div>
          <dt className="eyebrow text-muted-foreground">{t("mock.value")}</dt>
          <dd className="num mt-1 text-lg font-semibold text-foreground">1&nbsp;250&nbsp;000&nbsp;€</dd>
        </div>
        <div>
          <dt className="eyebrow text-muted-foreground">{t("mock.cpv")}</dt>
          <dd className="num mt-1 text-sm text-foreground">45214210</dd>
        </div>
        <div>
          <dt className="eyebrow text-muted-foreground">{t("mock.published")}</dt>
          <dd className="num mt-1 text-sm text-foreground">04.&nbsp;07.&nbsp;2026</dd>
        </div>
        <div>
          <dt className="eyebrow text-muted-foreground">{t("mock.deadline")}</dt>
          <dd className="mt-1">
            <span className="inline-flex items-center bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-[0.14em] px-2 py-1">
              {t("mock.days")}
            </span>
          </dd>
        </div>
      </dl>
      <div className="mt-6 pt-4 border-t-2 border-foreground flex items-center justify-between">
        <span className="eyebrow text-muted-foreground">{t("mock.sample")}</span>
        <span className="h-2.5 w-2.5 bg-primary" aria-hidden="true" />
      </div>
    </aside>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tendrik – Zákazky si ťa nájdu samy" },
      {
        name: "description",
        content:
          "Tendrik vám každý deň prinesie verejné zákazky presne podľa vašich kľúčových slov, CPV kódov a krajov. Zadarmo.",
      },
      { property: "og:title", content: "Tendrik – zákazky si ťa nájdu samy" },
      {
        property: "og:description",
        content: "Bezplatná služba, ktorá spáruje verejné zákazky s vaším odvetvím a regiónom.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-display font-bold text-xl text-foreground">
      <span
        className="relative inline-flex h-8 w-8 items-center justify-center bg-primary"
        aria-hidden="true"
      >
        <span className="font-display font-bold text-primary-foreground text-lg leading-none translate-y-[-1px]">
          T
        </span>
        <span className="absolute inset-0 border border-primary-foreground/30" />
      </span>
      <span>Tendrik</span>
    </Link>
  );
}

function Landing() {
  const { t } = useTranslation("marketing");
  const features = [
    { icon: Search, key: "matching" },
    { icon: Filter, key: "regions" },
    { icon: Bell, key: "notifications" },
  ] as const;
  const whyItems = t("why.items", { returnObjects: true }) as string[];
  const faqItems = t("faq.items", { returnObjects: true }) as Array<{ q: string; a: string }>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2">
            <Link to="/cennik" className="hidden sm:inline-flex items-center px-3 py-2 text-sm font-semibold text-foreground hover:text-primary">
              Cenník
            </Link>
            <LanguageSwitcher compact />
            <Link to="/auth" search={{ mode: "login" }}>
              <Button variant="ghost" className="h-8 px-2 text-xs sm:h-10 sm:px-4 sm:text-sm">
                {t("header.login")}
              </Button>
            </Link>
            <Link to="/auth" search={{ mode: "signup" }}>
              <Button className="h-8 px-2 text-xs sm:h-10 sm:px-4 sm:text-sm">
                <span className="hidden sm:inline">{t("header.signup")}</span>
                <span className="sm:hidden">{t("header.signupMobile")}</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-14 md:pt-24 md:pb-20">
        <div className="grid md:grid-cols-[1.35fr_1fr] gap-10 md:gap-14 items-start">
          <div>
            <div className="eyebrow flex items-center text-foreground">
              <span className="red-square" aria-hidden="true" />
              {t("hero.eyebrow")}
            </div>
            <h1 className="mt-6 font-display font-bold text-[2.75rem] leading-[1.02] md:text-[5rem] md:leading-[0.98] tracking-tight text-foreground">
              <span className="hero-underline">{t("hero.titleEmphasis")}</span>{" "}
              <span className="whitespace-pre-line">{t("hero.titleRest")}</span>
            </h1>
            <p className="mt-8 text-lg md:text-xl text-foreground/80 max-w-2xl whitespace-pre-line">
              {t("hero.subtitle")}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link to="/auth" search={{ mode: "signup" }}>
                <Button size="lg" className="w-full sm:w-auto">
                  {t("hero.ctaPrimary")}
                </Button>
              </Link>
              <Link to="/auth" search={{ mode: "login" }}>
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  {t("hero.ctaSecondary")}
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              <Trans
                i18nKey="hero.priceNote"
                ns="marketing"
                components={{ price: <span className="num text-foreground" /> }}
              />
            </p>

            <ActiveTendersBlock />
          </div>
          <div className="md:pt-4">
            <TenderMock />
          </div>
        </div>
      </section>

      <hr className="rule-thick mx-auto max-w-6xl" />

      <section className="mx-auto max-w-6xl px-4 py-14 grid md:grid-cols-3 gap-0 md:divide-x md:divide-border">
        {features.map((f, i) => (
          <div key={f.key} className={`px-0 md:px-8 py-6 ${i === 0 ? "md:pl-0" : ""}`}>
            <div className="eyebrow text-primary">
              {t("features.featureLabel", { n: String(i + 1).padStart(2, "0") })}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <f.icon className="h-5 w-5 text-foreground" />
              <h3 className="font-display font-bold text-xl text-foreground">
                {t(`features.${f.key}.title`)}
              </h3>
            </div>
            <p className="mt-3 text-sm text-foreground/75 leading-relaxed">
              {t(`features.${f.key}.text`)}
            </p>
          </div>
        ))}
      </section>

      <hr className="rule-thick mx-auto max-w-6xl" />

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="grid md:grid-cols-[1fr_1.4fr] gap-10 md:gap-16 items-start">
          <div>
            <div className="eyebrow flex items-center text-foreground">
              <span className="red-square" aria-hidden="true" />
              {t("why.eyebrow")}
            </div>
            <h2 className="mt-5 font-display text-3xl md:text-5xl font-bold tracking-tight">
              {t("why.title")}
            </h2>
          </div>
          <ul className="divide-y divide-border border-t border-b border-foreground">
            {whyItems.map((line, i) => (
              <li key={i} className="flex items-baseline gap-4 py-4">
                <span className="num text-sm text-primary font-semibold w-8 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-base md:text-lg text-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10">
          <Link to="/auth" search={{ mode: "signup" }}>
            <Button size="lg">{t("why.cta")}</Button>
          </Link>
        </div>
      </section>

      <hr className="rule-thick mx-auto max-w-6xl" />

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="grid md:grid-cols-[1fr_1.4fr] gap-10 md:gap-16 items-start">
          <div>
            <div className="eyebrow flex items-center text-foreground">
              <span className="red-square" aria-hidden="true" />
              {t("faq.eyebrow")}
            </div>
            <h2 className="mt-5 font-display text-3xl md:text-5xl font-bold tracking-tight">
              {t("faq.title")}
            </h2>
            <p className="mt-4 text-sm text-muted-foreground">{t("faq.subtitle")}</p>
          </div>
          <div className="border-t border-b border-foreground divide-y divide-border">
            {faqItems.map((item, i) => (
              <details key={i} className="group" open={i === 0}>
                <summary className="flex items-start gap-4 py-5 cursor-pointer list-none select-none">
                  <span className="num text-sm text-primary font-semibold w-8 tabular-nums shrink-0 pt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 font-display font-bold text-lg md:text-xl text-foreground leading-snug">
                    {item.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 mt-1 inline-flex h-6 w-6 items-center justify-center border border-foreground text-foreground text-lg leading-none font-bold transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pl-12 pr-2 pb-6 text-sm md:text-base text-foreground/80 leading-relaxed">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>


      <hr className="rule-thick mx-auto max-w-6xl" />

      <section id="cennik" className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="eyebrow flex items-center text-foreground">
          <span className="red-square" aria-hidden="true" />
          Cenník
        </div>
        <div className="mt-5 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            Dva plány. <span className="hero-underline">30 dní zdarma na vyskúšanie.</span>
          </h2>
          <p className="text-sm text-muted-foreground md:max-w-sm">
            Konečné ceny – Tobify s. r. o. nie je platca DPH.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="rounded-lg border-2 border-foreground bg-card p-6 flex flex-col">
            <div className="eyebrow">Základ</div>
            <h3 className="mt-2 font-display text-2xl font-bold">Monitoring zákaziek</h3>
            <p className="mt-4 num text-4xl font-bold">
              4,99 € <span className="text-base font-medium text-muted-foreground">/ mes</span>
            </p>
            <ul className="mt-5 space-y-1.5 text-sm flex-1">
              <li>· Neobmedzené radary a filtre</li>
              <li>· Denné e-mailové digesty</li>
              <li>· Pripomienky pred deadline</li>
              <li>· TED, ÚVO, EKS a JOSEPHINE</li>
              <li className="text-muted-foreground">— Bez AI analýzy</li>
            </ul>
            <div className="mt-6 flex gap-2">
              <Link to="/auth" search={{ mode: "signup" }} className="flex-1">
                <Button variant="outline" className="w-full">Vyskúšať zdarma</Button>
              </Link>
              <Link to="/cennik">
                <Button variant="ghost">Detaily</Button>
              </Link>
            </div>
          </div>

          <div className="rounded-lg border-2 border-primary bg-primary/5 p-6 relative flex flex-col">
            <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider px-2 py-0.5">
              Obsahuje AI
            </span>
            <div className="eyebrow text-primary">Prémium</div>
            <h3 className="mt-2 font-display text-2xl font-bold">Všetko + AI analýza</h3>
            <p className="mt-4 num text-4xl font-bold">
              14,99 € <span className="text-base font-medium text-muted-foreground">/ mes</span>
            </p>
            <ul className="mt-5 space-y-1.5 text-sm flex-1">
              <li>· Všetko zo Základu</li>
              <li>· AI analýza zákazky a spôsobilosti</li>
              <li>· AI návrh subdodávok a oslovení</li>
              <li>· TED podmienky štruktúrovane</li>
              <li>· Prioritná podpora</li>
            </ul>
            <div className="mt-6 flex gap-2">
              <Link to="/auth" search={{ mode: "signup" }} className="flex-1">
                <Button className="w-full">Vyskúšať zdarma</Button>
              </Link>
              <Link to="/cennik">
                <Button variant="ghost">Detaily</Button>
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Kompletný cenník a porovnanie plánov na <Link to="/cennik" className="underline text-foreground">/cennik</Link>.
        </p>
      </section>

      <hr className="rule-thick mx-auto max-w-6xl" />

      <section className="mx-auto max-w-6xl px-4 pb-14 pt-14">

        <div className="rounded-lg border-2 border-primary bg-primary/5 p-5 text-sm">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
            <div className="flex-1">
              <b className="text-primary">{t("billing.label")}</b>{" "}
              <Trans i18nKey="billing.body" ns="marketing" components={{ b: <b /> }} />
            </div>
            <div className="flex items-center gap-3">
              <Link to="/pravne/opakovane-platby" className="underline text-foreground whitespace-nowrap">
                {t("billing.link")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t-2 border-foreground bg-background">
        <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 md:grid-cols-4 text-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 bg-primary" aria-hidden="true" />
              <span className="font-display font-bold">Tendrik.sk</span>
            </div>
            <p className="mt-3 text-muted-foreground">
              {t("footer.company")}<br />
              {t("footer.address")}<br />
              {t("footer.ico")}
            </p>
          </div>
          <div>
            <div className="eyebrow text-foreground">{t("footer.contact")}</div>
            <ul className="mt-3 space-y-1.5 text-muted-foreground">
              <li><a href="mailto:info@tendrik.sk" className="hover:text-foreground">info@tendrik.sk</a></li>
              <li><a href="tel:+421907702422" className="hover:text-foreground">+421 907 702 422</a></li>
              <li><Link to="/kontakt" className="hover:text-foreground">{t("footer.contactForm")}</Link></li>
              <li><Link to="/cennik" className="hover:text-foreground">{t("footer.pricing")}</Link></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow text-foreground">{t("footer.legal")}</div>
            <ul className="mt-3 space-y-1.5 text-muted-foreground">
              <li><Link to="/pravne/obchodne-podmienky" className="hover:text-foreground">{t("footer.terms")}</Link></li>
              <li><Link to="/pravne/opakovane-platby" className="hover:text-foreground">{t("footer.recurring")}</Link></li>
              <li><Link to="/pravne/gdpr" className="hover:text-foreground">{t("footer.gdpr")}</Link></li>
              <li><Link to="/pravne/reklamacny-poriadok" className="hover:text-foreground">{t("footer.complaints")}</Link></li>
              <li><Link to="/pravne/cookies" className="hover:text-foreground">{t("footer.cookies")}</Link></li>
              <li>
                <button
                  type="button"
                  onClick={() => { import("@/lib/cookie-consent").then((m) => m.openCookieSettings()); }}
                  className="hover:text-foreground"
                >
                  {t("footer.cookiesSettings")}
                </button>
              </li>
            </ul>
          </div>
          <div>
            <div className="eyebrow text-foreground">{t("footer.payments")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold">GoPay</span>
              <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold">VISA</span>
              <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold">Mastercard</span>
              <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold">3D&nbsp;Secure</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("footer.paymentsNote")}</p>
          </div>
        </div>
        <div className="border-t border-border py-4 text-xs text-muted-foreground">
          <div className="mx-auto flex max-w-6xl flex-col md:flex-row items-start md:items-center justify-between gap-2 px-4">
            <span>{t("footer.rights", { year: new Date().getFullYear() })}</span>
            <span>{t("footer.priceInline")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
