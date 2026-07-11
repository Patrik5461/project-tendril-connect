import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { Button } from "@/components/ui/button";
import { openCookieSettings } from "@/lib/cookie-consent";

export const Route = createFileRoute("/pravne/cookies")({
  head: () => ({
    meta: [
      { title: "Cookies – Tendrik" },
      { name: "description", content: "Aké cookies používa Tendrik.sk a ako ich môžete spravovať." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/pravne/cookies" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage
      title="Zásady používania cookies"
      intro="Cookies sú malé textové súbory, ktoré ukladáme do vášho prehliadača, aby Tendrik.sk fungoval a aby sme mu rozumeli."
    >
      <section>
        <h2>Aké cookies používame</h2>
        <h3>1. Nevyhnutné (bez súhlasu)</h3>
        <ul>
          <li><b>Session cookie</b> – udržiava vaše prihlásenie.</li>
          <li><b>CSRF token</b> – ochrana pred podvrhnutím požiadavky.</li>
          <li><b>Cookie súhlas</b> – zapamätá si vašu voľbu tohto banneru.</li>
        </ul>
        <h3>2. Analytické (so súhlasom)</h3>
        <ul>
          <li>Anonymizované štatistiky návštevnosti (Plausible / GA4) – iba ak ich povolíte.</li>
        </ul>
        <p>Marketingové ani reklamné cookies nepoužívame.</p>
      </section>

      <section>
        <h2>Ako cookies vypnúť</h2>
        <p>Voľbu môžete kedykoľvek zmeniť:</p>
        <ul>
          <li>Cez tlačidlo <b>Nastavenia cookies</b> v päte stránky alebo tu:{" "}
            <Button variant="outline" size="sm" onClick={() => openCookieSettings()}>Otvoriť nastavenia cookies</Button>
          </li>
          <li>V nastaveniach vášho prehliadača (Chrome, Firefox, Safari, Edge…).</li>
        </ul>
        <p>Nevyhnutné cookies vypnúť nemožno – bez nich by sa nedalo prihlásiť.</p>
      </section>

      <section>
        <h2>Doba uchovávania</h2>
        <ul>
          <li>Session cookie: do zatvorenia prehliadača.</li>
          <li>Súhlasové a analytické cookies: max. 24 mesiacov.</li>
        </ul>
      </section>
    </LegalPage>
  );
}
