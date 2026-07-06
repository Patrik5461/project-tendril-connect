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
import {
  Calendar,
  Building2,
  MapPin,
  AlertCircle,
  RefreshCw,
  Mail,
  Send,
  Star,
  X,
  Radar,
  RotateCcw,
  Search,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { toast } from "sonner";

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

type Prefs = {
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  onboarding_completed: boolean;
};

type Action = "saved" | "hidden";
type ActionRow = { tender_id: string; action: Action };

const searchSchema = z.object({
  tab: fallback(z.enum(["foryou", "saved", "hidden"]), "foryou").default("foryou"),
  sort: fallback(z.enum(["deadline", "newest", "value"]), "deadline").default("deadline"),
  q: fallback(z.string(), "").default(""),
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

function Dashboard() {
  const { tab, sort, q } = Route.useSearch();
  const navigate = useNavigate({ from: "/_authenticated/dashboard" });

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [actions, setActions] = useState<Record<string, Set<Action>>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  // Debounce search input -> URL
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== q) {
        navigate({ search: (p: any) => ({ ...p, q: searchInput }), replace: true });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  async function loadTenders() {
    const { data: t } = await supabase.from("tenders").select("*");
    setTenders((t ?? []) as Tender[]);
  }

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
      await loadActions(u.user.id);
      setLoading(false);
    })();
  }, []);

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

  // Match tenders to user preferences (For You audience)
  const matchesPrefs = useMemo(() => {
    if (!prefs) return () => false;
    const kws = prefs.keywords.map((k) => norm(k));
    const cpvs = prefs.cpv_codes;
    const regs = prefs.regions;
    const wholeSk = regs.includes("Celé Slovensko");
    const hasFilters = kws.length > 0 || cpvs.length > 0;
    return (t: Tender) => {
      const regionOk =
        wholeSk || regs.length === 0 || (t.region ? regs.includes(t.region) : true);
      if (!regionOk) return false;
      if (!hasFilters) return true;
      const text = norm(t.title + " " + (t.description ?? ""));
      const keywordMatch = kws.length > 0 && kws.some((k) => text.includes(k));
      const cpvMatch =
        cpvs.length > 0 && !!t.cpv_code && cpvs.some((c) => t.cpv_code!.startsWith(c));
      return keywordMatch || cpvMatch;
    };
  }, [prefs]);

  const isActive = (t: Tender) => {
    const now = Date.now();
    if (t.deadline) return new Date(t.deadline).getTime() >= now;
    return t.published_at
      ? new Date(t.published_at).getTime() >= now - 30 * 24 * 60 * 60 * 1000
      : false;
  };

  const filtered = useMemo(() => {
    let result = tenders.slice();

    if (tab === "foryou") {
      result = result.filter(matchesPrefs).filter(isActive);
      result = result.filter((t) => !actions[t.id]?.has("hidden"));
    } else if (tab === "saved") {
      result = result.filter((t) => actions[t.id]?.has("saved"));
    } else if (tab === "hidden") {
      result = result.filter((t) => actions[t.id]?.has("hidden"));
    }

    if (q.trim()) {
      const nq = norm(q);
      result = result.filter(
        (t) =>
          norm(t.title).includes(nq) ||
          norm(t.contracting_authority).includes(nq) ||
          norm(t.description ?? "").includes(nq),
      );
    }

    result.sort((a, b) => {
      if (sort === "deadline") {
        const av = a.deadline ?? "9999";
        const bv = b.deadline ?? "9999";
        return av.localeCompare(bv);
      }
      if (sort === "newest") {
        return (b.published_at ?? "").localeCompare(a.published_at ?? "");
      }
      // value — nulls last
      const av = a.estimated_value == null ? -1 : Number(a.estimated_value);
      const bv = b.estimated_value == null ? -1 : Number(b.estimated_value);
      return bv - av;
    });
    return result;
  }, [tenders, actions, matchesPrefs, tab, q, sort]);

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
          <h1 className="font-display text-3xl font-bold tracking-tight">Vaše zákazky</h1>
          <p className="text-muted-foreground mt-1">
            Nájdených <b className="num text-foreground">{filtered.length}</b>{" "}
            {tab === "saved" ? "uložených" : tab === "hidden" ? "skrytých" : "aktívnych"} zákaziek
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => handleRefresh("TED")}
            disabled={refreshing !== null}
            variant="default"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing === "TED" ? "animate-spin" : ""}`} />
            {refreshing === "TED" ? "Aktualizujem..." : "TED"}
          </Button>
          <Button
            onClick={() => handleRefresh("UVO")}
            disabled={refreshing !== null}
            variant="secondary"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing === "UVO" ? "animate-spin" : ""}`} />
            {refreshing === "UVO" ? "Aktualizujem..." : "ÚVO"}
          </Button>
          <Button onClick={handlePreviewDigest} disabled={previewLoading} variant="outline" size="sm">
            <Mail className="h-4 w-4 mr-2" />
            Náhľad e-mailu
          </Button>
          <Button onClick={handleSendDigest} disabled={sendingDigest} variant="outline" size="sm">
            <Send className={`h-4 w-4 mr-2 ${sendingDigest ? "animate-pulse" : ""}`} />
            {sendingDigest ? "Odosielam..." : "Poslať digest"}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(v) =>
            navigate({ search: (p: any) => ({ ...p, tab: v as "foryou" | "saved" | "hidden" }) })
          }
        >
          <TabsList>
            <TabsTrigger value="foryou">Pre vás</TabsTrigger>
            <TabsTrigger value="saved">Uložené</TabsTrigger>
            <TabsTrigger value="hidden">Skryté</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2 flex-col sm:flex-row">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hľadať v zákazkach..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 sm:w-64"
            />
          </div>
          <Select
            value={sort}
            onValueChange={(v) =>
              navigate({
                search: (p: any) => ({ ...p, sort: v as "deadline" | "newest" | "value" }),
              })
            }
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deadline">Najbližší deadline</SelectItem>
              <SelectItem value="newest">Najnovšie</SelectItem>
              <SelectItem value="value">Najvyššia hodnota</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Náhľad denného digestu
              {!previewLoading && previewHtml !== null && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({previewCount} {previewCount === 1 ? "zákazka" : "zákaziek"} za posledných 24h)
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewLoading ? (
            <div className="py-16 text-center text-muted-foreground">Načítavam náhľad...</div>
          ) : previewCount === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              Za posledných 24 hodín nie sú žiadne nové zákazky pre vaše filtre –
              e-mail by sa vám dnes neposlal.
            </div>
          ) : (
            <iframe
              title="Náhľad digestu"
              srcDoc={previewHtml ?? ""}
              className="w-full h-[60vh] rounded border bg-white"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Zavrieť</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <details className="mt-6 rounded-xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          Backfill histórie (admin)
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Jednorazovo doplní historické zákazky. TED: posledných 365 dní.
            ÚVO: posledné ~3 mesiace čísel vestníka. Ukladá len zákazky s
            deadlinom v budúcnosti.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runBackfillTed} disabled={backfill.running}>
              Backfill TED (365 dní)
            </Button>
            <Button variant="outline" onClick={runBackfillUvo} disabled={backfill.running}>
              Backfill ÚVO (3 mesiace)
            </Button>
            {backfill.running && (
              <Button variant="destructive" onClick={stopBackfill}>
                Zastaviť
              </Button>
            )}
          </div>
          {backfill.status && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex items-center gap-2">
                {backfill.running && <RefreshCw className="h-4 w-4 animate-spin" />}
                <span>{backfill.status}</span>
              </div>
              {backfill.done && !backfill.running && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Súhrn: uložených <b>{backfill.saved}</b> nových zákaziek zo zdroja{" "}
                  <b>{backfill.source}</b>.
                </div>
              )}
            </div>
          )}
        </div>
      </details>

      {filtered.length === 0 ? (
        <EmptyState tab={tab} query={q} />
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {filtered.map((t) => (
            <TenderCard
              key={t.id}
              tender={t}
              saved={actions[t.id]?.has("saved") ?? false}
              hidden={actions[t.id]?.has("hidden") ?? false}
              tab={tab}
              onToggle={toggleAction}
            />
          ))}
        </div>
      )}
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
}: {
  tender: Tender;
  saved: boolean;
  hidden: boolean;
  tab: "foryou" | "saved" | "hidden";
  onToggle: (id: string, action: Action) => void;
}) {
  const deadlineDate = tender.deadline ? parseISO(tender.deadline) : null;
  const daysLeft = deadlineDate ? differenceInDays(deadlineDate, new Date()) : null;
  const expired = daysLeft !== null && daysLeft < 0;
  const urgent = daysLeft !== null && daysLeft >= 0 && daysLeft < 7;

  return (
    <article
      className={`rounded-lg border border-primary/15 bg-card p-5 flex flex-col gap-3 card-hover ${
        expired ? "opacity-70" : ""
      } ${hidden && tab !== "hidden" ? "opacity-60" : ""}`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <Link
            to="/zakazka/$id"
            params={{ id: tender.id }}
            className="flex-1 min-w-0 group"
          >
            <h3 className="font-display font-semibold text-lg leading-snug tracking-tight group-hover:text-primary transition-colors">
              {tender.title}
            </h3>
          </Link>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1">
              {tab === "hidden" ? (
                <button
                  type="button"
                  aria-label="Obnoviť zákazku"
                  title="Obnoviť"
                  onClick={() => onToggle(tender.id, "hidden")}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
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
                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        saved
                          ? "fill-primary text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Skryť zákazku"
                    title="Skryť"
                    onClick={() => onToggle(tender.id, "hidden")}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
            <SourceBadge source={tender.source} />
            {expired && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-md border border-border bg-muted text-muted-foreground">
                Po termíne
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          {tender.contracting_authority}
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          {tender.region ?? "—"}
          {tender.cpv_code && (
            <span className="ml-2 font-mono text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
              CPV {tender.cpv_code}
            </span>
          )}
        </div>
      </div>
      {tender.description && (
        <Link
          to="/zakazka/$id"
          params={{ id: tender.id }}
          className="text-sm text-muted-foreground line-clamp-2 hover:text-foreground"
        >
          {tender.description}
        </Link>
      )}
      <div className="mt-auto flex items-center justify-between pt-3 border-t border-primary/10">
        <div
          className={`flex items-center gap-1.5 text-sm font-medium num ${
            urgent ? "text-warning" : "text-foreground"
          }`}
        >
          {urgent ? <AlertCircle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
          <span>
            {deadlineDate ? format(deadlineDate, "d.M.yyyy") : "Neurčené"}
            {daysLeft !== null && (
              <span className="ml-1 text-xs opacity-80">
                ({daysLeft < 0 ? "po termíne" : `${daysLeft} dní`})
              </span>
            )}
          </span>
        </div>
        <Link to="/zakazka/$id" params={{ id: tender.id }}>
          <Button size="sm" variant="outline">
            Detail
          </Button>
        </Link>
      </div>
    </article>
  );
}

function SourceBadge({ source }: { source: string }) {
  const isUvo = source === "UVO";
  const label = isUvo ? "ÚVO" : "TED";
  const cls = isUvo
    ? "bg-accent text-accent-foreground border-primary/30"
    : "bg-transparent text-primary border-primary";
  return (
    <span
      className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border ${cls}`}
      title={isUvo ? "Vestník verejného obstarávania ÚVO" : "Tenders Electronic Daily (EÚ)"}
    >
      {label}
    </span>
  );
}
