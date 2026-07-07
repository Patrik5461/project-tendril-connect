// Supabase Edge Function: send-weekly-digest
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

type Radar = {
  id: string;
  user_id: string;
  name: string;
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  active: boolean;
};

type NotifPrefs = {
  user_id: string;
  email_notifications: boolean;
};

function matchesRadar(t: Tender, r: Radar): boolean {
  const wholeSk = r.regions.includes("Celé Slovensko");
  const regionOk =
    wholeSk || r.regions.length === 0 || (t.region ? r.regions.includes(t.region) : true);
  if (!regionOk) return false;
  const kws = r.keywords.map((k) => k.toLowerCase());
  const cpvs = r.cpv_codes;
  const hasFilters = kws.length > 0 || cpvs.length > 0;
  if (!hasFilters) return true;
  const text = (t.title + " " + (t.description ?? "")).toLowerCase();
  const kwMatch = kws.length > 0 && kws.some((k) => text.includes(k));
  const cpvMatch =
    cpvs.length > 0 && !!t.cpv_code && cpvs.some((c) => t.cpv_code!.startsWith(c));
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
  // ÚVO: red outline (primary). TED: navy outline (accent).
  const style = isUvo
    ? "color:#C8102E;border:1px solid #C8102E;"
    : "color:#26428B;border:1px solid #26428B;";
  return `<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;font-family:Inter,-apple-system,sans-serif;letter-spacing:0.12em;text-transform:uppercase;background:transparent;${style}">${label}</span>`;
}

function formatValue(v: number | null | undefined): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 })
    .format(n)
    .replace(/\u00a0/g, " ") + " €";
}

function renderTenderRow(t: Tender & { estimated_value?: number | null }): string {
  const titleHtml = t.source_url
    ? `<a href="${escapeHtml(t.source_url)}" style="color:#111111;text-decoration:none;font-weight:600;font-family:'Source Serif 4',Georgia,serif;font-size:18px;line-height:1.25;">${escapeHtml(t.title)}</a>`
    : `<span style="color:#111111;font-weight:600;font-family:'Source Serif 4',Georgia,serif;font-size:18px;line-height:1.25;">${escapeHtml(t.title)}</span>`;
  const valueStr = formatValue((t as any).estimated_value);
  const valueRow = valueStr
    ? `<div style="margin-top:8px;font-family:Inter,-apple-system,sans-serif;font-variant-numeric:tabular-nums;font-weight:600;color:#C8102E;font-size:15px;">${escapeHtml(valueStr)}</div>`
    : "";
  return `
    <tr>
      <td style="padding:18px 0;border-top:1px solid #111111;border-bottom:1px solid #d5d5d5;">
        <div style="margin-bottom:8px;">${sourceBadge(t.source)}</div>
        <div style="margin-bottom:6px;">${titleHtml}</div>
        <div style="font-family:Inter,-apple-system,sans-serif;font-size:13px;color:#555555;line-height:1.6;">
          <b style="color:#111111;">Obstarávateľ:</b> ${escapeHtml(t.contracting_authority)}<br/>
          <b style="color:#111111;">Región:</b> ${escapeHtml(t.region ?? "—")}<br/>
          <b style="color:#111111;">Deadline:</b> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatDeadline(t.deadline))}</span>
        </div>
        ${valueRow}
      </td>
    </tr>`;
}

