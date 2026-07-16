import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Download, X } from "lucide-react";
import {
  fetchCompanyData,
  getCompanyProfile,
  saveCompanyProfile,
} from "@/lib/tender-analysis.functions";

export const Route = createFileRoute("/_authenticated/firma")({
  head: () => ({ meta: [{ title: "Firemný profil – Tendrik" }] }),
  component: FirmaPage,
});

type YearRow = { rok: number; obrat?: number | null; zamestnanci?: number | null };
type ReferenceRow = { nazov: string; obstaravatel?: string; hodnota?: number | null; rok?: number | null };

type ProfileState = {
  ico: string;
  dic: string;
  nazov: string;
  adresa: string;
  psc: string;
  mesto: string;
  pravna_forma: string;
  sk_nace_code: string;
  sk_nace_name: string;
  velkost_kategoria: string;
  financne_roky: YearRow[];
  referencie: ReferenceRow[];
  certifikaty: string[];
  technicke_vybavenie: string;
  kluc_odbornici: string;
  doplnkove_info: string;
};

const empty = (): ProfileState => ({
  ico: "", dic: "", nazov: "", adresa: "", psc: "", mesto: "",
  pravna_forma: "", sk_nace_code: "", sk_nace_name: "", velkost_kategoria: "",
  financne_roky: [],
  referencie: [],
  certifikaty: [],
  technicke_vybavenie: "", kluc_odbornici: "", doplnkove_info: "",
});

