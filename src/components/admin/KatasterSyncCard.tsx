// Admin karta "7) Kataster – sync": ručné ťahanie parciel zo ZBGIS.
// Zámerne bez cronu – beh sa spúšťa len tlačidlom a progres sa číta
// pollovaním cadastral_sync_runs.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Play, RefreshCw, Search, ExternalLink } from "lucide-react";
import { TEST_PARCEL_LIMIT } from "@/lib/kataster";
import type { KuRow, SyncMode, SyncRegister, SyncRun } from "@/lib/kataster";

// Tabuľky modulu Kataster zatiaľ nie sú v generovaných typoch, preto beztypový klient.
const db = supabase as unknown as SupabaseClient;

const POLL_MS = 3000;

const STATUS_LABEL: Record<SyncRun["status"], string> = {
  running: "beží",
  done: "hotovo",
  failed: "zlyhalo",
  blocked: "zablokované ZBGIS",
};

function fmt(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("sk-SK");
  } catch {
    return v;
  }
}

export function KatasterSyncCard() {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<KuRow[]>([]);
  const [selected, setSelected] = useState<KuRow | null>(null);
  const [register, setRegister] = useState<SyncRegister>("both");
  const [busy, setBusy] = useState<SyncMode | null>(null);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const searchRef = useRef(0);

  const loadRuns = useCallback(async () => {
    const { data, error } = await db
      .from("cadastral_sync_runs")
      .select(
        "id,ku_code,register,mode,started_at,finished_at,status,parcels_total,parcels_done,spf_count,errors",
      )
      .order("started_at", { ascending: false })
      .limit(10);
    if (error) {
      console.error("[kataster] načítanie behov zlyhalo", error);
      return;
    }
    setRuns((data ?? []) as SyncRun[]);
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // Kým niečo beží, ťaháme progres každé 3 s; potom polling zastavíme.
  const hasRunning = runs.some((r) => r.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(() => void loadRuns(), POLL_MS);
    return () => clearInterval(t);
  }, [hasRunning, loadRuns]);

  // Vyhľadávanie k.ú. podľa názvu alebo kódu.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    const token = ++searchRef.current;
    const t = setTimeout(async () => {
      // Čiarky a zátvorky by rozbili syntax .or() filtra.
      const safe = q.replace(/[,()%]/g, " ").trim();
      if (!safe) return;
      const { data, error } = await db
        .from("ku_list")
        .select("ku_code,ku_name,okres,kraj")
        .or(`ku_name.ilike.%${safe}%,ku_code.ilike.%${safe}%`)
        .order("ku_name")
        .limit(20);
      if (error) {
        console.error("[kataster] hľadanie k.ú. zlyhalo", error);
        return;
      }
      if (token === searchRef.current) setOptions((data ?? []) as KuRow[]);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function startSync(mode: SyncMode) {
    if (!selected) {
      toast.error("Najprv vyber katastrálne územie.");
      return;
    }
    setBusy(mode);
    try {
      const res = await fetch("/api/public/hooks/sync-kataster", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string,
        },
        body: JSON.stringify({ ku_code: selected.ku_code, register, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast.success(
        mode === "test"
          ? `Test spustený (max ${TEST_PARCEL_LIMIT} parciel).`
          : "Full sync spustený – beží na pozadí.",
      );
      await loadRuns();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const active = runs.find((r) => r.status === "running") ?? null;

  return (
    <section className="rounded-lg border border-primary/15 bg-card p-5">
      <h2 className="font-display font-semibold text-lg tracking-tight">7) Kataster – sync</h2>
      <div className="mt-3 space-y-4">
        <div className="text-sm text-muted-foreground">
          Zdroj: ZBGIS · endpoint: <code>/api/public/hooks/sync-kataster</code> · bez cronu, len
          ručne.{" "}
          <Link to="/kataster" className="underline underline-offset-2">
            Prehľad parciel <ExternalLink className="inline h-3 w-3" />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="relative">
            <label className="text-xs text-muted-foreground">Katastrálne územie</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={selected ? `${selected.ku_name} (${selected.ku_code})` : query}
                placeholder="názov alebo kód k.ú. (min. 2 znaky)"
                onChange={(e) => {
                  setSelected(null);
                  setQuery(e.target.value);
                }}
              />
            </div>
            {!selected && options.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
                {options.map((o) => (
                  <li key={o.ku_code}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setSelected(o);
                        setOptions([]);
                      }}
                    >
                      {o.ku_name} <span className="text-muted-foreground">({o.ku_code})</span>
                      {o.okres && <span className="text-muted-foreground"> · {o.okres}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Register</label>
            <Select value={register} onValueChange={(v) => setRegister(v as SyncRegister)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="C">Register C</SelectItem>
                <SelectItem value="E">Register E</SelectItem>
                <SelectItem value="both">C aj E</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy !== null || !selected}
            onClick={() => startSync("test")}
          >
            <Play className={`h-4 w-4 mr-2 ${busy === "test" ? "animate-spin" : ""}`} />
            Test {TEST_PARCEL_LIMIT} parciel
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null || !selected}
            onClick={() => startSync("full")}
          >
            <Play className={`h-4 w-4 mr-2 ${busy === "full" ? "animate-spin" : ""}`} />
            Full sync
          </Button>
          <Button variant="ghost" onClick={() => void loadRuns()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Obnoviť
          </Button>
        </div>

        {active && (
          <div className="rounded-md border border-primary/20 bg-muted/40 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span>
                Beží <strong>{active.ku_code}</strong> · {active.register} · {active.mode}
              </span>
              <span className="text-muted-foreground">
                {active.parcels_done}
                {active.parcels_total ? ` / ${active.parcels_total}` : ""} parciel · SPF{" "}
                {active.spf_count}
              </span>
            </div>
            <Progress
              className="mt-2"
              value={
                active.parcels_total > 0
                  ? Math.round((active.parcels_done / active.parcels_total) * 100)
                  : 0
              }
            />
            {active.parcels_total === 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                Sťahujem zoznam parciel v k.ú. …
              </div>
            )}
          </div>
        )}

        <div>
          <h3 className="font-medium text-sm">Posledné behy</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">Začiatok</th>
                  <th className="py-1 pr-3">k.ú.</th>
                  <th className="py-1 pr-3">Reg.</th>
                  <th className="py-1 pr-3">Režim</th>
                  <th className="py-1 pr-3">Stav</th>
                  <th className="py-1 pr-3">Parcely</th>
                  <th className="py-1 pr-3">SPF</th>
                  <th className="py-1 pr-3">Chyby</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-3 text-muted-foreground">
                      Zatiaľ žiadny beh.
                    </td>
                  </tr>
                )}
                {runs.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmt(r.started_at)}</td>
                    <td className="py-2 pr-3">{r.ku_code}</td>
                    <td className="py-2 pr-3">{r.register}</td>
                    <td className="py-2 pr-3">{r.mode}</td>
                    <td className="py-2 pr-3">{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="py-2 pr-3 num">
                      {r.parcels_done}
                      {r.parcels_total ? ` / ${r.parcels_total}` : ""}
                    </td>
                    <td className="py-2 pr-3 num">{r.spf_count}</td>
                    <td className="py-2 pr-3">
                      {(r.errors ?? []).length === 0 ? (
                        "—"
                      ) : (
                        <details>
                          <summary className="cursor-pointer">{(r.errors ?? []).length}</summary>
                          <pre className="mt-1 max-w-[40ch] whitespace-pre-wrap text-xs text-muted-foreground">
                            {(r.errors ?? [])
                              .map((e) => `${e.parcel ? `${e.parcel}: ` : ""}${e.message}`)
                              .join("\n")}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export default KatasterSyncCard;
