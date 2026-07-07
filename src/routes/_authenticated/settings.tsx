import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { REGIONS, CPV_DIVISIONS } from "@/lib/slovakia";
import { X, Plus, Trash2, ChevronDown, ChevronRight, Radar as RadarIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Nastavenia – Tendrik" }] }),
  component: SettingsPage,
});

type Radar = {
  id: string;
  user_id: string;
  name: string;
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  active: boolean;
};

const radars = () => supabase.from("user_radars" as never) as any;

function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailNotif, setEmailNotif] = useState(true);
  const [deadlineReminders, setDeadlineReminders] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState<"daily" | "weekly">("daily");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [list, setList] = useState<Radar[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function reloadRadars(uid: string) {
    const { data } = await radars()
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });
    setList((data ?? []) as Radar[]);
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      setEmail(u.user.email ?? "");
      const { data } = await supabase
        .from("user_preferences")
        .select("email_notifications,deadline_reminders,digest_frequency")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (data) {
        setEmailNotif(data.email_notifications ?? true);
        setDeadlineReminders((data as any).deadline_reminders ?? true);
        const df = (data as any).digest_frequency;
        setDigestFrequency(df === "weekly" ? "weekly" : "daily");
      }
      await reloadRadars(u.user.id);
      setLoading(false);
    })();
  }, []);

  async function saveNotifications() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        email_notifications: emailNotif,
        deadline_reminders: deadlineReminders,
        onboarding_completed: true,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Notifikácie uložené");
  }

  async function addRadar() {
    if (!userId) return;
    const name = `Radar ${list.length + 1}`;
    const { data, error } = await radars()
      .insert({
        user_id: userId,
        name,
        keywords: [],
        cpv_codes: [],
        regions: [],
        active: true,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setList((prev) => [...prev, data as Radar]);
    setExpanded((prev) => new Set(prev).add((data as Radar).id));
  }

  async function updateRadar(id: string, patch: Partial<Radar>) {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await radars().update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function deleteRadar(id: string) {
    if (list.length <= 1) {
      toast.error("Musí zostať aspoň jeden radar.");
      return;
    }
    if (!confirm("Naozaj zmazať tento radar?")) return;
    const prev = list;
    setList(list.filter((r) => r.id !== id));
    const { error } = await radars().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      setList(prev);
    } else {
      toast.success("Radar zmazaný");
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

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-8 text-muted-foreground">Načítavam...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Nastavenia</h1>
      <p className="mt-1 text-muted-foreground">Prihlásený ako {email}</p>

      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
        <h2 className="font-display font-semibold text-lg tracking-tight">E-mailové notifikácie</h2>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <Label htmlFor="notif">Zasielať upozornenia na nové zákazky</Label>
            <p className="text-sm text-muted-foreground">Denný súhrn na váš e-mail.</p>
          </div>
          <Switch id="notif" checked={emailNotif} onCheckedChange={setEmailNotif} />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-primary/10 pt-4">
          <div>
            <Label htmlFor="deadlineRem">Pripomienky deadlinov uložených zákaziek</Label>
            <p className="text-sm text-muted-foreground">
              E-mail 3 dni a 1 deň pred koncom lehoty pri uložených zákazkách.
            </p>
          </div>
          <Switch
            id="deadlineRem"
            checked={deadlineReminders}
            onCheckedChange={setDeadlineReminders}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={saveNotifications} disabled={saving}>
            {saving ? "Ukladám..." : "Uložiť notifikácie"}
          </Button>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display font-semibold text-2xl tracking-tight">Radary</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Každý radar má vlastné kľúčové slová, CPV kategórie a kraje. Zákazka sa objaví, ak sedí
              aspoň jednému aktívnemu radaru.
            </p>
          </div>
          <Button size="sm" onClick={addRadar}>
            <Plus className="h-4 w-4 mr-1" /> Pridať radar
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {list.map((r) => (
            <RadarCard
              key={r.id}
              radar={r}
              expanded={expanded.has(r.id)}
              onToggleExpanded={() => toggleExpanded(r.id)}
              onUpdate={(patch) => updateRadar(r.id, patch)}
              onDelete={() => deleteRadar(r.id)}
              canDelete={list.length > 1}
            />
          ))}
          {list.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Zatiaľ nemáte žiadny radar. Pridajte prvý.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RadarCard({
  radar,
  expanded,
  onToggleExpanded,
  onUpdate,
  onDelete,
  canDelete,
}: {
  radar: Radar;
  expanded: boolean;
  onToggleExpanded: () => void;
  onUpdate: (patch: Partial<Radar>) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [nameDraft, setNameDraft] = useState(radar.name);
  const [kwInput, setKwInput] = useState("");

  useEffect(() => setNameDraft(radar.name), [radar.name]);

  function commitName() {
    const v = nameDraft.trim();
    if (!v) {
      setNameDraft(radar.name);
      return;
    }
    if (v !== radar.name) onUpdate({ name: v });
  }

  function addKeyword() {
    const kw = kwInput.trim();
    if (kw && !radar.keywords.includes(kw)) {
      onUpdate({ keywords: [...radar.keywords, kw] });
    }
    setKwInput("");
  }

  function toggleArr(arr: string[], v: string, key: "cpv_codes" | "regions") {
    const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    onUpdate({ [key]: next } as Partial<Radar>);
  }

  const summary = [
    radar.keywords.length ? `${radar.keywords.length} kľúč. slov` : null,
    radar.cpv_codes.length ? `${radar.cpv_codes.length} CPV` : null,
    radar.regions.length ? `${radar.regions.length} krajov` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "bez filtrov";

  return (
    <div className="rounded-lg border border-primary/15 bg-card">
      <div className="flex items-center gap-2 p-4">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "Zbaliť" : "Rozbaliť"}
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
          <div className="flex items-center gap-2">
            <Switch
              id={`active-${radar.id}`}
              checked={radar.active}
              onCheckedChange={(v) => onUpdate({ active: v })}
            />
            <Label htmlFor={`active-${radar.id}`} className="text-xs text-muted-foreground">
              {radar.active ? "Zapnutý" : "Vypnutý"}
            </Label>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={!canDelete}
            title={canDelete ? "Zmazať radar" : "Musí zostať aspoň jeden radar"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-primary/10 p-4 space-y-6">
          <div>
            <h3 className="font-semibold text-sm">Kľúčové slová</h3>
            <div className="mt-2 flex gap-2">
              <Input
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                placeholder="Pridať kľúčové slovo"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button type="button" size="sm" onClick={addKeyword}>
                Pridať
              </Button>
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

          <div>
            <h3 className="font-semibold text-sm">CPV kategórie</h3>
            <div className="mt-2 grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-2">
              {CPV_DIVISIONS.map((d) => (
                <label
                  key={d.code}
                  className="flex items-start gap-2 rounded-md border p-2 hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={radar.cpv_codes.includes(d.code)}
                    onCheckedChange={() => toggleArr(radar.cpv_codes, d.code, "cpv_codes")}
                  />
                  <span className="text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{d.code}</span>{" "}
                    {d.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm">Kraje</h3>
            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              {REGIONS.map((rg) => (
                <label
                  key={rg}
                  className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={radar.regions.includes(rg)}
                    onCheckedChange={() => toggleArr(radar.regions, rg, "regions")}
                  />
                  <span className="text-sm">{rg}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
