import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, Bell, Filter } from "lucide-react";

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
  const [count, setCount] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [display, setDisplay] = useState(0);
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

  if (failed) return null;

  return (
    <div className="mt-8 pt-6 border-t border-border flex flex-col items-start gap-1">
      {count === null ? (
        <span className="inline-block h-16 w-32 bg-muted" />
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-2">
          <span className="num text-6xl md:text-7xl font-bold text-primary leading-none">
            {formatSk(display)}
          </span>
          <span className="text-sm sm:text-base font-semibold text-foreground pb-1 sm:pb-2">
            aktívnych zákaziek naprieč EÚ
          </span>
        </div>
      )}
      {total != null && total > 0 && (
        <span className="text-base md:text-lg text-foreground">
          v hodnote viac než{" "}
          <span className="num font-semibold text-foreground">{formatBigEur(total)}</span>
        </span>
      )}
      <span className="eyebrow text-muted-foreground mt-1">
        ZDROJE TED · ÚVO · EKS · JOSEPHINE · AKTUALIZOVANÉ DENNE
      </span>
      <p className="mt-3 text-xs md:text-sm text-muted-foreground max-w-md leading-relaxed">
        Zobrazujeme len zákazky, do ktorých sa dá práve teraz prihlásiť. Žiadny archív ukončených súťaží.
      </p>
    </div>
  );
}

