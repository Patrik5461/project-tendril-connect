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
    <div className="mt-14 flex flex-col items-start gap-2">
      {count === null ? (
        <span className="inline-block h-16 w-32 bg-muted" />
      ) : (
        <span className="num text-6xl md:text-7xl font-bold text-primary leading-none">
          {formatSk(display)}
        </span>
      )}
      {total != null && total > 0 && (
        <span className="text-base md:text-lg text-foreground">
          v hodnote viac než{" "}
          <span className="num font-semibold text-foreground">{formatBigEur(total)}</span>
        </span>
      )}
      <span className="eyebrow text-muted-foreground mt-1">
        Aktívnych zákaziek · Zdroje TED &amp; ÚVO · Aktualizované denne
      </span>
    </div>
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
      <span className="h-8 w-8 bg-primary" aria-hidden="true" />
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
        <div className="max-w-4xl">
          <div className="eyebrow flex items-center text-foreground">
            <span className="red-square" aria-hidden="true" />
            Bezplatný monitoring verejného obstarávania
          </div>
          <h1 className="mt-6 font-display font-bold text-[2.75rem] leading-[1.02] md:text-[5.5rem] md:leading-[0.98] tracking-tight text-foreground">
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
          <ActiveTendersBlock />
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
            title: "Regionálne filtre",
            text: "Vyberte 8 slovenských krajov alebo celé Slovensko.",
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
              "Bez poplatkov, bez skrytých nákladov",
              "Nastavenie za menej ako 2 minúty",
              "Odkaz priamo na zdroj zákazky",
              "Farebné upozornenie pri krátkom deadline",
              "Dáta priamo z oficiálnych zdrojov TED a vestníka ÚVO",
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

      <footer className="border-t-2 border-foreground py-8 text-sm">
        <div className="mx-auto flex max-w-6xl flex-col md:flex-row items-start md:items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 bg-primary" aria-hidden="true" />
            <span className="font-display font-bold">Tendrik</span>
            <span className="text-muted-foreground">
              · © {new Date().getFullYear()} · Bezplatná služba pre slovenských podnikateľov
            </span>
          </div>
          <div className="eyebrow text-muted-foreground">Ver. 1.0</div>
        </div>
      </footer>
    </div>
  );
}
