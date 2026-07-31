import { createFileRoute, Link } from "@tanstack/react-router";
import { computeSubscription, formatEur, priceEur, tierLabel } from "@/lib/subscription";

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { REGIONS, CPV_DIVISIONS } from "@/lib/slovakia";
import { EU_COUNTRY_LIST, flagEmoji } from "@/lib/eu-countries";
import { X, Plus, Trash2, ChevronDown, ChevronRight, Radar as RadarIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sendWelcomeEmailIfNeeded } from "@/lib/welcome-email";
import { sendSettingsConfirmationEmail } from "@/lib/settings-email";
import GrantRadarsSection from "@/components/GrantRadarsSection";
import { trackConversion } from "@/lib/analytics";

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
  countries: string[];
  active: boolean;
};

const radars = () => supabase.from("user_radars" as never) as any;

function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailNotif, setEmailNotif] = useState(true);
  const [deadlineReminders, setDeadlineReminders] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState<"daily" | "weekly">("daily");
  const [grantNewMatch, setGrantNewMatch] = useState(true);
  const [grantWeekly, setGrantWeekly] = useState(false);
  const [grantDeadline, setGrantDeadline] = useState(true);
  const [email, setEmail] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
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
        .select("email_notifications,deadline_reminders,digest_frequency,notification_email,grant_new_match_notifications,grant_weekly_digest,grant_deadline_reminders")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (data) {
        setEmailNotif(data.email_notifications ?? true);
        setDeadlineReminders((data as any).deadline_reminders ?? true);
        const df = (data as any).digest_frequency;
        setDigestFrequency(df === "weekly" ? "weekly" : "daily");
        setNotificationEmail((data as any).notification_email ?? "");
        setGrantNewMatch((data as any).grant_new_match_notifications ?? true);
        setGrantWeekly((data as any).grant_weekly_digest ?? false);
        setGrantDeadline((data as any).grant_deadline_reminders ?? true);
      }
      await reloadRadars(u.user.id);
      setLoading(false);
    })();
  }, []);


  async function saveNotifications() {
    if (!userId) return;
    const raw = notificationEmail.trim();
    let normalized: string | null = null;
    if (raw !== "") {
      const parts = raw
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalid = parts.filter((p) => !emailRe.test(p));
      if (invalid.length > 0) {
        toast.error(`Neplatná e-mailová adresa: ${invalid[0]}`);
        return;
      }
      // Dedupe (case-insensitive)
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const p of parts) {
        const key = p.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(p);
        }
      }
      if (unique.length > 10) {
        toast.error("Maximálne 10 príjemcov");
        return;
      }
      normalized = unique.join(", ");
    }
    setSaving(true);
    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        email_notifications: emailNotif,
        deadline_reminders: deadlineReminders,
        digest_frequency: digestFrequency,
        notification_email: normalized,
        grant_new_match_notifications: grantNewMatch,
        grant_weekly_digest: grantWeekly,
        grant_deadline_reminders: grantDeadline,
        onboarding_completed: true,
      } as any,
      { onConflict: "user_id" },
    );

    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Notifikácie uložené");
      setNotificationEmail(normalized ?? "");
      if (emailNotif) void sendWelcomeEmailIfNeeded();
      void sendSettingsConfirmationEmail();
    }
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
        countries: ["SK"],
        active: true,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    trackConversion("radar_created", { radar_type: "tender" });
    setList((prev) => [...prev, data as Radar]);
    setExpanded((prev) => new Set(prev).add((data as Radar).id));
    void sendWelcomeEmailIfNeeded();
    void sendSettingsConfirmationEmail();
  }

  async function updateRadar(id: string, patch: Partial<Radar>) {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await radars().update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else void sendSettingsConfirmationEmail();
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
      void sendSettingsConfirmationEmail();
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

      <Link
        to="/firma"
        className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors"
      >
        <div>
          <div className="font-medium">Firemný profil</div>
          <div className="text-sm text-muted-foreground">IČO, obrat po rokoch, referencie, certifikáty – vstup pre AI analýzu zákaziek.</div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      <Tabs defaultValue="notifications" className="mt-8">
        <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="notifications">Notifikácie</TabsTrigger>
          <TabsTrigger value="radars">Radary</TabsTrigger>
          <TabsTrigger value="grant-radars">Radary na granty</TabsTrigger>
          <TabsTrigger value="billing">Predplatné & fakturácia</TabsTrigger>
        </TabsList>

        <TabsContent value="notifications" className="mt-6">
          <section className="rounded-lg border border-primary/15 bg-card p-6">
            <h2 className="font-display font-semibold text-lg tracking-tight">E-mailové notifikácie</h2>
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="notif">Zasielať upozornenia na nové zákazky</Label>
                <p className="text-sm text-muted-foreground">Súhrn nových zákaziek na váš e-mail.</p>
              </div>
              <Switch id="notif" checked={emailNotif} onCheckedChange={setEmailNotif} />
            </div>
            <div className="mt-4 border-t border-primary/10 pt-4">
              <Label htmlFor="notifEmail">E-mailové adresy pre notifikácie</Label>
              <p className="text-sm text-muted-foreground">
                Jedna alebo viac adries oddelených čiarkou – notifikácie pôjdu všetkým.
                Ak necháte prázdne, použije sa prihlasovací e-mail ({email}). Max 10 príjemcov.
              </p>
              <Input
                id="notifEmail"
                type="text"
                placeholder={`${email}, kolega@firma.sk`}
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                className="mt-2 max-w-md"
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-primary/10 pt-4">
              <div>
                <Label>Frekvencia notifikácií</Label>
                <p className="text-sm text-muted-foreground">
                  Ako často chcete dostávať súhrn nových zákaziek.
                </p>
              </div>
              <div className="inline-flex rounded-md border border-primary/20 overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => setDigestFrequency("daily")}
                  className={`px-3 py-1.5 text-sm font-medium ${
                    digestFrequency === "daily"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-foreground hover:bg-primary/5"
                  }`}
                >
                  Denne
                </button>
                <button
                  type="button"
                  onClick={() => setDigestFrequency("weekly")}
                  className={`px-3 py-1.5 text-sm font-medium border-l border-primary/20 ${
                    digestFrequency === "weekly"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-foreground hover:bg-primary/5"
                  }`}
                >
                  Týždenne
                </button>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-primary/10 pt-4">
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
            <div className="mt-6 border-t border-primary/10 pt-4">
              <h3 className="font-display font-semibold text-base tracking-tight">Grantové výzvy</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Iná kadencia než pri zákazkách – zoznam sa mení pomalšie.
              </p>
              <div className="mt-4 flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="gNewMatch">Nová zhoda s grantovým radarom</Label>
                  <p className="text-sm text-muted-foreground">
                    E-mail vždy, keď pribudne výzva, ktorá sedí na niektorý z vašich grantových radarov.
                  </p>
                </div>
                <Switch id="gNewMatch" checked={grantNewMatch} onCheckedChange={setGrantNewMatch} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="gWeekly">Týždenný súhrn grantov</Label>
                  <p className="text-sm text-muted-foreground">
                    Piatkový súhrn nových a otvorených výziev podľa vašich radarov.
                  </p>
                </div>
                <Switch id="gWeekly" checked={grantWeekly} onCheckedChange={setGrantWeekly} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="gDeadline">Pripomienky deadlinov grantov</Label>
                  <p className="text-sm text-muted-foreground">
                    Len pri one-shot výzvach (s pevným deadlinom), 7 a 2 dni pred koncom.
                  </p>
                </div>
                <Switch id="gDeadline" checked={grantDeadline} onCheckedChange={setGrantDeadline} />
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button size="sm" onClick={saveNotifications} disabled={saving}>
                {saving ? "Ukladám..." : "Uložiť notifikácie"}
              </Button>
            </div>
          </section>
        </TabsContent>


        <TabsContent value="radars" className="mt-6">
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold text-xl tracking-tight">Radary</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Každý radar má vlastné kľúčové slová, CPV kategórie a kraje. Zákazka sa objaví,
                  ak sedí aspoň jednému aktívnemu radaru.
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
        </TabsContent>

        <TabsContent value="grant-radars" className="mt-6">
          <GrantRadarsSection userId={userId} />
        </TabsContent>

        <TabsContent value="billing" className="mt-6 space-y-6">
          <SubscriptionSection userId={userId} />
          <BillingDetailsSection userId={userId} />
          <InvoicesHistorySection userId={userId} />
        </TabsContent>
      </Tabs>
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

  function toggleArr(arr: string[], v: string, key: "cpv_codes" | "regions" | "countries") {
    const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    onUpdate({ [key]: next } as Partial<Radar>);
  }

  const countryLabel =
    (radar.countries ?? []).includes("ALL")
      ? "všetky krajiny EÚ"
      : `${(radar.countries ?? []).length || 0} krajín`;

  const summary = [
    radar.keywords.length ? `${radar.keywords.length} kľúč. slov` : null,
    radar.cpv_codes.length ? `${radar.cpv_codes.length} CPV` : null,
    countryLabel,
    (radar.countries ?? []).includes("SK") && radar.regions.length
      ? `${radar.regions.length} krajov`
      : null,
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
            <h3 className="font-semibold text-sm">Krajiny</h3>
            <label className="mt-2 flex items-center gap-2 rounded-md border p-2 hover:bg-accent cursor-pointer">
              <Checkbox
                checked={(radar.countries ?? []).includes("ALL")}
                onCheckedChange={() =>
                  onUpdate({
                    countries: (radar.countries ?? []).includes("ALL") ? ["SK"] : ["ALL"],
                  })
                }
              />
              <span className="text-sm font-medium">Všetky krajiny EÚ</span>
            </label>
            {!(radar.countries ?? []).includes("ALL") && (
              <div className="mt-2 grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2">
                {EU_COUNTRY_LIST.map((c) => (
                  <label
                    key={c.code}
                    className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={(radar.countries ?? []).includes(c.code)}
                      onCheckedChange={() => toggleArr(radar.countries ?? [], c.code, "countries")}
                    />
                    <span className="text-sm">
                      {flagEmoji(c.code)} {c.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {((radar.countries ?? []).includes("SK") || (radar.countries ?? []).includes("ALL")) && (
            <div>
              <h3 className="font-semibold text-sm">Kraje (Slovensko) – voliteľné</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Nechajte prázdne pre celé Slovensko, alebo vyberte konkrétne kraje.
              </p>
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
          )}
        </div>
      )}
    </div>
  );
}

function SubscriptionSection({ userId }: { userId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState<any>(null);

  async function load() {
    if (!userId) return;
    const { data } = await supabase
      .from("user_preferences")
      .select("trial_started_at,subscription_status,subscription_tier,billing_period,subscription_valid_until,gopay_recurrence_id,subscription_cancel_requested_at,last_payment_at")
      .eq("user_id", userId)
      .maybeSingle();
    setRow(data);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  if (loading) {
    return (
      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
        <h2 className="font-display font-semibold text-lg tracking-tight">Predplatné</h2>
        <p className="mt-2 text-sm text-muted-foreground">Načítavam…</p>
      </section>
    );
  }

  const sub = computeSubscription(row);
  const validUntil = row?.subscription_valid_until ? new Date(row.subscription_valid_until) : null;
  const cancelRequested = !!row?.subscription_cancel_requested_at;

  const statusLabel =
    sub.status === "active" ? (cancelRequested ? "Aktívne (zrušené – dobieha)" : "Aktívne")
    : sub.status === "trial" ? `Skúšobné (zostáva ${sub.daysLeft} dní)`
    : "Vypršané";

  async function cancel() {
    if (!confirm("Zrušiť predplatné? Prístup vám zostane do konca zaplateného obdobia.")) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("gopay-cancel-subscription", { body: {} });
    setBusy(false);
    if (error) { toast.error("Nepodarilo sa zrušiť: " + error.message); return; }
    toast.success("Predplatné bolo zrušené." + (data?.valid_until ? " Prístup do " + new Date(data.valid_until).toLocaleDateString("sk-SK") + "." : ""));
    load();
  }

  return (
    <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
      <h2 className="font-display font-semibold text-lg tracking-tight">Predplatné</h2>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-muted-foreground">Stav</div>
          <div className="font-medium">{statusLabel}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Plán / Cena</div>
          <div className="font-medium">
            Tendrik {tierLabel(sub.tier)} · {formatEur(priceEur(sub.tier, sub.period))}{" "}
            / {sub.period === "yearly" ? "rok" : "mes"}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">AI analýzy</div>
          <div className="font-medium">
            {sub.status === "trial"
              ? `${sub.aiLimit} v rámci trialu`
              : sub.aiLimit > 0 ? `${sub.aiLimit} mesačne` : "nie sú v pláne"}
          </div>
        </div>

        {validUntil && (
          <div>
            <div className="text-muted-foreground">Zaplatené do</div>
            <div className="font-medium num">{validUntil.toLocaleDateString("sk-SK")}</div>
          </div>
        )}
        {row?.last_payment_at && (
          <div>
            <div className="text-muted-foreground">Posledná platba</div>
            <div className="font-medium num">{new Date(row.last_payment_at).toLocaleDateString("sk-SK")}</div>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {sub.status !== "active" && (
          <Link to="/predplatne">
            <Button size="sm">Aktivovať predplatné</Button>
          </Link>
        )}
        {sub.status === "active" && !cancelRequested && (
          <Button size="sm" variant="outline" onClick={cancel} disabled={busy}>
            {busy ? "Rušim…" : "Zrušiť predplatné"}
          </Button>
        )}
        {cancelRequested && (
          <p className="text-xs text-muted-foreground">
            Zrušenie vyžiadané. Prístup zostáva do konca zaplateného obdobia.
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Platby spracúva GoPay. Detaily nájdete v{" "}
        <Link to="/pravne/opakovane-platby" className="underline">podmienkach opakovaných platieb</Link>.
      </p>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Fakturačné údaje
// -----------------------------------------------------------------------------

type BillingRow = {
  name: string;
  ico: string | null;
  ic_dph: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string;
  email: string;
  faktero_customer_id?: string | null;
};

function BillingDetailsSection({ userId }: { userId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<BillingRow>({
    name: "",
    ico: "",
    ic_dph: "",
    street: "",
    city: "",
    zip: "",
    country: "SK",
    email: "",
  });

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await (supabase.from("billing_details" as never) as any)
        .select("*").eq("user_id", userId).maybeSingle();
      if (data) {
        setRow({
          name: data.name ?? "",
          ico: data.ico ?? "",
          ic_dph: data.ic_dph ?? "",
          street: data.street ?? "",
          city: data.city ?? "",
          zip: data.zip ?? "",
          country: data.country ?? "SK",
          email: data.email ?? "",
          faktero_customer_id: data.faktero_customer_id ?? null,
        });
      } else {
        const { data: u } = await supabase.auth.getUser();
        setRow((r) => ({ ...r, email: u.user?.email ?? "" }));
      }
      setLoading(false);
    })();
  }, [userId]);

  async function save() {
    if (!userId) return;
    if (!row.name.trim()) { toast.error("Zadaj meno alebo názov firmy."); return; }
    if (!row.email.trim() || !row.email.includes("@")) { toast.error("Zadaj platný e-mail."); return; }
    setSaving(true);
    const payload = {
      user_id: userId,
      name: row.name.trim(),
      ico: row.ico?.trim() || null,
      ic_dph: row.ic_dph?.trim() || null,
      street: row.street?.trim() || null,
      city: row.city?.trim() || null,
      zip: row.zip?.trim() || null,
      country: (row.country || "SK").trim().toUpperCase(),
      email: row.email.trim(),
    };
    const { error } = await (supabase.from("billing_details" as never) as any)
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error("Nepodarilo sa uložiť: " + error.message); return; }
    toast.success("Fakturačné údaje uložené.");
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
        <h2 className="font-display font-semibold text-lg tracking-tight">Fakturačné údaje</h2>
        <p className="mt-2 text-sm text-muted-foreground">Načítavam…</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
      <h2 className="font-display font-semibold text-lg tracking-tight">Fakturačné údaje</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Používajú sa na vystavenie faktúry po zaplatení predplatného. Faktúra vám príde na fakturačný e-mail.
      </p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Meno alebo názov firmy *</Label>
          <Input value={row.name} onChange={(e) => setRow({ ...row, name: e.target.value })} />
        </div>
        <div>
          <Label>IČO</Label>
          <Input value={row.ico ?? ""} onChange={(e) => setRow({ ...row, ico: e.target.value })} />
        </div>
        <div>
          <Label>IČ DPH</Label>
          <Input value={row.ic_dph ?? ""} onChange={(e) => setRow({ ...row, ic_dph: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Ulica a číslo</Label>
          <Input value={row.street ?? ""} onChange={(e) => setRow({ ...row, street: e.target.value })} />
        </div>
        <div>
          <Label>Mesto</Label>
          <Input value={row.city ?? ""} onChange={(e) => setRow({ ...row, city: e.target.value })} />
        </div>
        <div>
          <Label>PSČ</Label>
          <Input value={row.zip ?? ""} onChange={(e) => setRow({ ...row, zip: e.target.value })} />
        </div>
        <div>
          <Label>Krajina</Label>
          <Input value={row.country} onChange={(e) => setRow({ ...row, country: e.target.value })} />
        </div>
        <div>
          <Label>Fakturačný e-mail *</Label>
          <Input value={row.email} onChange={(e) => setRow({ ...row, email: e.target.value })} />
        </div>
      </div>
      <div className="mt-4">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Ukladám…" : "Uložiť fakturačné údaje"}
        </Button>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// História faktúr
// -----------------------------------------------------------------------------

function InvoicesHistorySection({ userId }: { userId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function load() {
    if (!userId) return;
    const { data } = await (supabase.from("invoices" as never) as any)
      .select("id, invoice_number, amount, currency, status, issued_at, created_at, error_message")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  async function downloadPdf(id: string) {
    setDownloading(id);
    const { data, error } = await supabase.functions.invoke("faktero-ops", {
      body: { action: "pdf", invoice_id: id },
    });
    setDownloading(null);
    if (error || !data?.url) { toast.error("PDF sa nepodarilo načítať."); return; }
    window.open(data.url, "_blank", "noopener");
  }

  return (
    <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
      <h2 className="font-display font-semibold text-lg tracking-tight">História faktúr</h2>
      {loading ? (
        <p className="mt-2 text-sm text-muted-foreground">Načítavam…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Zatiaľ žiadne faktúry.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-primary/10">
                <th className="py-2 pr-3">Dátum</th>
                <th className="py-2 pr-3">Číslo</th>
                <th className="py-2 pr-3">Suma</th>
                <th className="py-2 pr-3">Stav</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dt = r.issued_at || r.created_at;
                const isReady = ["issued", "paid_marked", "sent"].includes(r.status);
                return (
                  <tr key={r.id} className="border-b border-primary/5">
                    <td className="py-2 pr-3 num">{dt ? new Date(dt).toLocaleDateString("sk-SK") : "—"}</td>
                    <td className="py-2 pr-3 num">{r.invoice_number ?? "—"}</td>
                    <td className="py-2 pr-3 num">{Number(r.amount).toFixed(2)} {r.currency}</td>
                    <td className="py-2 pr-3">
                      {r.status === "sent" ? "Odoslaná"
                        : r.status === "paid_marked" ? "Vystavená (uhradená)"
                        : r.status === "issued" ? "Vystavená"
                        : r.status === "failed" ? <span className="text-destructive">Chyba</span>
                        : "Čaká sa"}
                    </td>
                    <td className="py-2 pr-3">
                      {isReady && (
                        <Button size="sm" variant="outline" onClick={() => downloadPdf(r.id)} disabled={downloading === r.id}>
                          {downloading === r.id ? "…" : "Stiahnuť PDF"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
