import { supabase } from "@/integrations/supabase/client";

// Fire-and-forget settings confirmation email. Edge function enforces a
// 30-minute rate limit per user and skips when notifications are disabled.
export async function sendSettingsConfirmationEmail(): Promise<void> {
  try {
    await supabase.functions.invoke("send-settings-confirmation", { body: {} });
  } catch (err) {
    console.warn("send-settings-confirmation failed:", err);
  }
}
