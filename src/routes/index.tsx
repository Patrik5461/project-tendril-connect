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

function ActiveTendersLine() {
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
    const dur = 1000;
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
    <div className="mt-12 flex flex-col items-center gap-3">
      {count === null ? (
        <span className="inline-block h-20 w-40 rounded-md bg-muted animate-pulse" />
      ) : (
        <span className="num text-7xl md:text-8xl font-bold text-primary leading-none">
          {formatSk(display)}
        </span>
      )}
      <span className="text-sm md:text-base text-muted-foreground text-center max-w-md">
        aktívnych zákaziek práve teraz{"\u00a0"}
        <br />
        z oficiálnych zdrojov TED a ÚVO · aktualizované denne
      </span>
      {total != null && total > 0 && (
        <span className="text-base md:text-lg text-foreground/80 text-center">
          v hodnote viac než{" "}
          <span className="num font-semibold text-primary">{formatBigEur(total)}</span>
        </span>
      )}
    </div>
  );
}

function RadarGraphic() {
  return (
    <div
      className="pointer-events-none absolute -top-32 -right-40 md:-top-40 md:-right-56 hidden md:block"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 400 400"
        className="h-[520px] w-[520px] md:h-[720px] md:w-[720px]"
      >
        <defs>
          <radialGradient id="sweep" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1A3C34" stopOpacity="0" />
            <stop offset="100%" stopColor="#1A3C34" stopOpacity="0.08" />
          </radialGradient>
        </defs>
        {/* concentric rings */}
        {[40, 90, 140, 180].map((r) => (
          <circle
            key={r}
            cx="200"
            cy="200"
            r={r}
            fill="none"
            stroke="#1A3C34"
            strokeOpacity="0.12"
            strokeWidth="1"
          />
        ))}
        {/* crosshairs */}
        <line x1="200" y1="20" x2="200" y2="380" stroke="#1A3C34" strokeOpacity="0.08" strokeWidth="0.5" />
        <line x1="20" y1="200" x2="380" y2="200" stroke="#1A3C34" strokeOpacity="0.08" strokeWidth="0.5" />
        {/* rotating sweep — very subtle */}
        <g className="radar-sweep" style={{ transformOrigin: "200px 200px" }}>
          <path d="M200 200 L200 20 A180 180 0 0 1 360 130 Z" fill="url(#sweep)" />
        </g>
        {/* target dots (tenders) */}
        {[
          { cx: 160, cy: 130, delay: "0s" },
          { cx: 260, cy: 180, delay: "0.6s" },
          { cx: 220, cy: 250, delay: "1.2s" },
          { cx: 130, cy: 230, delay: "1.8s" },
        ].map((d, i) => (
          <g key={i} style={{ transformOrigin: `${d.cx}px ${d.cy}px` }}>
            <circle
              cx={d.cx}
              cy={d.cy}
              r="4"
              fill="#7BA05B"
              fillOpacity="0.35"
            />
            <circle
              cx={d.cx}
              cy={d.cy}
              r="4"
              fill="#7BA05B"
              fillOpacity="0.35"
              className="radar-ping"
              style={{ animationDelay: d.delay, transformOrigin: `${d.cx}px ${d.cy}px` }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

function RadarBullet() {
  return (
    <span
      aria-hidden="true"
      className="mt-1.5 relative inline-flex h-3 w-3 shrink-0 items-center justify-center"
    >
      <span className="absolute inset-0 rounded-full border border-primary/50" />
      <span className="h-1.5 w-1.5 rounded-full bg-accent border border-primary" />
    </span>
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
    <Link to="/" className="flex items-center gap-2.5 font-display font-bold text-xl text-primary">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </span>
      Tendrik
    </Link>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur">
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

      <section className="relative overflow-hidden">
        <RadarGraphic />
        <div className="relative mx-auto max-w-4xl px-4 pt-24 pb-10 md:pt-32 md:pb-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-1.5 text-sm font-semibold text-accent-soft-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            100 % bezplatná služba
          </div>
          <h1 className="mt-8 font-display font-bold text-[2.75rem] leading-[1.02] md:text-7xl md:leading-[0.98] tracking-tight text-foreground">
            Zákazky si ťa
            <br />
            <span className="italic">nájdu samy.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto whitespace-pre-line">
            Zadaj kľúčové slová, CPV kategórie a kraje.{"\n"}
            Tendrik ti každý deň prinesie zákazky, ktoré sa ťa naozaj týkajú.
          </p>
          <ActiveTendersLine />
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
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
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 grid md:grid-cols-3 gap-4">
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
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-lg border border-primary/15 bg-card p-6 card-hover"
          >
            <div className="h-10 w-10 rounded-md bg-accent-soft text-primary flex items-center justify-center">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 font-display font-bold text-lg">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {f.text}
            </p>
          </div>
        ))}
      </section>

      <section className="border-y border-primary/15 bg-primary/[0.04]">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Prečo Tendrik?
          </h2>
          <ul className="mt-8 space-y-4 text-left inline-block">
            {[
              "Bez poplatkov, bez skrytých nákladov",
              "Nastavenie za menej ako 2 minúty",
              "Odkaz priamo na zdroj zákazky",
              "Farebné upozornenie pri krátkom deadline",
              "Dáta priamo z oficiálnych zdrojov TED a vestníka ÚVO",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-base">
                <RadarBullet />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <Link to="/auth" search={{ mode: "signup" }}>
              <Button size="lg">Vytvoriť účet zadarmo</Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Tendrik. Bezplatná služba pre slovenských podnikateľov.
      </footer>
    </div>
  );
}
