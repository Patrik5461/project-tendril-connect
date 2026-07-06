import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Calendar, ExternalLink, Building2, MapPin, AlertCircle, RefreshCw, Mail, Send } from "lucide-react";
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
  const [refreshing, setRefreshing] = useState<"TED" | "UVO" | null>(null);
  const [showExpired, setShowExpired] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [backfill, setBackfill] = useState<{
    source: "TED" | "UVO" | null;
    status: string;
    saved: number;
    running: boolean;
    done: boolean;
  }>({ source: null, status: "", saved: 0, running: false, done: false });
  const backfillStopRef = useRef(false);

  async function loadTenders() {
    const { data: t } = await supabase.from("tenders").select("*");
    setTenders((t ?? []) as Tender[]);
  }

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

  const filtered = useMemo(() => {
    if (!prefs) return { list: [] as Tender[], hiddenExpired: 0 };
    const kws = prefs.keywords.map((k) => k.toLowerCase());
    const cpvs = prefs.cpv_codes;
    const regs = prefs.regions;
    const wholeSk = regs.includes("Celé Slovensko");
    const hasFilters = kws.length > 0 || cpvs.length > 0;

    let result = tenders.filter((t) => {
      const regionOk = wholeSk || regs.length === 0 || (t.region ? regs.includes(t.region) : true);
      if (!regionOk) return false;
      if (!hasFilters) return true;
      const text = (t.title + " " + (t.description ?? "")).toLowerCase();
      const keywordMatch = kws.length > 0 && kws.some((k) => text.includes(k));
      const cpvMatch =
        cpvs.length > 0 && !!t.cpv_code && cpvs.some((c) => t.cpv_code!.startsWith(c));
      return keywordMatch || cpvMatch;
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.contracting_authority.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q),
      );
    }

    // Activity filter: by default hide expired/stale tenders.
    // Active = deadline today or in the future,
    //        OR (no deadline AND published_at within last 30 days).
    const now = Date.now();
    const publishedCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const isActive = (t: Tender) => {
      if (t.deadline) return new Date(t.deadline).getTime() >= now;
      return t.published_at
        ? new Date(t.published_at).getTime() >= publishedCutoff
        : false;
    };
    const hiddenExpired = showExpired ? 0 : result.filter((t) => !isActive(t)).length;
    if (!showExpired) result = result.filter(isActive);

    result.sort((a, b) => {
      if (sort === "deadline") return (a.deadline ?? "").localeCompare(b.deadline ?? "");
      return (b.published_at ?? "").localeCompare(a.published_at ?? "");
    });
    return { list: result, hiddenExpired };
  }, [tenders, prefs, sort, search, showExpired]);

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
            Nájdených <b>{filtered.list.length}</b> zákaziek podľa vašich filtrov
            {filtered.hiddenExpired > 0 && (
              <>
                {" "}· <button
                  type="button"
                  onClick={() => setShowExpired(true)}
                  className="underline hover:text-foreground"
                >
                  {filtered.hiddenExpired} po termíne skrytých
                </button>
              </>
            )}
            {showExpired && (
              <>
                {" "}·{" "}
                <button
                  type="button"
                  onClick={() => setShowExpired(false)}
                  className="underline hover:text-foreground"
                >
                  Skryť po termíne
                </button>
              </>
            )}
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
          <Button
            onClick={() => handleRefresh("TED")}
            disabled={refreshing !== null}
            variant="default"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing === "TED" ? "animate-spin" : ""}`}
            />
            {refreshing === "TED" ? "Aktualizujem..." : "Aktualizovať TED"}
          </Button>
          <Button
            onClick={() => handleRefresh("UVO")}
            disabled={refreshing !== null}
            variant="secondary"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing === "UVO" ? "animate-spin" : ""}`}
            />
            {refreshing === "UVO" ? "Aktualizujem..." : "Aktualizovať ÚVO"}
          </Button>
          <Button
            onClick={handlePreviewDigest}
            disabled={previewLoading}
            variant="outline"
          >
            <Mail className="h-4 w-4 mr-2" />
            Náhľad e-mailu
          </Button>
          <Button
            onClick={handleSendDigest}
            disabled={sendingDigest}
            variant="outline"
          >
            <Send className={`h-4 w-4 mr-2 ${sendingDigest ? "animate-pulse" : ""}`} />
            {sendingDigest ? "Odosielam..." : "Poslať digest teraz"}
          </Button>
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

      {filtered.list.length === 0 ? (
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
          {filtered.list.map((t) => (
            <TenderCard key={t.id} tender={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TenderCard({ tender }: { tender: Tender }) {
  const deadlineDate = tender.deadline ? parseISO(tender.deadline) : null;
  const daysLeft = deadlineDate ? differenceInDays(deadlineDate, new Date()) : null;
  const expired = daysLeft !== null && daysLeft < 0;
  const urgent = daysLeft !== null && daysLeft >= 0 && daysLeft < 7;
  return (
    <article className={`rounded-xl border bg-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow ${expired ? "opacity-70" : ""}`}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-lg leading-snug">{tender.title}</h3>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <SourceBadge source={tender.source} />
            {expired && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
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
            <span className="ml-2 font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">
              CPV {tender.cpv_code}
            </span>
          )}
        </div>
      </div>
      {tender.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{tender.description}</p>
      )}
      <div className="mt-auto flex items-center justify-between pt-2 border-t">
        <div
          className={`flex items-center gap-1.5 text-sm font-medium ${
            urgent ? "text-destructive" : "text-foreground"
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
        {tender.source_url && (
          <a href={tender.source_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline">
              Zdroj <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </a>
        )}
      </div>
    </article>
  );
}

function SourceBadge({ source }: { source: string }) {
  const isUvo = source === "UVO";
  const label = isUvo ? "ÚVO" : "TED";
  const cls = isUvo
    ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900"
    : "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900";
  return (
    <span
      className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}
      title={isUvo ? "Vestník verejného obstarávania ÚVO" : "Tenders Electronic Daily (EÚ)"}
    >
      {label}
    </span>
  );
}
