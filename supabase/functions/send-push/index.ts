// Natívne push notifikácie cez Firebase Cloud Messaging HTTP v1.
// Secret: FCM_SERVICE_ACCOUNT_JSON (celý JSON servisného účtu).
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

export async function sendPush(req: PushRequest) {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return { sent: 0, error: "FCM_NOT_CONFIGURED" };
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };

  const userIds = req.user_ids ?? (req.user_id ? [req.user_id] : []);
  if (userIds.length === 0) return { sent: 0 };

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("id, token, user_id")
    .in("user_id", userIds);
  if (!tokens || tokens.length === 0) return { sent: 0 };

  const accessToken = await getAccessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  let sent = 0;
  const stale: string[] = [];

  for (const t of tokens) {
    const payload = {
      message: {
        token: t.token,
        notification: { title: req.title, body: req.body },
        data: { ...(req.data ?? {}), ...(req.path ? { path: req.path } : {}) },
        android: { priority: "HIGH" },
        apns: { payload: { aps: { sound: "default" } } },
      },
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      sent++;
      await admin.from("push_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", t.id);
      continue;
    }
    const text = await r.text();
    if (r.status === 404 || text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) {
      stale.push(t.id);
    } else {
      console.error("[send-push]", r.status, text);
    }
  }

  if (stale.length > 0) await admin.from("push_tokens").delete().in("id", stale);
  return { sent, removed: stale.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as PushRequest;
    if (!body?.title || !body?.body) {
      return new Response(JSON.stringify({ error: "title a body sú povinné" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await sendPush(body);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-push]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
