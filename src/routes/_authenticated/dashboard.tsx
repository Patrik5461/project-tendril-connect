import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Calendar,
  Building2,
  MapPin,
  RefreshCw,
  Mail,
  Send,
  Star,
  X,
  Radar,
  RotateCcw,
  Search,
  LayoutList,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Globe,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { flagEmoji, countryName } from "@/lib/eu-countries";
import { computeSubscription, MONTHLY_PRICE_EUR, formatEur as formatEurPrice } from "@/lib/subscription";
import { Lock, Sparkles } from "lucide-react";
import { WebOnlyPurchase } from "@/components/WebOnlyPurchase";




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
  ai_summary?: string | null;
  country?: string | null;
  country_name?: string | null;
};

type Prefs = {
  onboarding_completed: boolean;
  trial_started_at?: string | null;
  subscription_status?: "trial" | "active" | "expired" | null;
};


type Radar = {
  id: string;
  name: string;
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  countries: string[];
  active: boolean;
};

type Action = "saved" | "hidden";
type ActionRow = { tender_id: string; action: Action };


const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_STORAGE_KEY = "tendrik.dashboard.pageSize";

const searchSchema = z.object({
  tab: fallback(z.enum(["foryou", "saved", "hidden"]), "foryou").default("foryou"),
  sort: fallback(z.enum(["deadline", "newest", "value", "value_asc"]), "deadline").default("deadline"),
  q: fallback(z.string(), "").default(""),
  view: fallback(z.enum(["list", "grid"]), "list").default("list"),
  radar: fallback(z.string(), "all").default("all"),
  // Comma-separated ISO country codes (e.g. "SK,CZ"). Empty = all.
  country: fallback(z.string(), "").default(""),
  source: fallback(z.enum(["all", "TED", "UVO", "EKS", "JOSEPHINE"]), "all").default("all"),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), DEFAULT_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Zákazky – Tendrik" }] }),
  validateSearch: zodValidator(searchSchema),
  component: Dashboard,
});

