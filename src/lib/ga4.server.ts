// Google Analytics 4 Data API access via a service account (server-only).
// Requires secrets: GA4_PROPERTY_ID, GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY.

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

async function getAccessToken(): Promise<string> {
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) {
    throw new Error("Chýbajú tajné kľúče GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY.");
  }
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
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`)),
  );
  const assertion = `${header}.${claim}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Google OAuth zlyhal [${res.status}]: ${body}`);
  return (JSON.parse(body) as { access_token: string }).access_token;
}

type ReportRow = { dimensions: string[]; metrics: string[] };

async function runReport(payload: Record<string, unknown>): Promise<ReportRow[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error("Chýba tajný kľúč GA4_PROPERTY_ID.");
  const token = await getAccessToken();
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
  const json = JSON.parse(text) as {
    rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
  };
  return (json.rows ?? []).map((r) => ({
    dimensions: (r.dimensionValues ?? []).map((d) => d.value),
    metrics: (r.metricValues ?? []).map((m) => m.value),
  }));
}

export type Ga4Overview = {
  range: { start: string; end: string };
  totals: { users: number; sessions: number; pageViews: number; conversions: number };
  byDay: { date: string; users: number; sessions: number }[];
  topPages: { path: string; views: number }[];
  channels: { channel: string; sessions: number; conversions: number }[];
  campaigns: { campaign: string; source: string; sessions: number; conversions: number }[];
  events: { name: string; count: number }[];
};

export async function fetchGa4Overview(days: number): Promise<Ga4Overview> {
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];

  const [totals, byDay, topPages, channels, campaigns, events] = await Promise.all([
    runReport({
      dateRanges,
      metrics: [
        { name: "totalUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "conversions" },
      ],
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "sessionCampaignName" }, { name: "sessionSource" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 15,
    }),
  ]);

  const n = (v: string | undefined) => Number(v ?? 0) || 0;
  const t = totals[0]?.metrics ?? [];

  return {
    range: { start: `${days}daysAgo`, end: "today" },
    totals: { users: n(t[0]), sessions: n(t[1]), pageViews: n(t[2]), conversions: n(t[3]) },
    byDay: byDay.map((r) => ({ date: r.dimensions[0], users: n(r.metrics[0]), sessions: n(r.metrics[1]) })),
    topPages: topPages.map((r) => ({ path: r.dimensions[0], views: n(r.metrics[0]) })),
    channels: channels.map((r) => ({
      channel: r.dimensions[0] || "(neznámy)",
      sessions: n(r.metrics[0]),
      conversions: n(r.metrics[1]),
    })),
    campaigns: campaigns.map((r) => ({
      campaign: r.dimensions[0] || "(bez kampane)",
      source: r.dimensions[1] || "",
      sessions: n(r.metrics[0]),
      conversions: n(r.metrics[1]),
    })),
    events: events.map((r) => ({ name: r.dimensions[0], count: n(r.metrics[0]) })),
  };
}
