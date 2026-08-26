// Supabase Edge Function: send-broadcast
// Hromadné rozposlanie mailu z admina — novinky alebo prevádzkový oznam.
//
// POST (Authorization: Bearer <access_token> admina)
//   { mode: "preview" | "test" | "send", kind: "news" | "ops",
//     audience: "all" | "trial" | "active" | "expired" | "basic" | "premium" | "komplet" | "manual",
//     subject, body, manual_emails?, test_to? }
//
// preview -> { html, recipients_total, sample }   (nič sa neodosiela)
// test    -> { sent: 1 }                          (jeden mail na zadanú adresu)
// send    -> { broadcast_id, recipients_total, sent_count, failed_count, failed_emails }
//
// Rozdiel medzi kind:
//   news — novinka. Preskočí každého, kto má email_notifications = false,
//          a do pätičky pridá odkaz na odhlásenie. Marketing bez možnosti
//          odhlásiť sa je porušenie zákona o reklame aj GDPR.
//   ops  — prevádzkový oznam (výpadok, odstávka). Servisná správa o službe,
//          ktorú si zákazník platí, preto ide všetkým a odhlásenie nemá.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM = "Tendrik <novinky@tendrik.sk>";
const APP_URL = Deno.env.get("APP_BASE_URL") ?? Deno.env.get("APP_URL") ?? "https://www.tendrik.sk";

/** Resend berie naraz 100 mailov; medzi dávkami necháme priestor na rate limit. */
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Kind = "news" | "ops";
type Mode = "preview" | "test" | "send";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Holý text na odseky. Prázdny riadok = nový odsek, jeden zlom = <br>. */
function renderBody(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const safe = escapeHtml(para)
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#26428B;">$1</a>')
        .replace(/\n/g, "<br />");
      return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">${safe}</p>`;
    })
    .join("\n");
}

function renderHtml(kind: Kind, subject: string, body: string): string {
  const label = kind === "ops" ? "Oznam" : "Novinky";
  const footer = kind === "news"
    ? `Tento mail ste dostali, lebo máte účet v Tendriku.
       <a href="${APP_URL}/settings" style="color:#26428B;text-decoration:underline;">Odhlásiť sa z noviniek</a>`
    : `Prevádzkový oznam k službe Tendrik. Posiela sa všetkým používateľom bez ohľadu na nastavenia mailov.`;

  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
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
                ${label}
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:28px 24px 8px 24px;">
          <h1 style="margin:0 0 18px 0;font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-0.01em;">
            ${escapeHtml(subject)}
          </h1>
          ${renderBody(body)}
        </td></tr>

        <tr><td style="padding:16px 24px 24px 24px;">
          <a href="${APP_URL}/dashboard" style="display:inline-block;background:#C8102E;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 24px;letter-spacing:0.02em;">
            Otvoriť Tendrik
          </a>
        </td></tr>

        <tr><td style="padding:16px 24px;border-top:2px solid #0a0a0a;font-size:12px;line-height:1.6;color:#525252;">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function parseEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const list = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => EMAIL_RE.test(s));
  return Array.from(new Set(list));
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("not authenticated");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("not authenticated");

  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) throw new Error("forbidden");

  return { admin, userId: data.user.id };
}

/** Všetci používatelia z auth — auth.admin.listUsers chodí po stránkach. */
async function listAllAuthUsers(admin: ReturnType<typeof createClient>) {
  const out: Array<{ id: string; email: string }> = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email) out.push({ id: u.id, email: u.email });
    }
    if (users.length < 1000) break;
  }
  return out;
}

type Prefs = {
  user_id: string;
  subscription_status: string | null;
  subscription_tier: string | null;
  email_notifications: boolean | null;
  notification_email: string | null;
};

function matchesAudience(audience: string, p: Prefs | undefined): boolean {
  const status = p?.subscription_status ?? "trial";
  const tier = p?.subscription_tier ?? "basic";
  switch (audience) {
    case "all": return true;
    case "trial":
    case "active":
    case "expired": return status === audience;
    case "basic":
    case "premium":
    case "komplet": return status === "active" && tier === audience;
    default: return false;
  }
}

