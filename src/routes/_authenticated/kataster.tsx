// Interná stránka /kataster (len admin rola): prehľad parciel stiahnutých zo
// ZBGIS s dôrazom na pozemky, kde je vlastníkom alebo správcom SPF.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KuPicker } from "@/components/admin/KuPicker";
import { SpfFoliosBrowser } from "@/components/admin/SpfFoliosBrowser";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import {
  OWNER_ROLE_LABEL,
  errorText,
  formatArea,
  isSpfOwner,
  zbgisParcelUrl,
} from "@/lib/kataster";
import type { CadastralParcel, KuRow, ParcelOwner } from "@/lib/kataster";

export const Route = createFileRoute("/_authenticated/kataster")({
  head: () => ({ meta: [{ title: "Kataster – Tendrik" }] }),
  component: KatasterPage,
});

// Tabuľky modulu Kataster zatiaľ nie sú v generovaných typoch, preto beztypový klient.
const db = supabase as unknown as SupabaseClient;
type ParcelQuery = ReturnType<ReturnType<typeof db.from>["select"]>;

const PAGE_SIZE = 200;
/** Súhrn ani export nesmú stiahnuť pol databázy naraz. */
const SCAN_PAGE = 1000;
const SCAN_CAP = 20_000;
const EXPORT_CAP = 50_000;

const SELECT_COLUMNS =
  "id,ku_code,parcel_register,parcel_number,lv_number,area_m2,land_type,owners,has_spf,centroid_lat,centroid_lng,fetched_at";

type Filters = {
  kuCode: string; // "" = všetky k.ú.
  register: "all" | "C" | "E";
  onlySpf: boolean;
  search: string;
};

type Summary = { total: number; spf: number; spfArea: number; areaTruncated: boolean };

function ownersOf(p: CadastralParcel): ParcelOwner[] {
  return Array.isArray(p.owners) ? p.owners : [];
}