function TenderMock() {
  return (
    <aside
      aria-hidden="true"
      className="hidden md:block relative rounded-lg border border-foreground bg-card p-6 rotate-[-0.6deg]"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center rounded-sm border border-primary text-primary text-[0.68rem] font-semibold uppercase tracking-[0.16em] px-1.5 py-0.5">
          ÚVO
        </span>
        <span className="eyebrow text-muted-foreground">Č. 2026 / 184</span>
      </div>
      <h3 className="mt-5 font-display font-bold text-2xl leading-tight text-foreground">
        Rekonštrukcia základnej školy na Hviezdoslavovej ulici
      </h3>
      <p className="mt-2 text-sm text-foreground/70">
        Mesto Prievidza · Trenčiansky kraj
      </p>
      <hr className="my-5 border-border" />
      <dl className="grid grid-cols-2 gap-y-3 gap-x-4">
        <div>
          <dt className="eyebrow text-muted-foreground">Hodnota</dt>
          <dd className="num mt-1 text-lg font-semibold text-foreground">1&nbsp;250&nbsp;000&nbsp;€</dd>
        </div>
        <div>
          <dt className="eyebrow text-muted-foreground">CPV</dt>
          <dd className="num mt-1 text-sm text-foreground">45214210</dd>
        </div>
        <div>
          <dt className="eyebrow text-muted-foreground">Zverejnené</dt>
          <dd className="num mt-1 text-sm text-foreground">04.&nbsp;07.&nbsp;2026</dd>
        </div>
        <div>
          <dt className="eyebrow text-muted-foreground">Deadline</dt>
          <dd className="mt-1">
            <span className="inline-flex items-center bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-[0.14em] px-2 py-1">
              8 dní
            </span>
          </dd>
        </div>
      </dl>
      <div className="mt-6 pt-4 border-t-2 border-foreground flex items-center justify-between">
        <span className="eyebrow text-muted-foreground">Ukážka záznamu</span>
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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Link to="/auth" search={{ mode: "login" }}>
              <Button variant="ghost">Prihlásiť sa</Button>
            </Link>
            <Link to="/auth" search={{ mode: "signup" }}>
              <Button>Registrovať sa</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-14 md:pt-24 md:pb-20">
        <div className="grid md:grid-cols-[1.35fr_1fr] gap-10 md:gap-14 items-start">
          <div>
            <div className="eyebrow flex items-center text-foreground">
              <span className="red-square" aria-hidden="true" />
              2 mesiace zdarma · monitoring verejného obstarávania
            </div>
            <h1 className="mt-6 font-display font-bold text-[2.75rem] leading-[1.02] md:text-[5rem] md:leading-[0.98] tracking-tight text-foreground">
              <span className="hero-underline">Zákazky</span> si&nbsp;ťa
              <br />
              nájdu samy.
            </h1>
            <p className="mt-8 text-lg md:text-xl text-foreground/80 max-w-2xl whitespace-pre-line">
              Zadaj kľúčové slová, CPV kategórie a kraje.{"\n"}
              Tendrik ti každý deň prinesie zákazky, ktoré sa ťa naozaj týkajú.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link to="/auth" search={{ mode: "signup" }}>
                <Button size="lg" className="w-full sm:w-auto">
                  Začať zadarmo
                </Button>
              </Link>
              <Link to="/auth" search={{ mode: "login" }}>
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Mám už účet
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Vyskúšajte 2 mesiace zadarmo. Potom{" "}
              <span className="num text-foreground">4,99 €/mesiac</span>. Bez
              záväzkov, kartu teraz nepotrebujete.
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
        {[
          {
            icon: Search,
            title: "Presné párovanie",
            text: "Kľúčové slová a CPV kódy nájdu len relevantné zákazky.",
          },
          {
            icon: Filter,
            title: "Krajiny a regióny",
            text: "Vyberte krajiny EÚ, ktoré vás zaujímajú, prípadne konkrétne slovenské kraje.",
          },
          {
            icon: Bell,
            title: "E-mailové notifikácie",
            text: "Zapnite si upozornenia a nezmeškajte deadline.",
          },
        ].map((f, i) => (
          <div key={f.title} className={`px-0 md:px-8 py-6 ${i === 0 ? "md:pl-0" : ""}`}>
            <div className="eyebrow text-primary">Funkcia 0{i + 1}</div>
            <div className="mt-3 flex items-center gap-3">
              <f.icon className="h-5 w-5 text-foreground" />
              <h3 className="font-display font-bold text-xl text-foreground">{f.title}</h3>
            </div>
            <p className="mt-3 text-sm text-foreground/75 leading-relaxed">
              {f.text}
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
              Prečo Tendrik
            </div>
            <h2 className="mt-5 font-display text-3xl md:text-5xl font-bold tracking-tight">
              Úradný vestník, ktorý pracuje za vás.
            </h2>
          </div>
          <ul className="divide-y divide-border border-t border-b border-foreground">
            {[
              "Prvé 2 mesiace zadarmo, potom 4,99 €/mesiac",
              "Nastavenie za menej ako 2 minúty",
              "Len živé príležitosti – zákazky po termíne automaticky mažeme. Nehľadáte v tisíckach starých súťaží, vidíte len tie, o ktoré sa dá reálne uchádzať.",
              "Odkaz priamo na zdroj zákazky",
              "Farebné upozornenie pri krátkom deadline",
              "Dáta priamo z oficiálnych zdrojov TED, ÚVO, EKS a JOSEPHINE",
            ].map((t, i) => (
              <li key={t} className="flex items-baseline gap-4 py-4">
                <span className="num text-sm text-primary font-semibold w-8 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-base md:text-lg text-foreground">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10">
          <Link to="/auth" search={{ mode: "signup" }}>
            <Button size="lg">Vytvoriť účet zadarmo</Button>
          </Link>
        </div>
      </section>

      <hr className="rule-thick mx-auto max-w-6xl" />

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="grid md:grid-cols-[1fr_1.4fr] gap-10 md:gap-16 items-start">
          <div>
            <div className="eyebrow flex items-center text-foreground">
              <span className="red-square" aria-hidden="true" />
              Časté otázky
            </div>
            <h2 className="mt-5 font-display text-3xl md:text-5xl font-bold tracking-tight">
              FAQ
            </h2>
            <p className="mt-4 text-sm text-muted-foreground">
              Čo sa najčastejšie pýtate pred registráciou.
            </p>
          </div>
          <div className="border-t border-b border-foreground divide-y divide-border">
            {[
              {
                q: "Prečo má Tendrik menej zákaziek než iné služby?",
                a: "Iné služby často uvádzajú celkový počet všetkých zákaziek, ktoré kedy zaznamenali – vrátane tých, ktoré sú roky po termíne. My zobrazujeme len aktívne zákazky, do ktorých sa dá práve teraz prihlásiť. Zákazky po uplynutí lehoty automaticky odstraňujeme, aby ste sa nemuseli prehrabávať v neaktuálnych súťažiach.",
              },
              {
                q: "Odkiaľ berete dáta?",
                a: "Z oficiálnych verejných zdrojov: TED (Tenders Electronic Daily – celoeurópsky vestník), vestník ÚVO (Úrad pre verejné obstarávanie SR), EKS (Elektronický kontraktačný systém) a JOSEPHINE (platforma pre podlimitné zákazky používaná mestami, nemocnicami a krajmi).",
              },
              {
                q: "Ako často sa zákazky aktualizujú?",
                a: "Každý deň sťahujeme nové zákazky zo všetkých štyroch zdrojov a odstraňujeme tie, ktorým už uplynula lehota. V praxi teda vidíte aktuálny stav toho, o čo sa dá dnes uchádzať.",
              },
              {
                q: "Je služba spoplatnená?",
                a: "Prvé 2 mesiace máte zadarmo, potom 4,99 € / mesiac bez DPH (6,14 € s DPH). Kartu pri registrácii nepotrebujete – ozveme sa vám pred koncom skúšobnej doby. Predplatné je zrušiteľné kedykoľvek.",
              },
              {
                q: "Pre koho je Tendrik určený?",
                a: "Pre malé a stredné firmy, remeselníkov, IT a stavebné spoločnosti, konzultantov, dodávateľov služieb – pre všetkých, ktorí sa chcú uchádzať o verejné zákazky, ale nechcú denne prehrabávať štyri rôzne portály.",
              },
            ].map((item, i) => (
              <details key={item.q} className="group" open={i === 0}>
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


      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="rounded-lg border-2 border-primary bg-primary/5 p-5 text-sm">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
            <div className="flex-1">
              <b className="text-primary">Cena a opakované platby:</b> 2 mesiace zadarmo, potom{" "}
              <b>4,99 € / mes bez DPH</b> (<b>6,14 € s DPH 23 %</b>). Predplatné sa
              automaticky obnovuje každý mesiac cez platobnú bránu GoPay. Zrušiteľné kedykoľvek.
            </div>
            <div className="flex items-center gap-3">
              <Link to="/pravne/opakovane-platby" className="underline text-foreground whitespace-nowrap">
                Podmienky opakovaných platieb →
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
              Tobify s. r. o.<br />
              Športová 707/43, 919 26 Zavar<br />
              IČO: 56607016 · IČ DPH: SK2122358579
            </p>
          </div>
          <div>
            <div className="eyebrow text-foreground">Kontakt</div>
            <ul className="mt-3 space-y-1.5 text-muted-foreground">
              <li><a href="mailto:info@tendrik.sk" className="hover:text-foreground">info@tendrik.sk</a></li>
              <li><a href="tel:+421907702422" className="hover:text-foreground">+421 907 702 422</a></li>
              <li><Link to="/kontakt" className="hover:text-foreground">Kontaktný formulár</Link></li>
              <li><Link to="/cennik" className="hover:text-foreground">Cenník</Link></li>
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
              <li>
                <button
                  type="button"
                  onClick={() => { import("@/lib/cookie-consent").then((m) => m.openCookieSettings()); }}
                  className="hover:text-foreground"
                >
                  Nastavenia cookies
                </button>
              </li>
            </ul>
          </div>
          <div>
            <div className="eyebrow text-foreground">Platby</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold">GoPay</span>
              <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold">VISA</span>
              <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold">Mastercard</span>
              <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold">3D&nbsp;Secure</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Platby spracúva GoPay s. r. o.
            </p>
          </div>
        </div>
        <div className="border-t border-border py-4 text-xs text-muted-foreground">
          <div className="mx-auto flex max-w-6xl flex-col md:flex-row items-start md:items-center justify-between gap-2 px-4">
            <span>© {new Date().getFullYear()} Tobify s. r. o. Všetky práva vyhradené.</span>
            <span>2 mesiace zdarma, potom 4,99 €/mes (6,14 € s DPH)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
