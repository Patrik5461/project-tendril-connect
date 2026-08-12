import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Download, X, Building2, Star } from "lucide-react";
import {
  deleteCompanyProfile,
  fetchCompanyData,
  listCompanyProfiles,
  saveCompanyProfile,
  setDefaultCompany,
} from "@/lib/tender-analysis.functions";
import { useTranslation } from "react-i18next";

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

type CompanyRow = {
  id: string;
  nazov: string | null;
  ico: string | null;
  is_default: boolean;
  [key: string]: unknown;
};

/**
 * Obrat z registrov prepíše ten doterajší, ale počet zamestnancov ostáva —
 * ten registre nedávajú a používateľ si ho vypĺňa ručne.
 */
function mergeYears(existing: YearRow[], fetched: { rok: number; obrat: number | null }[]): YearRow[] {
  const byYear = new Map<number, YearRow>();
  for (const r of existing) if (r.rok) byYear.set(Number(r.rok), r);
  for (const f of fetched) {
    byYear.set(f.rok, { ...(byYear.get(f.rok) ?? { rok: f.rok }), rok: f.rok, obrat: f.obrat });
  }
  return [...byYear.values()].sort((a, b) => Number(b.rok) - Number(a.rok));
}

function rowToState(row: CompanyRow): ProfileState {
  return {
    ico: (row.ico as string) ?? "",
    dic: (row.dic as string) ?? "",
    nazov: (row.nazov as string) ?? "",
    adresa: (row.adresa as string) ?? "",
    psc: (row.psc as string) ?? "",
    mesto: (row.mesto as string) ?? "",
    pravna_forma: (row.pravna_forma as string) ?? "",
    sk_nace_code: (row.sk_nace_code as string) ?? "",
    sk_nace_name: (row.sk_nace_name as string) ?? "",
    velkost_kategoria: (row.velkost_kategoria as string) ?? "",
    financne_roky: (row.financne_roky as YearRow[]) ?? [],
    referencie: (row.referencie as ReferenceRow[]) ?? [],
    certifikaty: (row.certifikaty as string[]) ?? [],
    technicke_vybavenie: (row.technicke_vybavenie as string) ?? "",
    kluc_odbornici: (row.kluc_odbornici as string) ?? "",
    doplnkove_info: (row.doplnkove_info as string) ?? "",
  };
}

