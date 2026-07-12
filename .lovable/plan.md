# Faktero API – automatické fakturácie

Napojenie Tendriku na Faktero (https://faktero.sk/api/v1) tak, aby sa po každej úspešnej GoPay platbe automaticky vystavila, označila ako zaplatená a odoslala faktúra zákazníkovi. Faktúra sa vždy vystavuje s DPH 23 % tak, aby celková suma zodpovedala 4,99 € s DPH (unit_price bez DPH = 4,06 €, zaokrúhlením na 2 desatinné miesta vzniká rozdiel ~0,004 € – ak Faktero prepočíta iným spôsobom, doladíme podľa testovacej faktúry v kroku 8).

---

## 1. Secrets

- `FAKTERO_API_KEY` – doplní používateľ (`fk_test_...` = test režim, `fk_live_...` = produkcia). Režim sa určí podľa prefixu.
- Base URL a header pevne v kóde: `https://faktero.sk/api/v1`, `Authorization: Bearer <key>`.

## 2. Databáza (jedna migrácia)

- `billing_details` (1:1 na `user_id`): name, ico, ic_dph, street, city, zip, country (default 'SK'), email, faktero_customer_id, timestamps. RLS: vlastník číta/upravuje, service_role všetko.
- `invoices`: user_id, faktero_invoice_id (nullable kým sa nevystaví), invoice_number, amount, currency, status ('pending'|'issued'|'failed'|'paid_marked'|'sent'), gopay_payment_id (unique, na idempotenciu), error_message, retry_count, next_retry_at, issued_at, timestamps. RLS: vlastník číta, service_role všetko; admin cez `has_role`.
- Grants pre `authenticated` (SELECT/INSERT/UPDATE billing_details, SELECT invoices) a `service_role` (ALL).

## 3. Server funkcie (`createServerFn` + auth middleware)

- `getBillingDetails`, `upsertBillingDetails` – používateľ si edituje fakturačné údaje.
- `lookupCompanyByIco(ico)` – najprv skúsim, či existuje interná funkcia; ak nie, ostane manuálne (podľa zadania).
- `listMyInvoices` – zoznam pre sekciu Predplatné.
- `downloadInvoicePdf(invoiceId)` – zavolá Faktero `GET /invoices/{id}/pdf`, vráti `signed_url` (client urobí redirect).
- **Admin**: `adminListInvoices({ status })`, `adminRetryInvoice(invoiceId)`, `adminGetFakteroMode()` (vráti test/live podľa prefixu kľúča a počty).

## 4. Faktero klient (`src/lib/faktero.server.ts`)

Modul určený len pre server (`.server.ts` = mimo klientského bundlu). Obsahuje:
- `fakteroFetch(path, init)` – nastaví Bearer header, JSON, retry s exponenciálnym backoffom na 429/5xx (max 4 pokusy, 500 ms → 1 s → 2 s → 4 s + jitter). Iné chyby (4xx okrem 429) sa nerekurzujú.
- `ensureCustomer(userId)` – ak billing_details.faktero_customer_id je NULL → `POST /customers`, uloží id.
- `createInvoice({ userId, gopayPaymentId, amountGross })` – prepočet: `unit_price = round(amountGross / 1.23, 2)`, `vat_rate: 23`, položka „Tendrik – mesačné predplatné". Volá `POST /invoices`, potom `POST /invoices/{id}/mark-paid`, potom `POST /invoices/{id}/send` s recipient_email z billing_details.
- `issueInvoiceForPayment(...)` – celý orchestrátor s idempotenciou cez `gopay_payment_id` unique index; pri chybe zapíše `status='failed'`, `error_message`, `retry_count`, `next_retry_at` a **nehodí** ďalej (aby to nezhodilo webhook).

## 5. Napojenie na GoPay webhook

V existujúcom `gopay-webhook` handleri, po tom čo sa platba potvrdí ako úspešná a aktivuje predplatné (najprv aktivácia, potom fakturácia), zavoláme `issueInvoiceForPayment` v try/catch. Chyba Faktera **nikdy** neovplyvní odpoveď webhooku ani stav predplatného.

## 6. UI

- **Pred platbou / v nastaveniach → Predplatné**: `BillingDetailsForm` (Zod validácia, IČO/IČ DPH nepovinné, krajina default SK). Ak `faktero_customer_id` už existuje a údaje sa zmenia, aktualizuje sa aj Faktero customer (PUT) – najprv len local uloženie + refresh pri ďalšej faktúre, ak Faktero PUT nemá, ostane iba lokálny update. *(Detail podľa API dokumentácie – ak endpoint chýba, len lokálny update.)*
- **História faktúr**: tabuľka (dátum, číslo, suma, status, „Stiahnuť PDF"). PDF sa otvorí v novom tabe cez signed_url.
- **Admin → nová záložka „Fakturácia"**: prepínač Test/Live (informatívny badge podľa prefixu kľúča), počty (vystavené / neúspešné / čakajúce), tabuľka nevystavených s tlačidlom „Skúsiť znova" (volá `adminRetryInvoice`) a manuálne vystavenie pre daný `gopay_payment_id`.

## 7. Idempotencia a odolnosť

- `invoices.gopay_payment_id` UNIQUE – druhé volanie webhooku na tú istú platbu nevystaví novú faktúru.
- Zlyhania sa neblokujú, iba logujú a ukladajú do `invoices` so `status='failed'`.
- Retry v admin tlačidle + backoff v `fakteroFetch`.

## 8. Testovanie

Po nasadení požiadam o vloženie `fk_test_` kľúča a spustím end-to-end test cez existujúci sandbox GoPay flow. Ukážem odpovede z `POST /customers`, `POST /invoices`, `mark-paid`, `send` a číslo vytvorenej testovacej faktúry.

---

## Otvorené otázky pred spustením

1. Presné názvy polí v Faktero API (`customer_id` vs `customerId`, tvar `mark-paid` vs `mark_paid`, presné pole `signed_url`) – overím proti dokumentácii pri implementácii; ak sa pole odlišuje, upravím klienta. Toto je jediné miesto, kde môžeme naraziť pri prvom teste.
2. Existujúce IČO-lookup – ak už funkcia v projekte je, znovupoužijem; ak nie, ponechám manuálne (podľa zadania).

Ak plán sedí, poviem "OK, choď" a začnem migráciou + Faktero klientom, potom webhook, UI a admin.
