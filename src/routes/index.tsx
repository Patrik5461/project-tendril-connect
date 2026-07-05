import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Search, Bell, Filter } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tendrik – Bezplatné notifikácie o verejných zákazkach" },
      {
        name: "description",
        content:
          "Tendrik vám každý deň prinesie verejné zákazky presne podľa vašich kľúčových slov, CPV kódov a krajov. Zadarmo.",
      },
      { property: "og:title", content: "Tendrik – verejné zákazky pre vaše podnikanie" },
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

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-bold text-xl text-primary">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
              T
            </div>
            Tendrik
          </div>
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

      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <div className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
          100 % bezplatná služba
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
          Verejné zákazky presne pre <span className="text-primary">vaše podnikanie</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Zadajte kľúčové slová, vyberte CPV kategórie a kraje. Tendrik vám každý deň zobrazí
          zákazky, ktoré sa vás naozaj týkajú.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
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
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 grid md:grid-cols-3 gap-6">
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
          <div key={f.title} className="rounded-xl border bg-card p-6">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold text-lg">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="bg-primary/5 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold">Prečo Tendrik?</h2>
          <ul className="mt-6 space-y-3 text-left inline-block">
            {[
              "Bez poplatkov, bez skrytých nákladov",
              "Nastavenie za menej ako 2 minúty",
              "Odkaz priamo na zdroj zákazky",
              "Farebné upozornenie pri krátkom deadline",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Link to="/auth" search={{ mode: "signup" }}>
              <Button size="lg">Vytvoriť účet zadarmo</Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Tendrik. Bezplatná služba pre slovenských podnikateľov.
      </footer>
    </div>
  );
}
