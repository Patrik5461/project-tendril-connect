// Zruší opakovanú platbu (recurring) v GoPay pre prihláseného používateľa.
// Prístup zostáva do konca zaplateného obdobia (subscription_valid_until).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, getGoPayToken, gopayConfig } from "../_shared/gopay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userRes.user;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: pref } = await admin
      .from("user_preferences")
      .select("gopay_recurrence_id, subscription_valid_until")
      .eq("user_id", user.id).maybeSingle();

    const recurrenceId = pref?.gopay_recurrence_id;
    let gopayResult: unknown = null;

    const cfg = gopayConfig();
    if (recurrenceId && cfg.configured) {
      const token = await getGoPayToken("payment-all");
      const res = await fetch(`${cfg.baseUrl}/api/payments/payment/${recurrenceId}/void-recurrence`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      gopayResult = await res.json().catch(() => ({ ok: res.ok }));
    }

    await admin.from("user_preferences").update({
      subscription_cancel_requested_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    return new Response(JSON.stringify({
      ok: true,
      valid_until: pref?.subscription_valid_until ?? null,
      gopay: gopayResult,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
