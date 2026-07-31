// Jediný zdroj pravdy pre ceny predplatného na strane edge funkcií.
// Musí zostať v súlade s src/lib/subscription.ts.
// Tobify s.r.o. nie je platca DPH – sumy sú konečné.

export type Tier = "basic" | "premium" | "komplet";
export type Period = "monthly" | "yearly";

export const PRICES_CENTS: Record<Tier, Record<Period, number>> = {
  basic: { monthly: 499, yearly: 4900 },
  premium: { monthly: 1499, yearly: 14900 },
  komplet: { monthly: 2499, yearly: 24900 },
};

export const AI_MONTHLY_LIMIT: Record<Tier, number> = {
  basic: 0,
  premium: 30,
  komplet: 150,
};

export function normalizeTier(t: unknown): Tier {
  return t === "premium" || t === "komplet" ? t : "basic";
}
export function normalizePeriod(p: unknown): Period {
  return p === "yearly" ? "yearly" : "monthly";
}
export function priceCents(tier: Tier, period: Period): number {
  return PRICES_CENTS[tier][period];
}
export function tierLabel(t: Tier): string {
  return t === "premium" ? "Prémium" : t === "komplet" ? "Komplet" : "Základ";
}
export function periodLabel(p: Period): string {
  return p === "yearly" ? "ročné" : "mesačné";
}

/** Fallback mapa suma(centy) -> tier+obdobie pre opakované platby bez parametrov. */
const AMOUNT_MAP: Record<number, { tier: Tier; period: Period }> = {
  499: { tier: "basic", period: "monthly" },
  4900: { tier: "basic", period: "yearly" },
  1499: { tier: "premium", period: "monthly" },
  14900: { tier: "premium", period: "yearly" },
  2499: { tier: "komplet", period: "monthly" },
  24900: { tier: "komplet", period: "yearly" },
};

export function tierFromAmount(amountCents: number): { tier: Tier; period: Period } | null {
  return AMOUNT_MAP[Number(amountCents)] ?? null;
}
