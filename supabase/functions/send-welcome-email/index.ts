// Supabase Edge Function: send-welcome-email
// Sends a one-time welcome email to an authenticated user.
// Idempotent: atomically flips user_preferences.welcome_email_sent from false to true,
// and only sends the email if that flip succeeded. Concurrent calls therefore email once.
//
// POST (with user's Authorization: Bearer <access_token>)
// -> { sent: boolean, reason?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM = "Tendrik <novinky@tendrik.sk>";
const APP_URL =
  Deno.env.get("APP_URL") ??
  "https://project--50e4e6a8-256b-47bb-bfde-c3e5d7cfcd8a.lovable.app";

function renderHtml(dashboardUrl: string, settingsUrl: string): string {
  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Vitajte v Tendriku</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:2px solid #0a0a0a;">
        <tr><td style="padding:20px 24px;border-bottom:2px solid #0a0a0a;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle;">
                <span style="display:inline-block;width:14px;height:14px;background:#dc2626;vertical-align:middle;margin-right:8px;"></span>
                <span style="font-weight:800;font-size:18px;letter-spacing:-0.01em;vertical-align:middle;">Tendrik</span>
              </td>
              <td align="right" style="vertical-align:middle;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#525252;">
                Uvítanie
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:28px 24px 8px 24px;">
          <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.01em;">
            Váš radar je zapnutý <span style="color:#dc2626;">✓</span>
          </h1>
          <p style="margin:14px 0 0 0;font-size:15px;line-height:1.55;">
            Ďakujeme, že ste si vybrali Tendrik.
          </p>
          <p style="margin:10px 0 0 0;font-size:15px;line-height:1.55;">
            Od tejto chvíle za vás sledujeme verejné zákazky na Slovensku –
            z oficiálnych zdrojov <strong>TED</strong> a <strong>vestníka ÚVO</strong>, každý deň.
            Len čo sa objaví zákazka, ktorá sadne vašim filtrom, dáme vám vedieť.
            Nemusíte prehľadávať žiadne portály, zákazky si vás nájdu samy.
          </p>
        </td></tr>

        <tr><td style="padding:20px 24px 0 24px;">
          <p style="margin:0 0 8px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#525252;font-weight:700;">
            Čo môžete čakať
          </p>
          <ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;">
            <li>Nové relevantné zákazky priamo do schránky (denne alebo týždenne – podľa vášho nastavenia)</li>
            <li>Pripomienku, keď sa blíži lehota na zákazku, ktorú ste si uložili</li>
            <li>Prehľad všetkých zákaziek kedykoľvek vo vašom dashboarde</li>
          </ul>
        </td></tr>

        <tr><td style="padding:20px 24px 0 24px;">
          <p style="margin:0 0 8px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#525252;font-weight:700;">
            Pár tipov na začiatok
          </p>
          <ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;">
            <li>Vytvorte si viac radarov, ak sledujete rôzne odbory (napr. zvlášť stavby, zvlášť služby)</li>
            <li>Uložte si zaujímavé zákazky hviezdičkou – budeme vám strážiť ich termíny</li>
            <li>V nastaveniach si kedykoľvek upravíte filtre aj frekvenciu e-mailov</li>
          </ul>
        </td></tr>

        <tr><td style="padding:20px 24px 0 24px;">
          <p style="margin:0;font-size:15px;line-height:1.55;">
            A áno – <strong>Tendrik je a zostáva bezplatný</strong>.
          </p>
          <p style="margin:10px 0 0 0;font-size:15px;line-height:1.55;">
            Ak si neviete rady, napíšte nám alebo použite pomocníka priamo v aplikácii.
          </p>
        </td></tr>

        <tr><td style="padding:24px 24px 8px 24px;" align="left">
          <a href="${dashboardUrl}"
             style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border:2px solid #0a0a0a;">
            Otvoriť môj dashboard →
          </a>
        </td></tr>

        <tr><td style="padding:18px 24px 24px 24px;">
          <p style="margin:0;font-size:14px;line-height:1.55;">
            Držíme palce pri zákazkách,<br/>
            <strong>tím Tendrik</strong>
          </p>
        </td></tr>

        <tr><td style="padding:16px 24px;border-top:2px solid #0a0a0a;font-size:12px;line-height:1.5;color:#525252;">
          Tento e-mail ste dostali, lebo ste si zapli notifikácie v Tendriku.
          <br/>
          <a href="${settingsUrl}" style="color:#0a0a0a;text-decoration:underline;">Nastavenia notifikácií</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "missing_authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identify user from bearer token
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: "invalid_token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const user = userData.user;
    const userId = user.id;

    const admin = createClient(url, serviceKey);

    // Atomic idempotency: only flip false -> true.
    // If the row does not exist yet, create it with welcome_email_sent = true.
    const { data: existing, error: prefErr } = await admin
      .from("user_preferences")
      .select("welcome_email_sent, notification_email")
      .eq("user_id", userId)
      .maybeSingle();
    if (prefErr) throw prefErr;

    let notificationEmail: string | null = null;

    if (!existing) {
      const { error: insErr } = await admin.from("user_preferences").insert({
        user_id: userId,
        welcome_email_sent: true,
      });
      if (insErr) throw insErr;
    } else {
      if (existing.welcome_email_sent) {
        return new Response(
          JSON.stringify({ sent: false, reason: "already_sent" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      notificationEmail = (existing as any).notification_email ?? null;
      const { data: updated, error: updErr } = await admin
        .from("user_preferences")
        .update({ welcome_email_sent: true })
        .eq("user_id", userId)
        .eq("welcome_email_sent", false)
        .select("user_id");
      if (updErr) throw updErr;
      if (!updated || updated.length === 0) {
        // Someone else got here first – do not send.
        return new Response(
          JSON.stringify({ sent: false, reason: "race_lost" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const recipient =
      notificationEmail && notificationEmail.trim() !== ""
        ? notificationEmail.trim()
        : user.email;
    if (!recipient) {
      return new Response(
        JSON.stringify({ sent: false, reason: "no_email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const dashboardUrl = `${APP_URL}/dashboard`;
    const settingsUrl = `${APP_URL}/settings`;
    const html = renderHtml(dashboardUrl, settingsUrl);

    try {
      await sendEmail(recipient, "Vitajte v Tendriku – váš radar je zapnutý", html, resendKey);
    } catch (mailErr) {
      // Roll back the flag so the user can retry later.
      await admin
        .from("user_preferences")
        .update({ welcome_email_sent: false })
        .eq("user_id", userId);
      throw mailErr;
    }

    return new Response(
      JSON.stringify({ sent: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-welcome-email error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
