import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LegalFooter, PaymentBadges } from "@/components/LegalFooter";
import { Check } from "lucide-react";

export const Route = createFileRoute("/cennik")({
  head: () => ({
    meta: [
      { title: "Cenník – Tendrik" },
      { name: "description", content: "2 mesiace zdarma, potom 4,99 € / mesiac (6,14 € s DPH). Automatické obnovenie, zrušiteľné kedykoľvek." },
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

      <main className="mx-auto max-w-4xl px-4 py-14">
        <div className="eyebrow flex items-center text-foreground">
          <span className="red-square" aria-hidden="true" /> Cenník
        </div>
        <h1 className="mt-4 font-display text-4xl md:text-5xl font-bold tracking-tight">
          Jedna cena. <span className="hero-underline">Bez prekvapení.</span>
        </h1>
        <p className="mt-4 text-lg text-foreground/80">
          2 mesiace zadarmo. Potom mesačné predplatné, ktoré môžete kedykoľvek zrušiť.
        </p>

        <div className="mt-10 rounded-lg border-2 border-primary bg-primary/5 p-4 text-sm">
          <b className="text-primary">Upozornenie na opakované platby:</b> Po skončení 2-mesačnej
          skúšobnej doby sa predplatné <b>automaticky obnovuje každý mesiac</b> vo výške{" "}
          <b>6,14 € s DPH</b> cez platobnú bránu GoPay. Zrušenie kedykoľvek v nastaveniach účtu.
          Podrobnosti v <Link to="/pravne/opakovane-platby" className="underline">Opakované platby</Link>.
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="eyebrow">Trial</div>
            <h2 className="mt-2 font-display text-2xl font-bold">Skúšobné obdobie</h2>
            <p className="mt-4 num text-4xl font-bold">0 €</p>
            <p className="text-sm text-muted-foreground">na prvé 2 mesiace</p>
            <ul className="mt-6 space-y-2 text-sm">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Všetky funkcie</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Bez platobnej karty</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Zrušiteľné kedykoľvek</li>
            </ul>
            <Link to="/auth" search={{ mode: "signup" }} className="mt-6 block">
              <Button className="w-full">Začať zadarmo</Button>
            </Link>
          </div>

          <div className="rounded-lg border-2 border-primary bg-card p-6 relative">
            <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider px-2 py-0.5">Po triali</span>
            <div className="eyebrow text-primary">Premium</div>
            <h2 className="mt-2 font-display text-2xl font-bold">Mesačné predplatné</h2>
            <p className="mt-4 num text-4xl font-bold">4,99 € <span className="text-base font-medium text-muted-foreground">/ mes bez DPH</span></p>
            <p className="text-sm text-muted-foreground">6,14 € s DPH 23 % · fakturované mesačne</p>
            <ul className="mt-6 space-y-2 text-sm">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Neobmedzený počet radarov</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Denné e-mailové notifikácie</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />TED + ÚVO v jednom</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Automatické obnovenie cez GoPay</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" />Zrušenie kedykoľvek</li>
            </ul>
            <Link to="/objednavka" className="mt-6 block">
              <Button className="w-full">Objednať Premium</Button>
            </Link>
            <PaymentBadges className="mt-4" />
          </div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Prevádzkovateľ: Tobify s. r. o., IČO 56607016, IČ DPH SK2122358579. Platby spracúva
          GoPay s. r. o. Podmienky:{" "}
          <Link to="/pravne/obchodne-podmienky" className="underline">Obchodné podmienky</Link> ·{" "}
          <Link to="/pravne/opakovane-platby" className="underline">Opakované platby</Link>.
        </p>
      </main>

      <LegalFooter />
    </div>
  );
}
