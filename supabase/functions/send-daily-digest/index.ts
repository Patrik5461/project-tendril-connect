// Supabase Edge Function: send-daily-digest
// Sends a daily email digest of new tenders (last 24h) to each user
// with email_notifications = true and at least one filter set.
// Matching mirrors the dashboard: (keyword hit in title/description OR CPV prefix match)
// AND region match (or "Celé Slovensko" wildcard).
//
// Modes:
//   POST {}                              -> send digests to all eligible users
//   POST { "preview_user_id": "<uuid>" } -> return { html, tender_count } for one user; no email sent

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const FROM = "Tendrik <novinky@tendrik.sk>";
const APP_URL =
  Deno.env.get("APP_URL") ??
  "https://project--50e4e6a8-256b-47bb-bfde-c3e5d7cfcd8a.lovable.app";
const MAX_ITEMS = 20;

type Tender = {
  id: string;
  title: string;
  contracting_authority: string;
  description: string | null;
  cpv_code: string | null;
  region: string | null;
  deadline: string | null;
  published_at: string | null;
  source_url: string | null;
  source: string;
  created_at: string;
};

type Prefs = {
  user_id: string;
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  email_notifications: boolean;
};

function matches(t: Tender, p: Prefs): boolean {
  const wholeSk = p.regions.includes("Celé Slovensko");
  const regionOk =
    wholeSk || p.regions.length === 0 || (t.region ? p.regions.includes(t.region) : true);
  if (!regionOk) return false;
  const kws = p.keywords.map((k) => k.toLowerCase());
  const text = (t.title + " " + (t.description ?? "")).toLowerCase();
  const kwMatch = kws.length > 0 && kws.some((k) => text.includes(k));
  const cpvMatch =
    p.cpv_codes.length > 0 &&
    !!t.cpv_code &&
    p.cpv_codes.some((c) => t.cpv_code!.startsWith(c));
  return kwMatch || cpvMatch;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDeadline(d: string | null): string {
  if (!d) return "Neurčené";
  const date = new Date(d);
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

function sourceBadge(src: string): string {
  const isUvo = src === "UVO";
  const label = isUvo ? "ÚVO" : "TED";
  // TED: dark green outline. UVO: solid warm yellow-green.
  const style = isUvo
    ? "background:#C5F547;color:#14201C;border:1px solid #1A3C34;"
    : "background:transparent;color:#1A3C34;border:1px solid #1A3C34;";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;font-family:'Space Grotesk',-apple-system,sans-serif;letter-spacing:0.02em;${style}">${label}</span>`;
}

function renderHtml(tenders: Tender[], totalCount: number): string {
  const items = tenders
    .map((t) => {
      const titleHtml = t.source_url
        ? `<a href="${escapeHtml(t.source_url)}" style="color:#14201C;text-decoration:none;font-weight:600;">${escapeHtml(t.title)}</a>`
        : `<span style="color:#14201C;font-weight:600;">${escapeHtml(t.title)}</span>`;
      return `
        <tr>
          <td style="padding:18px 0;border-bottom:1px solid rgba(26,60,52,0.15);">
            <div style="margin-bottom:8px;">${titleHtml} &nbsp;${sourceBadge(t.source)}</div>
            <div style="font-size:13px;color:#4a5a55;line-height:1.6;">
              <b style="color:#14201C;">Obstarávateľ:</b> ${escapeHtml(t.contracting_authority)}<br/>
              <b style="color:#14201C;">Región:</b> ${escapeHtml(t.region ?? "—")}<br/>
              <b style="color:#14201C;">Deadline:</b> <span style="font-family:'Space Grotesk',-apple-system,sans-serif;font-variant-numeric:tabular-nums;">${escapeHtml(formatDeadline(t.deadline))}</span>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const cta =
    totalCount > 0
      ? `<p style="text-align:center;margin:28px 0 8px 0;">
           <a href="${APP_URL}/dashboard" style="display:inline-block;background:#C5F547;color:#14201C;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;border:1px solid #1A3C34;font-family:'Space Grotesk',-apple-system,sans-serif;">
             ${totalCount > tenders.length ? "Zobraziť všetky zákazky" : "Otvoriť v Tendriku"} →
           </a>
         </p>`
      : "";

  return `<!DOCTYPE html>
<html lang="sk"><head><meta charset="utf-8"><title>Tendrik</title></head>
<body style="margin:0;padding:0;background:#FAF8F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#14201C;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F3;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FAF8F3;border:1px solid rgba(26,60,52,0.15);border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1A3C34;padding:20px 28px;">
          <div style="font-family:'Space Grotesk',-apple-system,sans-serif;font-weight:700;font-size:20px;letter-spacing:-0.02em;color:#FAF8F3;">
            <span style="display:inline-block;width:22px;height:22px;border-radius:5px;background:#C5F547;color:#1A3C34;text-align:center;line-height:22px;font-weight:800;margin-right:8px;vertical-align:middle;">T</span>
            Tendrik
          </div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 8px 0;font-family:'Space Grotesk',-apple-system,sans-serif;font-weight:700;font-size:22px;letter-spacing:-0.02em;color:#14201C;">${totalCount} ${totalCount === 1 ? "nová zákazka" : totalCount < 5 ? "nové zákazky" : "nových zákaziek"} pre vás</h1>
          <p style="margin:0 0 8px 0;color:#4a5a55;font-size:14px;">Za posledných 24 hodín sme našli zákazky, ktoré zodpovedajú vašim filtrom.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
          ${cta}
          <hr style="border:none;border-top:1px solid rgba(26,60,52,0.15);margin:24px 0;"/>
          <p style="font-size:12px;color:#6b7770;text-align:center;margin:0;">
            Dostávate tento e-mail, lebo máte zapnuté notifikácie v Tendriku.<br/>
            <a href="${APP_URL}/settings" style="color:#1A3C34;">Spravovať nastavenia</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string, apiKey: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: { preview_user_id?: string } = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: tendersData, error: tErr } = await supabase
      .from("tenders")
      .select(
        "id,title,contracting_authority,description,cpv_code,region,deadline,published_at,source_url,source,created_at",
      )
      .gte("created_at", since);
    if (tErr) throw tErr;
    const tenders = (tendersData ?? []) as Tender[];

    // PREVIEW MODE
    if (body.preview_user_id) {
      const { data: p } = await supabase
        .from("user_preferences")
        .select("user_id,keywords,cpv_codes,regions,email_notifications")
        .eq("user_id", body.preview_user_id)
        .maybeSingle();
      if (!p) {
        return new Response(
          JSON.stringify({ error: "user_preferences not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const prefs = p as Prefs;
      const matched = tenders.filter((t) => matches(t, prefs));
      matched.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      const html = renderHtml(matched.slice(0, MAX_ITEMS), matched.length);
      return new Response(
        JSON.stringify({ tender_count: matched.length, html }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SEND MODE
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const { data: prefsData, error: pErr } = await supabase
      .from("user_preferences")
      .select("user_id,keywords,cpv_codes,regions,email_notifications")
      .eq("email_notifications", true);
    if (pErr) throw pErr;

    const eligible = (prefsData ?? []).filter((p: any) => {
      const hasFilter =
        (p.keywords?.length ?? 0) > 0 ||
        (p.cpv_codes?.length ?? 0) > 0 ||
        (p.regions?.length ?? 0) > 0;
      return hasFilter;
    }) as Prefs[];

    let users_checked = 0;
    let emails_sent = 0;
    let errors = 0;

    for (const prefs of eligible) {
      users_checked++;
      try {
        const matched = tenders.filter((t) => matches(t, prefs));
        if (matched.length === 0) continue;

        // Fetch user email via admin API
        const { data: uRes, error: uErr } = await supabase.auth.admin.getUserById(
          prefs.user_id,
        );
        if (uErr || !uRes.user?.email) {
          console.error(`No email for user ${prefs.user_id}`, uErr);
          errors++;
          continue;
        }
        matched.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
        const html = renderHtml(matched.slice(0, MAX_ITEMS), matched.length);
        const subject = `Tendrik: ${matched.length} ${matched.length === 1 ? "nová zákazka" : matched.length < 5 ? "nové zákazky" : "nových zákaziek"} pre vás`;
        await sendEmail(uRes.user.email, subject, html, resendKey);
        emails_sent++;
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error(`Digest failed for user ${prefs.user_id}:`, err);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ users_checked, emails_sent, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-daily-digest failed:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
