import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { PaymentBadges } from "@/components/LegalFooter";

export const Route = createFileRoute("/pravne/opakovane-platby")({
  head: () => ({
    meta: [
      { title: "Opakované platby – Tendrik" },
      { name: "description", content: "Ako fungujú opakované mesačné platby v službe Tendrik.sk cez platobnú bránu GoPay." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/pravne/opakovane-platby" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage
      title="Opakované platby"
      intro="Predplatné Tendrik sa hradí formou automatických mesačných platieb cez platobnú bránu GoPay."
    >
      <div className="rounded-lg border-2 border-primary bg-primary/5 p-5">
        <div className="eyebrow text-primary">Zhrnutie</div>
        <ul className="mt-2 space-y-1 text-foreground">
          <li>💳 Suma: <b>4,99 € / mesiac</b> (Základ) alebo <b>14,99 € / mesiac</b> (Prémium) – konečná cena</li>
          <li>🔁 Frekvencia: <b>každý mesiac</b>, automaticky</li>
          <li>🎁 Prvé <b>2 mesiace</b> zadarmo (skúšobné obdobie)</li>
          <li>❌ Zrušenie kedykoľvek v nastaveniach účtu</li>
        </ul>
        <PaymentBadges className="mt-4" />
      </div>

      <section>
        <h2>Čo sú opakované platby</h2>
        <p>
          Opakovaná platba je automatická platba kartou, ktorá sa strháva v pravidelných
          intervaloch bez toho, aby ste museli platbu zakaždým znova potvrdzovať. Prvú platbu
          autorizujete pri aktivácii predplatného, ďalšie platby sa vykonávajú automaticky
          na základe tokenu z bezpečnej platobnej brány <b>GoPay</b>.
        </p>
      </section>

      <section>
        <h2>Výška platby</h2>
        <ul>
          <li>Základ: <b>4,99 € / mesiac</b></li>
          <li>Prémium: <b>14,99 € / mesiac</b></li>
          <li>Dodávateľ (Tobify s. r. o.) nie je platiteľom DPH – uvedené sumy sú konečné.</li>
        </ul>
        <p>
          O prípadnej zmene ceny vás budeme informovať e-mailom najmenej 15 dní vopred.
        </p>
      </section>

      <section>
        <h2>Kedy sa platba strhne</h2>
        <ul>
          <li><b>Prvá platba:</b> po skončení 2-mesačného skúšobného obdobia, resp. po aktivácii predplatného.</li>
          <li><b>Ďalšie platby:</b> každý mesiac v deň zodpovedajúci dátumu aktivácie.</li>
          <li>Pred každou platbou vám pošleme e-mail s daňovým dokladom.</li>
        </ul>
      </section>

      <section>
        <h2>Ako platby zrušiť</h2>
        <p>Opakované platby môžete kedykoľvek zrušiť dvoma spôsobmi:</p>
        <ol>
          <li>V <b>nastaveniach účtu</b> na Tendrik.sk kliknutím na „Zrušiť predplatné".</li>
          <li>E-mailom na <a href="mailto:info@tendrik.sk">info@tendrik.sk</a> z e-mailu, na ktorý je účet registrovaný.</li>
        </ol>
        <p>
          Po zrušení už nebude z vašej karty strhnutá žiadna ďalšia platba. Prístup ku
          plateným funkciám zostáva zachovaný do konca aktuálneho zúčtovacieho obdobia.
        </p>
      </section>

      <section>
        <h2>Bezpečnosť platieb</h2>
        <p>
          Údaje o platobnej karte spracúva výlučne platobná brána <b>GoPay s. r. o.</b>{" "}
          v štandarde <b>PCI-DSS Level 1</b>. Tendrik nikdy nemá prístup k číslu vašej karty
          ani k CVV kódu; ukladá sa iba anonymizovaný token potrebný na opakované strhávanie.
          Platby sú chránené <b>3D&nbsp;Secure</b> autentizáciou.
        </p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          Otázky k platbám: <a href="mailto:info@tendrik.sk">info@tendrik.sk</a>,{" "}
          <a href="tel:+421907702422">+421 907 702 422</a>.
        </p>
      </section>
    </LegalPage>
  );
}