async function resolveRecipients(
  admin: ReturnType<typeof createClient>,
  audience: string,
  kind: Kind,
  manualEmails: string | null,
): Promise<string[]> {
  if (audience === "manual") return parseEmails(manualEmails);

  const [users, prefsRes] = await Promise.all([
    listAllAuthUsers(admin),
    admin
      .from("user_preferences")
      .select("user_id,subscription_status,subscription_tier,email_notifications,notification_email"),
  ]);
  if (prefsRes.error) throw prefsRes.error;

  const byUser = new Map<string, Prefs>(
    ((prefsRes.data ?? []) as Prefs[]).map((p) => [p.user_id, p]),
  );

  const out = new Set<string>();
  for (const u of users) {
    const p = byUser.get(u.id);
    if (!matchesAudience(audience, p)) continue;
    // Novinky rešpektujú odhlásenie; chýbajúca hodnota znamená zapnuté.
    if (kind === "news" && p?.email_notifications === false) continue;
    const addr = (p?.notification_email ?? u.email).trim().toLowerCase();
    if (EMAIL_RE.test(addr)) out.add(addr);
  }
  return Array.from(out);
}

/** Posledná odpoveď Resendu pri chybe — aby sa dôvod dostal až do admina. */
let lastResendError = "";

/** Vráti adresy, ktoré sa nepodarilo odoslať. */
async function sendBatch(
  emails: string[],
  subject: string,
  html: string,
  kind: Kind,
  apiKey: string,
): Promise<string[]> {
  const payload = emails.map((to) => ({
    from: FROM,
    to: [to],
    subject,
    html,
    ...(kind === "news"
      ? { headers: { "List-Unsubscribe": `<${APP_URL}/settings>` } }
      : {}),
  }));

  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    lastResendError = `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
    console.error(lastResendError);
    return emails;
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { admin, userId } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const mode: Mode = body.mode === "send" || body.mode === "test" ? body.mode : "preview";
    const kind: Kind = body.kind === "ops" ? "ops" : "news";
    const audience: string = typeof body.audience === "string" ? body.audience : "all";
    const subject: string = (body.subject ?? "").toString().trim();
    const text: string = (body.body ?? "").toString().trim();

    if (!subject) throw new Error("Chýba predmet mailu.");
    if (!text) throw new Error("Chýba text mailu.");

    const html = renderHtml(kind, subject, text);
    const apiKey = Deno.env.get("RESEND_API_KEY");

    if (mode === "test") {
      if (!apiKey) throw new Error("RESEND_API_KEY nie je nastavený.");
      const to = parseEmails(body.test_to);
      if (to.length === 0) throw new Error("Zadaj platnú adresu na testovací mail.");
      const failed = await sendBatch(to.slice(0, 1), `[TEST] ${subject}`, html, kind, apiKey);
      if (failed.length > 0) {
        throw new Error(lastResendError || "Testovací mail sa nepodarilo odoslať.");
      }
      return new Response(JSON.stringify({ sent: 1 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipients = await resolveRecipients(admin, audience, kind, body.manual_emails ?? null);

    if (mode === "preview") {
      return new Response(
        JSON.stringify({
          html,
          recipients_total: recipients.length,
          sample: recipients.slice(0, 20),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!apiKey) throw new Error("RESEND_API_KEY nie je nastavený.");
    if (recipients.length === 0) throw new Error("Výber neobsahuje žiadneho príjemcu.");

    // Riadok vzniká pred odoslaním — keby funkcia v polovici spadla,
    // v admine ostane stopa so stavom „sending“ namiesto ticha.
    const { data: row, error: insErr } = await admin
      .from("email_broadcasts")
      .insert({
        created_by: userId,
        kind,
        audience,
        subject,
        body: text,
        recipients_total: recipients.length,
        status: "sending",
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const failedEmails: string[] = [];
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      failedEmails.push(...(await sendBatch(batch, subject, html, kind, apiKey)));
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const sentCount = recipients.length - failedEmails.length;
    await admin
      .from("email_broadcasts")
      .update({
        sent_count: sentCount,
        failed_count: failedEmails.length,
        failed_emails: failedEmails,
        status: sentCount > 0 ? "done" : "failed",
      })
      .eq("id", row.id);

    return new Response(
      JSON.stringify({
        broadcast_id: row.id,
        recipients_total: recipients.length,
        sent_count: sentCount,
        failed_count: failedEmails.length,
        failed_emails: failedEmails.slice(0, 50),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-broadcast]", msg);
    const status = msg === "forbidden" ? 403 : msg === "not authenticated" ? 401 : 400;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
