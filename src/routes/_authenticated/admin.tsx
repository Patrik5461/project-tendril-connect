import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Play, Mail, Send, Sparkles, CreditCard, Users as UsersIcon, ShieldCheck } from "lucide-react";

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
          <TabsTrigger value="users">Používatelia</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="actions" className="mt-4"><ActionsTab /></TabsContent>
        <TabsContent value="gopay" className="mt-4"><GopayTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
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
              <Stat label="Aktívne (v DB)" value={ov.active_tenders} />
              {Object.entries(ov.tenders_by_source).map(([k, v]) => (
                <Stat key={k} label={`Zdroj: ${k}`} value={v} />
              ))}
            </div>
          </Card>
          <Card title="Posledný fetch podľa zdroja">
            <ul className="text-sm space-y-1">
              {Object.entries(ov.last_fetch).map(([k, v]) => (
                <li key={k} className="flex justify-between border-b border-primary/10 py-1">
                  <span className="font-medium">{k}</span>
                  <span className="text-muted-foreground">{fmtDate(v)}</span>
                </li>
              ))}
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
