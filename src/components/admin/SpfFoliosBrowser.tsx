// Záložka "SPF – listy vlastníctva" na stránke /kataster.
//
// Zdroj je zoznam nezistených vlastníkov od SPF: sú to listy vlastníctva,
// kde SPF zo zákona spravuje podiely nezistených vlastníkov. Je to úroveň LV,
// nie parcely — parcelnú úroveň doplnia až hromadné dáta z ÚGKK.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";
import { KuPicker } from "@/components/admin/KuPicker";
import type { KuRow, SpfFolio } from "@/lib/kataster";

const db = supabase as unknown as SupabaseClient;
type FolioQuery = ReturnType<ReturnType<typeof db.from>["select"]>;

const PAGE_SIZE = 200;
const SCAN_PAGE = 1000;
const SCAN_CAP = 20_000;
const EXPORT_CAP = 50_000;
const COLUMNS = "id,ku_code,lv_number,owners_count,source,valid_as_of,updated_at";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function SpfFoliosBrowser() {
  const [ku, setKu] = useState<KuRow | null>(null);
  const [lvInput, setLvInput] = useState("");
  const [lv, setLv] = useState("");
  const [rows, setRows] = useState<SpfFolio[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [owners, setOwners] = useState<{ count: number; truncated: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const applyFilters = useCallback(
    (query: FolioQuery) => {
      let q = query;
      if (ku) q = q.eq("ku_code", ku.ku_code);
      const needle = lv.replace(/[,()%]/g, " ").trim();
      if (needle) q = q.ilike("lv_number", `%${needle}%`);
      return q;
    },
    [ku, lv],
  );

  const loadPage = useCallback(
    async (offset: number) => {
      const { data, error } = await applyFilters(db.from("spf_folios").select(COLUMNS))
        .order("ku_code")
        .order("owners_count", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as SpfFolio[];
      setHasMore(page.length === PAGE_SIZE);
      setRows((prev) => (offset === 0 ? page : [...prev, ...page]));
    },
    [applyFilters],
  );

  const loadSummary = useCallback(async () => {
    const { count, error } = await applyFilters(
      db.from("spf_folios").select("id", { count: "exact", head: true }),
    );
    if (error) throw new Error(error.message);
    setTotal(count ?? 0);

    // Nezistených vlastníkov sčítavame v prehliadači, agregácie tu nemáme.
    let sum = 0;
    let truncated = false;
    for (let from = 0; from < SCAN_CAP; from += SCAN_PAGE) {
      const { data, error: e } = await applyFilters(
        db.from("spf_folios").select("owners_count"),
      ).range(from, from + SCAN_PAGE - 1);
      if (e) throw new Error(e.message);
      const page = (data ?? []) as Array<{ owners_count: number }>;
      for (const r of page) sum += Number(r.owners_count ?? 0);
      if (page.length < SCAN_PAGE) break;
      if (from + SCAN_PAGE >= SCAN_CAP) truncated = true;
    }
    setOwners({ count: sum, truncated });
  }, [applyFilters]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadPage(0), loadSummary()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadPage, loadSummary]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function exportCsv() {
    setExporting(true);
    try {
      const all: SpfFolio[] = [];
      for (let from = 0; from < EXPORT_CAP; from += SCAN_PAGE) {
        const { data, error } = await applyFilters(db.from("spf_folios").select(COLUMNS))
          .order("ku_code")
          .order("lv_number")
          .range(from, from + SCAN_PAGE - 1);
        if (error) throw new Error(error.message);
        const page = (data ?? []) as SpfFolio[];
        all.push(...page);
        if (page.length < SCAN_PAGE) break;
      }
      if (!all.length) {
        toast.warning("Výber je prázdny, nie je čo exportovať.");
        return;
      }
      const lines = ["ku_code;lv;pocet_nezistenych_vlastnikov;platnost_k"];
      for (const r of all) {
        lines.push(
          [r.ku_code, r.lv_number, r.owners_count, r.valid_as_of ?? ""].map(csvCell).join(";"),
        );
      }
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spf-lv-${ku?.ku_code ?? "vsetky"}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export: ${all.length} listov vlastníctva.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Listy vlastníctva, na ktorých SPF spravuje podiely nezistených vlastníkov. Zdroj:{" "}
        <a
          href="https://pozfond.sk/verejny-pristup-k-informaciam/zoznam-nezistenych-vlastnikov/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          zoznam nezistených vlastníkov SPF
        </a>
        , aktualizovaný dvakrát ročne. Mená vlastníkov si neukladáme, len ich počet — nájdeš ich v
        zdrojovom súbore.
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Katastrálne územie</label>
          <KuPicker
            value={ku}
            onChange={setKu}
            allowEmpty
            placeholder="všetky k.ú. – píš názov alebo kód"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Číslo LV</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setLv(lvInput);
            }}
          >
            <Input
              value={lvInput}
              placeholder="napr. 812"
              onChange={(e) => setLvInput(e.target.value)}
              onBlur={() => setLv(lvInput)}
            />
          </form>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Obnoviť
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportCsv()} disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          {exporting ? "Exportujem…" : "Export CSV"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-primary/15 bg-card p-4">
          <div className="text-xs text-muted-foreground">Listov vlastníctva</div>
          <div className="font-display text-xl font-semibold">
            {total === null ? "…" : total.toLocaleString("sk-SK")}
          </div>
        </div>
        <div className="rounded-lg border border-primary/15 bg-card p-4">
          <div className="text-xs text-muted-foreground">Nezistených vlastníkov</div>
          <div className="font-display text-xl font-semibold">
            {owners === null
              ? "…"
              : `${owners.count.toLocaleString("sk-SK")}${owners.truncated ? " +" : ""}`}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-primary/15 bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2">k.ú.</th>
              <th className="px-3 py-2">LV</th>
              <th className="px-3 py-2">Nezistených vlastníkov</th>
              <th className="px-3 py-2">Platnosť k</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-muted-foreground">
                  Nič nesedí filtru.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{r.ku_code}</td>
                <td className="px-3 py-2 font-medium">{r.lv_number}</td>
                <td className="px-3 py-2 num">{r.owners_count}</td>
                <td className="px-3 py-2">{r.valid_as_of ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            loadPage(rows.length)
              .catch((e) => toast.error((e as Error).message))
              .finally(() => setLoading(false));
          }}
        >
          Načítať ďalších {PAGE_SIZE}
        </Button>
      )}
    </div>
  );
}

export default SpfFoliosBrowser;
