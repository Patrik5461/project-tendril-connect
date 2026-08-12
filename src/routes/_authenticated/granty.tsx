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
import { Calendar, Building2, MapPin, FileText, Search, RotateCcw, Infinity as InfinityIcon, Briefcase, Landmark, HeartHandshake, Users, Lock as LockIcon } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import {
  ApplicantCategory, CATEGORY_LABEL, CATEGORY_SHORT,
  categoriesForGrant, defaultCategoryFromLegalForm,
} from "@/lib/grant-applicant-categories";
import { AI_MONTHLY_LIMIT, formatEur, priceEur } from "@/lib/subscription";
import { fetchEntitlements } from "@/hooks/use-entitlements";
import { WebOnlyPurchase } from "@/components/WebOnlyPurchase";
import { useTranslation } from "react-i18next";



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
  kategoria: fallback(z.enum(["all", "podnikatelia", "verejny", "neziskovky", "auto"]), "auto").default("auto"),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["deadline", "newest", "suma_desc", "suma_asc"]), "deadline").default("deadline"),
  page: fallback(z.number().int(), 1).default(1),
});

export const Route = createFileRoute("/_authenticated/granty")({
  head: () => ({
    meta: [
      { title: "Granty a dotácie – Tendrik" },
      { name: "description", content: "Aktuálne grantové výzvy z Programu Slovensko a fondov EÚ (ITMS21+). Filtrujte podľa typu žiadateľa, oblasti, regiónu a deadlinu." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: GrantyList,
});

const REGIONS = [
  "Bratislavský kraj", "Trnavský kraj", "Trenčiansky kraj", "Nitriansky kraj",
  "Žilinský kraj", "Banskobystrický kraj", "Prešovský kraj", "Košický kraj",
];

// NUTS3 → SK názov (defenzívne, ak by ITMS niekde vrátil len kód)
const NUTS_TO_REGION: Record<string, string> = {
  SK010: "Bratislavský kraj", SK021: "Trnavský kraj", SK022: "Trenčiansky kraj",
  SK023: "Nitriansky kraj",   SK031: "Žilinský kraj", SK032: "Banskobystrický kraj",
  SK041: "Prešovský kraj",    SK042: "Košický kraj",
};

function extractRegionNames(mr: any): string[] {
  if (!Array.isArray(mr)) return [];
  const out = new Set<string>();
  for (const item of mr) {
    const nazov = item?.nazov?.trim?.();
    const kod: string = item?.kod ?? "";
    // Whole-country markers
    if (/^SK0?$/i.test(kod) || /^1006SK0?$/i.test(kod) ||
        /slovensk[aá]\s*republika|cel[eé]\s*slovensko/i.test(nazov ?? "")) {
      REGIONS.forEach((r) => out.add(r));
      continue;
    }
    if (nazov && REGIONS.includes(nazov)) { out.add(nazov); continue; }
    // NUTS fallback (e.g. "1006SK021" or "SK021")
    const m = kod.match(/SK0(?:10|21|22|23|31|32|41|42)/i);
    if (m) {
      const nuts = m[0].toUpperCase();
      const mapped = NUTS_TO_REGION[nuts];
      if (mapped) out.add(mapped);
    }
  }
  return Array.from(out);
}

function regionLabel(regions: string[], t: (k: string, o?: any) => string): string {
  if (regions.length === 0) return t("granty.regionLabel.none");
  if (regions.length >= 8) return t("granty.regionLabel.wholeCountry");
  if (regions.length >= 5) return t("granty.regionLabel.manyRegions", { count: regions.length });
  return regions.join(", ");
}

const CATEGORY_ICON: Record<ApplicantCategory, typeof Briefcase> = {
  podnikatelia: Briefcase,
  verejny: Landmark,
  neziskovky: HeartHandshake,
};

function GrantyList() {
  const { stav, typ, program, region, kategoria, q, sort, page } = Route.useSearch();
  const { t } = useTranslation("app");
  const navigate = useNavigate({ from: "/granty" });

  const [allItems, setAllItems] = useState<Grant[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState(q);
  const [profileCategory, setProfileCategory] = useState<ApplicantCategory | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [grantAccess, setGrantAccess] = useState<boolean | null>(null);

  useEffect(() => setQInput(q), [q]);

  // Load current user's default applicant category (from company_profile.pravna_forma)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setProfileLoaded(true); return; }
      const { data } = await supabase
        .from("company_profile")
        .select("pravna_forma")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();
      setProfileCategory(defaultCategoryFromLegalForm(data?.pravna_forma));
      setProfileLoaded(true);
      // Jediný zdroj pravdy pre prístup ku grantom: RPC get_entitlements().can_grants
      const ent = await fetchEntitlements();
      setGrantAccess(ent ? !!ent.can_grants : true);
    })();
  }, []);

  // Load facets
  useEffect(() => {
    (async () => {
      const { data: progs } = await supabase.from("grant_calls").select("program").not("program", "is", null);
      const uniqueProgs = Array.from(new Set((progs ?? []).map((r: any) => r.program).filter(Boolean))).sort();
      setPrograms(uniqueProgs as string[]);
    })();
  }, []);

  // Fetch all matching grants (excluding kategoria — we filter that client-side)
  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase
        .from("grant_calls")
        .select("id,kod,title,program,poskytovatel,suma_eu,suma_sr,deadline,datum_vyhlasenia,stav,typ,opravneny_ziadatel,miesto_realizacie,documents");

      if (stav !== "all") query = query.eq("stav", stav);
      if (typ !== "all") query = query.eq("typ", typ);
      if (program) query = query.eq("program", program);
      // region filter runs client-side (celoslovenské výzvy musia matchovať každý kraj)
      if (q) query = query.or(`title.ilike.%${q}%,kod.ilike.%${q}%,poskytovatel.ilike.%${q}%`);

      if (sort === "deadline") {
        query = query.order("deadline", { ascending: true, nullsFirst: false });
      } else if (sort === "newest") {
        query = query.order("datum_vyhlasenia", { ascending: false, nullsFirst: false });
      } else if (sort === "suma_desc") {
        query = query.order("suma_eu", { ascending: false, nullsFirst: false });
      } else if (sort === "suma_asc") {
        query = query.order("suma_eu", { ascending: true, nullsFirst: false });
      }

      query = query.limit(2000);

      const { data } = await query;
      setAllItems((data ?? []) as Grant[]);
      setLoading(false);
    })();
  }, [stav, typ, program, region, q, sort]);

  // Compute per-category + per-region counts + filter to selected category & region
  const { counts, regionCounts, effectiveCategory, filtered } = useMemo(() => {
    const counts = { podnikatelia: 0, verejny: 0, neziskovky: 0, ine: 0 };
    const regionCounts: Record<string, number> = { __whole__: 0 };
    REGIONS.forEach((r) => (regionCounts[r] = 0));

    const withMeta = allItems.map((g) => {
      const cats = categoriesForGrant(g.opravneny_ziadatel);
      if (cats.has("podnikatelia")) counts.podnikatelia++;
      if (cats.has("verejny")) counts.verejny++;
      if (cats.has("neziskovky")) counts.neziskovky++;
      if (cats.size === 0) counts.ine++;

      const regs = extractRegionNames(g.miesto_realizacie);
      const isWhole = regs.length >= 8;
      if (isWhole) regionCounts.__whole__++;
      regs.forEach((r) => { if (r in regionCounts) regionCounts[r]++; });
      return { g, cats, regs, isWhole };
    });

    const effective: ApplicantCategory | "all" =
      kategoria === "auto" ? (profileCategory ?? "all") : kategoria;

    const filtered = withMeta
      .filter((x) => effective === "all" ? true : x.cats.has(effective))
      .filter((x) => !region ? true : (x.isWhole || x.regs.includes(region)))
      .map((x) => x.g);

    return { counts, regionCounts, effectiveCategory: effective, filtered };
  }, [allItems, kategoria, profileCategory, region]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateSearch(patch: Partial<z.infer<typeof searchSchema>>) {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch, page: 1 }) });
  }

  function resetFilters() {
    navigate({ search: { stav: "OTVORENA", typ: "all", program: "", region: "", kategoria: "auto", q: "", sort: "deadline", page: 1 } });
  }

  const showAutoHint = kategoria === "auto" && profileCategory !== null;

  if (grantAccess === false) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("granty.title")}</h1>
        <div className="mt-6 rounded-lg border-2 border-primary bg-primary/5 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <LockIcon className="h-4 w-4" /> {t("granty.locked.badge")}
          </div>
          <p className="mt-2 text-sm text-foreground/80">
            {t("granty.locked.description", { price: formatEur(priceEur("komplet")), limit: AI_MONTHLY_LIMIT.komplet })}
          </p>
          <WebOnlyPurchase className="mt-5">
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/predplatne" search={{ tier: "komplet", period: "monthly" } as never}>
                <Button>{t("granty.locked.cta")}</Button>
              </Link>
              <Link to="/cennik"><Button variant="outline">{t("granty.locked.compare")}</Button></Link>
            </div>
          </WebOnlyPurchase>

        </div>
      </div>
    );
  }

  return (

    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{t("granty.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("granty.subtitle")}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="num font-semibold text-foreground">{total.toLocaleString("sk")}</span>{" "}
          {stav === "OTVORENA" ? t("granty.count", { count: total }) : t("granty.countAll", { count: total })}
        </div>
      </div>

      {/* Prominent applicant-type filter */}
      <div className="mt-6 border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div className="eyebrow text-muted-foreground">{t("granty.applicantType.label")}</div>
          {showAutoHint && (
            <span className="text-xs text-muted-foreground">
              {t("granty.applicantType.autoHint", { category: CATEGORY_SHORT[profileCategory!] })}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <CategoryButton
            active={effectiveCategory === "podnikatelia"}
            onClick={() => updateSearch({ kategoria: "podnikatelia" })}
            icon={Briefcase}
            label={t("granty.applicantType.businesses")}
            count={counts.podnikatelia}
            hint={t("granty.applicantType.businessesHint")}
          />
          <CategoryButton
            active={effectiveCategory === "verejny"}
            onClick={() => updateSearch({ kategoria: "verejny" })}
            icon={Landmark}
            label={t("granty.applicantType.public")}
            count={counts.verejny}
            hint={t("granty.applicantType.publicHint")}
          />
          <CategoryButton
            active={effectiveCategory === "neziskovky"}
            onClick={() => updateSearch({ kategoria: "neziskovky" })}
            icon={HeartHandshake}
            label={t("granty.applicantType.nonprofits")}
            count={counts.neziskovky}
            hint={t("granty.applicantType.nonprofitsHint")}
          />
          <CategoryButton
            active={effectiveCategory === "all"}
            onClick={() => updateSearch({ kategoria: "all" })}
            icon={Users}
            label={t("granty.applicantType.all")}
            count={allItems.length}
            hint={t("granty.applicantType.allHint")}
          />
        </div>
        {!profileLoaded ? null : profileCategory === null && kategoria === "auto" && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("granty.applicantType.tip", { link: "" })}<Link to="/firma" className="underline hover:text-foreground">{t("granty.applicantType.tipLink")}</Link>
          </p>
        )}
      </div>

      {/* Ostatné filtre */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-b border-border py-4">
        <div className="lg:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("granty.filters.searchPlaceholder")}
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") updateSearch({ q: qInput }); }}
            onBlur={() => { if (qInput !== q) updateSearch({ q: qInput }); }}
          />
        </div>

        <Select value={stav} onValueChange={(v) => updateSearch({ stav: v as any })}>
          <SelectTrigger><SelectValue placeholder={t("granty.filters.statusPlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="OTVORENA">{t("granty.filters.statusOpen")}</SelectItem>
            <SelectItem value="UZAVRETA">{t("granty.filters.statusClosed")}</SelectItem>
            <SelectItem value="ZRUSENA">{t("granty.filters.statusCancelled")}</SelectItem>
            <SelectItem value="all">{t("granty.filters.statusAll")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typ} onValueChange={(v) => updateSearch({ typ: v as any })}>
          <SelectTrigger><SelectValue placeholder={t("granty.filters.typePlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("granty.filters.typeAll")}</SelectItem>
            <SelectItem value="OTVORENA">{t("granty.filters.typeRolling")}</SelectItem>
            <SelectItem value="UZAVRETA">{t("granty.filters.typeOneShot")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={program || "__all__"} onValueChange={(v) => updateSearch({ program: v === "__all__" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder={t("granty.filters.programPlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("granty.filters.programAll")}</SelectItem>
            {programs.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={region || "__all__"} onValueChange={(v) => updateSearch({ region: v === "__all__" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder={t("granty.filters.regionPlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">
              {t("granty.filters.regionAll", { count: allItems.length })}
            </SelectItem>
            {REGIONS.map((r) => {
              const total = (regionCounts[r] ?? 0);
              const whole = regionCounts.__whole__ ?? 0;
              const regional = Math.max(0, total - whole);
              return (
                <SelectItem key={r} value={r}>
                  {r} — {total} <span className="text-muted-foreground">{t("granty.filters.regionSummary", { whole, regional })}</span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => updateSearch({ sort: v as any })}>
          <SelectTrigger><SelectValue placeholder={t("granty.filters.sortPlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="deadline">{t("granty.filters.sortDeadline")}</SelectItem>
            <SelectItem value="newest">{t("granty.filters.sortNewest")}</SelectItem>
            <SelectItem value="suma_desc">{t("granty.filters.sortSumDesc")}</SelectItem>
            <SelectItem value="suma_asc">{t("granty.filters.sortSumAsc")}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={resetFilters} className="justify-start">
          <RotateCcw className="h-4 w-4 mr-2" /> {t("granty.filters.reset")}
        </Button>
      </div>

      {/* List */}
      <div className="mt-6 space-y-3">
        {loading && <div className="text-muted-foreground text-sm py-8">{t("granty.list.loading")}</div>}
        {!loading && filtered.length === 0 && (
          <EmptyState category={effectiveCategory} onReset={() => updateSearch({ kategoria: "all" })} />
        )}
        {pageItems.map((g) => <GrantCard key={g.id} g={g} />)}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate({ search: (p: z.infer<typeof searchSchema>) => ({ ...p, page: page - 1 }) })}>
            {t("granty.pagination.prev")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("granty.pagination.page", { page, total: totalPages })}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => navigate({ search: (p: z.infer<typeof searchSchema>) => ({ ...p, page: page + 1 }) })}>
            {t("granty.pagination.next")}
          </Button>
        </div>
      )}
    </div>
  );
}

function CategoryButton({
  active, onClick, icon: Icon, label, count, hint,
}: {
  active: boolean; onClick: () => void; icon: typeof Briefcase;
  label: string; count: number; hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left border p-3 transition-colors ${
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:border-foreground bg-background"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
          <span className="font-medium text-sm">{label}</span>
        </div>
        <span className={`num text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{count}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

function EmptyState({ category, onReset }: { category: ApplicantCategory | "all"; onReset: () => void }) {
  const { t } = useTranslation("app");
  if (category === "all") {
    return (
      <div className="text-center py-16 text-muted-foreground">
        {t("granty.emptyState.allNoMatch")}
      </div>
    );
  }
  const label = CATEGORY_LABEL[category];
  return (
    <div className="border border-border bg-muted/30 p-8 text-center">
      <div className="font-medium text-foreground">
        {t("granty.emptyState.categoryNoMatch", { category: label })}
      </div>
      <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">
        {t("granty.emptyState.categoryHint")}
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onReset}>
        {t("granty.emptyState.showAll")}
      </Button>
    </div>
  );
}

function GrantCard({ g }: { g: Grant }) {
  const { t } = useTranslation("app");
  const deadlineDate = g.deadline ? parseISO(g.deadline) : null;
  const daysLeft = deadlineDate ? differenceInDays(deadlineDate, new Date()) : null;
  const rolling = g.typ === "OTVORENA";
  const docsCount = Array.isArray(g.documents) ? g.documents.length : 0;
  const regions = extractRegionNames(g.miesto_realizacie);
  const totalSum = (g.suma_eu ?? 0) + (g.suma_sr ?? 0);
  const cats = categoriesForGrant(g.opravneny_ziadatel);

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
                <InfinityIcon className="h-3 w-3 mr-1" /> {t("granty.card.rolling")}
              </span>
            ) : (
              <span className="eyebrow inline-flex items-center border border-primary text-primary px-2 py-0.5">
                {t("granty.card.oneShot")}
              </span>
            )}
            {Array.from(cats).map((c) => {
              const Icon = CATEGORY_ICON[c];
              return (
                <span key={c} className="eyebrow inline-flex items-center border border-border text-muted-foreground px-2 py-0.5">
                  <Icon className="h-3 w-3 mr-1" /> {CATEGORY_SHORT[c]}
                </span>
              );
            })}
            {deadlineDate && daysLeft !== null && daysLeft >= 0 && daysLeft < 30 && (
              <span className={`eyebrow inline-flex items-center px-2 py-0.5 ${daysLeft < 7 ? "border border-primary bg-primary text-primary-foreground" : "border border-foreground text-foreground"}`}>
                {daysLeft === 0 ? t("granty.card.lastDay") : t("granty.card.daysLeft", { count: daysLeft })}
              </span>
            )}
          </div>
          {totalSum > 0 && (
            <div className="text-right">
              <div className="eyebrow text-muted-foreground">{t("granty.card.allocation")}</div>
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
            <dt className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> {t("granty.card.provider")}</dt>
            <dd className="mt-0.5 line-clamp-2">{g.poskytovatel ?? t("granty.card.none")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> {t("granty.card.deadline")}</dt>
            <dd className="mt-0.5">
              {deadlineDate ? (
                <span className="num">{format(deadlineDate, "d.M.yyyy")}</span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400 text-xs font-medium">{t("granty.card.rollingCall")}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {t("granty.card.region")}</dt>
            <dd className="mt-0.5 text-xs">
              {regionLabel(regions, t)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> {t("granty.card.documents")}</dt>
            <dd className="mt-0.5 num">{docsCount}</dd>
          </div>
        </dl>
      </article>
    </Link>
  );
}
