import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Play, Mail, Send, Sparkles, CreditCard, Users as UsersIcon, ShieldCheck, Settings2, AlertTriangle, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listSeoPages, generateSeoPages, regenerateSeoPage, updateSeoPage } from "@/lib/seo.functions";
import { adminAnalyzeTender, adminListTendersForTest } from "@/lib/tender-analysis.functions";
import { adminSuggestSubcontracting, adminFindSubcontractorCandidates, adminGenerateOutreach } from "@/lib/subcontracting.functions";
import { adminAnalyzeGrant } from "@/lib/grant-analysis.functions";
import { GoogleAnalyticsTab } from "@/components/admin/GoogleAnalyticsTab";
import DeleteUserDialog from "@/components/admin/DeleteUserDialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin – Tendrik" }] }),
  component: AdminPage,
});

type SourceBreakdown = { total: number; active: number; expired: number };
type Overview = {
  users: { total: number; trial: number; active: number; expired: number; paid?: number; manual?: number };
  tenders_by_source: Record<string, number>;
  tenders_source_breakdown?: Record<string, SourceBreakdown>;
  tenders_by_country: Record<string, number>;
  last_fetch: Record<string, string | null>;
  active_tenders: number;
  total_tenders?: number;
};

type UserRow = {
  user_id: string;
  email: string | null;
  created_at: string;
  subscription_status: string | null;
  subscription_source: string | null;
  subscription_tier: string | null;
  billing_period?: string | null;

  subscription_note: string | null;
  trial_started_at: string | null;
  subscription_valid_until: string | null;
  radars_count: number;
  grant_radars_count?: number;
  ico?: string | null;
  company_name?: string | null;
  radars?: Array<{ name: string; active: boolean; keywords?: string[]; cpv_codes?: string[]; regions?: string[]; countries?: string[] }> | null;
  grant_radars?: Array<{ name: string; active: boolean; keywords?: string[]; programs?: string[]; regions?: string[]; applicant_categories?: string[] }> | null;
};

function radarSummary(r: UserRow): string {
  const parts: string[] = [];
  for (const x of r.radars ?? []) {
    parts.push(`Zákazky · ${x.name}${x.active ? "" : " (vyp.)"}: ${[
      (x.keywords ?? []).length ? `kľúčové: ${(x.keywords ?? []).join(", ")}` : null,
      (x.cpv_codes ?? []).length ? `CPV: ${(x.cpv_codes ?? []).join(", ")}` : null,
      (x.regions ?? []).length ? `kraje: ${(x.regions ?? []).join(", ")}` : null,
      (x.countries ?? []).length ? `krajiny: ${(x.countries ?? []).join(", ")}` : null,
    ].filter(Boolean).join(" | ") || "bez filtrov"}`);
  }
  for (const x of r.grant_radars ?? []) {
    parts.push(`Granty · ${x.name}${x.active ? "" : " (vyp.)"}: ${[
      (x.keywords ?? []).length ? `kľúčové: ${(x.keywords ?? []).join(", ")}` : null,
      (x.programs ?? []).length ? `programy: ${(x.programs ?? []).join(", ")}` : null,
      (x.regions ?? []).length ? `kraje: ${(x.regions ?? []).join(", ")}` : null,
      (x.applicant_categories ?? []).length ? `žiadateľ: ${(x.applicant_categories ?? []).join(", ")}` : null,
    ].filter(Boolean).join(" | ") || "bez filtrov"}`);
  }
  return parts.join("\n") || "Žiadne radary";
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("sk-SK"); } catch { return v; }
}

function AdminPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        navigate({ to: "/auth", search: { mode: "login" }, replace: true });
        return;
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) console.error("[admin-check]", error);
      if (data) {
        setAllowed(true);
      } else {
        toast.error("Prístup zamietnutý – nemáte admin rolu.");
        navigate({ to: "/dashboard", replace: true });
      }
      setChecking(false);
    })();
  }, [navigate]);

  if (checking) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Overujem oprávnenia…</div>;
  }
  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Admin</h1>
      </div>
      <p className="mt-1 text-muted-foreground">
        Interné rozhranie – všetky manuálne akcie a prehľady.
      </p>

      <StuckPaymentsBanner />


      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Prehľad</TabsTrigger>
          <TabsTrigger value="actions">Akcie</TabsTrigger>
          <TabsTrigger value="gopay">GoPay</TabsTrigger>
          <TabsTrigger value="invoices">Faktero fakturácia</TabsTrigger>
          <TabsTrigger value="users">Používatelia</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="ai-test">AI test</TabsTrigger>
          <TabsTrigger value="grants-test">Granty (ITMS)</TabsTrigger>
          <TabsTrigger value="grants-ai">Granty (AI test)</TabsTrigger>
          <TabsTrigger value="marketing">Google / Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="actions" className="mt-4"><ActionsTab /></TabsContent>
        <TabsContent value="gopay" className="mt-4"><GopayTab /></TabsContent>
        <TabsContent value="invoices" className="mt-4"><InvoicesTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="seo" className="mt-4"><SeoTab /></TabsContent>
        <TabsContent value="ai-test" className="mt-4"><AiTestTab /></TabsContent>
        <TabsContent value="grants-test" className="mt-4"><GrantsTestTab /></TabsContent>
        <TabsContent value="grants-ai" className="mt-4"><GrantsAiTestTab /></TabsContent>
        <TabsContent value="marketing" className="mt-4"><GoogleAnalyticsTab /></TabsContent>

      </Tabs>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-primary/15 bg-card p-5">
      <h2 className="font-display font-semibold text-lg tracking-tight">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function OverviewTab() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_overview_stats");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setOv(data as Overview);
  }
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Obnoviť
        </Button>
      </div>
      {!ov ? (
        <div className="text-muted-foreground">Načítavam…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Používatelia">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Celkom" value={ov.users.total} />
              <Stat label="Aktívni" value={ov.users.active} />
              <Stat label="Platiaci" value={ov.users.paid ?? 0} />
              <Stat label="Manuálni/zadarmo" value={ov.users.manual ?? 0} />
              <Stat label="Trial" value={ov.users.trial} />
              <Stat label="Exspirovaní" value={ov.users.expired} />
            </div>
          </Card>
          <Card title="Zákazky">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Aktívne spolu" value={ov.active_tenders} />
              <Stat label="Celkom v DB" value={ov.total_tenders ?? Object.values(ov.tenders_by_source).reduce((a, b) => a + b, 0)} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              <b>Aktívne</b> = deadline v budúcnosti alebo bez deadlinu (zverejnené za posledných 30 dní).{" "}
              <b>Po termíne</b> = čaká na cleanup (automaticky mažeme po 30 dňoch).
            </p>
          </Card>
          <Card title="Zdroje">
            <ul className="text-sm divide-y divide-primary/10">
              {(() => {
                const breakdown = ov.tenders_source_breakdown ?? {};
                const keys = new Set<string>([
                  ...Object.keys(breakdown),
                  ...Object.keys(ov.tenders_by_source),
                  ...Object.keys(ov.last_fetch),
                ]);
                return Array.from(keys)
                  .sort((a, b) => (breakdown[b]?.total ?? ov.tenders_by_source[b] ?? 0) - (breakdown[a]?.total ?? ov.tenders_by_source[a] ?? 0))
                  .map((k) => {
                    const b = breakdown[k];
                    const total = b?.total ?? ov.tenders_by_source[k] ?? 0;
                    return (
                      <li key={k} className="py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{k}</span>
                          <span className="num text-xs text-muted-foreground">
                            posledný fetch: {fmtDate(ov.last_fetch[k])}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs num">
                          <span>celkom <b className="text-foreground">{total}</b></span>
                          {b && (
                            <>
                              <span className="text-primary">aktívnych <b>{b.active}</b></span>
                              <span className="text-muted-foreground">po termíne <b>{b.expired}</b></span>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  });
              })()}
            </ul>
          </Card>
          <Card title="Top krajiny">
            <ul className="text-sm space-y-1 max-h-56 overflow-y-auto">
              {Object.entries(ov.tenders_by_country)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k} className="flex justify-between border-b border-primary/10 py-1">
                    <span className="font-medium">{k}</span>
                    <span className="num text-muted-foreground">{v}</span>
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-primary/10 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold num">{value}</div>
    </div>
  );
}

function ActionsTab() {
  const [busy, setBusy] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "ai_summaries_enabled").maybeSingle()
      .then(({ data }) => setAiEnabled(data?.value === true));
  }, []);

  async function invoke(name: string, body: any = {}, label = name) {
    setBusy(name);
    try {
      const { data, error } = await supabase.functions.invoke(name, { body });
      if (error) throw error;
      toast.success(`${label}: OK`);
      console.log(`[admin] ${name}:`, data);
    } catch (e: any) {
      toast.error(`${label}: ${e.message ?? "chyba"}`);
    } finally {
      setBusy(null);
    }
  }

  async function toggleAi(next: boolean) {
    const { data, error } = await supabase.rpc("set_ai_summaries_enabled", { enabled: next });
    if (error) { toast.error(error.message); return; }
    setAiEnabled(data === true);
    toast.success(next ? "AI zhrnutia zapnuté" : "AI zhrnutia vypnuté");
  }

  async function previewDigest() {
    setBusy("preview-digest");
    setPreviewHtml(null);
    setPreviewOpen(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke("send-daily-digest", {
        body: { preview_user_id: u.user?.id },
      });
      if (error) throw error;
      setPreviewHtml(data?.html ?? "");
    } catch (e: any) {
      toast.error(e.message);
      setPreviewOpen(false);
    } finally {
      setBusy(null);
    }
  }

  const actions: Array<{ key: string; label: string; fn: string; body?: any; icon: any; destructive?: boolean }> = [
    { key: "fetch-ted", label: "Fetch TED", fn: "fetch-tenders", icon: RefreshCw },
    { key: "fetch-uvo", label: "Fetch ÚVO", fn: "fetch-uvo-tenders", icon: RefreshCw },
    { key: "backfill-ted", label: "Backfill TED", fn: "backfill-ted", icon: Play },
    { key: "backfill-uvo", label: "Backfill ÚVO", fn: "backfill-uvo", icon: Play },
    { key: "fetch-eks", label: "Aktualizovať EKS", fn: "fetch-eks-tenders", icon: RefreshCw },
    { key: "backfill-eks", label: "Backfill EKS", fn: "backfill-eks", icon: Play },
    { key: "fetch-josephine", label: "Aktualizovať JOSEPHINE", fn: "fetch-josephine-tenders", icon: RefreshCw },
    { key: "backfill-josephine", label: "Backfill JOSEPHINE", fn: "backfill-josephine", icon: Play },
    { key: "cleanup", label: "Cleanup expirovaných", fn: "cleanup-tenders", icon: Play },
    { key: "daily", label: "Poslať denný digest", fn: "send-daily-digest", icon: Send, destructive: true },
    { key: "weekly", label: "Poslať týždenný digest", fn: "send-weekly-digest", icon: Send, destructive: true },
    { key: "deadline", label: "Poslať deadline pripomienky", fn: "send-deadline-reminders", icon: Send, destructive: true },
    { key: "summaries", label: "Vygenerovať chýbajúce AI zhrnutia", fn: "generate-missing-summaries", icon: Sparkles },
  ];

  return (
    <div className="space-y-4">
      <Card title="Manuálne akcie">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((a) => (
            <Button
              key={a.key}
              variant={a.destructive ? "outline" : "secondary"}
              onClick={() => {
                if (a.destructive && !confirm(`Naozaj spustiť: ${a.label}?`)) return;
                void invoke(a.fn, a.body, a.label);
              }}
              disabled={busy !== null}
              className="justify-start"
            >
              <a.icon className={`h-4 w-4 mr-2 ${busy === a.fn ? "animate-spin" : ""}`} />
              {a.label}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="Náhľad digestu (pre môj účet)">
        <Button variant="outline" onClick={previewDigest} disabled={busy !== null}>
          <Mail className="h-4 w-4 mr-2" /> Zobraziť náhľad
        </Button>
        {previewOpen && (
          <div className="mt-4">
            {previewHtml === null ? (
              <div className="text-muted-foreground text-sm">Načítavam…</div>
            ) : previewHtml === "" ? (
              <div className="text-muted-foreground text-sm">Žiadne nové zákazky za posledných 24 h.</div>
            ) : (
              <iframe title="Digest" srcDoc={previewHtml} className="w-full h-[60vh] rounded border bg-white" />
            )}
          </div>
        )}
      </Card>

      <Card title="AI zhrnutia">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground max-w-lg">
            Prepínač riadi cron, ktorý dopĺňa AI zhrnutia k novým zákazkám. Existujúce zhrnutia zostávajú.
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {aiEnabled === null ? "…" : aiEnabled ? "Zapnuté" : "Vypnuté"}
            </span>
            <Switch checked={aiEnabled === true} disabled={aiEnabled === null} onCheckedChange={toggleAi} />
          </div>
        </div>
      </Card>
    </div>
  );
}

type StuckPayment = {
  id: string;
  received_at: string;
  user_id: string | null;
  email: string | null;
  gopay_payment_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  state: string | null;
  processing_error: string | null;
  subscription_status: string | null;
  subscription_tier: string | null;
  subscription_valid_until: string | null;
};

function useStuckPayments() {
  const [rows, setRows] = useState<StuckPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_stuck_paid_payments", { _limit: 100 });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as StuckPayment[]);
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { rows, loading, reload: load };
}

function StuckPaymentsCard() {
  const { rows, loading, reload } = useStuckPayments();
  const [busy, setBusy] = useState<string | null>(null);

  async function reprocess(p: StuckPayment) {
    if (!p.gopay_payment_id) return;
    setBusy(p.id);
    try {
      const { data, error } = await supabase.functions.invoke("gopay-webhook", {
        body: { reprocess: true, payment_id: p.gopay_payment_id },
      });
      if (error) throw error;
      toast.success(`Dorovnané (${(data as any)?.mapped ?? (data as any)?.state ?? "OK"})`);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? "Dorovnanie zlyhalo");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Zaplatené platby bez aktivovaného predplatného">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Platby v stave <b>PAID</b>, kde používateľ nemá aktívne (alebo má expirované) predplatné.
        </p>
        <Button variant="outline" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Obnoviť
        </Button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Načítavam…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Žiadne nevybavené platby. ✓</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Dátum</th>
                <th className="py-2 pr-3">Používateľ</th>
                <th className="py-2 pr-3">Suma</th>
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 pr-3">Chyba</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-primary/10 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {new Date(r.received_at).toLocaleString("sk-SK")}
                  </td>
                  <td className="py-2 pr-3">
                    <div>{r.email ?? "—"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{r.user_id ?? "bez user_id"}</div>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap num">
                    {r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : "—"} {r.currency ?? "EUR"}
                  </td>
                  <td className="py-2 pr-3">{r.subscription_tier ?? "—"}</td>
                  <td className="py-2 pr-3 max-w-[28rem]">
                    <span className="text-xs text-destructive break-words">{r.processing_error ?? "—"}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <Button size="sm" onClick={() => reprocess(r)} disabled={busy === r.id || !r.gopay_payment_id}>
                      {busy === r.id ? "Dorovnávam…" : "Dorovnať"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function StuckPaymentsBanner() {
  const { rows, loading } = useStuckPayments();
  if (loading || rows.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
        <div className="text-sm">
          <b>Pozor: {rows.length} zaplatených platieb bez aktivovaného predplatného.</b>
          <div className="text-muted-foreground">
            Otvorte záložku <b>GoPay</b> → „Zaplatené platby bez aktivovaného predplatného" a dorovnajte ich.
          </div>
        </div>
      </div>
    </div>
  );
}

function GopayTab() {

  const [mode, setMode] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [recurring, setRecurring] = useState<boolean | null>(null);
  const [simUser, setSimUser] = useState("");
  const [simState, setSimState] = useState("PAID");
  const [simBusy, setSimBusy] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  async function toggleRecurring(next: boolean) {
    const prev = recurring;
    setRecurring(next);
    const { data, error } = await (supabase.rpc as any)("admin_set_gopay_recurring_enabled", { _enabled: next });
    if (error) { setRecurring(prev); toast.error(error.message); return; }
    setRecurring(Boolean(data));
    toast.success(next ? "Opakované platby zapnuté" : "Opakované platby vypnuté");
  }


  async function loadStatus() {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("gopay-test-connection", { body: {} });
      if (error) throw error;
      setStatus(data);
    } catch (e: any) {
      toast.error(e.message ?? "Test zlyhal");
    } finally {
      setTesting(false);
    }
  }


  useEffect(() => {
    (async () => {
      const { data } = await (supabase.rpc as any)("admin_get_gopay_mode");
      setMode(typeof data === "string" ? data : "");
      const { data: rec } = await (supabase.rpc as any)("get_gopay_recurring_enabled");
      setRecurring(rec === true);
    })();
    void loadStatus();
  }, []);



  async function save(next: string) {
    setSaving(true);
    const { data, error } = await (supabase.rpc as any)("admin_set_gopay_mode", { _mode: next });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setMode(String(data ?? next));
    toast.success(`GoPay režim: ${next || "podľa env"}`);
  }

  async function simulate() {
    setSimBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("gopay-webhook", {
        body: { simulate: true, payment_id: `sim_${Date.now()}`, state: simState, user_id: simUser || undefined },
      });
      if (error) throw error;
      toast.success(`Webhook simulácia OK (${data?.state ?? simState})`);
    } catch (e: any) {
      toast.error(e.message ?? "Simulácia zlyhala");
    } finally {
      setSimBusy(false);
    }
  }

  const effective = mode === "production" ? "production" : mode === "sandbox" ? "sandbox" : "(podľa GOPAY_ENV secret)";

  return (
    <div className="space-y-4">
      <StuckPaymentsCard />

      <Card title="Režim GoPay">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-primary" />
          <div className="text-sm">
            Aktuálne: <b>{effective}</b>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={mode === "sandbox" ? "default" : "outline"} onClick={() => save("sandbox")} disabled={saving}>Sandbox</Button>
          <Button variant={mode === "production" ? "default" : "outline"} onClick={() => save("production")} disabled={saving}>Production</Button>
          <Button variant="ghost" onClick={() => save("")} disabled={saving}>Riadiť cez env secret</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          DB override má prednosť pred secretom <code>GOPAY_ENV</code>. Kľúče (GOID/CLIENT_ID/CLIENT_SECRET) sa nastavujú cez secrets.
        </p>
      </Card>

      <Card title="Opakované platby (recurring)">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Ak je vypnuté, platby sa vytvárajú ako <b>jednorazové na 1 mesiac</b>. Zapnite až keď má
            GoPay účet povolené opakované platby (inak GoPay vráti chybu 344).
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm font-medium">
              {recurring === null ? "…" : recurring ? "Zapnuté" : "Vypnuté"}
            </span>
            <Switch checked={recurring === true} disabled={recurring === null} onCheckedChange={toggleRecurring} />
          </div>
        </div>
      </Card>



      <Card title="Kľúče GoPay (secrets)">
        <p className="text-sm text-muted-foreground">
          Kľúče sa ukladajú bezpečne ako secrets (nie do kódu). Po uložení kliknite <b>Test pripojenia</b> – overí sa OAuth token voči GoPay ({status?.env ?? "…"}).
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(["GOPAY_GOID","GOPAY_CLIENT_ID","GOPAY_CLIENT_SECRET"] as const).map((k) => {
            const ok = status?.secrets?.[k] === true;
            return (
              <div key={k} className="rounded-md border border-primary/10 p-3">
                <div className="flex items-center justify-between">
                  <code className="text-xs">{k}</code>
                  <span className={`text-xs font-medium ${ok ? "text-primary" : "text-muted-foreground"}`}>
                    {status ? (ok ? "✓ nastavené" : "chýba") : "…"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const url = `https://supabase.com/dashboard/project/${(import.meta as any).env.VITE_SUPABASE_PROJECT_ID}/settings/functions`;
              window.open(url, "_blank");
            }}
          >
            Nastaviť/upraviť kľúče
          </Button>
          <Button onClick={loadStatus} disabled={testing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${testing ? "animate-spin" : ""}`} />
            {testing ? "Testujem…" : "Test pripojenia"}
          </Button>
          {status && (
            <span className={`text-sm ${status.oauth?.ok ? "text-primary" : "text-destructive"}`}>
              {status.oauth?.ok
                ? `OAuth OK (${status.env})`
                : status.oauth?.error === "GOPAY_NOT_CONFIGURED"
                  ? "Kľúče zatiaľ chýbajú"
                  : `Chyba: ${status.oauth?.error ?? "neznáma"}`}
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Placeholdery: kým sú secrety prázdne alebo <code>PLACEHOLDER</code>, integrácia beží v sandbox režime bez reálnych volaní.
        </p>
      </Card>

      <Card title="Simulátor webhooku">

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">User ID</label>
            <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background"
              value={simUser} onChange={(e) => setSimUser(e.target.value)} placeholder="uuid" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Stav</label>
            <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background"
              value={simState} onChange={(e) => setSimState(e.target.value)}>
              <option>PAID</option>
              <option>CANCELED</option>
              <option>TIMEOUTED</option>
              <option>REFUNDED</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={simulate} disabled={simBusy}>
              {simBusy ? "Simulujem…" : "Simulovať webhook"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function UsersTab() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_list_users", { _limit: 500 });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as UserRow[]);
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.email ?? "").toLowerCase().includes(s) ||
      (r.ico ?? "").toLowerCase().includes(s) ||
      (r.company_name ?? "").toLowerCase().includes(s));
  }, [q, rows]);

  const counts = useMemo(() => {
    let paid = 0, manual = 0, trial = 0, expired = 0;
    for (const r of rows) {
      if (r.subscription_status === "active" && r.subscription_source === "manual") manual++;
      else if (r.subscription_status === "active") paid++;
      else if (r.subscription_status === "trial") trial++;
      else if (r.subscription_status === "expired") expired++;
    }
    return { paid, manual, trial, expired };
  }, [rows]);

  return (
    <Card title={`Používatelia (${rows.length})`}>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <span className="rounded bg-primary/10 text-primary px-2 py-0.5">Platiaci: <b>{counts.paid}</b></span>
        <span className="rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5">Manuálni/zadarmo: <b>{counts.manual}</b></span>
        <span className="rounded bg-muted px-2 py-0.5">Trial: <b>{counts.trial}</b></span>
        <span className="rounded bg-destructive/10 text-destructive px-2 py-0.5">Exspirovaní: <b>{counts.expired}</b></span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <UsersIcon className="h-4 w-4 text-muted-foreground" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Hľadať e-mail…"
          className="rounded border px-2 py-1.5 text-sm bg-background max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="ml-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Obnoviť
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b border-primary/10">
            <tr>
              <th className="py-2 pr-3">E-mail</th>
              <th className="py-2 pr-3">IČO / firma</th>
              <th className="py-2 pr-3">Predplatné</th>
              <th className="py-2 pr-3">Tier</th>
              <th className="py-2 pr-3">Zdroj</th>
              <th className="py-2 pr-3">Platné do</th>
              <th className="py-2 pr-3">Poznámka</th>
              <th className="py-2 pr-3">Registrácia</th>
              <th className="py-2 pr-3 text-right">Radary</th>
              <th className="py-2 pr-3 text-right">Akcia</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.user_id} className="border-b border-primary/5">
                <td className="py-2 pr-3">{r.email ?? "—"}</td>
                <td className="py-2 pr-3 max-w-[22ch]">
                  {r.ico ? (
                    <div className="leading-tight">
                      <div className="num">{r.ico}</div>
                      {r.company_name && (
                        <div className="text-xs text-muted-foreground truncate" title={r.company_name}>{r.company_name}</div>
                      )}
                    </div>
                  ) : "—"}
                </td>
                <td className="py-2 pr-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    r.subscription_status === "active" ? "bg-primary/10 text-primary" :
                    r.subscription_status === "expired" ? "bg-destructive/10 text-destructive" :
                    "bg-muted text-muted-foreground"
                  }`}>{r.subscription_status ?? "—"}</span>
                </td>
                <td className="py-2 pr-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    r.subscription_tier === "komplet" ? "bg-foreground/10 text-foreground" :
                    r.subscription_tier === "premium" ? "bg-primary/10 text-primary" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {r.subscription_tier === "komplet" ? "Komplet" : r.subscription_tier === "premium" ? "Prémium" : "Základ"}
                    {(r as any).billing_period === "yearly" ? " · ročne" : ""}
                  </span>
                </td>

                <td className="py-2 pr-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    r.subscription_source === "manual" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                    r.subscription_source === "paid" ? "bg-primary/10 text-primary" :
                    "bg-muted text-muted-foreground"
                  }`}>{r.subscription_source ?? "trial"}</span>
                </td>
                <td className="py-2 pr-3">{fmtDate(r.subscription_valid_until)}</td>
                <td className="py-2 pr-3 max-w-[16ch] truncate" title={r.subscription_note ?? ""}>{r.subscription_note ?? "—"}</td>
                <td className="py-2 pr-3">{fmtDate(r.created_at)}</td>
                <td className="py-2 pr-3 text-right num" title={radarSummary(r)}>
                  {r.radars_count}
                  {(r.grant_radars_count ?? 0) > 0 && (
                    <span className="text-muted-foreground"> + {r.grant_radars_count}G</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      <Settings2 className="h-3.5 w-3.5 mr-1" /> Spravovať
                    </Button>
                    {r.user_id !== meId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        title="Zmazať účet"
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Žiadne záznamy.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <SubscriptionDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {deleting && (
        <DeleteUserDialog
          userId={deleting.user_id}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); void load(); }}
        />
      )}
    </Card>
  );
}

function SubscriptionDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<string>(user.subscription_status ?? "trial");
  const [source, setSource] = useState<string>(user.subscription_source ?? "trial");
  const [tier, setTier] = useState<string>(user.subscription_tier ?? "basic");
  const [period, setPeriod] = useState<string>((user as any).billing_period ?? "monthly");
  const [validUntil, setValidUntil] = useState<string>(
    user.subscription_valid_until ? new Date(user.subscription_valid_until).toISOString().slice(0, 10) : ""
  );
  const [note, setNote] = useState<string>(user.subscription_note ?? "");
  const [saving, setSaving] = useState(false);

  function setPreset(months: number | "forever", presetTier: "basic" | "premium" | "komplet") {
    if (months === "forever") {
      setValidUntil("");
    } else {
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      setValidUntil(d.toISOString().slice(0, 10));
    }
    setStatus("active");
    setSource("manual");
    setTier(presetTier);
    setPeriod(months === 12 ? "yearly" : "monthly");
  }

  async function save() {
    setSaving(true);
    const { error } = await (supabase.rpc as any)("admin_set_subscription", {
      _user_id: user.user_id,
      _status: status,
      _valid_until: validUntil ? new Date(validUntil + "T23:59:59").toISOString() : null,
      _note: note || null,
      _source: source,
      _tier: tier,
      _period: period,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Predplatné aktualizované");
    onSaved();
  }

  async function revertToTrial() {
    if (!confirm("Vrátiť používateľa na trial?")) return;
    setSaving(true);
    const { error } = await (supabase.rpc as any)("admin_set_subscription", {
      _user_id: user.user_id, _status: "trial", _valid_until: null, _note: note || null,
      _source: "trial", _tier: tier, _period: period,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Vrátené na trial"); onSaved();
  }

  async function expire() {
    if (!confirm("Nastaviť ako expirovaný (odobrať prístup)?")) return;
    setSaving(true);
    const { error } = await (supabase.rpc as any)("admin_set_subscription", {
      _user_id: user.user_id, _status: "expired", _valid_until: null, _note: note || null,
      _source: source === "manual" ? "manual" : "paid", _tier: tier, _period: period,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Predplatné zrušené"); onSaved();
  }

  return (

    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Spravovať predplatné</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Rýchle voľby – Základ (bez AI)</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPreset(1, "basic")}>+1 mesiac</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPreset(6, "basic")}>+6 mesiacov</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPreset(12, "basic")}>+1 rok</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPreset("forever", "basic")}>Natrvalo</Button>
            </div>
          </div>
          <div>
            <Label className="text-xs text-primary">Rýchle voľby – Prémium (s AI)</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="default" onClick={() => setPreset(1, "premium")}>+1 mesiac Prémium</Button>
              <Button type="button" size="sm" variant="default" onClick={() => setPreset(6, "premium")}>+6 mes. Prémium</Button>
              <Button type="button" size="sm" variant="default" onClick={() => setPreset(12, "premium")}>+1 rok Prémium</Button>
              <Button type="button" size="sm" variant="default" onClick={() => setPreset("forever", "premium")}>Natrvalo Prémium</Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Rýchle voľby – Komplet (zákazky + granty + AI)</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setPreset(1, "komplet")}>+1 mesiac Komplet</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setPreset(6, "komplet")}>+6 mes. Komplet</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setPreset(12, "komplet")}>+1 rok Komplet</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setPreset("forever", "komplet")}>Natrvalo Komplet</Button>
            </div>
          </div>


          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sub-status" className="text-xs">Stav</Label>
              <select id="sub-status" value={status} onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background">
                <option value="trial">trial</option>
                <option value="active">active</option>
                <option value="expired">expired</option>
              </select>
            </div>
            <div>
              <Label htmlFor="sub-source" className="text-xs">Zdroj</Label>
              <select id="sub-source" value={source} onChange={(e) => setSource(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background">
                <option value="trial">trial</option>
                <option value="paid">paid (platiaci)</option>
                <option value="manual">manual (zadarmo)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sub-tier" className="text-xs">Tier (AI a granty)</Label>
              <select id="sub-tier" value={tier} onChange={(e) => setTier(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background">
                <option value="basic">Základ – iba monitoring (bez AI)</option>
                <option value="premium">Prémium – zákazky + AI (30/mes)</option>
                <option value="komplet">Komplet – zákazky + granty + AI (150/mes)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="sub-period" className="text-xs">Obdobie</Label>
              <select id="sub-period" value={period} onChange={(e) => setPeriod(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm bg-background">
                <option value="monthly">mesačné</option>
                <option value="yearly">ročné</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Trial má AI automaticky (5 analýz). Pre platiacich/manuálnych rozhoduje tier a obdobie.
          </p>


          <div>
            <Label htmlFor="sub-valid" className="text-xs">Platné do (nechať prázdne = natrvalo)</Label>
            <Input id="sub-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="sub-note" className="text-xs">Poznámka (tester, partner, známy…)</Label>
            <Textarea id="sub-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={revertToTrial} disabled={saving}>Vrátiť na trial</Button>
          <Button variant="ghost" onClick={expire} disabled={saving} className="text-destructive">Zrušiť prístup</Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose} disabled={saving}>Zrušiť</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Ukladám…" : "Uložiť"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- SEO Tab ----------

type SeoPageRow = {
  id: string;
  page_type: "category" | "region" | "category_region";
  category_slug: string | null;
  region_slug: string | null;
  h1: string;
  title: string;
  description: string;
  intro_text: string;
  active_tenders_count: number;
  last_generated_at: string;
};


function SeoTab() {
  const listFn = useServerFn(listSeoPages);
  const genFn = useServerFn(generateSeoPages);
  const regenFn = useServerFn(regenerateSeoPage);
  const updateFn = useServerFn(updateSeoPage);

  const [rows, setRows] = useState<SeoPageRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "category" | "region" | "category_region">("all");
  const [editing, setEditing] = useState<SeoPageRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listFn();
      setRows((data as SeoPageRow[]) ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runGenerate = async (onlyMissing: boolean) => {
    setRunning(true);
    toast.info(onlyMissing ? "Generujem chýbajúce stránky…" : "Regenerujem všetky stránky…");
    try {
      const res = await genFn({ data: { minTenders: 3, onlyMissing } });
      toast.success(`Hotovo: vytvorené ${res.created}, aktualizované ${res.updated}, preskočené ${res.skipped}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const regenerate = async (id: string) => {
    try {
      await regenFn({ data: { id } });
      toast.success("Text pregenerovaný");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const filtered = (rows ?? []).filter((r) => filter === "all" || r.page_type === filter);

  const pathOf = (r: SeoPageRow) => {
    if (r.page_type === "category") return `/zakazky/kategoria/${r.category_slug}`;
    if (r.page_type === "region") return `/zakazky/kraj/${r.region_slug}`;
    return `/zakazky/kategoria/${r.category_slug}/${r.region_slug}`;
  };

  return (
    <div className="space-y-4">
      <Card title="SEO landing stránky">
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => runGenerate(true)} disabled={running}>
            {running ? "Beží…" : "Vygenerovať chýbajúce"}
          </Button>
          <Button variant="outline" onClick={() => runGenerate(false)} disabled={running}>
            Prepočítať počty
          </Button>
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Načítať
          </Button>
          <div className="ml-auto flex gap-1 text-sm">
            {(["all", "category", "region", "category_region"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-2 py-1 border ${filter === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
              >
                {k === "all" ? "Všetko" : k === "category" ? "Kategórie" : k === "region" ? "Kraje" : "Kombinácie"}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Generuje sa iba pre kombinácie s aspoň 3 aktívnymi zákazkami. „Vygenerovať chýbajúce" nezasahuje do už existujúcich textov – iba doplní nové. Ručne upravený text sa neprepíše, kým nedáte „Pregenerovať" na riadku.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2 pr-3">Typ</th>
                  <th className="py-2 pr-3">Cesta</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3 text-right">Aktívne</th>
                  <th className="py-2 pr-3">Vygenerované</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 pr-3 text-xs uppercase">{r.page_type.replace("_", " ")}</td>
                    <td className="py-2 pr-3">
                      <a href={pathOf(r)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {pathOf(r)}
                      </a>
                    </td>
                    <td className="py-2 pr-3 max-w-md truncate" title={r.title}>{r.title}</td>
                    <td className="py-2 pr-3 text-right font-medium">{r.active_tenders_count}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(r.last_generated_at)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => regenerate(r.id)}>Pregenerovať</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Upraviť</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Zatiaľ žiadne stránky. Spustite generovanie.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <SeoEditModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            try {
              await updateFn({ data: { id: editing.id, ...patch } });
              toast.success("Uložené");
              setEditing(null);
              await load();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

function SeoEditModal({
  row, onClose, onSave,
}: {
  row: SeoPageRow;
  onClose: () => void;
  onSave: (patch: { h1: string; title: string; description: string; intro_text: string }) => void;
}) {
  const [h1, setH1] = useState(row.h1);
  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description);
  const [intro, setIntro] = useState(row.intro_text);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold mb-4">Upraviť SEO texty</h3>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-muted-foreground">H1</span>
            <input className="w-full mt-1 border px-3 py-2 bg-background" value={h1} onChange={(e) => setH1(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Title (max 60)</span>
            <input className="w-full mt-1 border px-3 py-2 bg-background" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Description (max 155)</span>
            <textarea className="w-full mt-1 border px-3 py-2 bg-background" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Úvodný text (2-3 vety)</span>
            <textarea className="w-full mt-1 border px-3 py-2 bg-background" rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} />
          </label>
        </div>
        <div className="mt-5 flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Zrušiť</Button>
          <Button onClick={() => onSave({ h1, title, description, intro_text: intro })}>Uložiť</Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Invoices / Faktero Tab ----------

function InvoicesTab() {
  const [mode, setMode] = useState<{ mode: string; counts: any; available?: { test: boolean; live: boolean } } | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<"failed" | "all" | "sent">("failed");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testKey, setTestKey] = useState("");
  const [liveKey, setLiveKey] = useState("");

  async function loadMode() {
    const { data, error } = await supabase.functions.invoke("faktero-ops", { body: { action: "mode" } });
    if (!error && data) setMode(data as any);
  }
  async function loadRows() {
    setLoading(true);
    let q = (supabase.from("invoices" as never) as any)
      .select("id, user_id, gopay_payment_id, invoice_number, amount, currency, status, error_message, retry_count, issued_at, created_at")
      .order("created_at", { ascending: false }).limit(200);
    if (filter === "failed") q = q.eq("status", "failed");
    else if (filter === "sent") q = q.in("status", ["issued", "paid_marked", "sent"]);
    const { data } = await q;
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => { loadMode(); loadRows(); /* eslint-disable-next-line */ }, [filter]);

  async function retry(id: string) {
    setBusy(id);
    const { data, error } = await supabase.functions.invoke("faktero-ops", {
      body: { action: "retry", invoice_id: id },
    });
    setBusy(null);
    if (error) { toast.error("Chyba: " + error.message); return; }
    if ((data as any)?.ok) toast.success("Faktúra vystavená.");
    else toast.error("Znova zlyhalo: " + ((data as any)?.error ?? "unknown"));
    loadRows(); loadMode();
  }

  async function sendTest() {
    setBusy("__test__");
    const { data, error } = await supabase.functions.invoke("faktero-ops", { body: { action: "test" } });
    setBusy(null);
    if (error) { toast.error("Chyba: " + error.message); return; }
    if ((data as any)?.ok) {
      toast.success("Testovacia faktúra vystavená" + ((data as any)?.invoice_number ? `: ${(data as any).invoice_number}` : "."));
    } else {
      toast.error("Zlyhalo: " + ((data as any)?.error ?? "unknown"));
    }
    loadRows(); loadMode();
  }



  async function switchMode(next: "test" | "live") {
    setBusy("__mode__");
    const { data, error } = await supabase.functions.invoke("faktero-ops", {
      body: { action: "set_mode", mode: next },
    });
    setBusy(null);
    if (error) { toast.error("Chyba: " + error.message); return; }
    const err = (data as any)?.error;
    if (err) {
      if (err === "no_test_key_configured") toast.error("Chýba secret FAKTERO_API_KEY_TEST.");
      else if (err === "no_live_key_configured") toast.error("Chýba secret FAKTERO_API_KEY_LIVE.");
      else toast.error("Zlyhalo: " + err);
      return;
    }
    toast.success(`Prepnuté na ${next === "test" ? "TEST" : "LIVE"} režim.`);
    loadMode();
  }

  async function saveKey(which: "test" | "live", value: string) {
    setBusy(`__key_${which}__`);
    const { data, error } = await supabase.functions.invoke("faktero-ops", {
      body: { action: "set_key", mode: which, value },
    });
    setBusy(null);
    if (error) { toast.error("Chyba: " + error.message); return; }
    const err = (data as any)?.error;
    if (err) {
      if (err.startsWith("invalid_prefix:")) {
        toast.error(`Neplatný kľúč – musí začínať '${err.split(":")[1]}'.`);
      } else {
        toast.error("Zlyhalo: " + err);
      }
      return;
    }
    toast.success(value.trim() ? `${which.toUpperCase()} kľúč uložený.` : `${which.toUpperCase()} kľúč vymazaný.`);
    if (which === "test") setTestKey("");
    else setLiveKey("");
    loadMode();
  }


  const badge = mode?.mode === "test"
    ? <span className="rounded-none bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 text-xs font-medium">TEST režim</span>
    : mode?.mode === "live"
    ? <span className="rounded-none bg-green-600/20 text-green-800 dark:text-green-300 px-2 py-0.5 text-xs font-medium">LIVE režim</span>
    : <span className="rounded-none bg-destructive/20 text-destructive px-2 py-0.5 text-xs font-medium">Chýba kľúč</span>;

  const avail = mode?.available ?? { test: false, live: false };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-primary/15 bg-card p-5">
        <div className="flex items-center gap-3">
          <h3 className="font-display font-semibold">Faktero</h3>
          {badge}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Prepnutie režimu použije <code>FAKTERO_API_KEY_TEST</code> alebo <code>FAKTERO_API_KEY_LIVE</code> (fallback: <code>FAKTERO_API_KEY</code> podľa prefixu).
        </p>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-1">Režim:</span>
          <Button
            size="sm"
            variant={mode?.mode === "test" ? "default" : "outline"}
            disabled={busy === "__mode__" || !avail.test || mode?.mode === "test"}
            onClick={() => switchMode("test")}
          >
            TEST
          </Button>
          <Button
            size="sm"
            variant={mode?.mode === "live" ? "default" : "outline"}
            disabled={busy === "__mode__" || !avail.live || mode?.mode === "live"}
            onClick={() => switchMode("live")}
          >
            LIVE
          </Button>
          {(!avail.test || !avail.live) && (
            <span className="text-xs text-muted-foreground ml-2">
              {!avail.test && "Chýba FAKTERO_API_KEY_TEST. "}
              {!avail.live && "Chýba FAKTERO_API_KEY_LIVE."}
            </span>
          )}
        </div>

        {mode?.counts && (
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-muted-foreground">Vystavené</div><div className="font-semibold num">{mode.counts.issued}</div></div>
            <div><div className="text-muted-foreground">Nevystavené (chyby)</div><div className="font-semibold num text-destructive">{mode.counts.failed}</div></div>
            <div><div className="text-muted-foreground">Čakajúce</div><div className="font-semibold num">{mode.counts.pending}</div></div>
          </div>
        )}
        {mode?.mode === "test" && (
          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" onClick={sendTest} disabled={busy === "__test__"}>
              {busy === "__test__" ? "Posielam…" : "Poslať testovaciu faktúru"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Vystaví testovaciu faktúru na 4,99 € pre vaše konto (podľa vašich fakturačných údajov).
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-primary/15 bg-card p-5">
        <h3 className="font-display font-semibold">API kľúče (Faktero)</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Zadajte kľúče priamo tu – prepíšu prípadné secrets v prostredí. TEST kľúč musí začínať <code>fk_test_</code>, LIVE kľúč <code>fk_live_</code>. Prázdna hodnota kľúč vymaže.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-primary/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">TEST kľúč</label>
              <span className={`text-xs ${avail.test ? "text-primary" : "text-muted-foreground"}`}>
                {avail.test ? "✓ nastavený" : "chýba"}
              </span>
            </div>
            <input
              type="password"
              autoComplete="off"
              value={testKey}
              onChange={(e) => setTestKey(e.target.value)}
              placeholder="fk_test_…"
              className="w-full rounded border px-2 py-1.5 text-sm bg-background"
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => saveKey("test", testKey)} disabled={busy === "__key_test__" || !testKey.trim()}>
                {busy === "__key_test__" ? "Ukladám…" : "Uložiť"}
              </Button>
              {avail.test && (
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Vymazať TEST kľúč?")) saveKey("test", ""); }} disabled={busy === "__key_test__"}>
                  Vymazať
                </Button>
              )}
            </div>
          </div>
          <div className="rounded-md border border-primary/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">LIVE kľúč</label>
              <span className={`text-xs ${avail.live ? "text-primary" : "text-muted-foreground"}`}>
                {avail.live ? "✓ nastavený" : "chýba"}
              </span>
            </div>
            <input
              type="password"
              autoComplete="off"
              value={liveKey}
              onChange={(e) => setLiveKey(e.target.value)}
              placeholder="fk_live_…"
              className="w-full rounded border px-2 py-1.5 text-sm bg-background"
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => saveKey("live", liveKey)} disabled={busy === "__key_live__" || !liveKey.trim()}>
                {busy === "__key_live__" ? "Ukladám…" : "Uložiť"}
              </Button>
              {avail.live && (
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Vymazať LIVE kľúč?")) saveKey("live", ""); }} disabled={busy === "__key_live__"}>
                  Vymazať
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Kľúče sú uložené v tabuľke <code>admin_secrets</code> a čítajú ich len edge funkcie cez service role – nie sú prístupné z frontendu.
        </p>
      </section>



      <section className="rounded-lg border border-primary/15 bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display font-semibold">Faktúry</h3>
          <div className="flex gap-1">
            {(["failed", "sent", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={"rounded-none border border-primary/20 px-2 py-1 text-xs " + (filter === f ? "bg-primary text-primary-foreground" : "bg-transparent")}>
                {f === "failed" ? "Nevystavené" : f === "sent" ? "Vystavené" : "Všetky"}
              </button>
            ))}
          </div>
        </div>
        {loading ? <p className="mt-3 text-sm text-muted-foreground">Načítavam…</p> : rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Žiadne záznamy.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-primary/10">
                  <th className="py-2 pr-3">Vytvorené</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">GoPay ID</th>
                  <th className="py-2 pr-3">Číslo</th>
                  <th className="py-2 pr-3">Suma</th>
                  <th className="py-2 pr-3">Stav</th>
                  <th className="py-2 pr-3">Chyba</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-primary/5 align-top">
                    <td className="py-2 pr-3 num">{new Date(r.created_at).toLocaleString("sk-SK")}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{String(r.user_id).slice(0, 8)}…</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.gopay_payment_id}</td>
                    <td className="py-2 pr-3 num">{r.invoice_number ?? "—"}</td>
                    <td className="py-2 pr-3 num">{Number(r.amount).toFixed(2)} {r.currency}</td>
                    <td className="py-2 pr-3">{r.status}{r.retry_count ? ` (${r.retry_count}×)` : ""}</td>
                    <td className="py-2 pr-3 text-xs text-destructive max-w-[240px] truncate" title={r.error_message ?? ""}>{r.error_message ?? ""}</td>
                    <td className="py-2 pr-3">
                      {r.status === "failed" && (
                        <Button size="sm" variant="outline" onClick={() => retry(r.id)} disabled={busy === r.id}>
                          {busy === r.id ? "…" : "Skúsiť znova"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- AI test tab: run Gemini analysis on ad-hoc tender + IČO ----------
function AiTestTab() {
  const listFn = useServerFn(adminListTendersForTest);
  const analyzeFn = useServerFn(adminAnalyzeTender);
  const suggestFn = useServerFn(adminSuggestSubcontracting);
  const findFn = useServerFn(adminFindSubcontractorCandidates);
  const outreachFn = useServerFn(adminGenerateOutreach);
  const [tenders, setTenders] = useState<Array<{ id: string; title: string; contracting_authority: string; deadline: string | null; cpv_code: string | null }>>([]);
  const [tenderId, setTenderId] = useState("");
  const [ico, setIco] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [totalMs, setTotalMs] = useState<number | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subResult, setSubResult] = useState<any>(null);
  const [candLoadingIdx, setCandLoadingIdx] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Record<number, any>>({});
  const [outreachLoading, setOutreachLoading] = useState<string | null>(null);
  const [outreach, setOutreach] = useState<Record<string, any>>({});


  useEffect(() => {
    listFn().then((rows) => setTenders(rows as any)).catch((e) => toast.error("Nepodarilo sa načítať zákazky: " + (e?.message ?? e)));
  }, [listFn]);

  async function run() {
    if (!tenderId) return toast.error("Vyber alebo vlož tender_id");
    if (!ico || ico.length < 6) return toast.error("Zadaj platné IČO (6–12 číslic)");
    setLoading(true);
    setResult(null);
    setTotalMs(null);
    setSubResult(null);
    setCandidates({});
    setOutreach({});
    const t0 = Date.now();
    try {
      const r = await analyzeFn({ data: { tender_id: tenderId, ico } });
      setResult(r);
      setTotalMs(Date.now() - t0);
    } catch (e: any) {
      toast.error("Analýza zlyhala: " + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function runSuggest() {
    if (!result) return;
    setSubLoading(true);
    setSubResult(null);
    setCandidates({});
    setOutreach({});
    try {
      const r = await suggestFn({
        data: {
          tender_id: tenderId,
          ico,
          requirements: result.parts?.requirements?.parsed ?? null,
          eligibility: result.parts?.eligibility?.parsed ?? null,
        },
      });
      setSubResult(r);
    } catch (e: any) {
      toast.error("Návrh subdodávok zlyhal: " + (e?.message ?? String(e)));
    } finally {
      setSubLoading(false);
    }
  }

  async function runFindCandidates(idx: number, keyword: string, city?: string | null) {
    setCandLoadingIdx(idx);
    try {
      const r = await findFn({ data: { keyword, city: city ?? null, limit: 15 } });
      setCandidates((prev) => ({ ...prev, [idx]: r }));
    } catch (e: any) {
      toast.error("Hľadanie firiem zlyhalo: " + (e?.message ?? String(e)));
    } finally {
      setCandLoadingIdx(null);
    }
  }

  async function runOutreach(idx: number, need: any, candidate: any) {
    const key = `${idx}:${candidate.ico ?? candidate.nazov}`;
    setOutreachLoading(key);
    try {
      const r = await outreachFn({
        data: {
          tender_id: tenderId,
          need_nazov: need.nazov,
          specifikacia: need.dovod ?? need.nazov,
          subcontractor_nazov: candidate.nazov ?? "Vážený partner",
          our_firm_nazov: subResult?.registry?.nazov ?? "Naša firma",
          our_firm_ico: subResult?.registry?.ico ?? null,
        },
      });
      setOutreach((prev) => ({ ...prev, [key]: r }));
    } catch (e: any) {
      toast.error("Generovanie oslovenia zlyhalo: " + (e?.message ?? String(e)));
    } finally {
      setOutreachLoading(null);
    }
  }


  return (
    <div className="space-y-4">
      <section className="rounded-xl border p-4 space-y-3">
        <h3 className="font-medium">AI test – analýza zákazky</h3>
        <p className="text-sm text-muted-foreground">
          Zvoľ zákazku z posledných 30 (alebo vlož tender_id) a IČO firmy. Analýza obíde firemný profil – identifikáciu vytiahne priamo z registrov.
        </p>

        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] items-end">
          <div>
            <Label htmlFor="ai-tender">Zákazka</Label>
            <select
              id="ai-tender"
              value={tenderId}
              onChange={(e) => setTenderId(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">— vyber alebo vlož ID nižšie —</option>
              {tenders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title.slice(0, 90)} · {t.contracting_authority.slice(0, 40)}
                </option>
              ))}
            </select>
            <Input
              className="mt-2"
              placeholder="alebo priamo tender_id (uuid)"
              value={tenderId}
              onChange={(e) => setTenderId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ai-ico">IČO firmy</Label>
            <Input id="ai-ico" value={ico} onChange={(e) => setIco(e.target.value)} placeholder="napr. 36631124" />
          </div>
          <Button onClick={run} disabled={loading}>
            {loading ? "Analyzujem…" : "Spustiť analýzu"}
          </Button>
        </div>
      </section>

      {result && (
        <section className="rounded-xl border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{result.tender.title}</div>
              <div className="text-xs text-muted-foreground">{result.tender.contracting_authority}</div>
            </div>
            {totalMs !== null && <div className="text-xs text-muted-foreground">Celkom: {(totalMs / 1000).toFixed(1)} s</div>}
          </div>

          <details className="rounded border p-3 text-xs" open>
            <summary className="cursor-pointer font-medium">Údaje z registrov (RPO + registeruz)</summary>
            <pre className="whitespace-pre-wrap mt-2">{JSON.stringify(result.registry_data, null, 2)}</pre>
          </details>

          {result.errors?.length > 0 && (
            <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm">
              <div className="font-medium mb-1">Chyby počas analýzy:</div>
              <ul className="list-disc pl-5">
                {result.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <PartBlock title="1. Súhrn zákazky" part={result.parts?.summary} />
          <PartBlock title="2. Podmienky účasti" part={result.parts?.requirements} />
          <PartBlock title="3. Spôsobilosť firmy" part={result.parts?.eligibility} />

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Fáza 3 — Subdodávky a partneri</div>
                <div className="text-xs text-muted-foreground">Testovacie spustenie (nič sa neukladá do tender_subcontracting).</div>
              </div>
              <Button onClick={runSuggest} disabled={subLoading} size="sm">
                {subLoading ? "Navrhujem…" : "Navrhnúť subdodávky"}
              </Button>
            </div>
          </div>

          {subResult && (
            <div className="rounded border p-3 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Model: {subResult.model} · {(subResult.elapsedMs / 1000).toFixed(1)} s</span>
                {subResult.firma_zvladne_sama && <span className="text-primary">Firma pravdepodobne zvládne sama</span>}
              </div>
              {subResult.poznamka && (
                <div className="text-sm bg-muted p-2 rounded">{subResult.poznamka}</div>
              )}
              {(subResult.polozky ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground italic">Žiadne návrhy subdodávok.</div>
              ) : (
                <ul className="space-y-3">
                  {subResult.polozky.map((p: any, idx: number) => {
                    const cand = candidates[idx];
                    return (
                      <li key={idx} className="rounded border p-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{p.nazov}</div>
                            <div className="text-xs text-muted-foreground mt-1">{p.dovod}</div>
                            <div className="text-xs mt-1">
                              NACE: <b>{p.nace_kod ?? "—"}</b> · Kľúč hľadania: <b>{p.hladane_slovo ?? "—"}</b>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!p.hladane_slovo || candLoadingIdx === idx}
                            onClick={() => runFindCandidates(idx, p.hladane_slovo, subResult?.registry?.mesto)}
                          >
                            {candLoadingIdx === idx ? "Hľadám…" : "Nájsť firmy (RPO)"}
                          </Button>
                        </div>
                        {cand && (
                          <div className="text-xs space-y-2">
                            <div className="text-muted-foreground">
                              Nájdených {cand.results?.length ?? 0} firiem · {(cand.elapsedMs / 1000).toFixed(1)} s
                              {cand.error && <span className="text-destructive"> · {cand.error}</span>}
                            </div>
                            {(cand.results ?? []).slice(0, 10).map((c: any, ci: number) => {
                              const key = `${idx}:${c.ico ?? c.nazov}`;
                              const em = outreach[key];
                              return (
                                <div key={ci} className="rounded border p-2 space-y-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="font-medium">{c.nazov ?? "?"} <span className="text-muted-foreground">· IČO {c.ico ?? "—"}</span></div>
                                      <div className="text-muted-foreground">{[c.ulica, c.psc, c.mesto].filter(Boolean).join(", ")}</div>
                                      <div className="text-muted-foreground italic">{c.hlavna_cinnost}</div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={outreachLoading === key}
                                      onClick={() => runOutreach(idx, p, c)}
                                    >
                                      {outreachLoading === key ? "Píšem…" : "Ukážka oslovenia"}
                                    </Button>
                                  </div>
                                  {em?.parsed && (
                                    <details className="mt-1" open>
                                      <summary className="cursor-pointer text-muted-foreground">Vygenerované oslovenia ({em.model} · {(em.elapsedMs / 1000).toFixed(1)} s)</summary>
                                      <div className="mt-2 space-y-2">
                                        <div className="bg-muted p-2 rounded">
                                          <div className="font-medium">Neutrálny dopyt</div>
                                          <div className="text-xs"><b>Predmet:</b> {em.parsed.neutralne?.predmet}</div>
                                          <pre className="whitespace-pre-wrap text-xs mt-1">{em.parsed.neutralne?.telo}</pre>
                                        </div>
                                        <div className="bg-muted p-2 rounded">
                                          <div className="font-medium">Dopyt + spolupráca</div>
                                          <div className="text-xs"><b>Predmet:</b> {em.parsed.spolupraca?.predmet}</div>
                                          <pre className="whitespace-pre-wrap text-xs mt-1">{em.parsed.spolupraca?.telo}</pre>
                                        </div>
                                      </div>
                                    </details>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Raw JSON (vrstva A)</summary>
                <pre className="whitespace-pre-wrap mt-2 bg-muted p-2 rounded">{JSON.stringify(subResult.parsed, null, 2)}</pre>
              </details>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PartBlock({ title, part }: { title: string; part: any | null }) {
  if (!part) return (
    <div className="rounded border p-3 text-sm">
      <div className="font-medium">{title}</div>
      <div className="text-muted-foreground italic mt-1">— nespustené / zlyhalo —</div>
    </div>
  );
  return (
    <div className="rounded border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">
          {part.model} · {(part.elapsedMs / 1000).toFixed(1)} s
        </div>
      </div>
      {part.parsed && (
        <details className="text-xs" open>
          <summary className="cursor-pointer">Parsed JSON</summary>
          <pre className="whitespace-pre-wrap mt-2 bg-muted p-2 rounded">{JSON.stringify(part.parsed, null, 2)}</pre>
        </details>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer">Raw text</summary>
        <pre className="whitespace-pre-wrap mt-2 bg-muted p-2 rounded">{part.text}</pre>
      </details>
    </div>
  );
}

function GrantsTestTab() {
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState<any>(null);
  const [kod, setKod] = useState("PSK-MIRRI-977-2026-TP-KF");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(5);
  const [stats, setStats] = useState<{ total: number; otvorene: number } | null>(null);

  async function refreshStats() {
    const { data } = await supabase.from("grant_calls").select("id, stav", { count: "exact" });
    if (data) {
      setStats({
        total: data.length,
        otvorene: data.filter((r: any) => r.stav === "OTVORENA").length,
      });
    }
  }

  useEffect(() => { void refreshStats(); }, []);

  async function testList() {
    setBusy("list");
    setOutput(null);
    try {
      const res = await fetch(`https://api.itms21.sk/public/v1/vyzva?limit=3&ajUkoncene=false&expression=DATUMVYHLASENIA&ascending=false`);
      setOutput(await res.json());
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(null); }
  }

  async function testDetail() {
    if (!kod.trim()) return;
    setBusy("detail");
    setOutput(null);
    try {
      const res = await fetch(`https://api.itms21.sk/public/v1/vyzva/${encodeURIComponent(kod.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOutput(await res.json());
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(null); }
  }

  async function backfillPage(rawOnly: boolean) {
    setBusy(rawOnly ? "raw" : "backfill");
    setOutput(null);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-itms-grants", {
        body: { next_offset: offset, limit, ajUkoncene: true, raw_only: rawOnly, with_detail: !rawOnly },
      });
      if (error) throw error;
      setOutput(data);
      if (!rawOnly) await refreshStats();
      toast.success(`OK: ${data?.processed ?? data?.returned ?? 0} výziev`);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(null); }
  }

  async function runIncrementalSync(full: boolean) {
    setBusy("sync");
    setOutput(null);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-itms-grants", {
        body: full ? { full: true } : {},
      });
      if (error) throw error;
      setOutput(data);
      await refreshStats();
      toast.success("Sync dokončený");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(null); }
  }

  async function runPooSync(opts: { force?: boolean; limit?: number }) {
    setBusy("poo");
    setOutput(null);
    try {
      const res = await fetch("/api/public/hooks/sync-poo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string,
        },
        body: JSON.stringify(opts),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setOutput(data);
      await refreshStats();
      toast.success(`POO sync: +${data.created} nových, ${data.updated} aktualizovaných`);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(null); }
  }

  async function runPpaSync(opts: { force?: boolean; limit?: number }) {
    setBusy("ppa");
    setOutput(null);
    try {
      const res = await fetch("/api/public/hooks/sync-ppa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string,
        },
        body: JSON.stringify(opts),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setOutput(data);
      await refreshStats();
      toast.success(`PPA sync: +${data.created} nových, ${data.updated} aktualizovaných`);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(null); }
  }

  async function runCleanup() {

    setBusy("cleanup");
    try {
      const { data, error } = await (supabase.rpc as any)("cleanup_grant_calls");
      if (error) throw error;
      toast.success(`Vymazaných uzavretých: ${data ?? 0}`);
      await refreshStats();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <Card title="ITMS21+ – stav v DB">
        <div className="text-sm text-muted-foreground">
          Uložených výziev: <strong>{stats?.total ?? "…"}</strong> (otvorených: {stats?.otvorene ?? "…"}).
          <br />
          API: <code>https://api.itms21.sk/public/v1</code> · Cron: <code>fetch-itms-grants</code> denne 01:30 UTC.
        </div>
      </Card>

      <Card title="1) Test list (živé ITMS API)">
        <Button onClick={testList} disabled={busy !== null} variant="secondary">
          <RefreshCw className={`h-4 w-4 mr-2 ${busy === "list" ? "animate-spin" : ""}`} />
          GET /vyzva?limit=3
        </Button>
      </Card>

      <Card title="2) Test detail podľa kódu">
        <div className="flex gap-2">
          <Input value={kod} onChange={(e) => setKod(e.target.value)} placeholder="napr. PSK-MIRRI-977-2026-TP-KF" />
          <Button onClick={testDetail} disabled={busy !== null} variant="secondary">
            <Play className={`h-4 w-4 mr-2 ${busy === "detail" ? "animate-spin" : ""}`} />
            GET /vyzva/{"{kod}"}
          </Button>
        </div>
      </Card>

      <Card title="3) Backfill jednej stránky">
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground">offset</label>
            <Input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value) || 0)} className="w-24" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">limit</label>
            <Input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value) || 5)} className="w-24" />
          </div>
          <Button onClick={() => backfillPage(true)} disabled={busy !== null} variant="outline">
            Náhľad (bez upsert)
          </Button>
          <Button onClick={() => backfillPage(false)} disabled={busy !== null}>
            <Play className={`h-4 w-4 mr-2 ${busy === "backfill" ? "animate-spin" : ""}`} />
            Backfill + upsert
          </Button>
        </div>
      </Card>

      <Card title="4) Ostatné akcie">
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => runIncrementalSync(false)} disabled={busy !== null} variant="secondary">
            Incremental sync (watermark)
          </Button>
          <Button onClick={() => runIncrementalSync(true)} disabled={busy !== null} variant="outline">
            Full sync (ignoruje watermark)
          </Button>
          <Button onClick={runCleanup} disabled={busy !== null} variant="outline">
            Cleanup uzavretých (&gt; 90 dní)
          </Button>
        </div>
      </Card>

      <Card title="5) Plán obnovy (POO) – sync">
        <div className="text-sm text-muted-foreground mb-2">
          API: <code>https://public-api.planobnovy.sk</code> · endpoint:{" "}
          <code>/api/public/hooks/sync-poo</code> · cron denne 02:45 UTC.
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => runPooSync({ limit: 5 })} disabled={busy !== null} variant="outline">
            Test (5 výziev)
          </Button>
          <Button onClick={() => runPooSync({})} disabled={busy !== null} variant="secondary">
            <Play className={`h-4 w-4 mr-2 ${busy === "poo" ? "animate-spin" : ""}`} />
            Inkrementálny sync
          </Button>
          <Button onClick={() => runPooSync({ force: true })} disabled={busy !== null} variant="outline">
            Full sync (force)
          </Button>
        </div>
      </Card>

      <Card title="6) PPA – sync">
        <div className="text-sm text-muted-foreground mb-2">
          API: <code>https://apa.sk</code> · endpoint: <code>/api/public/hooks/sync-ppa</code> · cron denne 03:15 UTC.
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => runPpaSync({ limit: 5 })} disabled={busy !== null} variant="outline">
            Test (5 výziev)
          </Button>
          <Button onClick={() => runPpaSync({})} disabled={busy !== null} variant="secondary">
            <Play className={`h-4 w-4 mr-2 ${busy === "ppa" ? "animate-spin" : ""}`} />
            Inkrementálny sync
          </Button>
          <Button onClick={() => runPpaSync({ force: true })} disabled={busy !== null} variant="outline">
            Full sync (force)
          </Button>
        </div>
      </Card>


      {output && (
        <Card title="Výstup">
          <pre className="whitespace-pre-wrap text-xs bg-muted p-3 rounded max-h-[70vh] overflow-auto">
{JSON.stringify(output, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

function GrantsAiTestTab() {
  const analyzeFn = useServerFn(adminAnalyzeGrant);
  const [grants, setGrants] = useState<Array<{ id: string; kod: string | null; title: string; poskytovatel: string | null }>>([]);
  const [grantId, setGrantId] = useState("");
  const [pravnaForma, setPravnaForma] = useState("Spoločnosť s ručením obmedzeným");
  const [velkost, setVelkost] = useState("mikro");
  const [kraj, setKraj] = useState("Bratislavský kraj");
  const [obrat, setObrat] = useState("250000");
  const [rok, setRok] = useState(String(new Date().getFullYear() - 1));
  const [intent, setIntent] = useState("Chceme kúpiť fotovoltiku 40 kWp na strechu výrobnej haly a batériové úložisko.");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("grant_calls")
        .select("id,kod,title,poskytovatel")
        .eq("stav", "OTVORENA")
        .order("datum_vyhlasenia", { ascending: false })
        .limit(200);
      setGrants(data ?? []);
      if (data && data.length && !grantId) setGrantId(data[0].id);
    })();
  }, []);

  async function run() {
    if (!grantId) return;
    setBusy(true);
    setOut(null);
    try {
      const res = await analyzeFn({
        data: {
          grant_id: grantId,
          intent: intent.trim() || null,
          company_override: {
            pravna_forma: pravnaForma,
            velkost,
            kraj,
            obrat_posledny: Number(obrat) || undefined,
            rok_obratu: Number(rok) || undefined,
          },
        },
      });
      setOut(res);
      toast.success("AI analýza spustená");
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Grantová AI analýza – testovací režim (bez firemného profilu)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Grantová výzva</Label>
            <select className="mt-1 w-full border rounded-md px-3 py-2 bg-background" value={grantId} onChange={(e) => setGrantId(e.target.value)}>
              {grants.map((g) => (
                <option key={g.id} value={g.id}>{g.kod} — {g.title.slice(0, 90)}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Právna forma firmy</Label>
            <Input value={pravnaForma} onChange={(e) => setPravnaForma(e.target.value)} />
          </div>
          <div>
            <Label>Veľkosť</Label>
            <Input value={velkost} onChange={(e) => setVelkost(e.target.value)} />
          </div>
          <div>
            <Label>Kraj (sídlo)</Label>
            <Input value={kraj} onChange={(e) => setKraj(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Obrat (EUR)</Label>
              <Input value={obrat} onChange={(e) => setObrat(e.target.value)} />
            </div>
            <div>
              <Label>Rok</Label>
              <Input value={rok} onChange={(e) => setRok(e.target.value)} />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Zámer (voliteľné)</Label>
            <Textarea rows={2} value={intent} onChange={(e) => setIntent(e.target.value)} />
          </div>
        </div>
        <Button onClick={run} disabled={busy || !grantId} className="mt-3">
          <Sparkles className={`h-4 w-4 mr-2 ${busy ? "animate-spin" : ""}`} />
          Spustiť AI analýzu
        </Button>
      </Card>

      {out && (
        <>
          <Card title={`Výstup: ${out.grant?.kod} — ${out.grant?.title?.slice(0, 120) ?? ""}`}>
            <div className="text-sm space-y-2">
              <div><b>Odporúčanie:</b> {out.recommendation ?? "—"}</div>
              <div><b>Gate:</b> applicant_match={out.gate?.applicant_match} · region_match={out.gate?.region_match} · blocked={String(out.gate?.blocked)}</div>
              {out.gate?.blocking_reason && <div className="text-red-700"><b>Blokujúca chyba:</b> {out.gate.blocking_reason}</div>}
              <div><b>Financie:</b> {out.financial?.hodnotenie} · miera {out.financial?.miera_spolufinancovania_pct ?? "?"} % · alokácia {out.financial?.alokacia_eur ?? "?"} €</div>
              <div className="text-muted-foreground text-xs">{out.financial?.poznamka}</div>
              {out.errors?.length > 0 && (
                <div className="text-red-700"><b>Errors:</b> {out.errors.join(" · ")}</div>
              )}
            </div>
          </Card>
          <Card title="1) Formálna oprávnenosť (Gemini Pro)">
            <div className="text-xs text-muted-foreground">Model: {out.formal?.model} · {out.formal?.elapsedMs} ms</div>
            <pre className="whitespace-pre-wrap mt-2 bg-muted p-2 rounded text-xs max-h-96 overflow-auto">{out.formal?.text ?? "(no output)"}</pre>
          </Card>
          <Card title="2) Čo výzva financuje (Gemini Flash)">
            <div className="text-xs text-muted-foreground">Model: {out.financed?.model} · {out.financed?.elapsedMs} ms</div>
            <pre className="whitespace-pre-wrap mt-2 bg-muted p-2 rounded text-xs max-h-96 overflow-auto">{out.financed?.text ?? "(no output)"}</pre>
          </Card>
          {out.intent && (
            <Card title="3) Súlad zámeru (Gemini Flash)">
              <div className="text-xs text-muted-foreground">Model: {out.intent?.model} · {out.intent?.elapsedMs ?? 0} ms · skipped: {out.intent?.skipped ?? "no"}</div>
              <div className="mt-2 text-sm italic">Zámer: „{out.intent?.provided}"</div>
              <pre className="whitespace-pre-wrap mt-2 bg-muted p-2 rounded text-xs max-h-96 overflow-auto">{out.intent?.text ?? "(no output)"}</pre>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
