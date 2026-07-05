import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { REGIONS, CPV_DIVISIONS } from "@/lib/slovakia";
import { X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Nastavenia – Tendrik" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");
  const [cpvCodes, setCpvCodes] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [emailNotif, setEmailNotif] = useState(true);
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (data) {
        setKeywords(data.keywords ?? []);
        setCpvCodes(data.cpv_codes ?? []);
        setRegions(data.regions ?? []);
        setEmailNotif(data.email_notifications ?? true);
      }
      setLoading(false);
    })();
  }, []);

  function addKeyword() {
    const kw = kwInput.trim();
    if (kw && !keywords.includes(kw)) setKeywords([...keywords, kw]);
    setKwInput("");
  }
  function toggle(arr: string[], v: string, setter: (a: string[]) => void) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: u.user.id,
        keywords,
        cpv_codes: cpvCodes,
        regions,
        email_notifications: emailNotif,
        onboarding_completed: true,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Nastavenia uložené");
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-8 text-muted-foreground">Načítavam...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold">Nastavenia</h1>
      <p className="mt-1 text-muted-foreground">Prihlásený ako {email}</p>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg">E-mailové notifikácie</h2>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <Label htmlFor="notif">Zasielať upozornenia na nové zákazky</Label>
            <p className="text-sm text-muted-foreground">Denný súhrn na váš e-mail.</p>
          </div>
          <Switch id="notif" checked={emailNotif} onCheckedChange={setEmailNotif} />
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg">Kľúčové slová</h2>
        <div className="mt-3 flex gap-2">
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
          <Button type="button" onClick={addKeyword}>
            Pridať
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {keywords.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm"
            >
              {k}
              <button onClick={() => setKeywords(keywords.filter((x) => x !== k))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg">CPV kategórie</h2>
        <div className="mt-4 grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-2">
          {CPV_DIVISIONS.map((d) => (
            <label
              key={d.code}
              className="flex items-start gap-2 rounded-md border p-2 hover:bg-accent cursor-pointer"
            >
              <Checkbox
                checked={cpvCodes.includes(d.code)}
                onCheckedChange={() => toggle(cpvCodes, d.code, setCpvCodes)}
              />
              <span className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{d.code}</span> {d.name}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg">Kraje</h2>
        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          {REGIONS.map((r) => (
            <label
              key={r}
              className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent cursor-pointer"
            >
              <Checkbox
                checked={regions.includes(r)}
                onCheckedChange={() => toggle(regions, r, setRegions)}
              />
              <span className="text-sm">{r}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="mt-8 flex justify-end">
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? "Ukladám..." : "Uložiť zmeny"}
        </Button>
      </div>
    </div>
  );
}
