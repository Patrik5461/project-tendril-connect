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
  const bg = isUvo ? "#d1fae5" : "#dbeafe";
  const color = isUvo ? "#065f46" : "#1e40af";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${bg};color:${color};">${label}</span>`;
}

function renderHtml(tenders: Tender[], totalCount: number): string {
  const items = tenders
    .map((t) => {
      const titleHtml = t.source_url
        ? `<a href="${escapeHtml(t.source_url)}" style="color:#111827;text-decoration:none;font-weight:600;">${escapeHtml(t.title)}</a>`
        : `<span style="color:#111827;font-weight:600;">${escapeHtml(t.title)}</span>`;
      return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #e5e7eb;">
            <div style="margin-bottom:6px;">${titleHtml} &nbsp;${sourceBadge(t.source)}</div>
            <div style="font-size:13px;color:#4b5563;line-height:1.5;">
              <b>Obstarávateľ:</b> ${escapeHtml(t.contracting_authority)}<br/>
              <b>Región:</b> ${escapeHtml(t.region ?? "—")}<br/>
              <b>Deadline:</b> ${escapeHtml(formatDeadline(t.deadline))}
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const more =
    totalCount > tenders.length
      ? `<p style="text-align:center;margin:20px 0;"><a href="${APP_URL}/dashboard" style="color:#2563eb;font-weight:600;">Zobraziť všetky v Tendriku →</a></p>`
      : "";

  return `<!DOCTYPE html>
<html lang="sk"><head><meta charset="utf-8"><title>Tendrik</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 8px 0;font-size:22px;">Tendrik: ${totalCount} ${totalCount === 1 ? "nová zákazka" : totalCount < 5 ? "nové zákazky" : "nových zákaziek"} pre vás</h1>
          <p style="margin:0 0 8px 0;color:#6b7280;font-size:14px;">Za posledných 24 hodín sme našli zákazky, ktoré zodpovedajú vašim filtrom.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
          ${more}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
            Dostávate tento e-mail, lebo máte zapnuté notifikácie v Tendriku.<br/>
            <a href="${APP_URL}/settings" style="color:#6b7280;">Spravovať nastavenia</a>
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
