import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/pravne/obchodne-podmienky")({
  head: () => ({
    meta: [
      { title: "Obchodné podmienky – Tendrik" },
      { name: "description", content: "Obchodné podmienky služby Tendrik.sk – monitoring verejného obstarávania. Prevádzkovateľ Tobify s. r. o." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/pravne/obchodne-podmienky" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage
      title="Obchodné podmienky"
      intro="Účinné od 1. 1. 2026. Tieto podmienky upravujú používanie služby Tendrik.sk."
    >
      <section>
        <h2>1. Prevádzkovateľ</h2>
        <p>
          Prevádzkovateľom služby Tendrik.sk (ďalej len „Služba") je spoločnosť:
        </p>
        <ul>
          <li><b>Tobify s. r. o.</b></li>
          <li>Sídlo: Športová 707/43, 919 26 Zavar, Slovenská republika</li>
          <li>IČO: 56607016</li>
          <li>DIČ: 2122358579</li>
          <li>IČ DPH: SK2122358579</li>
          <li>E-mail: <a href="mailto:info@tendrik.sk">info@tendrik.sk</a></li>
          <li>Telefón: <a href="tel:+421907702422">+421 907 702 422</a></li>
        </ul>
        <p>Spoločnosť je platiteľom DPH.</p>
      </section>

      <section>
        <h2>2. Popis služby</h2>
        <p>
          Tendrik.sk je online SaaS platforma, ktorá automaticky monitoruje verejné zákazky
          zverejnené v Úradnom vestníku EÚ (TED) a vo vestníku Úradu pre verejné obstarávanie SR
          (ÚVO). Používateľom umožňuje:
        </p>
        <ul>
          <li>filtrovať zákazky podľa kľúčových slov, CPV kódov, krajín a regiónov,</li>
          <li>dostávať e-mailové notifikácie o nových zákazkách a blížiacich sa uzávierkach,</li>
          <li>zobrazovať detail zákazky s odkazom na zdroj (TED / ÚVO / EKS / JOSEPHINE).</li>
        </ul>
      </section>

      <section>
        <h2>3. Cena a platobné podmienky</h2>
        <p>
          Používanie Služby je spoplatnené paušálnou mesačnou sumou podľa zvoleného tieru:
        </p>
        <ul>
          <li>Základ: <b>4,99&nbsp;€ / mesiac</b></li>
          <li>Prémium (s AI): <b>14,99&nbsp;€ / mesiac</b></li>
          <li>Dodávateľ <b>Tobify s.&nbsp;r.&nbsp;o.</b> nie je platiteľom DPH – uvedené sumy sú konečné.</li>
        </ul>
        <p>
          Platba prebieha prostredníctvom platobnej brány <b>GoPay</b> platobnou kartou (Visa,
          Mastercard) so zabezpečením 3D&nbsp;Secure. Predplatné sa automaticky obnovuje každý
          mesiac, viac v dokumente{" "}
          <a href="/pravne/opakovane-platby">Opakované platby</a>.
        </p>
      </section>

      <section>
        <h2>4. Skúšobné obdobie (trial)</h2>
        <p>
          Nový používateľ získava <b>2 mesiace zdarma</b> od registrácie, bez potreby zadávania
          platobnej karty. Po uplynutí skúšobného obdobia sa prístup k plateným funkciám
          uzamkne, kým používateľ neaktivuje platené predplatné.
        </p>
      </section>

      <section>
        <h2>5. Uzavretie zmluvy</h2>
        <p>
          Zmluva medzi Prevádzkovateľom a používateľom vzniká momentom potvrdenia objednávky
          (aktivácia platby) v používateľskom rozhraní. Používateľ potvrdzuje, že sa
          oboznámil s týmito podmienkami a súhlasí s nimi.
        </p>
      </section>

      <section>
        <h2>6. Odstúpenie od zmluvy (14 dní)</h2>
        <p>
          Spotrebiteľ má právo odstúpiť od zmluvy uzavretej na diaľku do <b>14 dní</b> bez
          udania dôvodu podľa § 7 zákona č. 102/2014 Z. z. Odstúpenie je potrebné zaslať na
          e-mail <a href="mailto:info@tendrik.sk">info@tendrik.sk</a>. Ak bola v tejto lehote
          Služba už poskytovaná so súhlasom spotrebiteľa, vráti sa alikvotná časť ceny.
        </p>
      </section>

      <section>
        <h2>7. Storno a ukončenie predplatného</h2>
        <p>
          Predplatné je možné zrušiť <b>kedykoľvek</b> v nastaveniach účtu alebo e-mailom na{" "}
          <a href="mailto:info@tendrik.sk">info@tendrik.sk</a>. Po zrušení už nebude
          predplatné automaticky obnovené. <b>Zostatok už zaplateného obdobia sa nerefunduje</b>{" "}
          (mimo prípadu podľa bodu 6 alebo úspešnej reklamácie).
        </p>
      </section>

      <section>
        <h2>8. Reklamačný postup</h2>
        <p>
          Reklamácie prijímame e-mailom na <a href="mailto:info@tendrik.sk">info@tendrik.sk</a>{" "}
          alebo poštou na adresu sídla. Reklamáciu vybavíme najneskôr do <b>30 dní</b> od
          jej doručenia. Podrobnosti nájdete v{" "}
          <a href="/pravne/reklamacny-poriadok">Reklamačnom poriadku</a>.
        </p>
      </section>

      <section>
        <h2>9. Zodpovednosť za obsah</h2>
        <p>
          Údaje o zákazkach pochádzajú z verejných zdrojov TED, ÚVO, EKS a JOSEPHINE. Prevádzkovateľ
          nezodpovedá za správnosť, úplnosť ani aktuálnosť týchto zdrojových údajov.
          Používanie výsledkov je na vlastnú zodpovednosť používateľa.
        </p>
      </section>

      <section>
        <h2>10. Ochrana osobných údajov</h2>
        <p>
          Spracovanie osobných údajov upravuje samostatný dokument{" "}
          <a href="/pravne/gdpr">GDPR – ochrana osobných údajov</a>.
        </p>
      </section>

      <section>
        <h2>11. Riešenie sporov</h2>
        <p>
          Prípadné spory sa riešia primárne dohodou. Spotrebiteľ má právo obrátiť sa na
          Slovenskú obchodnú inšpekciu (<a href="https://www.soi.sk" target="_blank" rel="noreferrer">soi.sk</a>)
          alebo využiť platformu ODR:{" "}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">
            ec.europa.eu/consumers/odr
          </a>.
        </p>
      </section>

      <section>
        <h2>12. Záverečné ustanovenia</h2>
        <p>
          Prevádzkovateľ si vyhradzuje právo tieto podmienky meniť. O podstatných zmenách
          bude používateľov informovať e-mailom minimálne 15 dní vopred. Vzťahy neupravené
          týmito podmienkami sa riadia právnym poriadkom Slovenskej republiky.
        </p>
      </section>
    </LegalPage>
  );
}
