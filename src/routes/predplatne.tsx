import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, Check, Sparkles, ReceiptText, LogIn } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useIsNative } from "@/lib/native";
import { useTranslation, Trans } from "react-i18next";


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

// Fakturačné údaje sa vypĺňajú priamo v checkoute. Predtým sa dali zadať iba
// v Nastaveniach, takže kto zaplatil bez nich, dostal platbu bez faktúry —
// gopay-webhook ju zahodil na billing_details_missing a keď si potom zmazal
// konto, nedala sa vystaviť už vôbec.
type BillingForm = {
  name: string; ico: string; ic_dph: string;
  street: string; city: string; zip: string; country: string; email: string;
};

const EMPTY_BILLING: BillingForm = {
  name: "", ico: "", ic_dph: "", street: "", city: "", zip: "", country: "SK", email: "",
};

function PredplatnePage() {
  const { t } = useTranslation("public");
  const search = Route.useSearch();
  const native = useIsNative();

  const TIER_INFO: Record<SubscriptionTier, { title: string; features: string[]; highlight?: boolean }> = {
    basic: {
      title: t("predplatne.tierTitle.basic"),
      features: t("predplatne.tierFeatures.basic", { returnObjects: true }) as string[],
    },
    premium: {
      title: t("predplatne.tierTitle.premium"),
      highlight: true,
      features: (t("predplatne.tierFeatures.premium", { returnObjects: true, count: AI_MONTHLY_LIMIT.premium }) as string[]),
    },
    komplet: {
      title: t("predplatne.tierTitle.komplet"),
      features: (t("predplatne.tierFeatures.komplet", { returnObjects: true, count: AI_MONTHLY_LIMIT.komplet }) as string[]),
    },
  };
  const [tier, setTier] = useState<SubscriptionTier>(search.tier ?? "premium");
  const [period, setPeriod] = useState<BillingPeriod>(search.period ?? "monthly");
  const [loading, setLoading] = useState(false);
  const [env, setEnv] = useState<string | null>(null);
  const [recurringEnabled, setRecurringEnabled] = useState<boolean | null>(null);
  const [autorenew, setAutorenew] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingForm>(EMPTY_BILLING);
  const [billingLoading, setBillingLoading] = useState(true);


  useEffect(() => {
    (async () => {
      const { data } = await (supabase.rpc as any)("get_gopay_recurring_enabled");
      setRecurringEnabled(data === true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      setUserId(uid);
      if (!uid) { setBillingLoading(false); return; }

      const { data: bd } = await (supabase.from("billing_details" as never) as any)
        .select("name, ico, ic_dph, street, city, zip, country, email")
        .eq("user_id", uid).maybeSingle();
      if (bd) {
        setBilling({
          name: bd.name ?? "", ico: bd.ico ?? "", ic_dph: bd.ic_dph ?? "",
          street: bd.street ?? "", city: bd.city ?? "", zip: bd.zip ?? "",
          country: bd.country ?? "SK", email: bd.email ?? u.user?.email ?? "",
        });
        setBillingLoading(false);
        return;
      }

      // Nový platiaci: predvyplň z firemného profilu, nech neprepisuje to,
      // čo už raz zadal pri onboardingu.
      const { data: cp } = await (supabase.from("company_profile" as never) as any)
        .select("nazov, ico, adresa, mesto, psc")
        .eq("user_id", uid).order("is_default", { ascending: false })
        .limit(1).maybeSingle();
      setBilling((b) => ({
        ...b,
        name: cp?.nazov ?? "",
        ico: cp?.ico ?? "",
        street: cp?.adresa ?? "",
        city: cp?.mesto ?? "",
        zip: cp?.psc ?? "",
        email: u.user?.email ?? "",
      }));
      setBillingLoading(false);
    })();
  }, []);
  const navigate = useNavigate();

  const yearly = period === "yearly";
  // Ročné predplatné je vždy jednorazová platba na 12 mesiacov.
  const canAutorenew = recurringEnabled === true && !yearly;

  if (native) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center safe-top">
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("predplatne.nativeTitle")}</h1>
        <p className="mt-4 text-sm text-muted-foreground">{t("predplatne.nativeNote")}</p>
      </div>
    );
  }



  async function activate() {
    if (!userId) {
      toast.error(t("predplatne.billing.loginRequired"));
      return;
    }
    if (!billingComplete) {
      toast.error(t("predplatne.billing.incomplete"));
      return;
    }
    setLoading(true);
    try {
      // Uložiť treba ešte pred presmerovaním na bránu — faktúru vystavuje
      // webhook hneď po zaplatení a číta si ju z tejto tabuľky.
      const { error: billingErr } = await (supabase.from("billing_details" as never) as any)
        .upsert({
          user_id: userId,
          name: billing.name.trim(),
          ico: billing.ico.trim() || null,
          ic_dph: billing.ic_dph.trim() || null,
          street: billing.street.trim() || null,
          city: billing.city.trim() || null,
          zip: billing.zip.trim() || null,
          country: (billing.country || "SK").trim().toUpperCase(),
          email: billing.email.trim(),
        }, { onConflict: "user_id" });
      if (billingErr) {
        toast.error(t("predplatne.billing.saveError", { message: billingErr.message }));
        return;
      }

      const { data, error } = await supabase.functions.invoke("gopay-create-subscription", {
        body: { tier, period, autorenew: canAutorenew && autorenew },
      });
      if (error || !data) {
        toast.error(t("predplatne.toastInvokeError", { message: error?.message ?? "" }));
        return;
      }
      if (data.error === "BILLING_DETAILS_MISSING") {
        toast.error(t("predplatne.billing.incomplete"));
        return;
      }
      if (data.error === "GOPAY_NOT_CONFIGURED") {
        setEnv(data.env ?? "sandbox");
        toast.error(t("predplatne.toastNotConfigured", { env: data.env ?? "sandbox" }));
        return;
      }
      if (data.gw_url) {
        window.location.href = data.gw_url;
        return;
      }
      toast.error(t("predplatne.toastNoUrl"));
    } catch (e) {
      toast.error(t("predplatne.toastGenericError", { message: String((e as Error).message ?? e) }));
    } finally {
      setLoading(false);
    }
  }

  const chargedEur = tierPrice(tier, period);
  // Odhlásenému nemá zmysel pýtať fakturačné údaje – aj tak by uložením
  // neprešiel, RLS ich viaže na auth.uid(). Dostane rovno prihlásenie.
  const loggedOut = !billingLoading && !userId;
  const billingComplete = billing.name.trim().length > 1
    && billing.email.includes("@")
    && billing.street.trim().length > 1
    && billing.city.trim().length > 1
    && billing.zip.trim().length > 3;
  const setB = (k: keyof BillingForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setBilling((b) => ({ ...b, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="eyebrow flex items-center justify-center text-foreground">
        <span className="red-square" aria-hidden="true" />
        {t("predplatne.eyebrow")}
      </div>
      <h1 className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight text-center">
        {t("predplatne.heading")}
      </h1>
      <p className="mt-3 text-center text-muted-foreground">
        {yearly
          ? t("predplatne.yearlyNote")
          : recurringEnabled
            ? t("predplatne.recurringNote")
            : t("predplatne.onetimeNote")}
      </p>

      <div className="mt-6 flex justify-center">
        <div className="inline-flex items-center border-2 border-foreground p-1">
          <button
            type="button"
            onClick={() => setPeriod("monthly")}
            className={`px-4 py-2 text-sm font-semibold ${!yearly ? "bg-foreground text-background" : "text-foreground"}`}
          >
            {t("predplatne.periodMonthly")}
          </button>
          <button
            type="button"
            onClick={() => setPeriod("yearly")}
            className={`px-4 py-2 text-sm font-semibold ${yearly ? "bg-foreground text-background" : "text-foreground"}`}
          >
            {t("predplatne.periodYearly")} <span className="text-primary">{t("predplatne.periodYearlyDiscount")}</span>
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {(["basic", "premium", "komplet"] as SubscriptionTier[]).map((tv) => (
          <TierCard
            key={tv}
            selected={tier === tv}
            onSelect={() => setTier(tv)}
            eyebrow={tierLabel(tv)}
            title={TIER_INFO[tv].title}
            monthlyEur={yearly ? monthlyEquivalentEur(tv) : tierPrice(tv, "monthly")}
            note={yearly ? t("predplatne.yearlyEurNote", { price: formatEur(tierPrice(tv, "yearly")) }) : t("predplatne.monthlyFinalNote")}
            highlight={TIER_INFO[tv].highlight}
            features={TIER_INFO[tv].features}
            aiBadgeLabel={t("predplatne.aiBadge")}
            priceSuffix={t("predplatne.priceSuffixMonth")}
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
            <div className="text-muted-foreground">{t("predplatne.selectedPlanLabel")}</div>
            <div className="font-display text-lg font-bold">
              Tendrik {tierLabel(tier)} · {yearly ? t("predplatne.planYearly") : t("predplatne.planMonthly")}
            </div>
          </div>
          <div className="text-right">
            <div className="num text-2xl font-bold">{formatEur(chargedEur)}</div>
            <div className="text-xs text-muted-foreground">
              {yearly ? t("predplatne.chargedYearlyNote") : t("predplatne.chargedMonthlyNote")}
            </div>
          </div>
        </div>

        {canAutorenew && (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <Checkbox checked={autorenew} onCheckedChange={(v) => setAutorenew(v === true)} />
            {t("predplatne.autorenewCheckbox")}
          </label>
        )}

        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            {loggedOut ? <LogIn className="h-5 w-5 text-primary" /> : <ReceiptText className="h-5 w-5 text-primary" />}
            <div className="text-sm">
              <b>{loggedOut ? t("predplatne.billing.loginTitle") : t("predplatne.billing.heading")}</b>
              <p className="text-muted-foreground">
                {loggedOut ? t("predplatne.billing.loginNote") : t("predplatne.billing.note")}
              </p>
            </div>
          </div>

          {billingLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("predplatne.billing.loading")}</p>
          ) : loggedOut ? null : (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>{t("predplatne.billing.name")} *</Label>
                <Input value={billing.name} onChange={setB("name")} />
              </div>
              <div>
                <Label>{t("predplatne.billing.ico")}</Label>
                <Input value={billing.ico} onChange={setB("ico")} />
              </div>
              <div>
                <Label>{t("predplatne.billing.icDph")}</Label>
                <Input value={billing.ic_dph} onChange={setB("ic_dph")} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("predplatne.billing.street")} *</Label>
                <Input value={billing.street} onChange={setB("street")} />
              </div>
              <div>
                <Label>{t("predplatne.billing.city")} *</Label>
                <Input value={billing.city} onChange={setB("city")} />
              </div>
              <div>
                <Label>{t("predplatne.billing.zip")} *</Label>
                <Input value={billing.zip} onChange={setB("zip")} />
              </div>
              <div>
                <Label>{t("predplatne.billing.country")}</Label>
                <Input value={billing.country} onChange={setB("country")} />
              </div>
              <div>
                <Label>{t("predplatne.billing.email")} *</Label>
                <Input value={billing.email} onChange={setB("email")} />
              </div>
            </div>
          )}
        </div>

        <PaymentBadges className="mt-4" />
        {loggedOut ? (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link to="/auth" search={{ mode: "login" } as never} className="flex-1">
              <Button className="w-full" size="lg">{t("predplatne.billing.loginCta")}</Button>
            </Link>
            <Link to="/auth" search={{ mode: "signup" } as never} className="flex-1">
              <Button className="w-full" size="lg" variant="outline">{t("predplatne.billing.signupCta")}</Button>
            </Link>
          </div>
        ) : (
          <Button className="mt-6 w-full" size="lg" onClick={activate} disabled={loading || billingLoading || !billingComplete}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t("predplatne.submit")}
          </Button>
        )}
        {!billingLoading && !loggedOut && !billingComplete && (
          <p className="mt-3 text-xs text-destructive text-center">
            {t("predplatne.billing.incomplete")}
          </p>
        )}
        {env === "sandbox" && (
          <p className="mt-3 text-xs text-muted-foreground text-center">
            <Trans i18nKey="predplatne.sandboxNote" ns="public" components={{ b: <b /> }} />
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground text-center">
          <Trans
            i18nKey="predplatne.agreementNote"
            ns="public"
            components={{ terms: <Link to="/pravne/obchodne-podmienky" className="underline" /> }}
          />
          {canAutorenew && autorenew ? (
            <Trans
              i18nKey="predplatne.agreementNoteRecurring"
              ns="public"
              components={{ recurring: <Link to="/pravne/opakovane-platby" className="underline" /> }}
            />
          ) : null}
          .
        </p>
      </div>

      <div className="mt-8 text-center">
        <Button variant="ghost" onClick={() => navigate({ to: "/dashboard", search: { tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never })}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("predplatne.backToDashboard")}
        </Button>
      </div>
    </div>
  );
}

function TierCard({
  selected, onSelect, eyebrow, title, monthlyEur, note, features, highlight, aiBadgeLabel, priceSuffix,
}: {
  selected: boolean; onSelect: () => void; eyebrow: string; title: string;
  monthlyEur: number; note: string; features: string[]; highlight?: boolean;
  aiBadgeLabel?: string; priceSuffix?: string;
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
          {aiBadgeLabel}
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
        {formatEur(monthlyEur)} <span className="text-sm font-medium text-muted-foreground">{priceSuffix}</span>
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
