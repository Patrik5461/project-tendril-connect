import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar, ExternalLink, Building2, MapPin, AlertCircle, RefreshCw } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { toast } from "sonner";

type Tender = {
  id: string;
  title: string;
  contracting_authority: string;
  description: string;
  cpv_code: string;
  region: string;
  deadline: string;
  published_at: string;
  source_url: string;
  estimated_value: number | null;
};

type Prefs = {
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  onboarding_completed: boolean;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Zákazky – Tendrik" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"deadline" | "published">("deadline");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [{ data: p }, { data: t }] = await Promise.all([
        supabase
          .from("user_preferences")
          .select("keywords,cpv_codes,regions,onboarding_completed")
          .eq("user_id", u.user.id)
          .maybeSingle(),
        supabase.from("tenders").select("*"),
      ]);
      setPrefs(p as Prefs | null);
      setTenders((t ?? []) as Tender[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!prefs) return [];
    const kws = prefs.keywords.map((k) => k.toLowerCase());
    const cpvs = prefs.cpv_codes;
    const regs = prefs.regions;
    const wholeSk = regs.includes("Celé Slovensko");

    let result = tenders.filter((t) => {
      const regionOk = wholeSk || regs.includes(t.region);
      if (!regionOk) return false;
      const text = (t.title + " " + t.description).toLowerCase();
      const keywordMatch = kws.length > 0 && kws.some((k) => text.includes(k));
      const cpvMatch = cpvs.length > 0 && cpvs.some((c) => t.cpv_code.startsWith(c));
      return keywordMatch || cpvMatch;
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.contracting_authority.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => {
      if (sort === "deadline") return a.deadline.localeCompare(b.deadline);
      return b.published_at.localeCompare(a.published_at);
    });
    return result;
  }, [tenders, prefs, sort, search]);

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-muted-foreground">Načítavam...</div>;
  }

  if (!prefs?.onboarding_completed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Ešte ste nenastavili filtre</h1>
        <p className="mt-2 text-muted-foreground">
          Aby sme vám ukázali relevantné zákazky, potrebujeme vaše kľúčové slová, CPV kategórie a
          kraje.
        </p>
        <Link to="/onboarding" className="mt-6 inline-block">
          <Button size="lg">Nastaviť filtre</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Vaše zákazky</h1>
          <p className="text-muted-foreground mt-1">
            Nájdených <b>{filtered.length}</b> zákaziek podľa vašich filtrov
          </p>
        </div>
        <div className="flex gap-2 flex-col sm:flex-row">
          <Input
            placeholder="Hľadať v zákazkach..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-64"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deadline">Podľa deadline</SelectItem>
              <SelectItem value="published">Podľa dátumu zverejnenia</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-12 rounded-xl border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            Žiadne zákazky nezodpovedajú vašim filtrom. Skúste upraviť{" "}
            <Link to="/settings" className="text-primary underline">
              nastavenia
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {filtered.map((t) => (
            <TenderCard key={t.id} tender={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TenderCard({ tender }: { tender: Tender }) {
  const daysLeft = differenceInDays(parseISO(tender.deadline), new Date());
  const urgent = daysLeft < 7;
  return (
    <article className="rounded-xl border bg-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div>
        <h3 className="font-semibold text-lg leading-snug">{tender.title}</h3>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          {tender.contracting_authority}
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          {tender.region}
          <span className="ml-2 font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">
            CPV {tender.cpv_code}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2">{tender.description}</p>
      <div className="mt-auto flex items-center justify-between pt-2 border-t">
        <div
          className={`flex items-center gap-1.5 text-sm font-medium ${
            urgent ? "text-destructive" : "text-foreground"
          }`}
        >
          {urgent ? <AlertCircle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
          <span>
            {format(parseISO(tender.deadline), "d.M.yyyy")}
            <span className="ml-1 text-xs opacity-80">
              ({daysLeft < 0 ? "po termíne" : `${daysLeft} dní`})
            </span>
          </span>
        </div>
        <a href={tender.source_url} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline">
            Zdroj <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </a>
      </div>
    </article>
  );
}