function FirmaPage() {
  const { t } = useTranslation("account");
  const loadAll = useServerFn(listCompanyProfiles);
  const fetchReg = useServerFn(fetchCompanyData);
  const save = useServerFn(saveCompanyProfile);
  const remove = useServerFn(deleteCompanyProfile);
  const makeDefault = useServerFn(setDefaultCompany);

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  /** null = rozpísaná nová firma, ktorá ešte nie je uložená. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<ProfileState>(empty());
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [certInput, setCertInput] = useState("");

  // Porovnanie proti poslednému uloženému stavu — aby prepnutie firmy
  // ticho nezahodilo rozpísané zmeny.
  const savedSnapshot = useRef<string>(JSON.stringify(empty()));
  function markSaved(next: ProfileState) {
    savedSnapshot.current = JSON.stringify(next);
  }
  function confirmDiscard(): boolean {
    if (JSON.stringify(state) === savedSnapshot.current) return true;
    return window.confirm(t("firma.companies.unsavedConfirm"));
  }

  useEffect(() => {
    (async () => {
      try {
        const rows = (await loadAll()) as CompanyRow[];
        setCompanies(rows);
        // Zoznam chodí zo servera s hlavnou firmou na prvom mieste.
        const first = rows[0];
        if (first) {
          const next = rowToState(first);
          setSelectedId(first.id);
          setState(next);
          markSaved(next);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  function selectCompany(id: string) {
    if (id === selectedId) return;
    const row = companies.find((c) => c.id === id);
    if (!row || !confirmDiscard()) return;
    const next = rowToState(row);
    setSelectedId(id);
    setState(next);
    markSaved(next);
  }

  function addCompany() {
    if (!confirmDiscard()) return;
    const next = empty();
    setSelectedId(null);
    setState(next);
    markSaved(next);
  }

  async function handleMakeDefault(id: string) {
    try {
      await makeDefault({ data: { id } });
      setCompanies((list) =>
        list
          .map((c) => ({ ...c, is_default: c.id === id }))
          .sort((a, b) => Number(b.is_default) - Number(a.is_default)),
      );
      toast.success(t("firma.companies.defaultSet"));
    } catch (e: any) {
      toast.error(e?.message ?? t("firma.saveError"));
    }
  }

  async function handleDelete(row: CompanyRow) {
    const name = row.nazov || row.ico || t("firma.companies.unnamed");
    if (!window.confirm(t("firma.companies.deleteConfirm", { name }))) return;
    try {
      await remove({ data: { id: row.id } });
      // Databáza po zmazaní hlavnej firmy povýši najstaršiu zvyšnú —
      // zoznam preto načítame odznova, nech sedí, ktorá je hlavná.
      const rows = (await loadAll()) as CompanyRow[];
      setCompanies(rows);
      if (selectedId === row.id) {
        const next = rows[0] ?? null;
        setSelectedId(next?.id ?? null);
        const nextState = next ? rowToState(next) : empty();
        setState(nextState);
        markSaved(nextState);
      }
      toast.success(t("firma.companies.deleted"));
    } catch (e: any) {
      toast.error(e?.message ?? t("firma.saveError"));
    }
  }

  async function handleFetch() {
    if (!state.ico || state.ico.replace(/\D/g, "").length < 6) {
      toast.error(t("firma.invalidIco"));
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
        financne_roky: mergeYears(s.financne_roky, reg.financne_roky ?? []),
      }));
      if (reg.errors?.length) {
        toast.warning(t("firma.registriesErrorPrefix") + reg.errors.join("; "));
      } else {
        const rokov = reg.financne_roky?.length ?? 0;
        toast.success(
          rokov > 0
            ? t("firma.registriesLoadedWithTurnover", { count: rokov })
            : t("firma.registriesLoaded"),
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? t("firma.registriesFetchError"));
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = (await save({
        data: {
          ...state,
          ...(selectedId ? { id: selectedId } : {}),
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
      })) as CompanyRow;
      // Novej firme priradil id až server — bez tohto by ďalšie uloženie
      // založilo duplikát namiesto úpravy.
      setSelectedId(saved.id);
      setCompanies((list) => {
        const without = list.filter((c) => c.id !== saved.id);
        return [...without, saved].sort(
          (a, b) => Number(b.is_default) - Number(a.is_default),
        );
      });
      markSaved(state);
      toast.success(t("firma.profileSaved"));
    } catch (e: any) {
      toast.error(e?.message ?? t("firma.saveError"));
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
    return <div className="mx-auto max-w-3xl px-4 py-8 text-muted-foreground">{t("firma.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{t("firma.title")}</h1>
      <p className="mt-1 text-muted-foreground">
        {t("firma.description")}
      </p>

      {/* Zoznam firiem */}
      <section className="mt-8 rounded-lg border border-primary/15 bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-lg">{t("firma.companies.heading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("firma.companies.description")}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addCompany}>
            <Plus className="h-4 w-4 mr-1" /> {t("firma.companies.add")}
          </Button>
        </div>

        <ul className="mt-4 space-y-2">
          {companies.map((c) => {
            const active = c.id === selectedId;
            return (
              <li
                key={c.id}
                className={`flex items-center gap-3 rounded border p-3 ${
                  active ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectCompany(c.id)}
                  className="flex flex-1 items-center gap-2 text-left min-w-0"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">
                    {c.nazov || c.ico || t("firma.companies.unnamed")}
                  </span>
                  {c.is_default && (
                    <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                      {t("firma.companies.default")}
                    </span>
                  )}
                </button>
                {!c.is_default && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMakeDefault(c.id)}
                      title={t("firma.companies.makeDefault")}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(c)}
                      title={t("firma.companies.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            );
          })}

          {selectedId === null && (
            <li className="flex items-center gap-2 rounded border border-primary bg-primary/5 p-3">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{t("firma.companies.newCompany")}</span>
            </li>
          )}
        </ul>

        {/*
          Hlavná firma sa mazať nedá — inak by používateľ mohol ostať
          s firmami bez hlavnej. Najprv treba označiť inú ako hlavnú.
        */}
        {companies.length > 1 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("firma.companies.defaultHint")}
          </p>
        )}
      </section>

      {/* IČO + fetch */}
      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
        <h2 className="font-display font-semibold text-lg">{t("firma.identification.heading")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("firma.identification.description")}
        </p>
        <div className="mt-4 flex gap-2 items-end">
          <div className="flex-1">
            <Label htmlFor="ico">{t("firma.identification.icoLabel")}</Label>
            <Input id="ico" value={state.ico}
              onChange={(e) => setState((s) => ({ ...s, ico: e.target.value }))}
              placeholder={t("firma.identification.icoPlaceholder")} />
          </div>
          <Button onClick={handleFetch} disabled={fetching} type="button">
            {fetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {t("firma.identification.fetchButton")}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("firma.identification.nameLabel")} value={state.nazov} onChange={(v) => setState((s) => ({ ...s, nazov: v }))} />
          <Field label={t("firma.identification.dicLabel")} value={state.dic} onChange={(v) => setState((s) => ({ ...s, dic: v }))} />
          <Field label={t("firma.identification.addressLabel")} value={state.adresa} onChange={(v) => setState((s) => ({ ...s, adresa: v }))} />
          <Field label={t("firma.identification.cityLabel")} value={state.mesto} onChange={(v) => setState((s) => ({ ...s, mesto: v }))} />
          <Field label={t("firma.identification.zipLabel")} value={state.psc} onChange={(v) => setState((s) => ({ ...s, psc: v }))} />
          <Field label={t("firma.identification.legalFormLabel")} value={state.pravna_forma} onChange={(v) => setState((s) => ({ ...s, pravna_forma: v }))} />
          <Field label={t("firma.identification.naceCodeLabel")} value={state.sk_nace_code} onChange={(v) => setState((s) => ({ ...s, sk_nace_code: v }))} />
          <Field label={t("firma.identification.naceNameLabel")} value={state.sk_nace_name} onChange={(v) => setState((s) => ({ ...s, sk_nace_name: v }))} />
          <Field label={t("firma.identification.sizeCategoryLabel")} value={state.velkost_kategoria} onChange={(v) => setState((s) => ({ ...s, velkost_kategoria: v }))} />
        </div>
      </section>

      {/* Financials by year */}
      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-lg">{t("firma.financials.heading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("firma.financials.description")}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addYear}>
            <Plus className="h-4 w-4 mr-1" /> {t("firma.financials.addYear")}
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {state.financne_roky.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("firma.financials.empty")}</p>
          )}
          {state.financne_roky.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-3">
                <Label className="text-xs">{t("firma.financials.yearLabel")}</Label>
                <Input type="number" value={r.rok ?? ""} onChange={(e) => updateYear(i, { rok: Number(e.target.value) })} />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">{t("firma.financials.turnoverLabel")}</Label>
                <Input type="number" value={r.obrat ?? ""} onChange={(e) => updateYear(i, { obrat: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">{t("firma.financials.employeesLabel")}</Label>
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
            <h2 className="font-display font-semibold text-lg">{t("firma.references.heading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("firma.references.description")}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRef}>
            <Plus className="h-4 w-4 mr-1" /> {t("firma.references.add")}
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {state.referencie.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("firma.references.empty")}</p>
          )}
          {state.referencie.map((r, i) => (
            <div key={i} className="rounded border border-border p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-11">
                  <Label className="text-xs">{t("firma.references.nameLabel")}</Label>
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
                  <Label className="text-xs">{t("firma.references.contractingAuthorityLabel")}</Label>
                  <Input value={r.obstaravatel ?? ""} onChange={(e) => updateRef(i, { obstaravatel: e.target.value })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">{t("firma.references.valueLabel")}</Label>
                  <Input type="number" value={r.hodnota ?? ""} onChange={(e) => updateRef(i, { hodnota: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">{t("firma.references.yearLabel")}</Label>
                  <Input type="number" value={r.rok ?? ""} onChange={(e) => updateRef(i, { rok: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Certificates */}
      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
        <h2 className="font-display font-semibold text-lg">{t("firma.certificates.heading")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("firma.certificates.description")}</p>
        <div className="mt-3 flex gap-2">
          <Input value={certInput} onChange={(e) => setCertInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCert(); } }}
            placeholder={t("firma.certificates.placeholder")} />
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
          <Label htmlFor="tech">{t("firma.other.technicalEquipmentLabel")}</Label>
          <Textarea id="tech" rows={3} value={state.technicke_vybavenie}
            onChange={(e) => setState((s) => ({ ...s, technicke_vybavenie: e.target.value }))}
            placeholder={t("firma.other.technicalEquipmentPlaceholder")} />
        </div>
        <div>
          <Label htmlFor="exp">{t("firma.other.keyExpertsLabel")}</Label>
          <Textarea id="exp" rows={3} value={state.kluc_odbornici}
            onChange={(e) => setState((s) => ({ ...s, kluc_odbornici: e.target.value }))}
            placeholder={t("firma.other.keyExpertsPlaceholder")} />
        </div>
        <div>
          <Label htmlFor="misc">{t("firma.other.additionalInfoLabel")}</Label>
          <Textarea id="misc" rows={2} value={state.doplnkove_info}
            onChange={(e) => setState((s) => ({ ...s, doplnkove_info: e.target.value }))} />
        </div>
      </section>

      <div className="mt-8 flex gap-3">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t("firma.save")}
        </Button>
        <Link to="/settings"><Button variant="outline" size="lg">{t("firma.backToSettings")}</Button></Link>
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
