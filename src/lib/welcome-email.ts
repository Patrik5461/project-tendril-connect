import { supabase } from "@/integrations/supabase/client";

// Fire-and-forget welcome email. Edge function is idempotent — it only ever
// sends once per user thanks to an atomic flip of welcome_email_sent.
export async function sendWelcomeEmailIfNeeded(): Promise<void> {
  try {
    await supabase.functions.invoke("send-welcome-email", { body: {} });
  } catch (err) {
    // Never surface to the user — welcome email is a nice-to-have.
    console.warn("send-welcome-email failed:", err);
  }
}
