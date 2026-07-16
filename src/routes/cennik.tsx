import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LegalFooter, PaymentBadges } from "@/components/LegalFooter";
import { Check, Sparkles } from "lucide-react";

export const Route = createFileRoute("/cennik")({
  head: () => ({
    meta: [
      { title: "Cenník – Tendrik" },
      { name: "description", content: "Základ 4,99 €/mes (monitoring) alebo Prémium 14,99 €/mes s AI analýzou. Prvé 2 mesiace zdarma." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/cennik" }],
  }),
  component: CennikPage,
});

function CennikPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display font-bold text-xl">
            <span className="inline-flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground font-display font-bold">T</span>
            Tendrik
          </Link>
          <Link to="/" className="eyebrow text-muted-foreground hover:text-foreground">← Späť na úvod</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-14">
        <div className="eyebrow flex items-center text-foreground">
          <span className="red-square" aria-hidden="true" /> Cenník
        </div>
        <h1 className="mt-4 font-display text-4xl md:text-5xl font-bold tracking-tight">
          Dva plány. <span className="hero-underline">Vy si vyberáte.</span>
        </h1>
        <p className="mt-4 text-lg text-foreground/80">
          Prvé 2 mesiace zdarma s plnou AI analýzou. Potom si vyberte Základ alebo Prémium.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {/* Základ */}
          <div className="rounded-lg border border-border bg-card p-6 flex flex-col">
            <div className="eyebrow">Základ</div>
            <h2 className="mt-2 font-display text-2xl font-bold">Monitoring zákaziek</h2>
            <p className="mt-4 num text-4xl font-bold">
              4,99 € <span className="text-base font-medium text-muted-foreground">/ mes</span>
            </p>
            <p className="text-sm text-muted-foreground">Konečná cena · fakturované mesačne</p>
            <ul className="mt-6 space-y-2 text-sm flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Neobmedzené radary a filtre</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Denné e-mailové digesty</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Pripomienky pred deadline</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Uložené / skryté zákazky</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />TED, ÚVO, EKS a JOSEPHINE v jednom</li>
              <li className="flex gap-2 text-muted-foreground"><span className="w-4 mt-0.5">—</span>Bez AI analýzy zákaziek</li>
            </ul>
            <Link to="/predplatne" search={{ tier: "basic" }} className="mt-6 block">
              <Button variant="outline" className="w-full">Vybrať Základ</Button>
            </Link>
          </div>

          {/* Prémium */}
          <div className="rounded-lg border-2 border-primary bg-card p-6 relative flex flex-col">
            <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider px-2 py-0.5">
              <Sparkles className="inline h-3 w-3 mr-1" /> Obsahuje AI analýzu spôsobilosti
            </span>
            <div className="eyebrow text-primary">Prémium</div>
            <h2 className="mt-2 font-display text-2xl font-bold">Všetko + AI</h2>
            <p className="mt-4 num text-4xl font-bold">
              14,99 € <span className="text-base font-medium text-muted-foreground">/ mes</span>
            </p>
            <p className="text-sm text-muted-foreground">Konečná cena · fakturované mesačne</p>
            <ul className="mt-6 space-y-2 text-sm flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /><b>Všetko zo Základu</b></li>
              <li className="flex gap-2"><Sparkles className="h-4 w-4 text-primary mt-0.5" />AI analýza zákazky a spôsobilosti</li>
              <li className="flex gap-2"><Sparkles className="h-4 w-4 text-primary mt-0.5" />AI návrh subdodávok a oslovení</li>
              <li className="flex gap-2"><Sparkles className="h-4 w-4 text-primary mt-0.5" />TED podmienky štruktúrovane</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Prioritná podpora</li>
            </ul>
            <Link to="/predplatne" search={{ tier: "premium" }} className="mt-6 block">
              <Button className="w-full">Vybrať Prémium</Button>
            </Link>
            <PaymentBadges className="mt-4" />
          </div>
        </div>

        <div className="mt-10 rounded-lg border-2 border-primary bg-primary/5 p-4 text-sm">
          <b className="text-primary">2 mesiace zdarma s plnou AI:</b> Trial obsahuje všetko z Prémia
          vrátane AI analýzy — nech si funkcie stihnete vyskúšať. Po skončení trialu si vyberiete tier.
        </div>

        <div className="mt-6 rounded-lg border-2 border-foreground/20 bg-background p-4 text-sm">
          <b>Opakované platby:</b> Predplatné sa <b>automaticky obnovuje každý mesiac</b> vo výške
          podľa zvoleného tieru cez platobnú bránu GoPay. Zrušenie kedykoľvek v nastaveniach účtu.
          Podrobnosti v <Link to="/pravne/opakovane-platby" className="underline">Opakované platby</Link>.
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Prevádzkovateľ: Tobify s. r. o., IČO 56607016 (neplatca DPH). Platby spracúva
          GoPay s. r. o. Podmienky:{" "}
          <Link to="/pravne/obchodne-podmienky" className="underline">Obchodné podmienky</Link> ·{" "}
          <Link to="/pravne/opakovane-platby" className="underline">Opakované platby</Link>.
        </p>
      </main>

      <LegalFooter />
    </div>
  );
}
