// Natívne push notifikácie.
//   Android → Firebase Cloud Messaging HTTP v1
//             Secret: FCM_SERVICE_ACCOUNT_JSON (celý JSON servisného účtu).
//   iOS     → APNs priamo (token-based auth, .p8 kľúč)
//             Secrets: APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID,
//                      APNS_BUNDLE_ID (default sk.tendrik.app),
//                      APNS_ENV ("production" | "sandbox", default production).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PushRequest = {
  user_ids?: string[];
  user_id?: string;
  title: string;
  body: string;
  /** In-app cesta, ktorá sa otvorí po kliknutí (napr. /zakazka/<uuid>). */
  path?: string;
  /**
   * Číslo na odznaku ikony (iOS). Posiela sa spolu s notifikáciou; appka ho
   * vynuluje sama, keď ju používateľ otvorí (AppDelegate). 0 odznak skryje.
   */
  badge?: number;
  data?: Record<string, string>;
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`)),
  );
  const jwt = `${header}.${claim}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`FCM_AUTH_FAILED: ${res.status} ${await res.text()}`);
  const j = await res.json();
  cachedToken = { token: j.access_token as string, exp: now + 3300 };
  return cachedToken.token;
}

// ── APNs (iOS) ────────────────────────────────────────────────────────────────

type ApnsConfig = {
  keyP8: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  host: string;
};

const APNS_PRODUCTION_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";

function apnsConfig(): ApnsConfig | null {
  const keyP8 = Deno.env.get("APNS_KEY_P8");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  if (!keyP8 || !keyId || !teamId) return null;
  return {
    // Secret sa dá vložiť aj s "\n" namiesto skutočných riadkov.
    keyP8: keyP8.replace(/\\n/g, "\n"),
    keyId,
    teamId,
    bundleId: Deno.env.get("APNS_BUNDLE_ID") ?? "sk.tendrik.app",
    // Prvý pokus; pri BadDeviceToken sa automaticky skúsi to druhé.
    host: Deno.env.get("APNS_ENV") === "sandbox" ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST,
  };
}

// Apple odmieta tokeny staršie ako hodinu a zároveň zakazuje generovať nový
// častejšie ako raz za 20 minút — obnovujeme po 45 minútach.
let cachedApnsJwt: { token: string; iat: number } | null = null;

async function getApnsJwt(cfg: ApnsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedApnsJwt && now - cachedApnsJwt.iat < 45 * 60) return cachedApnsJwt.token;

  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claim = b64url(JSON.stringify({ iss: cfg.teamId, iat: now }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(cfg.keyP8),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto vracia podpis rovno v raw r||s formáte, ktorý JWS očakáva.
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(`${header}.${claim}`),
    ),
  );
  const jwt = `${header}.${claim}.${b64url(sig)}`;
  cachedApnsJwt = { token: jwt, iat: now };
  return jwt;
}

async function sendApns(
  cfg: ApnsConfig,
  tokens: { id: string; token: string }[],
  req: PushRequest,
): Promise<{ ok: string[]; stale: string[] }> {
  const jwt = await getApnsJwt(cfg);
  // Vlastné kľúče idú na najvyššiu úroveň vedľa `aps` — klient ich číta
  // v pushNotificationActionPerformed cez notification.data.
  const payload = JSON.stringify({
    ...(req.data ?? {}),
    ...(req.path ? { path: req.path } : {}),
    aps: {
      alert: { title: req.title, body: req.body },
      sound: "default",
      ...(typeof req.badge === "number" ? { badge: req.badge } : {}),
    },
  });

  const post = (host: string, token: string) =>
    fetch(`${host}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": cfg.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: payload,
    });

  const otherHost =
    cfg.host === APNS_PRODUCTION_HOST ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;

  const ok: string[] = [];
  const stale: string[] = [];

  for (const t of tokens) {
    let r = await post(cfg.host, t.token);
    let text = r.ok ? "" : await r.text();

    // BadDeviceToken znamená aj token z opačného prostredia — zariadenie
    // s debug buildom z Xcode má sandbox token, TestFlight/App Store
    // produkčný. Skúsime teda ešte druhý host, nech fungujú obe naraz.
    if (!r.ok && text.includes("BadDeviceToken")) {
      r = await post(otherHost, t.token);
      text = r.ok ? "" : await r.text();
    }

    if (r.ok) {
      ok.push(t.id);
      continue;
    }
    // 410 Unregistered = appka odinštalovaná; BadDeviceToken po oboch
    // pokusoch = token je neplatný.
    if (
      r.status === 410 ||
      text.includes("BadDeviceToken") ||
      text.includes("DeviceTokenNotForTopic") ||
      text.includes("Unregistered")
    ) {
      stale.push(t.id);
    } else {
      console.error("[send-push:apns]", r.status, text);
    }
  }

  return { ok, stale };
}

// ── FCM (Android) ─────────────────────────────────────────────────────────────

async function sendFcm(
  tokens: { id: string; token: string }[],
  req: PushRequest,
): Promise<{ ok: string[]; stale: string[] }> {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    console.error("[send-push:fcm] FCM_NOT_CONFIGURED");
    return { ok: [], stale: [] };
  }
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };

  const accessToken = await getAccessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const ok: string[] = [];
  const stale: string[] = [];

  for (const t of tokens) {
    const payload = {
      message: {
        token: t.token,
        notification: { title: req.title, body: req.body },
        data: { ...(req.data ?? {}), ...(req.path ? { path: req.path } : {}) },
        android: { priority: "HIGH" },
      },
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      ok.push(t.id);
      continue;
    }
    const text = await r.text();
    if (r.status === 404 || text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) {
      stale.push(t.id);
    } else {
      console.error("[send-push:fcm]", r.status, text);
    }
  }

  return { ok, stale };
}

// ── Verejné API ───────────────────────────────────────────────────────────────

export async function sendPush(req: PushRequest) {
  const userIds = req.user_ids ?? (req.user_id ? [req.user_id] : []);
  if (userIds.length === 0) return { sent: 0 };

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("id, token, user_id, platform")
    .in("user_id", userIds);
  if (!tokens || tokens.length === 0) return { sent: 0 };

  const ios = tokens.filter((t) => t.platform === "ios");
  const android = tokens.filter((t) => t.platform !== "ios");

  const delivered: string[] = [];
  const stale: string[] = [];

  if (ios.length > 0) {
    const cfg = apnsConfig();
    if (cfg) {
      const res = await sendApns(cfg, ios, req);
      delivered.push(...res.ok);
      stale.push(...res.stale);
    } else {
      console.error("[send-push:apns] APNS_NOT_CONFIGURED");
    }
  }

  if (android.length > 0) {
    const res = await sendFcm(android, req);
    delivered.push(...res.ok);
    stale.push(...res.stale);
  }

  if (delivered.length > 0) {
    await admin
      .from("push_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", delivered);
  }
  if (stale.length > 0) await admin.from("push_tokens").delete().in("id", stale);

  return { sent: delivered.length, removed: stale.length };
}