// PostgREST: čiarky a zátvorky by rozbili syntax .or() filtra.
function sanitize(value: string): string {
  return value.replace(/[,()%]/g, " ").trim();
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ownersToText(owners: ParcelOwner[]): string {
  return owners
    .map((o) => `${o.name} (${OWNER_ROLE_LABEL[o.role] ?? o.role}${o.share ? `, ${o.share}` : ""})`)
    .join(" | ");
}

function KatasterPage() {
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
      if (error) console.error("[kataster-admin-check]", error);
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
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Overujem oprávnenia…</div>
    );
  }
  if (!allowed) return null;
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">Kataster</h1>
      <Tabs defaultValue="parcely" className="mt-4">
        <TabsList>
          <TabsTrigger value="parcely">Parcely</TabsTrigger>
          <TabsTrigger value="spf">SPF – listy vlastníctva</TabsTrigger>
        </TabsList>
        <TabsContent value="parcely" className="mt-4">
          <KatasterBrowser />
        </TabsContent>
        <TabsContent value="spf" className="mt-4">
          <SpfFoliosBrowser />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KatasterBrowser() {
  const [filters, setFilters] = useState<Filters>({
    kuCode: "",
    register: "all",
    onlySpf: true,
    search: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [selectedKu, setSelectedKu] = useState<KuRow | null>(null);
  const [rows, setRows] = useState<CadastralParcel[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Filtre sa aplikujú na jednom mieste, nech tabuľka, súhrn aj export
  // pracujú s presne rovnakým výberom.
  const applyFilters = useCallback(
    (query: ParcelQuery, opts?: { spf?: "filter" | "off" | "only" }) => {
      const spf = opts?.spf ?? "filter";
      let q = query;
      if (filters.kuCode) q = q.eq("ku_code", filters.kuCode);
      if (filters.register !== "all") q = q.eq("parcel_register", filters.register);
      if (spf === "only" || (spf === "filter" && filters.onlySpf)) q = q.eq("has_spf", true);
      const search = sanitize(filters.search);
      if (search) q = q.or(`parcel_number.ilike.%${search}%,lv_number.ilike.%${search}%`);
      return q;
    },
    [filters],
  );

  const loadPage = useCallback(
    async (offset: number) => {
      const { data, error } = await applyFilters(
        db.from("cadastral_parcels").select(SELECT_COLUMNS),
      )
        .order("ku_code")
        .order("parcel_register")
        .order("parcel_number")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as CadastralParcel[];
      setHasMore(page.length === PAGE_SIZE);
      setRows((prev) => (offset === 0 ? page : [...prev, ...page]));
    },
    [applyFilters],
  );

  const loadSummary = useCallback(async () => {
    // Celkový počet ignoruje prepínač "len SPF" – nech je vidno "z 1 240 parciel
    // je 42 SPF" aj vtedy, keď tabuľka ukazuje len tie SPF.
    const countOf = async (spf: "off" | "only") => {
      const { count, error } = await applyFilters(
        db.from("cadastral_parcels").select("id", { count: "exact", head: true }),
        { spf },
      );
      if (error) throw error;
      return count ?? 0;
    };

    const [total, spf] = await Promise.all([countOf("off"), countOf("only")]);

    // Výmeru sčítavame v prehliadači – PostgREST agregácie tu nemáme.
    let spfArea = 0;
    let areaTruncated = false;
    for (let from = 0; from < SCAN_CAP; from += SCAN_PAGE) {
      const { data, error } = await applyFilters(db.from("cadastral_parcels").select("area_m2"), {
        spf: "only",
      }).range(from, from + SCAN_PAGE - 1);
      if (error) throw error;
      const page = (data ?? []) as Array<{ area_m2: number | null }>;
      for (const r of page) spfArea += Number(r.area_m2 ?? 0);
      if (page.length < SCAN_PAGE) break;
      if (from + SCAN_PAGE >= SCAN_CAP) areaTruncated = true;
    }

    setSummary({ total, spf, spfArea, areaTruncated });
  }, [applyFilters]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadPage(0), loadSummary()]);
    } catch (e) {
      toast.error(errorText(e));
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
      const all: CadastralParcel[] = [];
      for (let from = 0; from < EXPORT_CAP; from += SCAN_PAGE) {
        const { data, error } = await applyFilters(
          db.from("cadastral_parcels").select(SELECT_COLUMNS),
        )
          .order("ku_code")
          .order("parcel_register")
          .order("parcel_number")
          .range(from, from + SCAN_PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as CadastralParcel[];
        all.push(...page);
        if (page.length < SCAN_PAGE) break;
      }
      if (all.length === 0) {
        toast.warning("Výber je prázdny, nie je čo exportovať.");
        return;
      }

      const header = [
        "ku_code",
        "parcela",
        "register",
        "lv",
        "vymera_m2",
        "druh_pozemku",
        "spf",
        "vlastnici_a_spravcovia",
        "lat",
        "lng",
        "stiahnute",
      ];
      const lines = [header.join(";")];
      for (const p of all) {
        lines.push(
          [
            p.ku_code,
            p.parcel_number,
            p.parcel_register,
            p.lv_number ?? "",
            p.area_m2 ?? "",
            p.land_type ?? "",
            p.has_spf ? "áno" : "nie",
            ownersToText(ownersOf(p)),
            p.centroid_lat ?? "",
            p.centroid_lng ?? "",
            p.fetched_at,
          ]
            .map(csvCell)
            .join(";"),
        );
      }

      // BOM, aby Excel otvoril UTF-8 správne.
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kataster-${filters.kuCode || "vsetky"}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export: ${all.length} parciel.`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Parcely stiahnuté zo ZBGIS. Dáta sa napĺňajú ručným syncom v{" "}
        <a href="/admin" className="underline underline-offset-2">
          admin paneli
        </a>{" "}
        (karta 7).
      </p>

      <section className="rounded-lg border border-primary/15 bg-card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Katastrálne územie</label>
            <KuPicker
              value={selectedKu}
              onChange={(ku) => {
                setSelectedKu(ku);
                setFilters((f) => ({ ...f, kuCode: ku?.ku_code ?? "" }));
              }}
              allowEmpty
              placeholder="všetky k.ú. – píš názov alebo kód"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Register</label>
            <Select
              value={filters.register}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, register: v as Filters["register"] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">C aj E</SelectItem>
                <SelectItem value="C">Register C</SelectItem>
                <SelectItem value="E">Register E</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Číslo parcely alebo LV</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFilters((f) => ({ ...f, search: searchInput }));
              }}
            >
              <Input
                value={searchInput}
                placeholder="napr. 1234/5 alebo 812"
                onChange={(e) => setSearchInput(e.target.value)}
                onBlur={() => setFilters((f) => ({ ...f, search: searchInput }))}
              />
            </form>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={filters.onlySpf}
              onCheckedChange={(v) => setFilters((f) => ({ ...f, onlySpf: v }))}
            />
            Len parcely SPF
          </label>
          <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Obnoviť
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportCsv()} disabled={exporting}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exportujem…" : "Export CSV"}
          </Button>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Parciel vo výbere"
          value={summary ? summary.total.toLocaleString("sk-SK") : "…"}
        />
        <Stat label="Z toho SPF" value={summary ? summary.spf.toLocaleString("sk-SK") : "…"} />
        <Stat
          label="Výmera SPF"
          value={
            summary ? `${formatArea(summary.spfArea)}${summary.areaTruncated ? " +" : ""}` : "…"
          }
        />
      </section>

      <section className="mt-4 overflow-x-auto rounded-lg border border-primary/15 bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2">Parcela</th>
              <th className="px-3 py-2">Reg.</th>
              <th className="px-3 py-2">LV</th>
              <th className="px-3 py-2">Výmera</th>
              <th className="px-3 py-2">Druh pozemku</th>
              <th className="px-3 py-2">Vlastníci / správcovia</th>
              <th className="px-3 py-2">ZBGIS</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-sm text-muted-foreground">
                  {summary?.total === 0 && !filters.kuCode && !filters.search ? (
                    <>
                      <strong className="text-foreground">Zatiaľ tu nie sú žiadne parcely.</strong>
                      <br />
                      Sync zo ZBGIS sa nedá spustiť, kým nie sú v <code>.env</code> nastavené{" "}
                      <code>ZBGIS_PARCELS_URL</code> a <code>ZBGIS_LV_DETAIL_URL</code>. ZBGIS má
                      hromadné sťahovanie parciel zavreté (403 na <code>/query</code>, vlastníci za
                      reCAPTCHA), takže tie adresy musia ukazovať na iný zdroj — podrobnosti sú v{" "}
                      <code>docs/zbgis-endpoints.md</code>. Medzitým funguje záložka{" "}
                      <strong className="text-foreground">SPF – listy vlastníctva</strong>.
                    </>
                  ) : (
                    <>Nič nesedí filtru. Skús vypnúť „len SPF“ alebo zmeniť katastrálne územie.</>
                  )}
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-t align-top">
                <td className="px-3 py-2 whitespace-nowrap font-medium">
                  {p.parcel_number}
                  <div className="text-xs text-muted-foreground">{p.ku_code}</div>
                </td>
                <td className="px-3 py-2">{p.parcel_register}</td>
                <td className="px-3 py-2">{p.lv_number ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap num">{formatArea(p.area_m2)}</td>
                <td className="px-3 py-2">{p.land_type ?? "—"}</td>
                <td className="px-3 py-2">
                  {ownersOf(p).length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {ownersOf(p).map((o, i) => (
                        <li
                          key={`${p.id}-${i}`}
                          className={isSpfOwner(o.name) ? "font-semibold text-primary" : ""}
                        >
                          {o.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {OWNER_ROLE_LABEL[o.role] ?? o.role}
                            {o.share ? ` · ${o.share}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-2">
                  <a
                    className="inline-flex items-center gap-1 underline underline-offset-2"
                    href={zbgisParcelUrl(p)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    mapa <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {hasMore && (
        <div className="mt-3">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              loadPage(rows.length)
                .catch((e) => toast.error(errorText(e)))
                .finally(() => setLoading(false));
            }}
          >
            Načítať ďalších {PAGE_SIZE}
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-xl font-semibold">{value}</div>
    </div>
  );
}