function renderHtml(
  tenders: (Tender & { estimated_value?: number | null })[],
  totalCount: number,
  groupsByRadar?: { name: string; items: (Tender & { estimated_value?: number | null })[] }[],
): string {
  let itemsHtml: string;
  if (groupsByRadar && groupsByRadar.length > 1) {
    itemsHtml = groupsByRadar
      .map((g) => {
        const header = `<tr><td style="padding:20px 0 8px 0;">
          <div style="font-family:Inter,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#C8102E;">Radar · ${escapeHtml(g.name)} (${g.items.length})</div>
        </td></tr>`;
        return header + g.items.map(renderTenderRow).join("");
      })
      .join("");
  } else {
    itemsHtml = tenders.map(renderTenderRow).join("");
  }
  const items = itemsHtml;

  const cta =
    totalCount > 0
      ? `<p style="text-align:left;margin:28px 0 8px 0;">
           <a href="${APP_URL}/dashboard" style="display:inline-block;background:#C8102E;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 28px;font-family:Inter,-apple-system,sans-serif;letter-spacing:0.02em;">
             ${totalCount > tenders.length ? "Zobraziť všetky zákazky" : "Otvoriť v Tendriku"} →
           </a>
         </p>`
      : "";

  return `<!DOCTYPE html>
<html lang="sk"><head><meta charset="utf-8"><title>Tendrik</title></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#FFFFFF;">
        <tr><td style="padding:16px 24px;border-bottom:2px solid #111111;">
          <div style="font-family:'Source Serif 4',Georgia,serif;font-weight:700;font-size:22px;letter-spacing:-0.01em;color:#111111;">
            <span style="display:inline-block;width:18px;height:18px;background:#C8102E;vertical-align:-3px;margin-right:10px;"></span>
            Tendrik
          </div>
        </td></tr>
        <tr><td style="padding:28px 24px 8px 24px;">
          <div style="font-family:Inter,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#555555;margin-bottom:8px;">
            <span style="display:inline-block;width:8px;height:8px;background:#C8102E;vertical-align:1px;margin-right:8px;"></span>
            Týždenný digest verejného obstarávania
          </div>
          <h1 style="margin:0 0 6px 0;font-family:'Source Serif 4',Georgia,serif;font-weight:700;font-size:28px;line-height:1.15;letter-spacing:-0.01em;color:#111111;">${totalCount} ${totalCount === 1 ? "nová zákazka" : totalCount < 5 ? "nové zákazky" : "nových zákaziek"} pre vás</h1>
          <p style="margin:0 0 20px 0;color:#555555;font-size:14px;">Za posledných 7 dní sme našli zákazky, ktoré zodpovedajú vašim filtrom.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
          ${cta}
          <hr style="border:none;border-top:2px solid #111111;margin:32px 0 12px 0;"/>
          <p style="font-size:12px;color:#777777;text-align:left;margin:0;">
            Dostávate tento e-mail, lebo máte zapnuté notifikácie v Tendriku.<br/>
            <a href="${APP_URL}/settings" style="color:#26428B;text-decoration:underline;">Spravovať nastavenia</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function parseRecipients(override: string | null | undefined, fallback: string | null | undefined): string[] {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (override && override.trim() !== "") {
    const list = override.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => emailRe.test(s));
    if (list.length > 0) return Array.from(new Set(list.map((s) => s.toLowerCase()))).slice(0, 10);
  }
  if (fallback && emailRe.test(fallback)) return [fallback];
  return [];
}

async function sendEmail(to: string[], subject: string, html: string, apiKey: string) {
  if (to.length === 0) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
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

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tendersData, error: tErr } = await supabase
      .from("tenders")
      .select(
        "id,title,contracting_authority,description,cpv_code,region,deadline,published_at,source_url,source,created_at,estimated_value",
      )
      .gte("created_at", since);
    if (tErr) throw tErr;
    const tenders = (tendersData ?? []) as Tender[];

    // Helper: build per-user radar match groups + flat list (unique tenders in order)
    function buildForUser(userId: string, radars: Radar[]) {
      const active = radars.filter((r) => r.active);
      const groupMap = new Map<string, (Tender & { estimated_value?: number | null })[]>();
      const seen = new Set<string>();
      const flat: (Tender & { estimated_value?: number | null })[] = [];
      const sorted = tenders
        .slice()
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      for (const t of sorted) {
        for (const r of active) {
          if (matchesRadar(t, r)) {
            if (!groupMap.has(r.name)) groupMap.set(r.name, []);
            groupMap.get(r.name)!.push(t as any);
            if (!seen.has(t.id)) {
              seen.add(t.id);
              flat.push(t as any);
            }
          }
        }
      }
      const groups = Array.from(groupMap.entries()).map(([name, items]) => ({ name, items }));
      return { flat, groups, activeCount: active.length };
    }

    // PREVIEW MODE
    if (body.preview_user_id) {
      const { data: rData } = await supabase
        .from("user_radars")
        .select("*")
        .eq("user_id", body.preview_user_id);
      const radars = (rData ?? []) as Radar[];
      const { flat, groups, activeCount } = buildForUser(body.preview_user_id, radars);
      const limited = flat.slice(0, MAX_ITEMS);
      const limitedGroups =
        activeCount > 1
          ? groups.map((g) => ({
              name: g.name,
              items: g.items.filter((t) => limited.some((x) => x.id === t.id)),
            }))
          : undefined;
      const html = renderHtml(limited, flat.length, limitedGroups);
      return new Response(
        JSON.stringify({ tender_count: flat.length, html }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SEND MODE
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const { data: notifData, error: pErr } = await supabase
      .from("user_preferences")
      .select("user_id,email_notifications,digest_frequency,notification_email")
      .eq("email_notifications", true)
      .eq("digest_frequency", "weekly");
    if (pErr) throw pErr;
    const notifEmailMap = new Map<string, string | null>(
      (notifData ?? []).map((p: any) => [p.user_id as string, (p.notification_email as string | null) ?? null]),
    );
    const eligibleIds = (notifData ?? []).map((p: any) => p.user_id as string);
    if (eligibleIds.length === 0) {
      return new Response(
        JSON.stringify({ users_checked: 0, emails_sent: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: allRadars, error: rErr } = await supabase
      .from("user_radars")
      .select("*")
      .in("user_id", eligibleIds);
    if (rErr) throw rErr;
    const radarsByUser = new Map<string, Radar[]>();
    for (const r of (allRadars ?? []) as Radar[]) {
      if (!radarsByUser.has(r.user_id)) radarsByUser.set(r.user_id, []);
      radarsByUser.get(r.user_id)!.push(r);
    }

    let users_checked = 0;
    let emails_sent = 0;
    let errors = 0;

    for (const userId of eligibleIds) {
      users_checked++;
      try {
        const radars = radarsByUser.get(userId) ?? [];
        if (radars.filter((r) => r.active).length === 0) continue;
        const { flat, groups, activeCount } = buildForUser(userId, radars);
        if (flat.length === 0) continue;

        const overrideEmail = notifEmailMap.get(userId);
        let recipient: string | null = overrideEmail && overrideEmail.trim() !== "" ? overrideEmail.trim() : null;
        if (!recipient) {
          const { data: uRes, error: uErr } = await supabase.auth.admin.getUserById(userId);
          if (uErr || !uRes.user?.email) {
            console.error(`No email for user ${userId}`, uErr);
            errors++;
            continue;
          }
          recipient = uRes.user.email;
        }
        const limited = flat.slice(0, MAX_ITEMS);
        const limitedGroups =
          activeCount > 1
            ? groups.map((g) => ({
                name: g.name,
                items: g.items.filter((t) => limited.some((x) => x.id === t.id)),
              }))
            : undefined;
        const html = renderHtml(limited, flat.length, limitedGroups);
        const subject = `Tendrik: váš týždenný prehľad – ${flat.length} ${flat.length === 1 ? "nová zákazka" : flat.length < 5 ? "nové zákazky" : "nových zákaziek"}`;
        await sendEmail(recipient, subject, html, resendKey);
        emails_sent++;
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error(`Digest failed for user ${userId}:`, err);
        errors++;
      }
    }


    return new Response(
      JSON.stringify({ users_checked, emails_sent, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-weekly-digest failed:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
