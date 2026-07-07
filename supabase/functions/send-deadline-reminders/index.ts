// Supabase Edge Function: send-deadline-reminders
// Denne posiela pripomienky pre ulozene zakazky, ktorym o 3 alebo 1 den konci lehota.
// Deduplikacia cez tabulku sent_reminders (user_id, tender_id, days_before).

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
const REMINDER_DAYS = [3, 1];

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
  const style = isUvo
    ? "color:#C8102E;border:1px solid #C8102E;"
    : "color:#26428B;border:1px solid #26428B;";
  return `<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;font-family:Inter,-apple-system,sans-serif;letter-spacing:0.12em;text-transform:uppercase;background:transparent;${style}">${label}</span>`;
}

function daysWord(n: number): string {
  if (n === 1) return "1 deň";
  if (n >= 2 && n <= 4) return `${n} dni`;
  return `${n} dní`;
}

function renderHtml(
  t: {
    id: string;
    title: string;
    contracting_authority: string;
    deadline: string | null;
    source_url: string | null;
    source: string;
  },
  daysLeft: number,
): string {
  const detailUrl = `${APP_URL}/dashboard?tender=${t.id}`;
  const sourceBtn = t.source_url
    ? `<a href="${escapeHtml(t.source_url)}" style="display:inline-block;border:1px solid #111111;color:#111111;text-decoration:none;font-weight:600;padding:12px 22px;font-family:Inter,-apple-system,sans-serif;margin-left:8px;">Oficiálny zdroj →</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="sk"><head><meta charset="utf-8"><title>Tendrik – pripomienka</title></head>
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
          <div style="font-family:Inter,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#C8102E;margin-bottom:8px;">
            <span style="display:inline-block;width:8px;height:8px;background:#C8102E;vertical-align:1px;margin-right:8px;"></span>
            Pripomienka deadlinu
          </div>
          <h1 style="margin:0 0 6px 0;font-family:'Source Serif 4',Georgia,serif;font-weight:700;font-size:26px;line-height:1.2;letter-spacing:-0.01em;color:#111111;">
            Zákazke končí lehota o ${daysWord(daysLeft)}
          </h1>
          <p style="margin:0 0 20px 0;color:#555555;font-size:14px;">Uložili ste si túto zákazku. Nezabudnite na termín predloženia ponuky.</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:18px 0;border-top:1px solid #111111;border-bottom:1px solid #d5d5d5;">
              <div style="margin-bottom:8px;">${sourceBadge(t.source)}</div>
              <div style="margin-bottom:10px;">
                <span style="color:#111111;font-weight:600;font-family:'Source Serif 4',Georgia,serif;font-size:19px;line-height:1.25;">${escapeHtml(t.title)}</span>
              </div>
              <div style="font-family:Inter,-apple-system,sans-serif;font-size:13px;color:#555555;line-height:1.7;">
                <b style="color:#111111;">Obstarávateľ:</b> ${escapeHtml(t.contracting_authority)}<br/>
                <b style="color:#111111;">Deadline:</b> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatDeadline(t.deadline))}</span><br/>
                <b style="color:#111111;">Zostáva:</b> <span style="color:#C8102E;font-weight:600;">${daysWord(daysLeft)}</span>
              </div>
            </td></tr>
          </table>

          <p style="text-align:left;margin:28px 0 8px 0;">
            <a href="${detailUrl}" style="display:inline-block;background:#C8102E;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 28px;font-family:Inter,-apple-system,sans-serif;letter-spacing:0.02em;">Otvoriť detail →</a>
            ${sourceBtn}
          </p>

          <hr style="border:none;border-top:2px solid #111111;margin:32px 0 12px 0;"/>
          <p style="font-size:12px;color:#777777;text-align:left;margin:0;">
            Dostávate tento e-mail, lebo máte zapnuté pripomienky uložených zákaziek.<br/>
            <a href="${APP_URL}/settings" style="color:#26428B;text-decoration:underline;">Spravovať nastavenia</a>
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

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    // Nacitaj vsetky ulozene zakazky
    const { data: actions, error: aErr } = await supabase
      .from("user_tender_actions")
      .select("user_id, tender_id")
      .eq("action", "saved");
    if (aErr) throw aErr;

    if (!actions || actions.length === 0) {
      return new Response(
        JSON.stringify({ reminders_sent: 0, checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Nacitaj tendre
    const tenderIds = [...new Set(actions.map((a) => a.tender_id))];
    const { data: tenders, error: tErr } = await supabase
      .from("tenders")
      .select("id,title,contracting_authority,deadline,source_url,source")
      .in("id", tenderIds)
      .not("deadline", "is", null);
    if (tErr) throw tErr;
    const tenderMap = new Map((tenders ?? []).map((t) => [t.id, t]));

    // Nacitaj preferencie
    const userIds = [...new Set(actions.map((a) => a.user_id))];
    const { data: prefs, error: pErr } = await supabase
      .from("user_preferences")
      .select("user_id, email_notifications, deadline_reminders")
      .in("user_id", userIds);
    if (pErr) throw pErr;
    const prefMap = new Map((prefs ?? []).map((p) => [p.user_id, p]));

    // Nacitaj uz odoslane pripomienky
    const { data: sent, error: sErr } = await supabase
      .from("sent_reminders")
      .select("user_id, tender_id, days_before")
      .in("user_id", userIds);
    if (sErr) throw sErr;
    const sentKey = new Set(
      (sent ?? []).map((r) => `${r.user_id}|${r.tender_id}|${r.days_before}`),
    );

    let reminders_sent = 0;
    let checked = 0;
    let errors = 0;
    const emailCache = new Map<string, string | null>();
    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    for (const a of actions) {
      checked++;
      const t = tenderMap.get(a.tender_id);
      if (!t || !t.deadline) continue;

      const p = prefMap.get(a.user_id);
      if (!p) continue;
      if (p.email_notifications === false) continue;
      if (p.deadline_reminders === false) continue;

      const msLeft = new Date(t.deadline).getTime() - now;
      if (msLeft <= 0) continue;
      const daysLeft = Math.ceil(msLeft / MS_PER_DAY);
      if (!REMINDER_DAYS.includes(daysLeft)) continue;

      const key = `${a.user_id}|${a.tender_id}|${daysLeft}`;
      if (sentKey.has(key)) continue;

      // Zisti email
      let email = emailCache.get(a.user_id);
      if (email === undefined) {
        const { data: uRes, error: uErr } = await supabase.auth.admin.getUserById(a.user_id);
        email = uErr ? null : (uRes.user?.email ?? null);
        emailCache.set(a.user_id, email);
      }
      if (!email) {
        errors++;
        continue;
      }

      try {
        const subject = `Pripomienka: zákazke ${t.title} končí lehota o ${daysWord(daysLeft)}`;
        const html = renderHtml(t, daysLeft);
        await sendEmail(email, subject, html, resendKey);

        const { error: insErr } = await supabase.from("sent_reminders").insert({
          user_id: a.user_id,
          tender_id: a.tender_id,
          days_before: daysLeft,
        });
        if (insErr) console.error("sent_reminders insert failed:", insErr);
        sentKey.add(key);
        reminders_sent++;
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error(`Reminder failed for user ${a.user_id} tender ${a.tender_id}:`, err);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ reminders_sent, checked, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-deadline-reminders failed:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
