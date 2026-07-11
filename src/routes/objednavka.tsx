import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LegalFooter, PaymentBadges } from "@/components/LegalFooter";
import { Check, Info } from "lucide-react";

export const Route = createFileRoute("/objednavka")({
  head: () => ({
    meta: [
      { title: "Objednávka predplatného – Tendrik" },
      { name: "description", content: "Objednajte si Tendrik Premium za 6,14 € s DPH mesačne. Prvé 2 mesiace zdarma. Platba cez GoPay." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/objednavka" }],
  }),
  component: ObjednavkaPage,
});

function ObjednavkaPage() {
  const [plan, setPlan] = useState<"trial" | "premium">("premium");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display font-bold text-xl">
            <span className="inline-flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground font-display font-bold">T</span>
            Tendrik
          </Link>
          <Link to="/" className="eyebrow text-muted-foreground hover:text-foreground">← Späť</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="eyebrow flex items-center text-foreground">
          <span className="red-square" aria-hidden="true" /> Objednávka
        </div>
        <h1 className="mt-4 font-display text-3xl md:text-5xl font-bold tracking-tight">
          Vyberte si plán
        </h1>
        <p className="mt-3 text-muted-foreground">
          Prvé 2 mesiace zadarmo, potom 4,99 € / mes bez DPH (6,14 € s DPH). Bez záväzku.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setPlan("trial")}
            className={`text-left rounded-lg border-2 p-6 transition ${plan === "trial" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-foreground/40"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="eyebrow">Free trial</div>
                <div className="mt-1 font-display text-2xl font-bold">2 mesiace zdarma</div>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 ${plan === "trial" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
            </div>
            <p className="mt-2 num text-3xl font-bold">0 €</p>
            <p className="text-sm text-muted-foreground">Bez platobnej karty. Ideálne na vyskúšanie.</p>
          </button>

          <button
            type="button"
            onClick={() => setPlan("premium")}
            className={`text-left rounded-lg border-2 p-6 transition ${plan === "premium" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-foreground/40"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="eyebrow text-primary">Premium</div>
                <div className="mt-1 font-display text-2xl font-bold">Mesačné predplatné</div>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 ${plan === "premium" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
            </div>
            <p className="mt-2 num text-3xl font-bold">6,14 € <span className="text-base font-medium text-muted-foreground">/ mes s DPH</span></p>
            <p className="text-sm text-muted-foreground">4,99 € bez DPH + 23 % DPH. Automatické obnovenie každý mesiac.</p>
          </button>
        </div>

        <div className="mt-8 rounded-lg border-2 border-primary bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <b className="text-primary">Ide o opakovanú platbu.</b> Po skončení 2-mesačného
              skúšobného obdobia sa z vašej karty automaticky strhne <b>6,14 € s DPH</b> každý
              mesiac. Predplatné môžete kedykoľvek zrušiť v nastaveniach účtu alebo e-mailom na{" "}
              <a href="mailto:info@tendrik.sk" className="underline">info@tendrik.sk</a>.
              Podrobnosti nájdete v dokumente{" "}
              <Link to="/pravne/opakovane-platby" className="underline">Opakované platby</Link>.
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">Súhrn</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {plan === "trial" ? "Free trial – 2 mesiace zdarma" : "Tendrik Premium – mesačné predplatné"}
              </p>
            </div>
            <p className="num text-2xl font-bold">
              {plan === "trial" ? "0,00 €" : "6,14 € / mes"}
            </p>
          </div>
          {plan === "premium" && (
            <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary" />Základ dane: 4,99 €</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary" />DPH 23 %: 1,15 €</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary" />Platba cez GoPay (Visa / Mastercard, 3D&nbsp;Secure)</li>
            </ul>
          )}
          <PaymentBadges className="mt-4" />
          <Link to="/auth" search={{ mode: "signup" }} className="mt-6 block">
            <Button className="w-full" size="lg">
              {plan === "trial" ? "Začať zdarma" : "Pokračovať na platbu"}
            </Button>
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            Kliknutím súhlasíte s{" "}
            <Link to="/pravne/obchodne-podmienky" className="underline">obchodnými podmienkami</Link>,{" "}
            <Link to="/pravne/opakovane-platby" className="underline">podmienkami opakovaných platieb</Link> a{" "}
            <Link to="/pravne/gdpr" className="underline">spracovaním osobných údajov</Link>.
          </p>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Predávajúci: <b>Tobify s. r. o.</b>, Športová 707/43, 919 26 Zavar, IČO 56607016,
          IČ DPH SK2122358579. Platby spracúva GoPay s. r. o.
        </p>
      </main>

      <LegalFooter />
    </div>
  );
}
