// Shared helpers for the 2-month trial + 4.99 €/mes subscription model.
// Real billing isn't wired yet — this only tracks the trial window.

export type SubscriptionStatus = "trial" | "active" | "expired";

export const TRIAL_DAYS = 60;
export const MONTHLY_PRICE_EUR = 4.99;

export type SubscriptionInfo = {
  status: SubscriptionStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  /** Days remaining in trial (0 once expired). Only meaningful when status='trial'. */
  daysLeft: number;
  /** True when the user should be blocked from tender content. */
  isLocked: boolean;
  /** True when we should highlight the countdown (last week). */
  isEndingSoon: boolean;
};

export function computeSubscription(row: {
  trial_started_at?: string | null;
  subscription_status?: SubscriptionStatus | string | null;
} | null | undefined): SubscriptionInfo {
  const status = (row?.subscription_status as SubscriptionStatus) ?? "trial";
  const startedAt = row?.trial_started_at ? new Date(row.trial_started_at) : null;
  const endsAt = startedAt
    ? new Date(startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const msLeft = endsAt ? endsAt.getTime() - Date.now() : 0;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  const isLocked = status === "expired";
  const isEndingSoon = status === "trial" && daysLeft <= 7;
  return {
    status: (status === "trial" || status === "active" || status === "expired")
      ? status
      : "trial",
    trialStartedAt: startedAt,
    trialEndsAt: endsAt,
    daysLeft,
    isLocked,
    isEndingSoon,
  };
}

export function formatEur(n: number): string {
  return n.toFixed(2).replace(".", ",") + " €";
}
