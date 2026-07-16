import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2, Users, Search, Sparkles, Copy, CheckCircle2, Plus, X, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  suggestSubcontracting, getSubcontracting, findSubcontractorCandidates,
  generateOutreach, saveSubcontractingSelections,
} from "@/lib/subcontracting.functions";

type SuggestedItem = {
  nazov: string;
  dovod: string;
  nace_kod?: string | null;
  hladane_slovo?: string | null;
  hladane_slova?: string[] | null;
  sam_zvladne?: boolean;
};

type Candidate = {
  ico: string | null;
  nazov: string | null;
  mesto: string | null;
  ulica: string | null;
  psc: string | null;
  hlavna_cinnost: string | null;
};

type Selection = {
  key: string;
  need_nazov: string;
  nazov_firmy: string;
  ico?: string | null;
  email?: string | null;
  mesto?: string | null;
  co_dopyt?: string | null;
  oslovenia?: {
    neutralne?: { predmet: string; telo: string } | null;
    spolupraca?: { predmet: string; telo: string } | null;
  } | null;
  vybrana_verzia?: "neutralne" | "spolupraca" | null;
  vlastny_text?: string | null;
};

type Props = {
  tenderId: string;
  defaultCity?: string | null;
  isActive: boolean;
  analysisReady: boolean;
};

