import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/pravne/gdpr")({
  head: () => ({
    meta: [
      { title: "GDPR – ochrana osobných údajov – Tendrik" },
      { name: "description", content: "Ako Tendrik.sk (Tobify s. r. o.) spracúva osobné údaje v súlade s nariadením GDPR." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/pravne/gdpr" }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage
      title="Ochrana osobných údajov (GDPR)"
      intro="Informácie o spracovaní osobných údajov podľa nariadenia (EÚ) 2016/679 (GDPR) a zákona č. 18/2018 Z. z."
    >
      <section>
        <h2>1. Prevádzkovateľ</h2>
        <ul>
          <li><b>Tobify s. r. o.</b>, Športová 707/43, 919 26 Zavar, SR</li>
          <li>IČO: 56607016, DIČ: 2122358579 (neplatiteľ DPH)</li>
          <li>E-mail: <a href="mailto:info@tendrik.sk">info@tendrik.sk</a></li>
          <li>Telefón: <a href="tel:+421907702422">+421 907 702 422</a></li>
        </ul>
      </section>

      <section>
        <h2>2. Aké údaje spracúvame</h2>
        <ul>
          <li><b>Registračné údaje:</b> e-mailová adresa, heslo (uložené v hašovanej podobe).</li>
          <li><b>Voliteľné údaje:</b> meno, názov firmy, IČO, telefón.</li>
          <li><b>Fakturačné údaje</b> (pri platenom predplatnom): fakturačná adresa, IČO/DIČ.</li>
          <li><b>Platobné metadáta</b> od GoPay: ID transakcie, čas, suma – nie číslo karty.</li>
          <li><b>Preferencie:</b> kľúčové slová, CPV kódy, sledované regióny, nastavenia notifikácií.</li>
          <li><b>Technické údaje:</b> IP adresa, log prihlásení, cookies (viď <a href="/pravne/cookies">Cookies</a>).</li>
        </ul>
      </section>

      <section>
        <h2>3. Účel a právny základ</h2>
        <ul>
          <li><b>Plnenie zmluvy (čl. 6 ods. 1 písm. b GDPR):</b> poskytovanie služby, e-mailové notifikácie, fakturácia, zákaznícka podpora.</li>
          <li><b>Zákonná povinnosť (čl. 6 ods. 1 písm. c):</b> uchovanie účtovných dokladov 10 rokov.</li>
          <li><b>Oprávnený záujem (čl. 6 ods. 1 písm. f):</b> bezpečnosť a prevencia zneužitia služby.</li>
          <li><b>Súhlas (čl. 6 ods. 1 písm. a):</b> analytické cookies, marketingová komunikácia.</li>
        </ul>
      </section>

      <section>
        <h2>4. Doba uchovávania</h2>
        <ul>
          <li>Účet: po dobu existencie účtu + 3 roky po jeho zrušení.</li>
          <li>Fakturačné doklady: 10 rokov (zákonná povinnosť).</li>
          <li>Analytické cookies: max. 24 mesiacov.</li>
        </ul>
      </section>

      <section>
        <h2>5. Príjemcovia (sprostredkovatelia)</h2>
        <ul>
          <li><b>Supabase / Lovable Cloud</b> – hosting databázy a autentifikácia (EÚ).</li>
          <li><b>GoPay s. r. o.</b> – spracovanie platieb (ČR/EÚ).</li>
          <li><b>Resend</b> – odosielanie transakčných e-mailov (EÚ).</li>
          <li>Účtovná firma – iba fakturačné údaje.</li>
        </ul>
        <p>Údaje neprenášame mimo EHP.</p>
      </section>

      <section>
        <h2>6. Vaše práva</h2>
        <p>Ako dotknutá osoba máte právo na:</p>
        <ul>
          <li>prístup k údajom a ich kópiu,</li>
          <li>opravu nesprávnych údajov,</li>
          <li>vymazanie („právo byť zabudnutý"),</li>
          <li>obmedzenie spracovania,</li>
          <li>prenosnosť údajov,</li>
          <li>namietať proti spracovaniu na základe oprávneného záujmu,</li>
          <li>odvolať súhlas,</li>
          <li>podať sťažnosť dozornému orgánu – <b>Úrad na ochranu osobných údajov SR</b>,{" "}
            <a href="https://dataprotection.gov.sk" target="_blank" rel="noreferrer">dataprotection.gov.sk</a>.
          </li>
        </ul>
        <p>Uplatnenie práv: <a href="mailto:info@tendrik.sk">info@tendrik.sk</a>. Reagujeme do 30 dní.</p>
      </section>

      <section>
        <h2>7. Zodpovedná osoba (DPO)</h2>
        <p>
          Prevádzkovateľ nespĺňa podmienky podľa čl. 37 GDPR a nemá povinnosť ustanoviť
          zodpovednú osobu (DPO). Vo veciach ochrany údajov kontaktujte{" "}
          <a href="mailto:info@tendrik.sk">info@tendrik.sk</a>.
        </p>
      </section>

      <section>
        <h2>8. Zabezpečenie</h2>
        <p>
          Údaje sú prenášané cez HTTPS/TLS, heslá sú hašované, prístupy sú logované.
          Databáza je chránená row-level security politikami.
        </p>
      </section>
    </LegalPage>
  );
}
