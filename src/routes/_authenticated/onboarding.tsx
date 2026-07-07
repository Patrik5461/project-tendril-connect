import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { REGIONS, CPV_DIVISIONS } from "@/lib/slovakia";
import { X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Nastavenie filtrov – Tendrik" }] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");
  const [cpvCodes, setCpvCodes] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("user_preferences")
        .select("keywords,cpv_codes,regions,onboarding_completed")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (data?.onboarding_completed) navigate({ to: "/dashboard" });
      if (data) {
        setKeywords(data.keywords ?? []);
        setCpvCodes(data.cpv_codes ?? []);
        setRegions(data.regions ?? []);
      }
    })();
  }, [navigate]);

  function addKeyword() {
    const kw = kwInput.trim();
    if (kw && !keywords.includes(kw)) setKeywords([...keywords, kw]);
    setKwInput("");
  }
  function toggle(arr: string[], v: string, setter: (a: string[]) => void) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  async function save() {
    if (keywords.length === 0 && cpvCodes.length === 0) {
      toast.error("Zadajte aspoň jedno kľúčové slovo alebo CPV kategóriu.");
      return;
    }
    if (regions.length === 0) {
      toast.error("Vyberte aspoň jeden kraj.");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return;
    }

    // Vytvor prvý radar, ak používateľ ešte žiadny nemá
    const { data: existing } = await supabase
      .from("user_radars" as never)
      .select("id")
      .eq("user_id", u.user.id)
      .limit(1);
    if (!existing || existing.length === 0) {
      const { error: rErr } = await (supabase.from("user_radars" as never) as any).insert({
        user_id: u.user.id,
        name: "Môj radar",
        keywords,
        cpv_codes: cpvCodes,
        regions,
        active: true,
      });
      if (rErr) {
        setSaving(false);
        toast.error(rErr.message);
        return;
      }
    }

    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: u.user.id,
        keywords,
        cpv_codes: cpvCodes,
        regions,
        onboarding_completed: true,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Radar uložený");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
        Nastavte si filtre
      </h1>
      <p className="mt-2 text-muted-foreground">
        Zákazka sa zobrazí, ak sa v názve/popise nájde niektoré kľúčové slovo <b>alebo</b> sa
        zhoduje CPV kód, <b>a zároveň</b> sedí región.
      </p>

      <section className="mt-8 rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg">1. Kľúčové slová</h2>
        <p className="text-sm text-muted-foreground">Napr. „strecha", „server", „autobus".</p>
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
        <h2 className="font-semibold text-lg">2. CPV kategórie</h2>
        <p className="text-sm text-muted-foreground">Vyberte hlavné divízie, ktoré vás zaujímajú.</p>
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
                <span className="font-mono text-xs text-muted-foreground">{d.code}</span>{" "}
                {d.name}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg">3. Kraje</h2>
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
          {saving ? "Ukladám..." : "Uložiť a pokračovať"}
        </Button>
      </div>
    </div>
  );
}