// Diacritics-insensitive lowercase for client-side matching
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseCountryParam(v: string): string[] {
  return v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

function Dashboard() {
  const {
    tab,
    sort,
    q,
    view,
    radar: radarParam,
    country: countryParam,
    source: sourceParam,
    page,
    pageSize,
  } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard" });


  const [pageItems, setPageItems] = useState<Tender[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [countryFacets, setCountryFacets] = useState<CountryFacet[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [userRadars, setUserRadars] = useState<Radar[]>([]);
  const [actions, setActions] = useState<Record<string, Set<Action>>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<"TED" | "UVO" | null>(null);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [searchInput, setSearchInput] = useState(q);
  const [backfill, setBackfill] = useState<{
    source: "TED" | "UVO" | null;
    status: string;
    saved: number;
    running: boolean;
    done: boolean;
  }>({ source: null, status: "", saved: 0, running: false, done: false });
  const backfillStopRef = useRef(false);
  const [aiSummariesEnabled, setAiSummariesEnabled] = useState<boolean | null>(null);
  const [aiToggleBusy, setAiToggleBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "ai_summaries_enabled")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setAiSummariesEnabled(data?.value === true);
      });
    return () => { cancelled = true; };
  }, []);

  async function toggleAiSummaries(next: boolean) {
    setAiToggleBusy(true);
    const { data, error } = await supabase.rpc("set_ai_summaries_enabled", { enabled: next });
    setAiToggleBusy(false);
    if (error) {
      toast.error(`Nepodarilo sa prepnúť: ${error.message}`);
      return;
    }
    setAiSummariesEnabled(data === true);
    toast.success(next ? "Generovanie AI zhrnutí zapnuté" : "Generovanie AI zhrnutí vypnuté");
  }

  // Debounce search input -> URL (reset to page 1)
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== q) {
        navigate({
          search: (p: any) => ({ ...p, q: searchInput, page: 1 }),
          replace: true,
        });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  async function loadActions(uid: string) {
    const { data } = await supabase
      .from("user_tender_actions" as never)
      .select("tender_id, action")
      .eq("user_id", uid);
    const map: Record<string, Set<Action>> = {};
    for (const row of (data ?? []) as ActionRow[]) {
      if (!map[row.tender_id]) map[row.tender_id] = new Set();
      map[row.tender_id].add(row.action);
    }
    setActions(map);
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase
          .from("user_preferences")
          .select("onboarding_completed, trial_started_at, subscription_status")
          .eq("user_id", u.user.id)
          .maybeSingle(),
        (supabase.from("user_radars" as never) as any)
          .select("*")
          .eq("user_id", u.user.id)
          .order("created_at", { ascending: true }),
      ]);
      const radars = (r ?? []) as Radar[];
      setPrefs(p as Prefs | null);

      setUserRadars(radars);
      await loadActions(u.user.id);
      setLoading(false);
    })();
  }, []);

  // Restore pageSize from localStorage on first visit if URL has default.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    if (
      stored &&
      PAGE_SIZE_OPTIONS.includes(stored as (typeof PAGE_SIZE_OPTIONS)[number]) &&
      stored !== pageSize
    ) {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("pageSize")) {
        navigate({ search: (p: any) => ({ ...p, pageSize: stored }), replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist pageSize to localStorage on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
  }, [pageSize]);

  // Derive radar_ids for the RPC based on the radar dropdown selection.
  const activeRadars = useMemo(
    () => userRadars.filter((r) => r.active),
    [userRadars],
  );
  const selectedRadars = useMemo(() => {
    if (radarParam === "all") return activeRadars;
    const one = activeRadars.find((r) => r.id === radarParam);
    return one ? [one] : activeRadars;
  }, [activeRadars, radarParam]);

  const selectedCountries = useMemo(() => parseCountryParam(countryParam), [countryParam]);

  const safePageSize = PAGE_SIZE_OPTIONS.includes(
    pageSize as (typeof PAGE_SIZE_OPTIONS)[number],
  )
    ? pageSize
    : DEFAULT_PAGE_SIZE;

  // Server-side fetch: page + total + facets. Runs whenever any filter changes.
  // For "saved"/"hidden" tabs we ignore the radar filter (the selected radar
  // has no effect on which tenders you've saved).
  const radarIdsForRpc = useMemo(() => {
    if (tab !== "foryou") return null;
    if (radarParam === "all") return null;
    const one = activeRadars.find((r) => r.id === radarParam);
    return one ? [one.id] : null;
  }, [tab, radarParam, activeRadars]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setListLoading(true);
    const from = (Math.max(1, page) - 1) * safePageSize;
    const countriesArg = selectedCountries.length > 0 ? selectedCountries : null;
    const sourcesArg = sourceParam === "all" ? null : [sourceParam];
    Promise.all([
      (supabase.rpc as any)("search_user_tenders", {
        _tab: tab,
        _radar_ids: radarIdsForRpc,
        _q: q,
        _countries: countriesArg,
        _sort: sort,
        _from: from,
        _limit: safePageSize,
        _sources: sourcesArg,
      }),
      (supabase.rpc as any)("user_tenders_country_facets", {
        _tab: tab,
        _radar_ids: radarIdsForRpc,
        _q: q,
      }),
    ]).then(([pageRes, facetsRes]: any[]) => {
      if (cancelled) return;
      if (pageRes.error) {
        toast.error(`Chyba pri načítaní: ${pageRes.error.message}`);
      } else {
        const payload = pageRes.data ?? {};
        setPageItems((payload.rows ?? []) as Tender[]);
        setTotalCount(Number(payload.total ?? 0));
      }
      if (facetsRes.error) {
        setCountryFacets([]);
      } else {
        const rows = (facetsRes.data ?? []) as { country: string; cnt: number }[];
        setCountryFacets(
          rows.map((r) => ({
            code: r.country,
            count: Number(r.cnt),
            label:
              r.country === "XX"
                ? t("dashboard.country.unknown")
                : (countryName(r.country) ?? r.country),
          })),
        );
      }
      setListLoading(false);
    });
    return () => { cancelled = true; };
  }, [loading, tab, radarIdsForRpc, q, countryParam, sourceParam, sort, page, safePageSize, selectedCountries.join(",")]);

  async function refetchPage() {
    if (!userId) return;
    const from = (Math.max(1, page) - 1) * safePageSize;
    const countriesArg = selectedCountries.length > 0 ? selectedCountries : null;
    const sourcesArg = sourceParam === "all" ? null : [sourceParam];
    const [pageRes, facetsRes] = await Promise.all([
      (supabase.rpc as any)("search_user_tenders", {
        _tab: tab,
        _radar_ids: radarIdsForRpc,
        _q: q,
        _countries: countriesArg,
        _sort: sort,
        _from: from,
        _limit: safePageSize,
        _sources: sourcesArg,
      }),
      (supabase.rpc as any)("user_tenders_country_facets", {
        _tab: tab,
        _radar_ids: radarIdsForRpc,
        _q: q,
      }),
    ]);
    if (!pageRes.error) {
      const payload = pageRes.data ?? {};
      setPageItems((payload.rows ?? []) as Tender[]);
      setTotalCount(Number(payload.total ?? 0));
    }
    if (!facetsRes.error) {
      const rows = (facetsRes.data ?? []) as { country: string; cnt: number }[];
      setCountryFacets(
        rows.map((r) => ({
          code: r.country,
          count: Number(r.cnt),
          label:
            r.country === "XX"
              ? t("dashboard.country.unknown")
              : (countryName(r.country) ?? r.country),
        })),
      );
    }
  }

  const loadTenders = refetchPage;




  async function toggleAction(tenderId: string, action: Action) {
    if (!userId) return;
    const current = actions[tenderId] ?? new Set<Action>();
    const has = current.has(action);
    // Optimistic
    setActions((prev) => {
      const next = { ...prev };
      const set = new Set(next[tenderId] ?? []);
      if (has) set.delete(action);
      else set.add(action);
      next[tenderId] = set;
      return next;
    });

    if (has) {
      const { error } = await supabase
        .from("user_tender_actions" as never)
        .delete()
        .eq("user_id", userId)
        .eq("tender_id", tenderId)
        .eq("action", action);
      if (error) {
        toast.error("Nepodarilo sa zmeniť stav");
        await loadActions(userId);
      }
    } else {
      const { error } = await supabase
        .from("user_tender_actions" as never)
        .insert({ user_id: userId, tender_id: tenderId, action } as never);
      if (error) {
        toast.error("Nepodarilo sa zmeniť stav");
        await loadActions(userId);
      }
    }
  }

  async function handleRefresh(source: "TED" | "UVO") {
    setRefreshing(source);
    const fnName = source === "TED" ? "fetch-tenders" : "fetch-uvo-tenders";
    try {
      const { data, error } = await supabase.functions.invoke(fnName);
      if (error) throw error;
      if (source === "TED") {
        toast.success(
          `TED: ${data?.processed ?? 0} zákaziek (${data?.new ?? 0} nových)`,
        );
      } else {
        toast.success(
          `ÚVO ${data?.issue ?? ""}: uložených ${data?.saved ?? 0}, preskočených ${data?.skipped_existing ?? 0}, chýb ${data?.errors ?? 0}`,
        );
      }
      await loadTenders();
    } catch (err: any) {
      toast.error(err.message ?? "Aktualizácia zlyhala");
    } finally {
      setRefreshing(null);
    }
  }

  async function handlePreviewDigest() {
    setPreviewLoading(true);
    setPreviewOpen(true);
    setPreviewHtml(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Nie ste prihlásený");
      const { data, error } = await supabase.functions.invoke("send-daily-digest", {
        body: { preview_user_id: u.user.id },
      });
      if (error) throw error;
      setPreviewHtml(data?.html ?? "");
      setPreviewCount(data?.tender_count ?? 0);
    } catch (err: any) {
      toast.error(err.message ?? "Náhľad zlyhal");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSendDigest() {
    if (!confirm("Naozaj odoslať denný digest všetkým používateľom teraz?")) return;
    setSendingDigest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-daily-digest", {
        body: {},
      });
      if (error) throw error;
      toast.success(
        `Digest: skontrolovaných ${data?.users_checked ?? 0}, odoslaných ${data?.emails_sent ?? 0}, chýb ${data?.errors ?? 0}`,
      );
    } catch (err: any) {
      toast.error(err.message ?? "Odoslanie zlyhalo");
    } finally {
      setSendingDigest(false);
    }
  }

  function stopBackfill() {
    backfillStopRef.current = true;
  }

  async function runBackfillTed() {
    backfillStopRef.current = false;
    setBackfill({ source: "TED", status: "Spúšťam...", saved: 0, running: true, done: false });
    let totalSaved = 0;
    let nextPage: number | null = 1;
    let pagesTotal = 0;
    try {
      while (nextPage !== null) {
        if (backfillStopRef.current) {
          setBackfill((b) => ({ ...b, running: false, done: true, status: `Zastavené · strán ${pagesTotal}, uložených ${totalSaved}` }));
          return;
        }
        const { data, error }: { data: any; error: any } = await supabase.functions.invoke("backfill-ted", {
          body: { next_page: nextPage },
        });
        if (error) throw error;
        pagesTotal += data?.pages_done ?? 0;
        totalSaved += data?.saved ?? 0;
        nextPage = data?.has_more ? data?.next_page : null;
        setBackfill({
          source: "TED",
          status: `TED: strana ${pagesTotal}${data?.has_more ? "…" : ""}, uložených ${totalSaved}`,
          saved: totalSaved,
          running: nextPage !== null,
          done: nextPage === null,
        });
      }
      await loadTenders();
      toast.success(`TED backfill hotový: ${totalSaved} zákaziek za ${pagesTotal} strán`);
    } catch (err: any) {
      toast.error(`TED backfill zlyhal: ${err.message}`);
      setBackfill((b) => ({ ...b, running: false, done: true, status: `Chyba: ${err.message}` }));
    }
  }

  async function runBackfillUvo() {
    backfillStopRef.current = false;
    setBackfill({ source: "UVO", status: "Zisťujem čísla vestníka...", saved: 0, running: true, done: false });
    let totalSaved = 0;
    let issuesDone = 0;
    let remaining: any[] | undefined = undefined;
    let totalIssues = 0;
    try {
      while (true) {
        if (backfillStopRef.current) {
          setBackfill((b) => ({ ...b, running: false, done: true, status: `Zastavené · čísel ${issuesDone}, uložených ${totalSaved}` }));
          return;
        }
        const { data, error }: { data: any; error: any } = await supabase.functions.invoke("backfill-uvo", {
          body: remaining ? { remaining_issues: remaining } : {},
        });
        if (error) throw error;
        const done: string[] = data?.issues_done ?? [];
        issuesDone += done.length;
        totalSaved += data?.saved ?? 0;
        if (totalIssues === 0) totalIssues = issuesDone + (data?.remaining_issues?.length ?? 0);
        remaining = data?.remaining_issues;
        setBackfill({
          source: "UVO",
          status: `ÚVO: číslo ${issuesDone}/${totalIssues}, uložených ${totalSaved}`,
          saved: totalSaved,
          running: data?.has_more,
          done: !data?.has_more,
        });
        if (!data?.has_more) break;
      }
      await loadTenders();
      toast.success(`ÚVO backfill hotový: ${totalSaved} zákaziek z ${issuesDone} čísel`);
    } catch (err: any) {
      toast.error(`ÚVO backfill zlyhal: ${err.message}`);
      setBackfill((b) => ({ ...b, running: false, done: true, status: `Chyba: ${err.message}` }));
    }
  }

  // Match tender against a single radar
  const matchesRadar = (t: Tender, r: Radar): boolean => {
    // Country gate. Empty = SK-only fallback for safety.
    const countries = (r.countries && r.countries.length > 0) ? r.countries : ["SK"];
    const includesAll = countries.includes("ALL");
    if (!includesAll) {
      if (!t.country || !countries.includes(t.country)) return false;
    }
    // SK region gate applies only when tender is SK.
    if (t.country === "SK") {
      const regs = r.regions;
      const wholeSk = regs.includes("Celé Slovensko");
      const regionOk =
        wholeSk || regs.length === 0 || (t.region ? regs.includes(t.region) : true);
      if (!regionOk) return false;
    }
    const kws = r.keywords.map((k) => norm(k));
    const cpvs = r.cpv_codes;
    const hasFilters = kws.length > 0 || cpvs.length > 0;
    if (!hasFilters) return true;
    const text = norm(t.title + " " + (t.description ?? ""));
    const keywordMatch = kws.length > 0 && kws.some((k) => text.includes(k));
    const cpvLooksValid = !!t.cpv_code && /^\d{2,}/.test(t.cpv_code);
    const cpvMatch =
      cpvs.length > 0 && cpvLooksValid && cpvs.some((c) => t.cpv_code!.startsWith(c));
    const cpvUnknown = !cpvLooksValid;
    return keywordMatch || cpvMatch || cpvUnknown;
  };

  // Client-side helper used only to label cards ("matched by radar X, Y").
  // The actual filtering happens server-side in `search_user_tenders`.
  const matchingRadarsFor = useMemo(() => {
    return (t: Tender): Radar[] => selectedRadars.filter((r) => matchesRadar(t, r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRadars]);

  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = totalCount === 0 ? 0 : (safePage - 1) * safePageSize;
  const pageEnd = Math.min(pageStart + safePageSize, totalCount);

  // If the URL page drifts out of range (e.g. after filter change), snap back.
  // Guard against the initial render where totalCount is still 0 — otherwise
  // we'd overwrite a deep-link like ?page=690 back to 1 before data arrives.
  useEffect(() => {
    if (listLoading) return;
    if (totalCount === 0) return;
    if (page !== safePage) {
      navigate({ search: (p: any) => ({ ...p, page: safePage }), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, listLoading, totalCount]);






  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-muted-foreground">{t("common.loading")}</div>;
  }

  const hasAnyRadar = userRadars.length > 0;
  if (!prefs?.onboarding_completed || !hasAnyRadar) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">{t("dashboard.noRadar.title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("dashboard.noRadar.description")}
        </p>
        <Link to="/onboarding" className="mt-6 inline-block">
          <Button size="lg">{t("dashboard.noRadar.cta")}</Button>
        </Link>
      </div>
    );
  }

  const subscription = computeSubscription(prefs);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {subscription.status === "trial" && (
        <TrialBanner daysLeft={subscription.daysLeft} isEndingSoon={subscription.isEndingSoon} />
      )}
      {subscription.status === "expired" && <ExpiredBanner />}

      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {totalCount === 0 ? (
            t("dashboard.resultsCount.none")
          ) : (
            <>
              <span className="num font-semibold text-foreground">
                {pageStart + 1}–{pageEnd}
              </span>{" "}
              {t("dashboard.resultsCount.showing", {
                total: totalCount,
                tabWord: t(`dashboard.tabWord.${tab}`),
              })}
            </>
          )}
        </div>
      </div>



      <div className="mt-6 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <Tabs
            value={tab}
            onValueChange={(v) =>
              navigate({
                search: (p: any) => ({
                  ...p,
                  tab: v as "foryou" | "saved" | "hidden",
                  page: 1,
                }),
              })
            }
          >
            <TabsList>
              <TabsTrigger value="foryou">{t("dashboard.tabs.foryou")}</TabsTrigger>
              <TabsTrigger value="saved">{t("dashboard.tabs.saved")}</TabsTrigger>
              <TabsTrigger value="hidden">{t("dashboard.tabs.hidden")}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Select
              value={String(safePageSize)}
              onValueChange={(v) =>
                navigate({
                  search: (p: any) => ({ ...p, pageSize: Number(v), page: 1 }),
                })
              }
            >
              <SelectTrigger className="w-28" aria-label={t("dashboard.perPageAriaLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {t("dashboard.perPageOption", { count: n })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ViewToggle
              view={view}
              onChange={(v) => navigate({ search: (p: any) => ({ ...p, view: v }) })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-b border-border py-4">
          {tab === "foryou" && userRadars.length > 1 && (
            <Select
              value={radarParam}
              onValueChange={(v) =>
                navigate({ search: (p: any) => ({ ...p, radar: v, page: 1 }) })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.filters.allRadars")}</SelectItem>
                {userRadars.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {!r.active ? t("dashboard.filters.inactiveSuffix") : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("dashboard.filters.searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 w-full"
            />
          </div>
          <CountryFilter
            facets={countryFacets}
            selected={selectedCountries}
            onChange={(codes) =>
              navigate({
                search: (p: any) => ({
                  ...p,
                  country: codes.join(","),
                  page: 1,
                }),
                replace: true,
              })
            }
          />
          <Select
            value={sourceParam}
            onValueChange={(v) =>
              navigate({
                search: (p: any) => ({
                  ...p,
                  source: v as "all" | "TED" | "UVO" | "EKS" | "JOSEPHINE",
                  page: 1,
                }),
              })
            }
          >
            <SelectTrigger className="w-full" aria-label={t("dashboard.filters.sourceAriaLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dashboard.filters.allSources")}</SelectItem>
              <SelectItem value="TED">TED</SelectItem>
              <SelectItem value="UVO">ÚVO</SelectItem>
              <SelectItem value="EKS">EKS</SelectItem>
              <SelectItem value="JOSEPHINE">JOSEPHINE</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) =>
              navigate({
                search: (p: any) => ({
                  ...p,
                  sort: v as "deadline" | "newest" | "value" | "value_asc",
                  page: 1,
                }),
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deadline">{t("dashboard.sort.deadline")}</SelectItem>
              <SelectItem value="newest">{t("dashboard.sort.newest")}</SelectItem>
              <SelectItem value="value">{t("dashboard.sort.value")}</SelectItem>
              <SelectItem value="value_asc">{t("dashboard.sort.valueAsc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>






      <div className="relative">
        {subscription.isLocked && <LockedOverlay />}
        <div
          className={
            subscription.isLocked
              ? "pointer-events-none select-none blur-[6px] opacity-70"
              : ""
          }
          aria-hidden={subscription.isLocked || undefined}
        >
          {totalCount === 0 && !listLoading ? (
            <EmptyState tab={tab} query={q} />
          ) : (
            <>
              {view === "grid" ? (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pageItems.map((t) => (
                    <TenderGridCard
                      key={t.id}
                      tender={t}
                      saved={actions[t.id]?.has("saved") ?? false}
                      hidden={actions[t.id]?.has("hidden") ?? false}
                      tab={tab}
                      onToggle={toggleAction}
                      radarLabels={
                        tab === "foryou" && userRadars.length > 1
                          ? matchingRadarsFor(t).map((r) => r.name)
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {pageItems.map((t) => (
                    <TenderCard
                      key={t.id}
                      tender={t}
                      saved={actions[t.id]?.has("saved") ?? false}
                      hidden={actions[t.id]?.has("hidden") ?? false}
                      tab={tab}
                      onToggle={toggleAction}
                      radarLabels={
                        tab === "foryou" && userRadars.length > 1
                          ? matchingRadarsFor(t).map((r) => r.name)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
              <Pagination
                page={safePage}
                pageSize={safePageSize}
                totalCount={totalCount}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                onPageChange={(p) =>
                  navigate({ search: (sp: any) => ({ ...sp, page: p }) })
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TrialBanner({ daysLeft, isEndingSoon }: { daysLeft: number; isEndingSoon: boolean }) {
  const { t } = useTranslation("app");
  return (
    <div
      className={`mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border px-4 py-3 text-sm ${
        isEndingSoon
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-muted/40 text-foreground/90"
      }`}
    >
      <div className="flex items-center gap-2">
        <Sparkles className={`h-4 w-4 ${isEndingSoon ? "text-primary" : "text-muted-foreground"}`} />
        <span>
          {t("dashboard.trialBanner.label")}{" "}
          <b className="num text-foreground">
            {t("dashboard.trialBanner.remaining", { count: daysLeft })}
          </b>
          {isEndingSoon && t("dashboard.trialBanner.endingSoon")}
        </span>
      </div>
      <WebOnlyPurchase>
        <Link to="/predplatne">
          <Button size="sm" variant={isEndingSoon ? "default" : "outline"}>
            {t("dashboard.trialBanner.cta", { price: formatEurPrice(MONTHLY_PRICE_EUR) })}
          </Button>
        </Link>
      </WebOnlyPurchase>

    </div>
  );
}

function ExpiredBanner() {
  const { t } = useTranslation("app");
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border-2 border-primary bg-primary/10 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-primary" />
        <span>
          <b>{t("dashboard.expiredBanner.title")}</b>{" "}
          {t("dashboard.expiredBanner.text", { price: formatEurPrice(MONTHLY_PRICE_EUR) })}
        </span>
      </div>
      <WebOnlyPurchase>
        <Link to="/predplatne">
          <Button size="sm">{t("dashboard.expiredBanner.cta")}</Button>
        </Link>
      </WebOnlyPurchase>

    </div>
  );
}

function LockedOverlay() {
  const { t } = useTranslation("app");
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-12 pointer-events-none">
      <div className="pointer-events-auto max-w-md rounded-lg border-2 border-foreground bg-card p-8 text-center shadow-lg">
        <Lock className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-4 font-display text-2xl font-bold">
          {t("dashboard.lockedOverlay.title")}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("dashboard.lockedOverlay.description", { price: formatEurPrice(MONTHLY_PRICE_EUR) })}
        </p>
        <WebOnlyPurchase className="mt-6 block">
          <Link to="/predplatne" className="mt-6 inline-block">
            <Button size="lg">{t("dashboard.lockedOverlay.cta")}</Button>
          </Link>
        </WebOnlyPurchase>

      </div>
    </div>
  );
}



function EmptyState({
  tab,
  query,
}: {
  tab: "foryou" | "saved" | "hidden";
  query: string;
}) {
  if (query.trim()) {
    return (
      <div className="mt-12 rounded-xl border bg-card p-12 text-center">
        <Search className="mx-auto h-10 w-10 text-muted-foreground/60" />
        <p className="mt-4 text-muted-foreground">
          Nič sme nenašli pre{" "}
          <b className="text-foreground">„{query}"</b> – skúste iné slovo.
        </p>
      </div>
    );
  }

  if (tab === "saved") {
    return (
      <div className="mt-12 rounded-xl border bg-card p-12 text-center">
        <Star className="mx-auto h-10 w-10 text-muted-foreground/60" />
        <p className="mt-4 text-muted-foreground">
          Zatiaľ nemáte uložené zákazky – kliknite na hviezdičku pri zákazke,
          ktorá vás zaujme.
        </p>
      </div>
    );
  }

  if (tab === "hidden") {
    return (
      <div className="mt-12 rounded-xl border bg-card p-12 text-center">
        <X className="mx-auto h-10 w-10 text-muted-foreground/60" />
        <p className="mt-4 text-muted-foreground">
          Nemáte žiadne skryté zákazky.
        </p>
      </div>
    );
  }

  // for you empty
  return (
    <div className="mt-12 rounded-xl border bg-card p-12 text-center">
      <Radar className="mx-auto h-12 w-12 text-primary/70" />
      <h2 className="mt-4 font-display text-xl font-semibold">
        Váš radar zatiaľ nič nezachytil
      </h2>
      <p className="mt-2 text-muted-foreground">
        Skúste upraviť filtre alebo si pozrite všetky zákazky.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/settings">
          <Button>Upraviť filtre</Button>
        </Link>
        <Link to="/dashboard" search={{ tab: "foryou", sort: "newest", q: "" }}>
          <Button variant="outline">Zobraziť všetky zákazky</Button>
        </Link>
      </div>
    </div>
  );
}

function TenderCard({
  tender,
  saved,
  hidden,
  tab,
  onToggle,
  radarLabels,
}: {
  tender: Tender;
  saved: boolean;
  hidden: boolean;
  tab: "foryou" | "saved" | "hidden";
  onToggle: (id: string, action: Action) => void;
  radarLabels?: string[];
}) {
  const deadlineDate = tender.deadline ? parseISO(tender.deadline) : null;
  const daysLeft = deadlineDate ? differenceInDays(deadlineDate, new Date()) : null;
  const expired = daysLeft !== null && daysLeft < 0;
  const urgent = daysLeft !== null && daysLeft >= 0 && daysLeft < 7;

  const summary = tender.ai_summary?.trim();
  const firstSentence = summary
    ? (summary.match(/[^.!?]+[.!?]/)?.[0] ?? summary).trim()
    : null;
  const snippet = firstSentence ?? tender.description;

  return (
    <article
      className={`border border-border bg-card p-5 transition-colors hover:border-foreground ${
        expired ? "opacity-70" : ""
      } ${hidden && tab !== "hidden" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <SourceBadge source={tender.source} />
          <DeadlineBadge daysLeft={daysLeft} expired={expired} />
          {tender.cpv_code && (
            <span className="eyebrow inline-flex items-center border border-border text-muted-foreground px-2 py-0.5">
              CPV {tender.cpv_code}
            </span>
          )}
          {radarLabels?.map((n) => (
            <span
              key={n}
              className="eyebrow inline-flex items-center gap-1 border border-primary/40 text-primary px-2 py-0.5"
              title="Zachytené radarom"
            >
              <Radar className="h-3 w-3" /> {n}
            </span>
          ))}
        </div>

        <div className="flex items-start gap-4">
          {tender.estimated_value != null && (
            <div className="text-right">
              <div className="eyebrow text-muted-foreground">Hodnota</div>
              <div className="num font-bold text-primary text-lg leading-tight">
                {new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 })
                  .format(Number(tender.estimated_value))
                  .replace(/\u00a0/g, " ")}{" "}
                €
              </div>
            </div>
          )}
          <div className="flex items-center gap-1">
            {tab === "hidden" ? (
              <button
                type="button"
                aria-label="Obnoviť zákazku"
                title="Obnoviť"
                onClick={() => onToggle(tender.id, "hidden")}
                className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  aria-label={saved ? "Zrušiť uloženie" : "Uložiť zákazku"}
                  title={saved ? "Zrušiť uloženie" : "Uložiť"}
                  onClick={() => onToggle(tender.id, "saved")}
                  className="p-1.5 hover:bg-secondary transition-colors"
                >
                  <Star
                    className={`h-4 w-4 ${
                      saved ? "fill-primary text-primary" : "text-muted-foreground"
                    }`}
                  />
                </button>
                <button
                  type="button"
                  aria-label="Skryť zákazku"
                  title="Skryť"
                  onClick={() => onToggle(tender.id, "hidden")}
                  className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <Link to="/zakazka/$id" params={{ id: tender.id }} className="block group">
        <h3 className="mt-3 font-display font-semibold text-lg leading-snug group-hover:text-primary transition-colors">
          {tender.title}
        </h3>
      </Link>

      {snippet && (
        <Link
          to="/zakazka/$id"
          params={{ id: tender.id }}
          className="mt-1 block text-xs text-muted-foreground line-clamp-2 hover:text-foreground"
        >
          {snippet}
        </Link>
      )}

      <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground flex items-center gap-1">
            <Building2 className="h-3 w-3" /> Obstarávateľ
          </dt>
          <dd className="mt-0.5 line-clamp-2">{tender.contracting_authority ?? "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Deadline
          </dt>
          <dd className="mt-0.5 num">
            {deadlineDate ? format(deadlineDate, "d.M.yyyy") : "Neurčené"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Región
          </dt>
          <dd className="mt-0.5 text-xs">
            {tender.country && tender.country !== "SK"
              ? `${flagEmoji(tender.country)} ${tender.country_name ?? countryName(tender.country)}`
              : (tender.region ?? "—")}
          </dd>
        </div>
        <div className="min-w-0 flex items-end">
          <Link to="/zakazka/$id" params={{ id: tender.id }}>
            <Button size="sm" variant="outline">
              Detail
            </Button>
          </Link>
        </div>
      </dl>
    </article>
  );
}


function DeadlineBadge({
  daysLeft,
  expired,
}: {
  daysLeft: number | null;
  expired: boolean;
}) {
  if (daysLeft === null) return null;
  if (expired) {
    return (
      <span className="eyebrow inline-flex items-center border border-border bg-secondary px-2 py-0.5 text-muted-foreground">
        Po termíne
      </span>
    );
  }
  const urgent = daysLeft < 7;
  const cls = urgent
    ? "border border-primary bg-primary text-primary-foreground"
    : "border border-foreground bg-transparent text-foreground";
  const label =
    daysLeft === 0 ? "Posledný deň" : `${daysLeft} ${daysLeft === 1 ? "deň" : daysLeft < 5 ? "dni" : "dní"}`;
  return (
    <span className={`eyebrow inline-flex items-center rounded-sm px-2 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const isUvo = source === "UVO";
  const isEks = source === "EKS";
  const isJos = source === "JOSEPHINE";
  const label = isJos ? "JOSEPHINE" : isEks ? "EKS" : isUvo ? "ÚVO" : "TED";
  const cls = isJos
    ? "border border-amber-600 text-amber-700 dark:text-amber-400"
    : isEks
      ? "border border-emerald-600 text-emerald-700 dark:text-emerald-400"
      : isUvo
        ? "border border-primary text-primary"
        : "border border-accent text-accent";
  const title = isJos
    ? "JOSEPHINE (proEBIZ)"
    : isEks
      ? "Elektronický kontraktačný systém (EKS)"
      : isUvo
        ? "Vestník verejného obstarávania ÚVO"
        : "Tenders Electronic Daily (EÚ)";
  return (
    <span
      className={`eyebrow inline-flex items-center rounded-sm bg-transparent px-2 py-0.5 ${cls}`}
      title={title}
    >
      {label}
    </span>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "list" | "grid";
  onChange: (v: "list" | "grid") => void;
}) {
  const base =
    "inline-flex h-9 w-9 items-center justify-center border transition-colors";
  const active = "border-foreground text-foreground bg-secondary";
  const inactive =
    "border-border text-muted-foreground hover:text-foreground hover:border-foreground";
  return (
    <div className="flex" role="group" aria-label="Zobrazenie zákaziek">
      <button
        type="button"
        aria-label="Zobraziť ako zoznam"
        aria-pressed={view === "list"}
        title="Zoznam"
        onClick={() => onChange("list")}
        className={`${base} ${view === "list" ? active : inactive} relative`}
      >
        <LayoutList className="h-4 w-4" />
        {view === "list" && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[2px] bg-primary"
          />
        )}
      </button>
      <button
        type="button"
        aria-label="Zobraziť ako mriežku"
        aria-pressed={view === "grid"}
        title="Mriežka"
        onClick={() => onChange("grid")}
        className={`${base} ${view === "grid" ? active : inactive} relative -ml-px`}
      >
        <LayoutGrid className="h-4 w-4" />
        {view === "grid" && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[2px] bg-primary"
          />
        )}
      </button>
    </div>
  );
}

function formatEur(v: number): string {
  return (
    new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 })
      .format(v)
      .replace(/\u00a0/g, " ") + " €"
  );
}

function TenderGridCard({
  tender,
  saved,
  hidden,
  tab,
  onToggle,
  radarLabels,
}: {
  tender: Tender;
  saved: boolean;
  hidden: boolean;
  tab: "foryou" | "saved" | "hidden";
  onToggle: (id: string, action: Action) => void;
  radarLabels?: string[];
}) {
  const deadlineDate = tender.deadline ? parseISO(tender.deadline) : null;
  const daysLeft = deadlineDate ? differenceInDays(deadlineDate, new Date()) : null;
  const expired = daysLeft !== null && daysLeft < 0;

  return (
    <article
      className={`flex flex-col rounded-lg border border-foreground bg-card p-5 transition-colors hover:bg-secondary/60 ${
        expired ? "opacity-70" : ""
      } ${hidden && tab !== "hidden" ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <SourceBadge source={tender.source} />
        <DeadlineBadge daysLeft={daysLeft} expired={expired} />
        {radarLabels?.map((n) => (
          <span
            key={n}
            className="inline-flex items-center gap-1 rounded-sm border border-primary/40 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            title="Zachytené radarom"
          >
            <Radar className="h-3 w-3" /> {n}
          </span>
        ))}
      </div>
      <Link
        to="/zakazka/$id"
        params={{ id: tender.id }}
        className="mt-4 block group min-w-0"
      >
        <h3
          className="font-display font-semibold text-lg leading-snug tracking-tight text-foreground group-hover:text-primary transition-colors line-clamp-3 break-words"
          title={tender.title}
        >
          {tender.title}
        </h3>
      </Link>
      <div className="mt-3 space-y-1.5 text-sm text-foreground/75 min-w-0">
        <div className="flex items-start gap-1.5">
          <Building2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="truncate">{tender.contracting_authority}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {tender.country && tender.country !== "SK"
              ? `${flagEmoji(tender.country)} ${tender.country_name ?? countryName(tender.country)}`
              : (tender.region ?? "—")}
          </span>
        </div>
      </div>
      {tender.estimated_value != null && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="eyebrow text-muted-foreground">Hodnota</div>
          <div className="num text-lg font-semibold text-foreground">
            {formatEur(Number(tender.estimated_value))}
          </div>
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-2">
        <Link to="/zakazka/$id" params={{ id: tender.id }}>
          <Button size="sm" variant="outline">
            Detail
          </Button>
        </Link>
        <div className="flex items-center gap-1">
          {tab === "hidden" ? (
            <button
              type="button"
              aria-label="Obnoviť zákazku"
              title="Obnoviť"
              onClick={() => onToggle(tender.id, "hidden")}
              className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-label={saved ? "Zrušiť uloženie" : "Uložiť zákazku"}
                title={saved ? "Zrušiť uloženie" : "Uložiť"}
                onClick={() => onToggle(tender.id, "saved")}
                className="p-1.5 hover:bg-secondary transition-colors"
              >
                <Star
                  className={`h-4 w-4 ${
                    saved ? "fill-primary text-primary" : "text-muted-foreground"
                  }`}
                />
              </button>
              <button
                type="button"
                aria-label="Skryť zákazku"
                title="Skryť"
                onClick={() => onToggle(tender.id, "hidden")}
                className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

type CountryFacet = { code: string; count: number; label: string };

function CountryFilter({
  facets,
  selected,
  onChange,
}: {
  facets: CountryFacet[];
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);
  const label =
    selected.length === 0
      ? "Všetky krajiny"
      : selected.length === 1
        ? `${flagEmoji(selected[0])} ${countryName(selected[0]) ?? selected[0]}`
        : `${selected.length} krajín`;

  function toggle(code: string) {
    const next = new Set(selectedSet);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(Array.from(next));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="default"
          className="w-full justify-between h-9 font-normal"
          aria-label="Filter krajín"
        >
          <span className="flex items-center gap-2 truncate">
            <Globe className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <span className="text-sm font-medium">Krajiny</span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Vymazať výber
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {facets.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Žiadne krajiny v aktuálnych výsledkoch
            </div>
          ) : (
            facets.map((f) => (
              <label
                key={f.code}
                className="flex items-center gap-3 px-3 py-2 rounded-sm cursor-pointer hover:bg-secondary"
              >
                <Checkbox
                  checked={selectedSet.has(f.code)}
                  onCheckedChange={() => toggle(f.code)}
                />
                <span className="flex-1 flex items-center gap-2 text-sm">
                  <span>
                    {f.code === "XX" ? "❓" : flagEmoji(f.code)} {f.label}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground num">
                  {f.count}
                </span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Pagination({
  page,
  pageSize: _pageSize,
  totalCount,
  totalPages,
  pageStart,
  pageEnd,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return (
      <div className="mt-6 flex items-center justify-center text-sm text-muted-foreground">
        Zobrazené <b className="num text-foreground mx-1">{pageStart + 1}–{pageEnd}</b>{" "}
        z <b className="num text-foreground ml-1">{totalCount}</b>
      </div>
    );
  }

  // Build compact page list: 1 … (page-1) page (page+1) … totalPages
  const pages: (number | "…")[] = [];
  const push = (n: number) => {
    if (!pages.includes(n) && n >= 1 && n <= totalPages) pages.push(n);
  };
  push(1);
  if (page - 2 > 2) pages.push("…");
  for (let i = page - 1; i <= page + 1; i++) push(i);
  if (page + 2 < totalPages - 1) pages.push("…");
  push(totalPages);

  const btn =
    "inline-flex h-9 min-w-9 items-center justify-center border px-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const inactive =
    "border-border text-muted-foreground hover:text-foreground hover:border-foreground";
  const active = "border-foreground bg-secondary text-foreground";

  return (
    <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        Zobrazené{" "}
        <b className="num text-foreground">
          {pageStart + 1}–{pageEnd}
        </b>{" "}
        z <b className="num text-foreground">{totalCount}</b>
      </div>
      <div className="flex flex-wrap items-center gap-1" role="navigation" aria-label="Stránkovanie">
        <button
          type="button"
          className={`${btn} ${inactive}`}
          disabled={page === 1}
          onClick={() => onPageChange(1)}
          aria-label="Prvá stránka"
          title="Prvá stránka"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`${btn} ${inactive}`}
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Predchádzajúca stránka"
          title="Predchádzajúca"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`e${i}`}
              className="inline-flex h-9 min-w-9 items-center justify-center text-sm text-muted-foreground"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`${btn} ${p === page ? active : inactive} num`}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Stránka ${p}`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className={`${btn} ${inactive}`}
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Nasledujúca stránka"
          title="Nasledujúca"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`${btn} ${inactive}`}
          disabled={page === totalPages}
          onClick={() => onPageChange(totalPages)}
          aria-label="Posledná stránka"
          title="Posledná stránka"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

