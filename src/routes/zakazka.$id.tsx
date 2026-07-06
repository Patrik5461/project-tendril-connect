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
  Coins,
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

      <div className="mt-6 flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
          {tender.title}
        </h1>
        <span
          className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-md border ${
            isUvo
              ? "bg-accent text-accent-foreground border-primary/30"
              : "bg-transparent text-primary border-primary"
          }`}
          title={
            isUvo ? "Vestník verejného obstarávania ÚVO" : "Tenders Electronic Daily (EÚ)"
          }
        >
          {isUvo ? "ÚVO" : "TED"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span>{tender.contracting_authority}</span>
      </div>

      <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-primary/15 bg-card p-5">
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
                        ? "text-destructive"
                        : daysLeft < 7
                          ? "text-warning"
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
        {tender.estimated_value != null && (
          <Field
            icon={<Coins className="h-4 w-4" />}
            label="Predpokladaná hodnota"
            value={
              <span className="num font-medium">
                {new Intl.NumberFormat("sk-SK").format(
                  Number(tender.estimated_value),
                )}{" "}
                €
              </span>
            }
          />
        )}
      </dl>

      {tender.description && (
        <div className="mt-6">
          <h2 className="font-display text-lg font-semibold">Popis zákazky</h2>
          <p className="mt-2 whitespace-pre-line text-foreground/90 leading-relaxed">
            {tender.description}
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
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
        <div className="mt-10 rounded-xl border border-primary/20 bg-accent-soft p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="font-display font-semibold text-lg text-primary">
              Zaregistruj sa a dostávaj takéto zákazky e-mailom
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Nastav si kľúčové slová, CPV kategórie a kraje. 100 % bezplatná
              služba.
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