function FirmaPage() {
  const load = useServerFn(getCompanyProfile);
  const fetchReg = useServerFn(fetchCompanyData);
  const save = useServerFn(saveCompanyProfile);

  const [state, setState] = useState<ProfileState>(empty());
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [certInput, setCertInput] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const row = await load();
        if (row) {
          setState({
            ico: row.ico ?? "",
            dic: row.dic ?? "",
            nazov: row.nazov ?? "",
            adresa: row.adresa ?? "",
            psc: row.psc ?? "",
            mesto: row.mesto ?? "",
            pravna_forma: row.pravna_forma ?? "",
            sk_nace_code: row.sk_nace_code ?? "",
            sk_nace_name: row.sk_nace_name ?? "",
            velkost_kategoria: row.velkost_kategoria ?? "",
            financne_roky: (row.financne_roky as YearRow[]) ?? [],
            referencie: (row.referencie as ReferenceRow[]) ?? [],
            certifikaty: (row.certifikaty as string[]) ?? [],
            technicke_vybavenie: row.technicke_vybavenie ?? "",
            kluc_odbornici: row.kluc_odbornici ?? "",
            doplnkove_info: row.doplnkove_info ?? "",
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  async function handleFetch() {
    if (!state.ico || state.ico.replace(/\D/g, "").length < 6) {
      toast.error("Zadajte platné IČO");
      return;
    }
    setFetching(true);
    try {
      const reg = await fetchReg({ data: { ico: state.ico } });
      setState((s) => ({
        ...s,
        ico: reg.ico ?? s.ico,
        dic: reg.dic ?? s.dic,
        nazov: reg.nazov ?? s.nazov,
        adresa: reg.adresa ?? s.adresa,
        psc: reg.psc ?? s.psc,
        mesto: reg.mesto ?? s.mesto,
        pravna_forma: reg.pravna_forma ?? s.pravna_forma,
        sk_nace_code: reg.sk_nace_code ?? s.sk_nace_code,
        sk_nace_name: reg.sk_nace_name ?? s.sk_nace_name,
        velkost_kategoria: reg.velkost_kategoria ?? s.velkost_kategoria,
      }));
      if (reg.errors?.length) {
        toast.warning("Registre: " + reg.errors.join("; "));
      } else {
        toast.success("Údaje z registrov načítané");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba pri načítaní z registrov");
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        data: {
          ...state,
          financne_roky: state.financne_roky
            .filter((r) => r.rok)
            .map((r) => ({
              rok: Number(r.rok),
              obrat: r.obrat != null && r.obrat !== ("" as any) ? Number(r.obrat) : null,
              zamestnanci: r.zamestnanci != null && r.zamestnanci !== ("" as any) ? Number(r.zamestnanci) : null,
            })),
          referencie: state.referencie
            .filter((r) => r.nazov)
            .map((r) => ({
              nazov: r.nazov,
              obstaravatel: r.obstaravatel ?? "",
              hodnota: r.hodnota != null && r.hodnota !== ("" as any) ? Number(r.hodnota) : null,
              rok: r.rok != null && r.rok !== ("" as any) ? Number(r.rok) : null,
            })),
        },
      });
      toast.success("Firemný profil uložený");
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba pri ukladaní");
    } finally {
      setSaving(false);
    }
  }

  function addYear() {
    const currentYears = state.financne_roky.map((r) => r.rok);
    const nextYear = currentYears.length
      ? Math.min(...currentYears) - 1
      : new Date().getFullYear() - 1;
    setState((s) => ({
      ...s,
      financne_roky: [...s.financne_roky, { rok: nextYear, obrat: null, zamestnanci: null }],
    }));
  }
  function removeYear(i: number) {
    setState((s) => ({ ...s, financne_roky: s.financne_roky.filter((_, j) => j !== i) }));
  }
  function updateYear(i: number, patch: Partial<YearRow>) {
    setState((s) => ({
      ...s,
      financne_roky: s.financne_roky.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));
  }

  function addRef() {
    setState((s) => ({
      ...s,
      referencie: [...s.referencie, { nazov: "", obstaravatel: "", hodnota: null, rok: null }],
    }));
  }
  function removeRef(i: number) {
    setState((s) => ({ ...s, referencie: s.referencie.filter((_, j) => j !== i) }));
  }
  function updateRef(i: number, patch: Partial<ReferenceRow>) {
    setState((s) => ({
      ...s,
      referencie: s.referencie.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));
  }

  function addCert() {
    const v = certInput.trim();
    if (!v) return;
    if (state.certifikaty.includes(v)) { setCertInput(""); return; }
    setState((s) => ({ ...s, certifikaty: [...s.certifikaty, v] }));
    setCertInput("");
  }
  function removeCert(v: string) {
    setState((s) => ({ ...s, certifikaty: s.certifikaty.filter((c) => c !== v) }));
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-8 text-muted-foreground">Načítavam…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Firemný profil</h1>
      <p className="mt-1 text-muted-foreground">
        AI porovná túto informáciu s podmienkami zákaziek pri „Analyzovať zákazku".
      </p>

      {/* IČO + fetch */}
      <section className="mt-8 rounded-lg border border-primary/15 bg-card p-6">
        <h2 className="font-display font-semibold text-lg">Identifikácia</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Zadajte IČO a načítajte údaje z RPO + registeruz.sk.
        </p>
        <div className="mt-4 flex gap-2 items-end">
          <div className="flex-1">
            <Label htmlFor="ico">IČO</Label>
            <Input id="ico" value={state.ico}
              onChange={(e) => setState((s) => ({ ...s, ico: e.target.value }))}
              placeholder="12345678" />
          </div>
          <Button onClick={handleFetch} disabled={fetching} type="button">
            {fetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Načítať z registrov
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Názov" value={state.nazov} onChange={(v) => setState((s) => ({ ...s, nazov: v }))} />
          <Field label="DIČ" value={state.dic} onChange={(v) => setState((s) => ({ ...s, dic: v }))} />
          <Field label="Adresa" value={state.adresa} onChange={(v) => setState((s) => ({ ...s, adresa: v }))} />
          <Field label="Mesto" value={state.mesto} onChange={(v) => setState((s) => ({ ...s, mesto: v }))} />
          <Field label="PSČ" value={state.psc} onChange={(v) => setState((s) => ({ ...s, psc: v }))} />
          <Field label="Právna forma" value={state.pravna_forma} onChange={(v) => setState((s) => ({ ...s, pravna_forma: v }))} />
          <Field label="SK-NACE kód" value={state.sk_nace_code} onChange={(v) => setState((s) => ({ ...s, sk_nace_code: v }))} />
          <Field label="SK-NACE názov" value={state.sk_nace_name} onChange={(v) => setState((s) => ({ ...s, sk_nace_name: v }))} />
          <Field label="Veľkostná kategória" value={state.velkost_kategoria} onChange={(v) => setState((s) => ({ ...s, velkost_kategoria: v }))} />
        </div>
      </section>

      {/* Financials by year */}
      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-lg">Obrat a zamestnanci po rokoch</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              AI porovnáva s podmienkou „priemerný ročný obrat za posledné 3 roky".
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addYear}>
            <Plus className="h-4 w-4 mr-1" /> Pridať rok
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {state.financne_roky.length === 0 && (
            <p className="text-sm text-muted-foreground">Zatiaľ žiadne roky.</p>
          )}
          {state.financne_roky.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-3">
                <Label className="text-xs">Rok</Label>
                <Input type="number" value={r.rok ?? ""} onChange={(e) => updateYear(i, { rok: Number(e.target.value) })} />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">Obrat (EUR)</Label>
                <Input type="number" value={r.obrat ?? ""} onChange={(e) => updateYear(i, { obrat: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">Zamestnanci</Label>
                <Input type="number" value={r.zamestnanci ?? ""} onChange={(e) => updateYear(i, { zamestnanci: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="col-span-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeYear(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* References */}
      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-lg">Referencie</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Zoznam významných zákaziek – AI porovnáva počet a hodnotu.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRef}>
            <Plus className="h-4 w-4 mr-1" /> Pridať
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {state.referencie.length === 0 && (
            <p className="text-sm text-muted-foreground">Zatiaľ žiadne referencie.</p>
          )}
          {state.referencie.map((r, i) => (
            <div key={i} className="rounded border border-border p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-11">
                  <Label className="text-xs">Názov zákazky</Label>
                  <Input value={r.nazov} onChange={(e) => updateRef(i, { nazov: e.target.value })} />
                </div>
                <div className="col-span-1 flex items-end">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRef(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6">
                  <Label className="text-xs">Obstarávateľ</Label>
                  <Input value={r.obstaravatel ?? ""} onChange={(e) => updateRef(i, { obstaravatel: e.target.value })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Hodnota (EUR)</Label>
                  <Input type="number" value={r.hodnota ?? ""} onChange={(e) => updateRef(i, { hodnota: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Rok</Label>
                  <Input type="number" value={r.rok ?? ""} onChange={(e) => updateRef(i, { rok: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Certificates */}
      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
        <h2 className="font-display font-semibold text-lg">Certifikáty</h2>
        <p className="mt-1 text-sm text-muted-foreground">Napr. ISO 9001, ISO 14001, ISO 27001…</p>
        <div className="mt-3 flex gap-2">
          <Input value={certInput} onChange={(e) => setCertInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCert(); } }}
            placeholder="ISO 9001" />
          <Button type="button" onClick={addCert}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {state.certifikaty.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1 text-sm">
              {c}
              <button type="button" onClick={() => removeCert(c)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Technical & experts */}
      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6 space-y-4">
        <div>
          <Label htmlFor="tech">Technické vybavenie</Label>
          <Textarea id="tech" rows={3} value={state.technicke_vybavenie}
            onChange={(e) => setState((s) => ({ ...s, technicke_vybavenie: e.target.value }))}
            placeholder="Stroje, vozidlá, laboratóriá, softvér…" />
        </div>
        <div>
          <Label htmlFor="exp">Kľúčoví odborníci</Label>
          <Textarea id="exp" rows={3} value={state.kluc_odbornici}
            onChange={(e) => setState((s) => ({ ...s, kluc_odbornici: e.target.value }))}
            placeholder="Odbornosť, prax, oprávnenia…" />
        </div>
        <div>
          <Label htmlFor="misc">Doplňujúce informácie</Label>
          <Textarea id="misc" rows={2} value={state.doplnkove_info}
            onChange={(e) => setState((s) => ({ ...s, doplnkove_info: e.target.value }))} />
        </div>
      </section>

      <div className="mt-8 flex gap-3">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Uložiť profil
        </Button>
        <Link to="/settings"><Button variant="outline" size="lg">Späť na nastavenia</Button></Link>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
