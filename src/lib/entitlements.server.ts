// Prístup k AI funkciám na serveri. Jediný zdroj pravdy je RPC
// get_entitlements() — rovnaká funkcia, akú používa klient
// (src/hooks/use-entitlements.ts).
//
// Predtým si každá server funkcia porovnávala subscription_tier sama.
// Keď pribudol balík Komplet, upravila sa len analýza zákaziek; granty
// a subdodávky ostali na `tier === "premium"`, takže platiaci zákazník
// s Kompletom dostal hlášku, nech si kúpi Prémium.

type Entitlements = {
  status: string;
  tier: string;
  can_ai: boolean;
  can_grants: boolean;
};

export type AiAccess = { status: string; tier: string };

export async function requireAiAccess(
  context: {
    supabase: { rpc: (fn: "get_entitlements") => PromiseLike<{ data: unknown; error: unknown }> };
  },
  kind: "tender" | "grant",
): Promise<AiAccess> {
  const { data, error } = await context.supabase.rpc("get_entitlements");
  const ent = (error ? null : (data as Entitlements | null)) ?? null;

  // Keď RPC zlyhá, používateľa nezablokujeme. O prístupe aj o kvóte
  // rozhodne consume_ai_credit* v tej istej databáze o pár riadkov nižšie.
  if (!ent) return { status: "trial", tier: "basic" };

  if (ent.status === "expired") {
    throw new Error("AI analýza je dostupná len s aktívnym predplatným.");
  }
  if (!ent.can_ai) {
    throw new Error(
      "AI analýza je súčasťou balíkov Prémium a Komplet. Upgradnite predplatné na /cennik a odomknite ju.",
    );
  }
  if (kind === "grant" && !ent.can_grants) {
    throw new Error(
      "AI analýza grantov je súčasťou balíka Komplet. Upgradnite predplatné na /cennik.",
    );
  }

  return { status: ent.status, tier: ent.tier };
}
