import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, BarChart3 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import {
  CONVERSION_KEYS,
  EMPTY_ANALYTICS_CONFIG,
  type AnalyticsConfig,
  type ConversionKey,
} from "@/lib/analytics";

type Ga4Stats =
  | {
      ok: true;
      property_id: string;
      range: { start: string; end: string; days: number };
      totals: {
        activeUsers: number;
        newUsers: number;
        sessions: number;
        pageViews: number;
        avgSessionDuration: number;
        bounceRate: number;
      };
      timeseries: { date: string; activeUsers: number; sessions: number; pageViews: number }[];
      topPages: { path: string; title: string; views: number }[];
      topSources: { source: string; medium: string; sessions: number }[];
      events: { name: string; count: number }[];
    }
  | { ok: false; error: string; missing?: string[] };

export function GoogleAnalyticsTab() {
  const [cfg, setCfg] = useState<AnalyticsConfig>(EMPTY_ANALYTICS_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [days, setDays] = useState(28);
  const [report, setReport] = useState<Ga4Stats | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("admin_get_analytics_config");
      if (error) toast.error(error.message);
      else setCfg({ ...EMPTY_ANALYTICS_CONFIG, ...((data as Partial<AnalyticsConfig>) ?? {}) });
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_analytics_config", {
      _config: cfg as unknown as never,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Nastavenia uložené. Prejaví sa do 2 minút (cache).");
  }

  async function loadReport() {
    setReportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ga4-stats", {
        body: { days },
      });
      if (error) throw error;
      const r = data as Ga4Stats;
      setReport(r);
      if (!r.ok) toast.error(r.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Načítanie zlyhalo");
    } finally {
      setReportLoading(false);
    }
  }


  if (loading) return <div className="p-4 text-muted-foreground">Načítavam…</div>;

  const setLabel = (key: ConversionKey, value: string) =>
    setCfg((c) => ({ ...c, conversion_labels: { ...c.conversion_labels, [key]: value } }));

  return (
    <div className="space-y-8">
      {/* --- Measurement IDs --- */}
      <section className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Meracie kódy</h3>
            <p className="text-sm text-muted-foreground">
              Skripty sa načítajú až po súhlase s analytickými cookies (Consent Mode v2).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="an-enabled" className="text-sm">Zapnuté</Label>
            <Switch
              id="an-enabled"
              checked={cfg.enabled}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, enabled: v }))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="gtm">Google Tag Manager ID</Label>
            <Input
              id="gtm"
              placeholder="GTM-XXXXXXX"
              value={cfg.gtm_id}
              onChange={(e) => setCfg((c) => ({ ...c, gtm_id: e.target.value.trim() }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Ak vyplníte GTM, GA4 a Ads sa spravujú v GTM (dataLayer eventy posielame vždy).
            </p>
          </div>
          <div>
            <Label htmlFor="ga4">GA4 Measurement ID</Label>
            <Input
              id="ga4"
              placeholder="G-XXXXXXXXXX"
              value={cfg.ga4_id}
              onChange={(e) => setCfg((c) => ({ ...c, ga4_id: e.target.value.trim() }))}
            />
          </div>
          <div>
            <Label htmlFor="ads">Google Ads conversion ID</Label>
            <Input
              id="ads"
              placeholder="AW-XXXXXXXXX"
              value={cfg.ads_id}
              onChange={(e) => setCfg((c) => ({ ...c, ads_id: e.target.value.trim() }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="an-debug"
            checked={cfg.debug}
            onCheckedChange={(v) => setCfg((c) => ({ ...c, debug: v }))}
          />
          <Label htmlFor="an-debug" className="text-sm">Debug logy v konzole prehliadača</Label>
        </div>
      </section>

      {/* --- Conversions --- */}
      <section className="rounded-lg border p-4 space-y-4">
        <div>
          <h3 className="font-semibold">Konverzie</h3>
          <p className="text-sm text-muted-foreground">
            Tieto udalosti aplikácia posiela automaticky. Pre Google Ads doplňte conversion label
            (časť za lomkou v <code>AW-123/AbC-D_efGh</code>).
          </p>
        </div>
        <div className="space-y-3">
          {CONVERSION_KEYS.map((c) => (
            <div key={c.key} className="grid gap-2 sm:grid-cols-[1fr_240px] sm:items-center">
              <div>
                <div className="text-sm font-medium">
                  {c.label} <code className="text-xs text-muted-foreground">{c.key}</code>
                </div>
                <div className="text-xs text-muted-foreground">{c.description}</div>
              </div>
              <Input
                placeholder="conversion label"
                value={cfg.conversion_labels?.[c.key] ?? ""}
                onChange={(e) => setLabel(c.key, e.target.value.trim())}
              />
            </div>
          ))}
        </div>
      </section>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Uložiť nastavenia
      </Button>

      {/* --- GA4 report --- */}
      <section className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Štatistiky z GA4
            </h3>
            <p className="text-sm text-muted-foreground">
              Číta sa cez GA4 Data API pomocou service accountu (secrets GA4_PROPERTY_ID,
              GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY).
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="days" className="text-xs">Počet dní</Label>
              <Input
                id="days"
                type="number"
                className="w-24"
                value={days}
                onChange={(e) => setDays(Number(e.target.value) || 28)}
              />
            </div>
            <Button variant="outline" onClick={loadReport} disabled={reportLoading}>
              {reportLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Načítať
            </Button>
          </div>
        </div>

        {report && !report.ok && (
          <p className="text-sm text-destructive whitespace-pre-wrap">{report.error}</p>
        )}

        {report?.ok && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Používatelia", report.overview.totals.users],
                ["Návštevy", report.overview.totals.sessions],
                ["Zobrazenia stránok", report.overview.totals.pageViews],
                ["Konverzie", report.overview.totals.conversions],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border p-3">
                  <div className="text-2xl font-bold">{Number(value).toLocaleString("sk-SK")}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            <ReportTable
              title="Kanály"
              head={["Kanál", "Návštevy", "Konverzie"]}
              rows={report.overview.channels.map((r) => [r.channel, r.sessions, r.conversions])}
            />
            <ReportTable
              title="Kampane (vrátane Google Ads)"
              head={["Kampaň", "Zdroj", "Návštevy", "Konverzie"]}
              rows={report.overview.campaigns.map((r) => [r.campaign, r.source, r.sessions, r.conversions])}
            />
            <ReportTable
              title="Najnavštevovanejšie stránky"
              head={["Cesta", "Zobrazenia"]}
              rows={report.overview.topPages.map((r) => [r.path, r.views])}
            />
            <ReportTable
              title="Udalosti"
              head={["Udalosť", "Počet"]}
              rows={report.overview.events.map((r) => [r.name, r.count])}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function ReportTable({
  title,
  head,
  rows,
}: {
  title: string;
  head: string[];
  rows: (string | number)[][];
}) {
  if (!rows.length) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                {r.map((cell, j) => (
                  <td key={j} className="px-3 py-2 break-all">
                    {typeof cell === "number" ? cell.toLocaleString("sk-SK") : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
