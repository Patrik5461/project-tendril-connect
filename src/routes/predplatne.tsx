import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AI_MONTHLY_LIMIT,
  formatEur,
  monthlyEquivalentEur,
  priceEur as tierPrice,
  tierLabel,
  type BillingPeriod,
  type SubscriptionTier,
} from "@/lib/subscription";
import { PaymentBadges } from "@/components/LegalFooter";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/predplatne")({
  validateSearch: z.object({
    tier: z.enum(["basic", "premium", "komplet"]).optional(),
    period: z.enum(["monthly", "yearly"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Aktivovať predplatné – Tendrik" },
      {
        name: "description",
        content: "Vyberte si Základ, Prémium s AI alebo Komplet so zákazkami aj grantmi.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PredplatnePage,
});

const TIER_INFO: Record<SubscriptionTier, { title: string; features: string[]; highlight?: boolean }> = {
  basic: {
    title: "Monitoring zákaziek",
    features: [
      "Radary a filtre",
      "Denné e-mailové digesty",
      "Pripomienky pred deadline",
      "TED, ÚVO, EKS a JOSEPHINE",
      "Bez AI a bez grantov",
    ],
  },
  premium: {
    title: "Zákazky + AI analýza",
    highlight: true,
    features: [
      "Všetko zo Základu",
      `${AI_MONTHLY_LIMIT.premium} AI analýz mesačne`,
      "AI analýza spôsobilosti",
      "AI návrh subdodávok a oslovení",
      "TED podmienky štruktúrovane",
    ],
  },
  komplet: {
    title: "Zákazky + granty + AI",
    features: [
      "Všetko z Prémia",
      "Grantové výzvy a radary",
      "AI analýza grantových výziev",
      `${AI_MONTHLY_LIMIT.komplet} AI analýz mesačne`,
      "Prioritná podpora",
    ],
  },
};

function PredplatnePage() {
  const search = Route.useSearch();
  const [tier, setTier] = useState<SubscriptionTier>(search.tier ?? "premium");
  const [period, setPeriod] = useState<BillingPeriod>(search.period ?? "monthly");
  const [loading, setLoading] = useState(false);
  const [env, setEnv] = useState<string | null>(null);
  const [recurringEnabled, setRecurringEnabled] = useState<boolean | null>(null);
  const [autorenew, setAutorenew] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.rpc as any)("get_gopay_recurring_enabled");
      setRecurringEnabled(data === true);
    })();
  }, []);
  const navigate = useNavigate();

  const yearly = period === "yearly";
  // Ročné predplatné je vždy jednorazová platba na 12 mesiacov.
  const canAutorenew = recurringEnabled === true && !yearly;

  async function activate() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gopay-create-subscription", {
        body: { tier, period, autorenew: canAutorenew && autorenew },
      });
      if (error || !data) {
        toast.error("Nepodarilo sa spustiť platbu. " + (error?.message ?? ""));
        return;
      }
      if (data.error === "GOPAY_NOT_CONFIGURED") {
        setEnv(data.env ?? "sandbox");
        toast.error("GoPay kľúče zatiaľ nie sú vyplnené (režim: " + (data.env ?? "sandbox") + ").");
        return;
      }
      if (data.gw_url) {
        window.location.href = data.gw_url;
        return;
      }
      toast.error("GoPay nevrátil URL brány.");
    } catch (e) {
      toast.error("Chyba: " + String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const chargedEur = tierPrice(tier, period);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="eyebrow flex items-center justify-center text-foreground">
        <span className="red-square" aria-hidden="true" />
        Predplatné
      </div>
      <h1 className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight text-center">
        Vyberte si plán
      </h1>
      <p className="mt-3 text-center text-muted-foreground">
        {yearly
          ? "Ročné predplatné: jednorazová platba na 12 mesiacov."
          : recurringEnabled
            ? "Automatické obnovenie cez GoPay, zrušenie kedykoľvek."
            : "Jednorazová platba na 1 mesiac. Pred koncom obdobia vám pošleme pripomienku."}
      </p>

      <div className="mt-6 flex justify-center">
        <div className="inline-flex items-center border-2 border-foreground p-1">
          <button
            type="button"
            onClick={() => setPeriod("monthly")}
            className={`px-4 py-2 text-sm font-semibold ${!yearly ? "bg-foreground text-background" : "text-foreground"}`}
          >
            Mesačne
          </button>
          <button
            type="button"
            onClick={() => setPeriod("yearly")}
            className={`px-4 py-2 text-sm font-semibold ${yearly ? "bg-foreground text-background" : "text-foreground"}`}
          >
            Ročne <span className="text-primary">−2 mesiace</span>
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {(["basic", "premium", "komplet"] as SubscriptionTier[]).map((t) => (
          <TierCard
            key={t}
            selected={tier === t}
            onSelect={() => setTier(t)}
            eyebrow={tierLabel(t)}
            title={TIER_INFO[t].title}
            monthlyEur={yearly ? monthlyEquivalentEur(t) : tierPrice(t, "monthly")}
            note={yearly ? `${formatEur(tierPrice(t, "yearly"))} ročne` : "Konečná cena (neplatca DPH)"}
            highlight={TIER_INFO[t].highlight}
            features={TIER_INFO[t].features}
          />
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-primary" />
          <div className="text-sm">
            <b>Bezpečná platba cez GoPay</b>
            <p className="text-muted-foreground">Visa / Mastercard, 3D Secure.</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <div className="text-sm">
            <div className="text-muted-foreground">Vybraný plán</div>
            <div className="font-display text-lg font-bold">
              Tendrik {tierLabel(tier)} · {yearly ? "ročne" : "mesačne"}
            </div>
          </div>
          <div className="text-right">
            <div className="num text-2xl font-bold">{formatEur(chargedEur)}</div>
            <div className="text-xs text-muted-foreground">
              {yearly ? "konečná cena / 12 mesiacov" : "konečná cena / mes"}
            </div>
          </div>
        </div>

        {canAutorenew && (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <Checkbox checked={autorenew} onCheckedChange={(v) => setAutorenew(v === true)} />
            Automaticky obnovovať každý mesiac
          </label>
        )}

        <PaymentBadges className="mt-4" />
        <Button className="mt-6 w-full" size="lg" onClick={activate} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Pokračovať na platbu
        </Button>
        {env === "sandbox" && (
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Režim: <b>SANDBOX</b> – testovacia prevádzka.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground text-center">
          Kliknutím súhlasíte s{" "}
          <Link to="/pravne/obchodne-podmienky" className="underline">obchodnými podmienkami</Link>
          {canAutorenew && autorenew ? (
            <>
              {" "}a{" "}
              <Link to="/pravne/opakovane-platby" className="underline">opakovanými platbami</Link>
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="mt-8 text-center">
        <Button variant="ghost" onClick={() => navigate({ to: "/dashboard", search: { tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never })}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Späť na dashboard
        </Button>
      </div>
    </div>
  );
}

function TierCard({
  selected, onSelect, eyebrow, title, monthlyEur, note, features, highlight,
}: {
  selected: boolean; onSelect: () => void; eyebrow: string; title: string;
  monthlyEur: number; note: string; features: string[]; highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative text-left rounded-lg border-2 p-6 transition ${
        selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-foreground/40"
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider px-2 py-0.5">
          <Sparkles className="inline h-3 w-3 mr-1" />
          Obsahuje AI
        </span>
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className={`eyebrow ${highlight ? "text-primary" : ""}`}>{eyebrow}</div>
          <div className="mt-1 font-display text-xl font-bold">{title}</div>
        </div>
        <div className={`h-5 w-5 rounded-full border-2 shrink-0 ${selected ? "border-primary bg-primary" : "border-muted-foreground"}`} />
      </div>
      <p className="mt-3 num text-3xl font-bold">
        {formatEur(monthlyEur)} <span className="text-sm font-medium text-muted-foreground">/ mes</span>
      </p>
      <p className="text-xs text-muted-foreground">{note}</p>
      <ul className="mt-4 space-y-1.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}