export function SubcontractingSection({ tenderId, defaultCity, isActive, analysisReady }: Props) {
  const runSuggest = useServerFn(suggestSubcontracting);
  const load = useServerFn(getSubcontracting);
  const findCandidates = useServerFn(findSubcontractorCandidates);
  const genOutreach = useServerFn(generateOutreach);
  const saveSel = useServerFn(saveSubcontractingSelections);

  const [state, setState] = useState<{
    loaded: boolean;
    suggested: SuggestedItem[];
    firma_zvladne_sama: boolean;
    poznamka: string | null;
    selections: Selection[];
  }>({ loaded: false, suggested: [], firma_zvladne_sama: false, poznamka: null, selections: [] });

  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState<Record<string, { loading: boolean; items: Candidate[]; city: string; keyword: string; note?: string; used_keyword?: string; dropped_city?: boolean; searched?: boolean }>>({});
  const selectionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isActive || !analysisReady) return;
    (async () => {
      const row = await load({ data: { tender_id: tenderId } }).catch(() => null);
      if (row) {
        setState({
          loaded: true,
          suggested: (row as any).suggested ?? [],
          firma_zvladne_sama: !!(row as any).firma_zvladne_sama,
          poznamka: (row as any).poznamka ?? null,
          selections: (row as any).selections ?? [],
        });
      } else {
        setState((s) => ({ ...s, loaded: true }));
      }
    })();
  }, [tenderId, isActive, analysisReady, load]);

  async function suggest(force = false) {
    setRunning(true);
    try {
      const row = await runSuggest({ data: { tender_id: tenderId, force } });
      setState({
        loaded: true,
        suggested: (row as any).suggested ?? [],
        firma_zvladne_sama: !!(row as any).firma_zvladne_sama,
        poznamka: (row as any).poznamka ?? null,
        selections: (row as any).selections ?? [],
      });
      setCandidates({});
      toast.success((row as any).cached ? "Načítané uložené návrhy" : "Návrhy pripravené");
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa navrhnúť subdodávky");
    } finally {
      setRunning(false);
    }
  }

  function initialKeyword(item: SuggestedItem): string {
    return (item.hladane_slovo || item.hladane_slova?.[0] || item.nazov || "").trim();
  }

  async function searchFor(item: SuggestedItem, idx: number, overrideKeyword?: string) {
    const key = String(idx);
    const existing = candidates[key];
    const kw = (overrideKeyword ?? existing?.keyword ?? initialKeyword(item)).trim();
    const city = existing?.city ?? defaultCity ?? "";
    if (kw.length < 2) {
      toast.error("Zadajte aspoň 2 znaky pre hľadaný pojem.");
      return;
    }
    setCandidates((c) => ({ ...c, [key]: { loading: true, items: [], city, keyword: kw } }));
    const alternatives = (item.hladane_slova ?? []).filter((s) => s && s.trim() && s.trim() !== kw);
    try {
      const res: any = await findCandidates({ data: { keyword: kw, alternatives, city: city || null, limit: 15 } });
      setCandidates((c) => ({
        ...c,
        [key]: {
          loading: false,
          items: res.results ?? [],
          city,
          keyword: kw,
          note: res.note,
          used_keyword: res.used_keyword,
          dropped_city: !!res.dropped_city,
          searched: true,
        },
      }));
    } catch (e: any) {
      setCandidates((c) => ({ ...c, [key]: { loading: false, items: [], city, keyword: kw, note: e?.message, searched: true } }));
      toast.error(e?.message ?? "Vyhľadávanie zlyhalo");
    }
  }

  function scrollToSelections() {
    setTimeout(() => selectionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function addSelection(need: SuggestedItem, c?: Candidate) {
    const sel: Selection = {
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      need_nazov: need.nazov,
      nazov_firmy: c?.nazov ?? "",
      ico: c?.ico ?? null,
      mesto: c?.mesto ?? null,
      email: null,
      co_dopyt: need.dovod,
    };
    setState((s) => ({ ...s, selections: [...s.selections, sel] }));
    toast.success(c?.nazov ? `Pridané: ${c.nazov}` : `Pridané prázdne — doplňte firmu pre „${need.nazov}"`);
    scrollToSelections();
  }

  function addManual() {
    setState((s) => ({
      ...s,
      selections: [...s.selections, {
        key: `${Date.now()}-m-${Math.random().toString(36).slice(2, 6)}`,
        need_nazov: "",
        nazov_firmy: "",
        co_dopyt: "",
        email: "",
      }],
    }));
    toast.success("Pridaný prázdny záznam – vyplňte údaje firmy nižšie.");
    scrollToSelections();
  }

  function updateSel(key: string, patch: Partial<Selection>) {
    setState((s) => ({ ...s, selections: s.selections.map((x) => x.key === key ? { ...x, ...patch } : x) }));
  }
  function removeSel(key: string) {
    setState((s) => ({ ...s, selections: s.selections.filter((x) => x.key !== key) }));
  }

  async function generate(sel: Selection) {
    if (!sel.need_nazov.trim() || !sel.nazov_firmy.trim() || !(sel.co_dopyt ?? "").trim()) {
      toast.error("Vyplňte plnenie, firmu a špecifikáciu.");
      return;
    }
    updateSel(sel.key, { oslovenia: { neutralne: null, spolupraca: null } });
    try {
      const res: any = await genOutreach({ data: {
        tender_id: tenderId,
        need_nazov: sel.need_nazov,
        specifikacia: sel.co_dopyt!,
        subcontractor_nazov: sel.nazov_firmy,
      } });
      updateSel(sel.key, { oslovenia: res, vybrana_verzia: sel.vybrana_verzia ?? "neutralne" });
      toast.success("Oslovenia vygenerované");
    } catch (e: any) {
      updateSel(sel.key, { oslovenia: null });
      toast.error(e?.message ?? "Generovanie zlyhalo");
    }
  }

  async function saveAll() {
    try {
      await saveSel({ data: { tender_id: tenderId, selections: state.selections } });
      toast.success("Uložené");
    } catch (e: any) {
      toast.error(e?.message ?? "Uloženie zlyhalo");
    }
  }

  if (!isActive || !analysisReady) return null;

  return (
    <div className="mt-12 border-t-2 border-foreground pt-6">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <div className="eyebrow text-primary">Subdodávky a partneri</div>
      </div>

      {!state.loaded ? (
        <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
        </div>
      ) : state.suggested.length === 0 && !state.firma_zvladne_sama ? (
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <h3 className="font-display font-semibold text-lg">Čo potrebujete zabezpečiť</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            AI z podmienok zákazky a vášho profilu navrhne plnenia, na ktoré pravdepodobne
            potrebujete subdodávateľa alebo partnera.
          </p>
          <Button className="mt-4" onClick={() => suggest(false)} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Navrhnúť subdodávky
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">Čo potrebujete zabezpečiť</h3>
            <Button variant="outline" size="sm" onClick={() => suggest(true)} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Prepočítať
            </Button>
          </div>

          {state.firma_zvladne_sama && (
            <div className="rounded border border-emerald-600/40 bg-emerald-500/5 p-4 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                <div>
                  <div className="font-medium">Firma pravdepodobne zvládne všetko sama.</div>
                  {state.poznamka && <div className="mt-1 text-muted-foreground">{state.poznamka}</div>}
                </div>
              </div>
            </div>
          )}

          {state.suggested.map((item, idx) => {
            const key = String(idx);
            const c = candidates[key];
            const currentKw = c?.keyword ?? initialKeyword(item);
            const alts = (item.hladane_slova ?? []).filter((s) => s && s.trim() && s.trim() !== currentKw);
            return (
              <div key={idx} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-medium">{item.nazov}</div>
                    <div className="text-sm text-muted-foreground mt-1">{item.dovod}</div>
                    {item.nace_kod && (
                      <div className="text-xs text-muted-foreground mt-2">SK-NACE: <code>{item.nace_kod}</code></div>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-[2fr_1.5fr_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Hľadaný pojem (upravte ak treba)</Label>
                    <Input
                      value={currentKw}
                      onChange={(e) => setCandidates((s) => ({
                        ...s,
                        [key]: { ...(s[key] ?? { loading: false, items: [], city: defaultCity ?? "" }), keyword: e.target.value },
                      }))}
                      placeholder="napr. záhradn, kosačk, elektroinštal"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Obec (voliteľné)</Label>
                    <Input
                      value={c?.city ?? defaultCity ?? ""}
                      onChange={(e) => setCandidates((s) => ({
                        ...s,
                        [key]: { ...(s[key] ?? { loading: false, items: [], keyword: currentKw }), city: e.target.value },
                      }))}
                      placeholder="napr. Bratislava"
                      className="h-9"
                    />
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => searchFor(item, idx)} disabled={c?.loading}>
                    {c?.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                    Nájsť firmy
                  </Button>
                </div>

                {alts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-muted-foreground">Skúsiť aj:</span>
                    {alts.map((a, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => searchFor(item, idx, a)}
                        className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-accent"
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                )}

                {c && !c.loading && c.searched && (
                  <div className="mt-3">
                    {c.items.length === 0 ? (
                      <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-2">
                        <p>
                          Nenašli sme firmy podľa registrovanej činnosti (skúšané:{" "}
                          {(c as any).tried ? (c as any).tried.join(", ") : currentKw}
                          {c.dropped_city ? "; aj bez mesta" : ""}). Upravte hľadaný pojem vyššie a skúste znova, alebo pridajte vlastnú firmu.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Tip: registrové činnosti bývajú formulované všeobecne. Použite krátky koreň slova
                          (napr. „záhradn", „komunálna technika", „elektrikár") namiesto celej frázy.
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-2">{c.note}</p>
                        <ul className="divide-y divide-border rounded border border-border">
                          {c.items.map((cand, i) => (
                            <li key={i} className="p-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate">{cand.nazov ?? "—"}</div>
                                <div className="text-xs text-muted-foreground">
                                  IČO {cand.ico ?? "—"} · {cand.mesto ?? "—"} {cand.psc ? `(${cand.psc})` : ""}
                                </div>
                                {cand.hlavna_cinnost && (
                                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{cand.hlavna_cinnost}</div>
                                )}
                              </div>
                              <Button size="sm" variant="outline" onClick={() => addSelection(item, cand)}>
                                <Plus className="h-4 w-4 mr-1" /> Vybrať
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => addSelection(item)}>
                    <Plus className="h-4 w-4 mr-1" /> Pridať vlastnú firmu pre toto plnenie
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Výber + oslovenia */}
          <div ref={selectionsRef} className="pt-4 border-t border-border scroll-mt-24">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold">Vybraní subdodávatelia a oslovenia</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addManual}>
                  <Plus className="h-4 w-4 mr-1" /> Pridať vlastného
                </Button>
                <Button size="sm" onClick={saveAll}>Uložiť</Button>
              </div>
            </div>

            {state.selections.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Zatiaľ nikto nie je vybraný.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {state.selections.map((sel) => (
                  <SelectionCard
                    key={sel.key}
                    sel={sel}
                    onChange={(patch) => updateSel(sel.key, patch)}
                    onRemove={() => removeSel(sel.key)}
                    onGenerate={() => generate(sel)}
                  />
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground rounded border border-dashed border-border p-3">
            Návrhy subdodávok aj firiem sú orientačné, generované AI z verejných registrov (RPO ŠÚ SR).
            Overte si referencie, kapacitu a spoľahlivosť sami. Tendrik oslovenia neodosiela — pošlete ich z vlastnej pošty.
          </p>
        </div>
      )}
    </div>
  );
}

function SelectionCard({ sel, onChange, onRemove, onGenerate }: {
  sel: Selection;
  onChange: (p: Partial<Selection>) => void;
  onRemove: () => void;
  onGenerate: () => void;
}) {
  const [copying, setCopying] = useState(false);
  const active = sel.vybrana_verzia ?? "neutralne";
  const version = sel.oslovenia?.[active];

  async function copyEmail() {
    if (!version) return;
    const text = `Predmet: ${version.predmet}\n\n${version.telo}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopying(true);
      setTimeout(() => setCopying(false), 1500);
    } catch { /* noop */ }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
          <div>
            <Label className="text-xs">Plnenie (čo dopytujeme)</Label>
            <Input value={sel.need_nazov} onChange={(e) => onChange({ need_nazov: e.target.value })} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Názov firmy</Label>
            <Input value={sel.nazov_firmy} onChange={(e) => onChange({ nazov_firmy: e.target.value })} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Kontaktný e-mail (voliteľné)</Label>
            <Input value={sel.email ?? ""} onChange={(e) => onChange({ email: e.target.value })} className="h-9" placeholder="pre vaše potreby, nikam sa neodosiela" />
          </div>
          <div>
            <Label className="text-xs">IČO (voliteľné)</Label>
            <Input value={sel.ico ?? ""} onChange={(e) => onChange({ ico: e.target.value })} className="h-9" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Špecifikácia – čo od nich chcete</Label>
            <Textarea value={sel.co_dopyt ?? ""} onChange={(e) => onChange({ co_dopyt: e.target.value })} rows={2} />
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Odstrániť">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={onGenerate}>
          <Sparkles className="h-4 w-4 mr-2" /> {sel.oslovenia ? "Vygenerovať znova" : "Vygenerovať oslovenie"}
        </Button>
        {sel.oslovenia && (sel.oslovenia.neutralne || sel.oslovenia.spolupraca) && (
          <div className="flex rounded border border-border overflow-hidden text-xs">
            <button
              className={`px-3 py-1.5 ${active === "neutralne" ? "bg-primary text-primary-foreground" : "bg-card"}`}
              onClick={() => onChange({ vybrana_verzia: "neutralne" })}
            >Neutrálny dopyt</button>
            <button
              className={`px-3 py-1.5 ${active === "spolupraca" ? "bg-primary text-primary-foreground" : "bg-card"}`}
              onClick={() => onChange({ vybrana_verzia: "spolupraca" })}
            >Dopyt + spolupráca</button>
          </div>
        )}
      </div>

      {version && (
        <div className="mt-3 space-y-2">
          <div>
            <Label className="text-xs">Predmet</Label>
            <Input value={version.predmet} onChange={(e) => {
              const next = { ...sel.oslovenia! };
              (next as any)[active] = { ...(next as any)[active], predmet: e.target.value };
              onChange({ oslovenia: next });
            }} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Text e-mailu</Label>
            <Textarea rows={10} value={version.telo} onChange={(e) => {
              const next = { ...sel.oslovenia! };
              (next as any)[active] = { ...(next as any)[active], telo: e.target.value };
              onChange({ oslovenia: next });
            }} />
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={copyEmail}>
              <Copy className="h-4 w-4 mr-2" /> {copying ? "Skopírované" : "Kopírovať predmet + text"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
