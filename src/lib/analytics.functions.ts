import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getGa4Overview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => ({
    days: Math.min(Math.max(Math.round(input?.days ?? 28), 1), 365),
  }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !isAdmin) throw new Error("Forbidden");

    const configured =
      !!process.env.GA4_PROPERTY_ID &&
      !!process.env.GOOGLE_SA_CLIENT_EMAIL &&
      !!process.env.GOOGLE_SA_PRIVATE_KEY;
    if (!configured) {
      return {
        ok: false as const,
        configured: false,
        error:
          "Prepojenie s GA4 Data API ešte nie je nastavené (chýba service account alebo Property ID).",
      };
    }

    try {
      const { fetchGa4Overview } = await import("@/lib/ga4.server");
      const overview = await fetchGa4Overview(data.days);
      return { ok: true as const, configured: true, overview };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[ga4] overview failed:", message);
      return { ok: false as const, configured: true, error: message };
    }
  });
