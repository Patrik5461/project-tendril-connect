// Zdieľané kódovanie chyby prekročenej kvóty AI analýz medzi serverom a UI.

export type AiQuotaError = {
  error: "ai_quota_exceeded";
  used: number;
  limit: number;
  tier: string;
  status?: string;
  scope?: "trial" | "monthly" | "none";
};

const PREFIX = "AI_QUOTA_EXCEEDED:";

export function encodeQuotaError(e: AiQuotaError): string {
  return PREFIX + JSON.stringify(e);
}

/** Vráti detail kvóty, ak ide o quota chybu; inak null. */
export function parseQuotaError(err: unknown): AiQuotaError | null {
  const msg = typeof err === "string" ? err : (err as Error)?.message ?? "";
  const i = msg.indexOf(PREFIX);
  if (i < 0) return null;
  try {
    return JSON.parse(msg.slice(i + PREFIX.length)) as AiQuotaError;
  } catch {
    return null;
  }
}

/** Navrhne vyšší tier pre upsell. */
export function suggestedTier(tier: string): "premium" | "komplet" {
  return tier === "premium" || tier === "komplet" ? "komplet" : "premium";
}
