import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/pravne/reklamacny-poriadok")({
  head: () => ({
    meta: [
      { title: "Reklamačný poriadok – Tendrik" },
      { name: "description", content: "Ako reklamovať službu Tendrik.sk. Lehota vybavenia 30 dní." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/pravne/reklamacny-poriadok" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage
      title="Reklamačný poriadok"
      intro="Postup pri uplatnení reklamácie služby Tendrik.sk (SaaS platforma monitoringu verejného obstarávania)."
    >
      <section>
        <h2>1. Prevádzkovateľ</h2>
        <p>
          <b>Tobify s. r. o.</b>, Športová 707/43, 919 26 Zavar, IČO: 56607016,{" "}
          <a href="mailto:info@tendrik.sk">info@tendrik.sk</a>,{" "}
          <a href="tel:+421907702422">+421 907 702 422</a>.
        </p>
      </section>

      <section>
        <h2>2. Predmet reklamácie</h2>
        <p>Reklamovať možno najmä:</p>
        <ul>
          <li>nedostupnosť Služby dlhšiu než 24 hodín zavinenú Prevádzkovateľom,</li>
          <li>nefunkčnosť platených funkcií,</li>
          <li>chybne vyúčtovanú platbu,</li>
          <li>nezaslanie objednaných e-mailových notifikácií.</li>
        </ul>
      </section>

      <section>
        <h2>3. Ako reklamáciu podať</h2>
        <p>Reklamáciu môžete uplatniť:</p>
        <ul>
          <li><b>E-mailom:</b> <a href="mailto:info@tendrik.sk">info@tendrik.sk</a> (odporúčame),</li>
          <li><b>Poštou:</b> Tobify s. r. o., Športová 707/43, 919 26 Zavar,</li>
          <li><b>Telefonicky:</b> <a href="tel:+421907702422">+421 907 702 422</a> (následne potvrďte e-mailom).</li>
        </ul>
        <p>V reklamácii uveďte: registračný e-mail, popis vady, dátum vzniku, prípadne screenshoty.</p>
      </section>

      <section>
        <h2>4. Lehoty</h2>
        <ul>
          <li>Prijatie reklamácie potvrdíme do <b>3 pracovných dní</b>.</li>
          <li>Reklamáciu vybavíme najneskôr do <b>30 dní</b> od jej doručenia.</li>
          <li>O výsledku informujeme e-mailom.</li>
        </ul>
      </section>

      <section>
        <h2>5. Spôsoby vybavenia</h2>
        <ul>
          <li>odstránenie vady,</li>
          <li>predĺženie predplatného o čas nedostupnosti,</li>
          <li>vrátenie alikvotnej časti ceny,</li>
          <li>odôvodnené zamietnutie reklamácie.</li>
        </ul>
      </section>

      <section>
        <h2>6. Alternatívne riešenie sporov</h2>
        <p>
          Ak nesúhlasíte s vybavením reklamácie, môžete sa obrátiť na Slovenskú obchodnú
          inšpekciu (<a href="https://www.soi.sk" target="_blank" rel="noreferrer">soi.sk</a>)
          alebo na platformu ODR:{" "}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>.
        </p>
      </section>
    </LegalPage>
  );
}
