import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
  MapPin,
  Tag,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";

type Tender = {
  id: string;
  title: string;
  contracting_authority: string;
  description: string | null;
  cpv_code: string | null;
  region: string | null;
  deadline: string | null;
  published_at: string | null;
  source_url: string | null;
  estimated_value: number | null;
  source: string;
};

export const Route = createFileRoute("/zakazka/$id")({
  head: () => ({
    meta: [{ title: "Detail zákazky – Tendrik" }],
  }),
  component: TenderDetail,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">
          Nepodarilo sa načítať zákazku
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button
          className="mt-6"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Skúsiť znova
        </Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Zákazka neexistuje</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Túto zákazku sa nám nepodarilo nájsť.
      </p>
      <Link to="/dashboard" className="mt-6 inline-block">
        <Button>
          <ArrowLeft className="h-4 w-4 mr-2" /> Späť na zákazky
        </Button>
      </Link>
    </div>
  ),
});

function TenderDetail() {
  const { id } = Route.useParams();
  const [tender, setTender] = useState<Tender | null>(null);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data }, { data: u }] = await Promise.all([
        supabase.from("tenders").select("*").eq("id", id).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      setTender((data as Tender) ?? null);
      setAuthed(!!u.user);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-muted-foreground">
        Načítavam…
      </div>
    );
  }

  if (!tender) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Zákazka neexistuje</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Túto zákazku sa nám nepodarilo nájsť.
        </p>
        <Link to="/dashboard" className="mt-6 inline-block">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" /> Späť na zákazky
          </Button>
        </Link>
      </div>
    );
  }

  const deadlineDate = tender.deadline ? parseISO(tender.deadline) : null;
  const daysLeft = deadlineDate
    ? differenceInDays(deadlineDate, new Date())
    : null;
  const isUvo = tender.source === "UVO";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <Link
        to={authed ? "/dashboard" : "/"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Späť
      </Link>

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <span
          className={`eyebrow inline-flex items-center bg-transparent px-2 py-0.5 ${
            isUvo
              ? "border border-primary text-primary"
              : "border border-accent text-accent"
          }`}
          title={
            isUvo ? "Vestník verejného obstarávania ÚVO" : "Tenders Electronic Daily (EÚ)"
          }
        >
          {isUvo ? "ÚVO" : "TED"}
        </span>
        {daysLeft !== null && (
          daysLeft < 0 ? (
            <span className="eyebrow inline-flex items-center border border-border bg-secondary px-2 py-0.5 text-muted-foreground">
              Po termíne
            </span>
          ) : (
            <span
              className={`eyebrow inline-flex items-center px-2 py-0.5 ${
                daysLeft < 7
                  ? "border border-primary bg-primary text-primary-foreground"
                  : "border border-foreground bg-transparent text-foreground"
              }`}
            >
              {daysLeft === 0
                ? "Posledný deň"
                : `${daysLeft} ${daysLeft === 1 ? "deň" : daysLeft < 5 ? "dni" : "dní"}`}
            </span>
          )
        )}
      </div>

      <h1 className="mt-4 font-display text-3xl md:text-5xl font-bold tracking-tight leading-[1.05] text-foreground">
        {tender.title}
      </h1>

      <div className="mt-4 flex items-center gap-2 text-foreground/80">
        <Building2 className="h-4 w-4" />
        <span>{tender.contracting_authority}</span>
      </div>

      {tender.estimated_value != null && (
        <div className="mt-8 border-t-2 border-foreground border-b border-border py-5">
          <div className="eyebrow text-muted-foreground">Predpokladaná hodnota</div>
          <div className="num mt-1 text-4xl md:text-5xl font-bold text-primary leading-tight">
            {new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 })
              .format(Number(tender.estimated_value))
              .replace(/\u00a0/g, " ")}{" "}
            €
          </div>
        </div>
      )}

      <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8 border-t border-border pt-6">
        <Field
          icon={<Calendar className="h-4 w-4" />}
          label="Deadline"
          value={
            deadlineDate ? (
              <>
                <span className="num">{format(deadlineDate, "d.M.yyyy")}</span>
                {daysLeft !== null && (
                  <span
                    className={`ml-2 text-xs ${
                      daysLeft < 0
                        ? "text-muted-foreground"
                        : daysLeft < 7
                          ? "text-primary"
                          : "text-muted-foreground"
                    }`}
                  >
                    {daysLeft < 0
                      ? "po termíne"
                      : daysLeft === 0
                        ? "posledný deň"
                        : `zostáva ${daysLeft} dní`}
                  </span>
                )}
              </>
            ) : (
              "Neurčené"
            )
          }
        />
        <Field
          icon={<Calendar className="h-4 w-4" />}
          label="Zverejnené"
          value={
            tender.published_at ? (
              <span className="num">
                {format(parseISO(tender.published_at), "d.M.yyyy")}
              </span>
            ) : (
              "—"
            )
          }
        />
        <Field
          icon={<MapPin className="h-4 w-4" />}
          label="Región"
          value={tender.region ?? "—"}
        />
        <Field
          icon={<Tag className="h-4 w-4" />}
          label="CPV"
          value={
            tender.cpv_code ? (
              <span className="font-mono text-sm">
                {tender.cpv_code}
                <span className="ml-1 text-muted-foreground">
                  · {cpvCategory(tender.cpv_code)}
                </span>
              </span>
            ) : (
              "—"
            )
          }
        />
      </dl>

      {tender.description && (
        <div className="mt-10 border-t border-border pt-6">
          <div className="eyebrow text-muted-foreground">Popis zákazky</div>
          <p className="mt-3 whitespace-pre-line text-foreground/90 leading-relaxed">
            {tender.description}
          </p>
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        {tender.source_url && (
          <a href={tender.source_url} target="_blank" rel="noopener noreferrer">
            <Button>
              Otvoriť oficiálny zdroj{" "}
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          </a>
        )}
        <Link to={authed ? "/dashboard" : "/"}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" /> Späť na zákazky
          </Button>
        </Link>
      </div>

      {authed === false && (
        <div className="mt-12 border-t-2 border-foreground border-b border-border py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="eyebrow flex items-center text-foreground">
              <span className="red-square" aria-hidden="true" />
              Bezplatná služba
            </div>
            <p className="mt-2 font-display font-bold text-xl text-foreground">
              Zaregistruj sa a dostávaj takéto zákazky e-mailom
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Nastav si kľúčové slová, CPV kategórie a kraje.
            </p>
          </div>
          <Link to="/auth">
            <Button size="lg">Začať zadarmo</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}

function cpvCategory(code: string): string {
  const map: Record<string, string> = {
    "03": "Poľnohospodárske produkty",
    "09": "Ropa, palivá, elektrina",
    "14": "Baníctvo a nerasty",
    "15": "Potraviny a nápoje",
    "18": "Odevy, obuv",
    "22": "Tlačoviny",
    "24": "Chemikálie",
    "30": "Kancelárske stroje a IT",
    "31": "Elektrické zariadenia",
    "32": "Rádiové a TV zariadenia",
    "33": "Zdravotnícke pomôcky",
    "34": "Dopravné prostriedky",
    "35": "Bezpečnostné vybavenie",
    "37": "Hudobné a športové potreby",
    "38": "Laboratórne zariadenia",
    "39": "Nábytok",
    "42": "Priemyselné stroje",
    "44": "Stavebné konštrukcie",
    "45": "Stavebné práce",
    "48": "Softvér",
    "50": "Opravy a údržba",
    "51": "Inštalačné služby",
    "55": "Hotely, reštaurácie",
    "60": "Doprava",
    "63": "Podporné dopravné služby",
    "64": "Poštové a telekomunikačné služby",
    "65": "Energie, voda, odpad",
    "66": "Finančné a poistné služby",
    "70": "Nehnuteľnosti",
    "71": "Architektúra a inžinierstvo",
    "72": "IT služby",
    "73": "Výskum a vývoj",
    "75": "Verejná správa",
    "76": "Ropný a plynárenský priemysel",
    "77": "Poľnohospodárske služby",
    "79": "Podnikateľské služby",
    "80": "Vzdelávanie",
    "85": "Zdravotníctvo a sociálne služby",
    "90": "Odpad, čistenie, životné prostredie",
    "92": "Rekreácia, kultúra, šport",
    "98": "Iné komunálne, sociálne a osobné služby",
  };
  return map[code.slice(0, 2)] ?? "Iné";
}
