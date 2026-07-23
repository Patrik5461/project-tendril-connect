import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar, Building2, MapPin, FileText, Search, RotateCcw, Infinity as InfinityIcon, ExternalLink } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";

type Grant = {
  id: string;
  kod: string | null;
  title: string;
  program: string | null;
  poskytovatel: string | null;
  suma_eu: number | null;
  suma_sr: number | null;
  deadline: string | null;
  datum_vyhlasenia: string | null;
  stav: string | null;
  typ: string | null;
  opravneny_ziadatel: any;
  miesto_realizacie: any;
  documents: any;
};

const PAGE_SIZE = 20;

const searchSchema = z.object({
  stav: fallback(z.enum(["OTVORENA", "UZAVRETA", "ZRUSENA", "all"]), "OTVORENA").default("OTVORENA"),
  typ: fallback(z.enum(["all", "OTVORENA", "UZAVRETA"]), "all").default("all"),
  program: fallback(z.string(), "").default(""),
  region: fallback(z.string(), "").default(""),
  ziadatel: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["deadline", "newest", "suma_desc"]), "deadline").default("deadline"),
  page: fallback(z.number().int(), 1).default(1),
});

export const Route = createFileRoute("/_authenticated/granty")({
  head: () => ({
    meta: [
      { title: "Granty a dotácie – Tendrik" },
      { name: "description", content: "Aktuálne grantové výzvy z Programu Slovensko a fondov EÚ (ITMS21+). Filtre podľa oblasti, žiadateľa, regiónu a deadlinu." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: GrantyList,
});

const REGIONS = [
  "Bratislavský kraj", "Trnavský kraj", "Trenčiansky kraj", "Nitriansky kraj",
  "Žilinský kraj", "Banskobystrický kraj", "Prešovský kraj", "Košický kraj",
];

function GrantyList() {
  const { stav, typ, program, region, ziadatel, q, sort, page } = Route.useSearch();
  const navigate = useNavigate({ from: "/granty" });

  const [items, setItems] = useState<Grant[]>([]);
  const [total, setTotal] = useState(0);
  const [programs, setPrograms] = useState<string[]>([]);
  const [ziadatele, setZiadatele] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState(q);

  useEffect(() => setQInput(q), [q]);

  // Load facets once
  useEffect(() => {
    (async () => {
      const { data: progs } = await supabase.from("grant_calls").select("program").not("program", "is", null);
      const uniqueProgs = Array.from(new Set((progs ?? []).map((r: any) => r.program).filter(Boolean))).sort();
      setPrograms(uniqueProgs as string[]);

      // Aggregate applicant types
      const { data: rows } = await supabase.from("grant_calls").select("opravneny_ziadatel");
      const set = new Set<string>();
      for (const r of rows ?? []) {
        const arr = (r as any).opravneny_ziadatel;
        if (Array.isArray(arr)) for (const z of arr) { if (z?.nazov) set.add(z.nazov); }
      }
      setZiadatele(Array.from(set).sort());
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase
        .from("grant_calls")
        .select("id,kod,title,program,poskytovatel,suma_eu,suma_sr,deadline,datum_vyhlasenia,stav,typ,opravneny_ziadatel,miesto_realizacie,documents", { count: "exact" });

      if (stav !== "all") query = query.eq("stav", stav);
      if (typ !== "all") query = query.eq("typ", typ);
      if (program) query = query.eq("program", program);
      if (ziadatel) query = query.contains("opravneny_ziadatel", [{ nazov: ziadatel }]);
      if (region) query = query.contains("miesto_realizacie", [{ nazov: region }]);
      if (q) query = query.or(`title.ilike.%${q}%,kod.ilike.%${q}%,poskytovatel.ilike.%${q}%`);

      if (sort === "deadline") {
        query = query.order("deadline", { ascending: true, nullsFirst: false });
      } else if (sort === "newest") {
        query = query.order("datum_vyhlasenia", { ascending: false, nullsFirst: false });
      } else if (sort === "suma_desc") {
        query = query.order("suma_eu", { ascending: false, nullsFirst: false });
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count } = await query;
      setItems((data ?? []) as Grant[]);
      setTotal(count ?? 0);
      setLoading(false);
    })();
  }, [stav, typ, program, region, ziadatel, q, sort, page]);

  function updateSearch(patch: Partial<z.infer<typeof searchSchema>>) {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });
  }

  function resetFilters() {
    navigate({ search: { stav: "OTVORENA", typ: "all", program: "", region: "", ziadatel: "", q: "", sort: "deadline", page: 1 } });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Granty a dotácie</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aktuálne grantové výzvy z Programu Slovensko a fondov EÚ (ITMS21+).
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="num font-semibold text-foreground">{total.toLocaleString("sk")}</span> {stav === "OTVORENA" ? "otvorených" : "nájdených"} výziev
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-b border-border py-4">
        <div className="lg:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Hľadať podľa názvu, kódu alebo poskytovateľa…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") updateSearch({ q: qInput }); }}
            onBlur={() => { if (qInput !== q) updateSearch({ q: qInput }); }}
          />
        </div>

        <Select value={stav} onValueChange={(v) => updateSearch({ stav: v as any })}>
          <SelectTrigger><SelectValue placeholder="Stav" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="OTVORENA">Otvorené</SelectItem>
            <SelectItem value="UZAVRETA">Uzavreté</SelectItem>
            <SelectItem value="ZRUSENA">Zrušené</SelectItem>
            <SelectItem value="all">Všetky</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typ} onValueChange={(v) => updateSearch({ typ: v as any })}>
          <SelectTrigger><SelectValue placeholder="Formát výzvy" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Formát: všetky</SelectItem>
            <SelectItem value="OTVORENA">Priebežné (rolling)</SelectItem>
            <SelectItem value="UZAVRETA">One-shot (uzatvárajúce sa)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={program || "__all__"} onValueChange={(v) => updateSearch({ program: v === "__all__" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="Program" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všetky programy</SelectItem>
            {programs.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={region || "__all__"} onValueChange={(v) => updateSearch({ region: v === "__all__" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="Miesto realizácie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Celé Slovensko</SelectItem>
            {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={ziadatel || "__all__"} onValueChange={(v) => updateSearch({ ziadatel: v === "__all__" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="Oprávnený žiadateľ" /></SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="__all__">Všetci žiadatelia</SelectItem>
            {ziadatele.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => updateSearch({ sort: v as any })}>
          <SelectTrigger><SelectValue placeholder="Zoradiť" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="deadline">Podľa deadlinu</SelectItem>
            <SelectItem value="newest">Najnovšie vyhlásené</SelectItem>
            <SelectItem value="suma_desc">Najvyššia suma EÚ</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={resetFilters} className="justify-start">
          <RotateCcw className="h-4 w-4 mr-2" /> Vyčistiť filtre
        </Button>
      </div>

      {/* List */}
      <div className="mt-6 space-y-3">
        {loading && <div className="text-muted-foreground text-sm py-8">Načítavam…</div>}
        {!loading && items.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            Žiadne výzvy nezodpovedajú filtrom.
          </div>
        )}
        {items.map((g) => <GrantCard key={g.id} g={g} />)}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate({ search: (p) => ({ ...p, page: page - 1 }) })}>
            Predchádzajúca
          </Button>
          <span className="text-sm text-muted-foreground">
            Strana <span className="num font-medium text-foreground">{page}</span> z <span className="num">{totalPages}</span>
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => navigate({ search: (p) => ({ ...p, page: page + 1 }) })}>
            Ďalšia
          </Button>
        </div>
      )}
    </div>
  );
}

function GrantCard({ g }: { g: Grant }) {
  const deadlineDate = g.deadline ? parseISO(g.deadline) : null;
  const daysLeft = deadlineDate ? differenceInDays(deadlineDate, new Date()) : null;
  const rolling = g.typ === "OTVORENA";
  const docsCount = Array.isArray(g.documents) ? g.documents.length : 0;
  const regions = Array.isArray(g.miesto_realizacie) ? g.miesto_realizacie.map((x: any) => x?.nazov).filter(Boolean) : [];
  const totalSum = (g.suma_eu ?? 0) + (g.suma_sr ?? 0);

  return (
    <Link to="/grant/$id" params={{ id: g.id }} className="block group">
      <article className="border border-border hover:border-foreground transition-colors bg-card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {g.kod && (
              <span className="font-mono text-xs bg-secondary text-foreground px-2 py-0.5 rounded">
                {g.kod}
              </span>
            )}
            {rolling ? (
              <span className="eyebrow inline-flex items-center border border-emerald-600 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
                <InfinityIcon className="h-3 w-3 mr-1" /> Priebežná
              </span>
            ) : (
              <span className="eyebrow inline-flex items-center border border-primary text-primary px-2 py-0.5">
                One-shot
              </span>
            )}
            {deadlineDate && daysLeft !== null && daysLeft >= 0 && daysLeft < 30 && (
              <span className={`eyebrow inline-flex items-center px-2 py-0.5 ${daysLeft < 7 ? "border border-primary bg-primary text-primary-foreground" : "border border-foreground text-foreground"}`}>
                {daysLeft === 0 ? "Posledný deň" : `${daysLeft} dní`}
              </span>
            )}
          </div>
          {totalSum > 0 && (
            <div className="text-right">
              <div className="eyebrow text-muted-foreground">Alokácia EÚ+ŠR</div>
              <div className="num font-bold text-primary text-lg leading-tight">
                {new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 }).format(totalSum)} €
              </div>
            </div>
          )}
        </div>

        <h2 className="mt-3 font-display font-semibold text-lg leading-snug group-hover:text-primary transition-colors">
          {g.title}
        </h2>

        {g.program && (
          <div className="mt-1 text-xs text-muted-foreground">{g.program}</div>
        )}

        <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Poskytovateľ</dt>
            <dd className="mt-0.5 line-clamp-2">{g.poskytovatel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Deadline</dt>
            <dd className="mt-0.5">
              {deadlineDate ? (
                <span className="num">{format(deadlineDate, "d.M.yyyy")}</span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400 text-xs font-medium">priebežná výzva</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Región</dt>
            <dd className="mt-0.5 text-xs">
              {regions.length === 0 ? "—" : regions.length >= 8 ? "Celé Slovensko" : regions.slice(0, 2).join(", ") + (regions.length > 2 ? ` +${regions.length - 2}` : "")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Dokumenty</dt>
            <dd className="mt-0.5 num">{docsCount}</dd>
          </div>
        </dl>
      </article>
    </Link>
  );
}
