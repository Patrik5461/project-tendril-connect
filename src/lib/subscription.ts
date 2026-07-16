// Shared helpers for the 2-month trial + Základ/Prémium subscription model.

export type SubscriptionStatus = "trial" | "active" | "expired";
export type SubscriptionTier = "basic" | "premium";

export const TRIAL_DAYS = 60;
export const MONTHLY_PRICE_EUR = 4.99;       // legacy alias (Základ)
export const PRICE_BASIC_EUR = 4.99;
export const PRICE_PREMIUM_EUR = 15.0;
export const PRICE_BASIC_GROSS_EUR = 6.14;   // 4,99 + 23 % DPH
export const PRICE_PREMIUM_GROSS_EUR = 18.45; // 15 + 23 % DPH
export const PRICE_BASIC_CENTS = 614;
export const PRICE_PREMIUM_CENTS = 1845;

export function tierLabel(t: SubscriptionTier | string | null | undefined): string {
  return t === "premium" ? "Prémium" : "Základ";
}
export function tierPriceEur(t: SubscriptionTier): number {
  return t === "premium" ? PRICE_PREMIUM_EUR : PRICE_BASIC_EUR;
}
export function tierPriceGrossEur(t: SubscriptionTier): number {
  return t === "premium" ? PRICE_PREMIUM_GROSS_EUR : PRICE_BASIC_GROSS_EUR;
}
export function tierPriceCents(t: SubscriptionTier): number {
  return t === "premium" ? PRICE_PREMIUM_CENTS : PRICE_BASIC_CENTS;
}

export type SubscriptionInfo = {
  status: SubscriptionStatus;
  tier: SubscriptionTier;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  daysLeft: number;
  isLocked: boolean;
  isEndingSoon: boolean;
  /** True keď má užívateľ prístup k AI (trial vždy, active iba pre premium tier). */
  hasAiAccess: boolean;
};

export function computeSubscription(row: {
  trial_started_at?: string | null;
  subscription_status?: SubscriptionStatus | string | null;
  subscription_tier?: SubscriptionTier | string | null;
} | null | undefined): SubscriptionInfo {
  const rawStatus = (row?.subscription_status as SubscriptionStatus) ?? "trial";
  const status: SubscriptionStatus =
    rawStatus === "trial" || rawStatus === "active" || rawStatus === "expired" ? rawStatus : "trial";
  const rawTier = (row?.subscription_tier as SubscriptionTier) ?? "basic";
  const tier: SubscriptionTier = rawTier === "premium" ? "premium" : "basic";
  const startedAt = row?.trial_started_at ? new Date(row.trial_started_at) : null;
  const endsAt = startedAt
    ? new Date(startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const msLeft = endsAt ? endsAt.getTime() - Date.now() : 0;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  const isLocked = status === "expired";
  const isEndingSoon = status === "trial" && daysLeft <= 7;
  const hasAiAccess = status === "trial" || (status === "active" && tier === "premium");
  return { status, tier, trialStartedAt: startedAt, trialEndsAt: endsAt, daysLeft, isLocked, isEndingSoon, hasAiAccess };
}

export function formatEur(n: number): string {
  return n.toFixed(2).replace(".", ",") + " €";
}
