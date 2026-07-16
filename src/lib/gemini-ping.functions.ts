import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GEMINI_MODELS, geminiGenerate, geminiUserMessage } from "./gemini.server";

/** Admin-only smoke test: pings all 3 Gemini models with a tiny prompt. */
export const geminiPing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");

    const results: Record<string, { ok: boolean; text?: string; error?: string }> = {};
    for (const [key, model] of Object.entries(GEMINI_MODELS)) {
      try {
        const text = await geminiGenerate(model as any, "Napíš iba slovo: OK", {
          maxOutputTokens: 50,
          disableThinking: true,
          temperature: 0,
        });
        results[key] = { ok: true, text: text.trim().slice(0, 100) };
      } catch (e) {
        results[key] = { ok: false, error: geminiUserMessage(e) };
      }
    }
    return { models: results, keyPresent: !!process.env.GEMINI_API_KEY };
  });
