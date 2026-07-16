import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Play, Mail, Send, Sparkles, CreditCard, Users as UsersIcon, ShieldCheck } from "lucide-react";
import { listSeoPages, generateSeoPages, regenerateSeoPage, updateSeoPage } from "@/lib/seo.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin – Tendrik" }] }),
  component: AdminPage,
});

type SourceBreakdown = { total: number; active: number; expired: number };
type Overview = {
  users: { total: number; trial: number; active: number; expired: number };
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
  subscription_note: string | null;
  trial_started_at: string | null;
  subscription_valid_until: string | null;
  radars_count: number;
};

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

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Prehľad</TabsTrigger>
          <TabsTrigger value="actions">Akcie</TabsTrigger>
          <TabsTrigger value="gopay">GoPay</TabsTrigger>
          <TabsTrigger value="invoices">Faktero fakturácia</TabsTrigger>
          <TabsTrigger value="users">Používatelia</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="actions" className="mt-4"><ActionsTab /></TabsContent>
        <TabsContent value="gopay" className="mt-4"><GopayTab /></TabsContent>
        <TabsContent value="invoices" className="mt-4"><InvoicesTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="seo" className="mt-4"><SeoTab /></TabsContent>
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

function GopayTab() {
  const [mode, setMode] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [simUser, setSimUser] = useState("");
  const [simState, setSimState] = useState("PAID");
  const [simBusy, setSimBusy] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [testing, setTesting] = useState(false);

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
    return rows.filter((r) => (r.email ?? "").toLowerCase().includes(s));
  }, [q, rows]);

  return (
    <Card title={`Používatelia (${rows.length})`}>
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
              <th className="py-2 pr-3">Predplatné</th>
              <th className="py-2 pr-3">Trial od</th>
              <th className="py-2 pr-3">Platné do</th>
              <th className="py-2 pr-3">Registrácia</th>
              <th className="py-2 pr-3 text-right">Radary</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.user_id} className="border-b border-primary/5">
                <td className="py-2 pr-3">{r.email ?? "—"}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    r.subscription_status === "active" ? "bg-primary/10 text-primary" :
                    r.subscription_status === "expired" ? "bg-destructive/10 text-destructive" :
                    "bg-muted text-muted-foreground"
                  }`}>{r.subscription_status ?? "—"}</span>
                </td>
                <td className="py-2 pr-3">{fmtDate(r.trial_started_at)}</td>
                <td className="py-2 pr-3">{fmtDate(r.subscription_valid_until)}</td>
                <td className="py-2 pr-3">{fmtDate(r.created_at)}</td>
                <td className="py-2 pr-3 text-right num">{r.radars_count}</td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Žiadne záznamy.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
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
