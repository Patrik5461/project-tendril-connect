import { createFileRoute, Link } from "@tanstack/react-router";
import { openCookieSettings } from "@/lib/cookie-consent";

export const Route = createFileRoute("/ochrana-osobnych-udajov")({
  head: () => ({
    meta: [
      { title: "Ochrana osobných údajov – Tendrik" },
      {
        name: "description",
        content:
          "Ako Tendrik spracúva osobné údaje, aké cookies používa a ako môžete svoje voľby kedykoľvek zmeniť.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        to="/"
        className="eyebrow text-muted-foreground hover:text-foreground"
      >
        ← Späť na úvod
      </Link>
      <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight">
        Ochrana osobných údajov
      </h1>
      <p className="mt-2 text-muted-foreground">
        Tendrik je služba pre podnikateľov (30 dní zdarma, potom od 4,99 €/mesiac). Osobné údaje
        spracúvame len v rozsahu potrebnom na fungovanie služby.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Aké údaje spracúvame
        </h2>
        <p className="text-sm leading-relaxed">
          Pri registrácii uchovávame e-mailovú adresu a nastavenia notifikácií
          (radary, frekvencia e-mailov, uložené zákazky). Údaje používame výhradne
          na doručovanie služby.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Cookies
        </h2>
        <p className="text-sm leading-relaxed">
          Používame dve kategórie cookies:
        </p>
        <ul className="list-disc pl-6 text-sm leading-relaxed space-y-1">
          <li>
            <strong>Nevyhnutné</strong> – potrebné na prihlásenie, session a
            základné nastavenia. Bez nich stránka nemôže fungovať.
          </li>
          <li>
            <strong>Analytické</strong> – voliteľné. Načítajú sa iba ak dáte
            súhlas. Pomáhajú nám merať používanie služby.
          </li>
        </ul>
        <p className="text-sm">
          <button
            type="button"
            onClick={openCookieSettings}
            className="underline underline-offset-2 hover:text-primary"
          >
            Otvoriť nastavenia cookies
          </button>
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Vaše práva
        </h2>
        <p className="text-sm leading-relaxed">
          Máte právo na prístup k svojim údajom, ich opravu a vymazanie. V prípade
          otázok nás kontaktujte na e-maile uvedenom v aplikácii.
        </p>
      </section>
    </div>
  );
}
