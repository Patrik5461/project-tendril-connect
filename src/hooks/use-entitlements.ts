import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Jediný zdroj pravdy pre prístup k funkciám (granty, AI).
 * NIKDY nerozhodujeme podľa subscription_tier / subscription_status na klientovi.
 */
export type Entitlements = {
  status: string;
  tier: string;
  effective_tier: string;
  can_monitoring: boolean;
  can_ai: boolean;
  can_grants: boolean;
  ai_limit: number;
  ai_used: number;
  ai_remaining: number;
  ai_scope: string;
};

export async function fetchEntitlements(): Promise<Entitlements | null> {
  const { data, error } = await supabase.rpc("get_entitlements");
  if (error || !data) return null;
  return data as unknown as Entitlements;
}

export function useEntitlements() {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (!cancelled) { setEntitlements(null); setLoading(false); }
        return;
      }
      const ent = await fetchEntitlements();
      if (!cancelled) { setEntitlements(ent); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return { entitlements, loading, setEntitlements };
}
