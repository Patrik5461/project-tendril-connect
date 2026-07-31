// GA4 Data API stats for the admin panel.
// Secrets: GA4_PROPERTY_ID, GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(clientEmail: string, privateKeyRaw: string): Promise<string> {
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(`${header}.${claim}`),
    ),
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${b64url(sig)}`,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google OAuth zlyhal [${res.status}]: ${text}`);
  return (JSON.parse(text) as { access_token: string }).access_token;
}

type Row = { dimensions: string[]; metrics: string[] };

async function runReport(
  propertyId: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<Row[]> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId.replace(/^properties\//, "")}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`GA4 Data API [${res.status}]: ${text}`);
  const parsed = JSON.parse(text) as {
    rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
  };
  return (parsed.rows ?? []).map((r) => ({
    dimensions: (r.dimensionValues ?? []).map((d) => d.value),
    metrics: (r.metricValues ?? []).map((m) => m.value),
  }));
}

const n = (v?: string) => Number(v ?? 0) || 0;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtGa = (s: string) =>
  s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // --- authz: admin only ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: "Neprihlásený používateľ." });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ ok: false, error: "Prístup zamietnutý (vyžaduje sa admin)." });

    const missing = [
      "GA4_PROPERTY_ID",
      "GOOGLE_SA_CLIENT_EMAIL",
      "GOOGLE_SA_PRIVATE_KEY",
    ].filter((k) => !Deno.env.get(k));
    if (missing.length) {
      return json({
        ok: false,
        error: "Prepojenie s GA4 Data API nie je nastavené – chýbajú tajné kľúče.",
        missing,
      });
    }

    let days = 28;
    try {
      const body = await req.json();
      days = Math.min(Math.max(Math.round(Number(body?.days) || 28), 1), 365);
    } catch {
      /* default */
    }

    const propertyId = Deno.env.get("GA4_PROPERTY_ID")!;
    const token = await getAccessToken(
      Deno.env.get("GOOGLE_SA_CLIENT_EMAIL")!,
      Deno.env.get("GOOGLE_SA_PRIVATE_KEY")!,
    );
    const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];

    const [totals, series, pages, sources, events] = await Promise.all([
      runReport(propertyId, token, {
        dateRanges,
        metrics: [
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
      }),
      runReport(propertyId, token, {
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 400,
      }),
      runReport(propertyId, token, {
        dateRanges,
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 15,
      }),
      runReport(propertyId, token, {
        dateRanges,
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 15,
      }),
      runReport(propertyId, token, {
        dateRanges,
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 20,
      }),
    ]);

    const t = totals[0]?.metrics ?? [];
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);

    return json({
      ok: true,
      property_id: propertyId,
      range: { start: isoDate(start), end: isoDate(end), days },
      totals: {
        activeUsers: n(t[0]),
        newUsers: n(t[1]),
        sessions: n(t[2]),
        pageViews: n(t[3]),
        avgSessionDuration: n(t[4]),
        bounceRate: n(t[5]),
      },
      timeseries: series.map((r) => ({
        date: fmtGa(r.dimensions[0] ?? ""),
        activeUsers: n(r.metrics[0]),
        sessions: n(r.metrics[1]),
        pageViews: n(r.metrics[2]),
      })),
      topPages: pages.map((r) => ({
        path: r.dimensions[0] ?? "",
        title: r.dimensions[1] ?? "",
        views: n(r.metrics[0]),
      })),
      topSources: sources.map((r) => ({
        source: r.dimensions[0] || "(direct)",
        medium: r.dimensions[1] || "(none)",
        sessions: n(r.metrics[0]),
      })),
      events: events.map((r) => ({ name: r.dimensions[0] ?? "", count: n(r.metrics[0]) })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[ga4-stats]", message);
    return json({ ok: false, error: message });
  }
});
