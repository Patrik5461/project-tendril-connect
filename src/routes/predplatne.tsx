import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail } from "lucide-react";
import { MONTHLY_PRICE_EUR, formatEur } from "@/lib/subscription";

export const Route = createFileRoute("/predplatne")({
  head: () => ({
    meta: [
      { title: "Predplatné – Tendrik" },
      {
        name: "description",
        content:
          "Predplatné Tendrik za 4,99 € mesačne. Platby čoskoro spustíme.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PredplatnePlaceholder,
});

function PredplatnePlaceholder() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <div className="eyebrow flex items-center justify-center text-foreground">
        <span className="red-square" aria-hidden="true" />
        Predplatné
      </div>
      <h1 className="mt-6 font-display text-3xl md:text-5xl font-bold tracking-tight">
        Platby čoskoro spustíme
      </h1>
      <p className="mt-6 text-lg text-foreground/80">
        Pracujeme na spustení predplatného za{" "}
        <b className="text-foreground">{formatEur(MONTHLY_PRICE_EUR)}/mes</b>.
        Hneď ako bude platba pripravená, ozveme sa vám e-mailom – nemusíte
        nič robiť.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Do vtedy si užite skúšobné obdobie bez záväzkov.
      </p>
      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to="/dashboard" search={{ tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never}>
          <Button size="lg" variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Späť na dashboard
          </Button>
        </Link>
        <a href="mailto:kontakt@tendrik.sk">
          <Button size="lg">
            <Mail className="h-4 w-4 mr-2" />
            Napíšte nám
          </Button>
        </a>
      </div>
    </div>
  );
}
