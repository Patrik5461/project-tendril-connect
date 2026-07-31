// Shared helpers for the 30-day trial + Základ/Prémium/Komplet subscription model.
// Jediný zdroj pravdy pre ceny a limity vo frontende.

export type SubscriptionStatus = "trial" | "active" | "expired";
export type SubscriptionTier = "basic" | "premium" | "komplet";
export type BillingPeriod = "monthly" | "yearly";

export const TRIAL_DAYS = 30;
export const TRIAL_AI_ANALYSES = 5;

/** Ceny v centoch. Tobify s.r.o. nie je platca DPH – sumy sú konečné. */
export const PRICES_CENTS: Record<SubscriptionTier, Record<BillingPeriod, number>> = {
  basic: { monthly: 499, yearly: 4900 },
  premium: { monthly: 1499, yearly: 14900 },
  komplet: { monthly: 2499, yearly: 24900 },
};

/** Mesačný limit AI analýz (zákazky + granty spolu). */
export const AI_MONTHLY_LIMIT: Record<SubscriptionTier, number> = {
  basic: 0,
  premium: 30,
  komplet: 150,
};

export const TIERS: SubscriptionTier[] = ["basic", "premium", "komplet"];

// Legacy aliasy (spätná kompatibilita)
export const PRICE_BASIC_EUR = PRICES_CENTS.basic.monthly / 100;
export const PRICE_PREMIUM_EUR = PRICES_CENTS.premium.monthly / 100;
export const PRICE_KOMPLET_EUR = PRICES_CENTS.komplet.monthly / 100;
export const MONTHLY_PRICE_EUR = PRICE_BASIC_EUR;
export const PRICE_BASIC_GROSS_EUR = PRICE_BASIC_EUR;
export const PRICE_PREMIUM_GROSS_EUR = PRICE_PREMIUM_EUR;
export const PRICE_BASIC_CENTS = PRICES_CENTS.basic.monthly;
export const PRICE_PREMIUM_CENTS = PRICES_CENTS.premium.monthly;

export function normalizeTier(t: string | null | undefined): SubscriptionTier {
  return t === "premium" || t === "komplet" ? t : "basic";
}
export function normalizePeriod(p: string | null | undefined): BillingPeriod {
  return p === "yearly" ? "yearly" : "monthly";
}
export function tierLabel(t: SubscriptionTier | string | null | undefined): string {
  return t === "premium" ? "Prémium" : t === "komplet" ? "Komplet" : "Základ";
}
export function periodLabel(p: BillingPeriod): string {
  return p === "yearly" ? "ročné" : "mesačné";
}
export function priceCents(t: SubscriptionTier, p: BillingPeriod = "monthly"): number {
  return PRICES_CENTS[normalizeTier(t)][normalizePeriod(p)];
}
export function priceEur(t: SubscriptionTier, p: BillingPeriod = "monthly"): number {
  return priceCents(t, p) / 100;
}
/** Prepočet ročnej ceny na mesiac. */
export function monthlyEquivalentEur(t: SubscriptionTier): number {
  return PRICES_CENTS[normalizeTier(t)].yearly / 12 / 100;
}
export function aiMonthlyLimit(t: SubscriptionTier | string | null | undefined): number {
  return AI_MONTHLY_LIMIT[normalizeTier(t as string)];
}

// Legacy
export function tierPriceEur(t: SubscriptionTier): number {
  return priceEur(t, "monthly");
}
export function tierPriceGrossEur(t: SubscriptionTier): number {
  return tierPriceEur(t);
}
export function tierPriceCents(t: SubscriptionTier): number {
  return priceCents(t, "monthly");
}

export type SubscriptionInfo = {
  status: SubscriptionStatus;
  tier: SubscriptionTier;
  period: BillingPeriod;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  daysLeft: number;
  isLocked: boolean;
  isEndingSoon: boolean;
  /** True keď má užívateľ prístup k AI (trial vždy, active pre premium/komplet). */
  hasAiAccess: boolean;
  /** Prístup ku grantom: trial alebo aktívny Komplet. */
  hasGrantAccess: boolean;
  /** Mesačný limit AI analýz pre daný tier (trial = 5 spolu). */
  aiLimit: number;
};

export function computeSubscription(row: {
  trial_started_at?: string | null;
  subscription_status?: SubscriptionStatus | string | null;
  subscription_tier?: SubscriptionTier | string | null;
  billing_period?: string | null;
} | null | undefined): SubscriptionInfo {
  const rawStatus = (row?.subscription_status as SubscriptionStatus) ?? "trial";
  const status: SubscriptionStatus =
    rawStatus === "trial" || rawStatus === "active" || rawStatus === "expired" ? rawStatus : "trial";
  const tier = normalizeTier(row?.subscription_tier as string);
  const period = normalizePeriod(row?.billing_period);
  const startedAt = row?.trial_started_at ? new Date(row.trial_started_at) : null;
  const endsAt = startedAt
    ? new Date(startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const msLeft = endsAt ? endsAt.getTime() - Date.now() : 0;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  const isLocked = status === "expired";
  const isEndingSoon = status === "trial" && daysLeft <= 7;
  const hasAiAccess = status === "trial" || (status === "active" && aiMonthlyLimit(tier) > 0);
  const hasGrantAccess = status === "trial" || (status === "active" && tier === "komplet");
  const aiLimit = status === "trial" ? TRIAL_AI_ANALYSES : aiMonthlyLimit(tier);
  return {
    status, tier, period, trialStartedAt: startedAt, trialEndsAt: endsAt, daysLeft,
    isLocked, isEndingSoon, hasAiAccess, hasGrantAccess, aiLimit,
  };
}

export function formatEur(n: number): string {
  return n.toFixed(2).replace(".", ",") + " €";
}
