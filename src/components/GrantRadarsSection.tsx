import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { X, Plus, Trash2, ChevronDown, ChevronRight, Radar as RadarIcon } from "lucide-react";
import { REGIONS } from "@/lib/slovakia";
import { Trans, useTranslation } from "react-i18next";
import { trackConversion } from "@/lib/analytics";
import {
  CATEGORY_LABEL,
  defaultCategoryFromLegalForm,
  type ApplicantCategory,
} from "@/lib/grant-applicant-categories";

type GrantRadar = {
  id: string;
  user_id: string;
  name: string;
  keywords: string[];
  applicant_categories: string[];
  programs: string[];
  regions: string[];
  suma_eu_min: number | null;
  suma_eu_max: number | null;
  formats: string[];
  active: boolean;
};

const CATEGORIES: ApplicantCategory[] = ["podnikatelia", "verejny", "neziskovky"];

const table = () => supabase.from("user_grant_radars");

export default function GrantRadarsSection({ userId }: { userId: string | null }) {
  const { t } = useTranslation("account");
  const [list, setList] = useState<GrantRadar[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<Array<{ program: string; cnt: number }>>([]);
  const [defaultCategory, setDefaultCategory] = useState<ApplicantCategory | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data }, prog, comp] = await Promise.all([
        table().select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        supabase.rpc("list_grant_programs"),
        supabase
          .from("company_profile")
          .select("pravna_forma")
          .eq("user_id", userId)
          .eq("is_default", true)
          .maybeSingle(),
      ]);
      setList((data ?? []) as GrantRadar[]);
      setPrograms(((prog.data ?? []) as any[]).map((r) => ({ program: r.program, cnt: r.cnt })));
      const pf = (comp.data as any)?.pravna_forma as string | null | undefined;
      setDefaultCategory(defaultCategoryFromLegalForm(pf));
      setLoading(false);
    })();
  }, [userId]);

  async function addRadar() {
    if (!userId) return;
    const name = t("grantRadars.defaultName", { n: list.length + 1 });
    const applicant = defaultCategory ? [defaultCategory] : [];
    const { data, error } = await table()
      .insert({
        user_id: userId,
        name,
        keywords: [],
        applicant_categories: applicant,
        programs: [],
        regions: [],
        suma_eu_min: null,
        suma_eu_max: null,
        formats: [],
        active: true,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    trackConversion("radar_created", { radar_type: "grant" });
    setList((prev) => [...prev, data as GrantRadar]);
    setExpanded((prev) => new Set(prev).add((data as GrantRadar).id));
  }

  async function updateRadar(id: string, patch: Partial<GrantRadar>) {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await table().update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function deleteRadar(id: string) {
    if (!confirm(t("grantRadars.confirmDelete"))) return;
    const prev = list;
    setList(list.filter((r) => r.id !== id));
    const { error } = await table().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      setList(prev);
    } else {
      toast.success(t("grantRadars.deleted"));
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <div className="text-muted-foreground">{t("settings.loading")}</div>;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold text-xl tracking-tight">{t("grantRadars.heading")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("grantRadars.description")}
          </p>
        </div>
        <Button size="sm" onClick={addRadar}>
          <Plus className="h-4 w-4 mr-1" /> {t("grantRadars.add")}
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {list.map((r) => (
          <GrantRadarCard
            key={r.id}
            radar={r}
            expanded={expanded.has(r.id)}
            onToggleExpanded={() => toggleExpanded(r.id)}
            onUpdate={(patch) => updateRadar(r.id, patch)}
            onDelete={() => deleteRadar(r.id)}
            programs={programs}
          />
        ))}
        {list.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            {t("grantRadars.empty")}
            {defaultCategory && (
              <div className="mt-2 text-xs">
                <Trans
                  i18nKey="grantRadars.autoFillCategory"
                  ns="account"
                  values={{ category: CATEGORY_LABEL[defaultCategory] }}
                  components={{ b: <b /> }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function GrantRadarCard({
  radar,
  expanded,
  onToggleExpanded,
  onUpdate,
  onDelete,
  programs,
}: {
  radar: GrantRadar;
  expanded: boolean;
  onToggleExpanded: () => void;
  onUpdate: (patch: Partial<GrantRadar>) => void;
  onDelete: () => void;
  programs: Array<{ program: string; cnt: number }>;
}) {
  const { t } = useTranslation("account");
  const [nameDraft, setNameDraft] = useState(radar.name);
  const [kwInput, setKwInput] = useState("");
  useEffect(() => setNameDraft(radar.name), [radar.name]);

  function commitName() {
    const v = nameDraft.trim();
    if (!v) return setNameDraft(radar.name);
    if (v !== radar.name) onUpdate({ name: v });
  }

  function addKeyword() {
    const kw = kwInput.trim();
    if (kw && !radar.keywords.includes(kw)) {
      onUpdate({ keywords: [...radar.keywords, kw] });
    }
    setKwInput("");
  }

  function toggleIn<K extends "applicant_categories" | "programs" | "regions" | "formats">(
    key: K,
    v: string,
  ) {
    const cur = (radar[key] as string[]) ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    onUpdate({ [key]: next } as Partial<GrantRadar>);
  }

  const summary =
    [
      radar.keywords.length ? t("grantRadars.summary.keywords", { count: radar.keywords.length }) : null,
      radar.applicant_categories.length
        ? t("grantRadars.summary.type", { count: radar.applicant_categories.length })
        : null,
      radar.programs.length ? t("grantRadars.summary.programs", { count: radar.programs.length }) : null,
      radar.regions.length
        ? t("grantRadars.summary.regions", { count: radar.regions.length })
        : t("grantRadars.summary.wholeSk"),
      radar.formats.length === 1
        ? radar.formats[0] === "rolling"
          ? t("grantRadars.summary.rolling")
          : t("grantRadars.summary.oneshot")
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || t("grantRadars.summary.empty");

  return (
    <div className="rounded-lg border border-primary/15 bg-card">
      <div className="flex items-center gap-2 p-4">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="text-muted-foreground hover:text-foreground"
          aria-label={expanded ? t("grantRadars.collapse") : t("grantRadars.expand")}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <RadarIcon
          className={`h-4 w-4 ${radar.active ? "text-primary" : "text-muted-foreground/40"}`}
        />
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="max-w-xs font-semibold"
        />
        <span className="hidden sm:inline text-xs text-muted-foreground">{summary}</span>
        <div className="ml-auto flex items-center gap-3">
          <Switch
            checked={radar.active}
            onCheckedChange={(v) => onUpdate({ active: v })}
          />
          <Button variant="ghost" size="icon" onClick={onDelete} title={t("grantRadars.deleteTitle")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-primary/10 p-4 space-y-6">
          {/* Keywords */}
          <div>
            <h3 className="font-semibold text-sm">{t("grantRadars.keywords.heading")}</h3>
            <div className="mt-2 flex gap-2">
              <Input
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                placeholder={t("grantRadars.keywords.placeholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button type="button" size="sm" onClick={addKeyword}>{t("grantRadars.keywords.add")}</Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {radar.keywords.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground px-3 py-1 text-sm font-medium"
                >
                  {k}
                  <button
                    onClick={() =>
                      onUpdate({ keywords: radar.keywords.filter((x) => x !== k) })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Applicant categories */}
          <div>
            <h3 className="font-semibold text-sm">{t("grantRadars.applicantType.heading")}</h3>
            {radar.applicant_categories.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("grantRadars.applicantType.hint")}
              </p>
            )}
            <div className="mt-2 grid sm:grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <label
                  key={c}
                  className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={radar.applicant_categories.includes(c)}
                    onCheckedChange={() => toggleIn("applicant_categories", c)}
                  />
                  <span className="text-sm">{CATEGORY_LABEL[c]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Programs */}
          <div>
            <h3 className="font-semibold text-sm">{t("grantRadars.programs.heading")}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("grantRadars.programs.hint", { count: programs.length })}
            </p>
            <div className="mt-2 grid sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-2">
              {programs.map((p) => (
                <label
                  key={p.program}
                  className="flex items-start gap-2 rounded-md border p-2 hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={radar.programs.includes(p.program)}
                    onCheckedChange={() => toggleIn("programs", p.program)}
                  />
                  <span className="text-sm">
                    {p.program} <span className="text-muted-foreground">({p.cnt})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Regions */}
          <div>
            <h3 className="font-semibold text-sm">{t("grantRadars.regions.heading")}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("grantRadars.regions.hint")}
            </p>
            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              {REGIONS.map((rg) => (
                <label
                  key={rg}
                  className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={radar.regions.includes(rg)}
                    onCheckedChange={() => toggleIn("regions", rg)}
                  />
                  <span className="text-sm">{rg}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Alokácia EÚ */}
          <div>
            <h3 className="font-semibold text-sm">{t("grantRadars.allocation.heading")}</h3>
            <div className="mt-2 grid grid-cols-2 gap-3 max-w-md">
              <div>
                <Label className="text-xs">{t("grantRadars.allocation.fromLabel")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={radar.suma_eu_min ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    onUpdate({ suma_eu_min: v });
                  }}
                  placeholder={t("grantRadars.allocation.fromPlaceholder")}
                />
              </div>
              <div>
                <Label className="text-xs">{t("grantRadars.allocation.toLabel")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={radar.suma_eu_max ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    onUpdate({ suma_eu_max: v });
                  }}
                  placeholder={t("grantRadars.allocation.toPlaceholder")}
                />
              </div>
            </div>
          </div>

          {/* Format */}
          <div>
            <h3 className="font-semibold text-sm">{t("grantRadars.format.heading")}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("grantRadars.format.hint")}
            </p>
            <div className="mt-2 flex gap-2">
              {[
                { v: "rolling", label: t("grantRadars.format.rolling") },
                { v: "oneshot", label: t("grantRadars.format.oneshot") },
              ].map((f) => (
                <label
                  key={f.v}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={radar.formats.includes(f.v)}
                    onCheckedChange={() => toggleIn("formats", f.v)}
                  />
                  <span className="text-sm">{f.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
