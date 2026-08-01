import { supabase } from "@/integrations/supabase/client";
import { isNative, nativePlatform } from "@/lib/native";

export type PushStatus = "granted" | "denied" | "prompt" | "unsupported";

async function plugin() {
  const mod = await import("@capacitor/push-notifications");
  return mod.PushNotifications;
}

/** Aktuálny stav povolenia bez vyžiadania promptu. */
export async function getPushStatus(): Promise<PushStatus> {
  if (!isNative()) return "unsupported";
  try {
    const PushNotifications = await plugin();
    const res = await PushNotifications.checkPermissions();
    if (res.receive === "granted") return "granted";
    if (res.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unsupported";
  }
}

/** Vyžiada povolenie, zaregistruje zariadenie a uloží FCM/APNs token. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isNative()) return { ok: false, reason: "unsupported" };
  const PushNotifications = await plugin();

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return { ok: false, reason: "denied" };

  const token = await new Promise<string | null>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, 15000);

    PushNotifications.addListener("registration", (t) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(t.value);
    });
    PushNotifications.addListener("registrationError", () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(null);
    });
    PushNotifications.register();
  });

  if (!token) return { ok: false, reason: "no_token" };

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, reason: "not_authenticated" };

  const platform = nativePlatform();
  if (platform === "web") return { ok: false, reason: "unsupported" };

  const { error } = await supabase
    .from("push_tokens" as never)
    .upsert(
      {
        user_id: u.user.id,
        token,
        platform,
        last_used_at: new Date().toISOString(),
      } as never,
      { onConflict: "token" },
    );
  if (error) return { ok: false, reason: error.message };

  try {
    window.localStorage.setItem("tendrik_push_token", token);
  } catch {
    /* ignore */
  }
  return { ok: true };
}

/** Odstráni uložené tokeny tohto zariadenia. */
export async function disablePush(): Promise<void> {
  if (!isNative()) return;
  let token: string | null = null;
  try {
    token = window.localStorage.getItem("tendrik_push_token");
  } catch {
    /* ignore */
  }
  const q = supabase.from("push_tokens" as never).delete();
  if (token) {
    await (q as never as { eq: (c: string, v: string) => Promise<unknown> }).eq("token", token);
  } else {
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await (q as never as { eq: (c: string, v: string) => Promise<unknown> }).eq(
        "user_id",
        u.user.id,
      );
    }
  }
  try {
    const PushNotifications = await plugin();
    await PushNotifications.removeAllListeners();
    window.localStorage.removeItem("tendrik_push_token");
  } catch {
    /* ignore */
  }
}

/** Má tento používateľ na tomto zariadení uložený token? */
export async function hasStoredToken(): Promise<boolean> {
  if (!isNative()) return false;
  let token: string | null = null;
  try {
    token = window.localStorage.getItem("tendrik_push_token");
  } catch {
    return false;
  }
  if (!token) return false;
  const { data } = await supabase
    .from("push_tokens" as never)
    .select("id")
    .eq("token", token)
    .maybeSingle();
  return !!data;
}

/**
 * Zaregistruje handler pre klik na notifikáciu.
 * Otvorí konkrétnu zákazku / grant, nie dashboard.
 */
export async function attachPushNavigation(navigate: (path: string) => void) {
  if (!isNative()) return () => {};
  try {
    const PushNotifications = await plugin();
    const handle = await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const raw = (action.notification.data ?? {}) as Record<string, unknown>;
        const path = typeof raw.path === "string" ? raw.path : null;
        const tenderId = typeof raw.tender_id === "string" ? raw.tender_id : null;
        const grantId = typeof raw.grant_id === "string" ? raw.grant_id : null;
        if (tenderId) navigate(`/zakazka/${tenderId}`);
        else if (grantId) navigate(`/grant/${grantId}`);
        else if (path) navigate(path);
      },
    );
    return () => {
      handle.remove();
    };
  } catch {
    return () => {};
  }
}
