// Supabase Edge Function: send-settings-confirmation
// Sends a confirmation email after user saves notification/radar settings.
// Rate limit: max 1 email per user per 30 minutes (last_settings_email_at).
// Skipped if user has notifications disabled.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM = "Tendrik <novinky@tendrik.sk>";
const APP_URL =
  Deno.env.get("APP_BASE_URL") ?? Deno.env.get("APP_URL") ??
  "https://www.tendrik.sk";

const EU_COUNTRIES: Record<string, string> = {
  AT: "Rakúsko", BE: "Belgicko", BG: "Bulharsko", HR: "Chorvátsko", CY: "Cyprus",
  CZ: "Česko", DK: "Dánsko", EE: "Estónsko", FI: "Fínsko", FR: "Francúzsko",
  DE: "Nemecko", GR: "Grécko", HU: "Maďarsko", IE: "Írsko", IT: "Taliansko",
  LV: "Lotyšsko", LT: "Litva", LU: "Luxembursko", MT: "Malta", NL: "Holandsko",
  PL: "Poľsko", PT: "Portugalsko", RO: "Rumunsko", SK: "Slovensko", SI: "Slovinsko",
  ES: "Španielsko", SE: "Švédsko",
};

// Trimmed CPV division labels (matches src/lib/slovakia.ts CPV_DIVISIONS).
const CPV_LABELS: Record<string, string> = {
  "03": "Poľnohospodárske produkty", "09": "Ropa, palivá, elektrina",
  "14": "Ťažobné produkty", "15": "Potraviny, nápoje, tabak",
  "16": "Poľnohospodárske stroje", "18": "Odevy a obuv", "19": "Kožené a textilné výrobky",
  "22": "Tlačené výrobky", "24": "Chemické produkty", "30": "Kancelárska a výpočtová technika",
  "31": "Elektrické stroje", "32": "Telekomunikačné zariadenia",
  "33": "Zdravotnícke zariadenia a lieky", "34": "Dopravné prostriedky",
  "35": "Bezpečnostné zariadenia", "37": "Hudobné nástroje, šport",
  "38": "Laboratórne a optické prístroje", "39": "Nábytok a spotrebiče",
  "41": "Voda", "42": "Priemyselné stroje", "43": "Banské a stavebné stroje",
  "44": "Stavebné konštrukcie a materiály", "45": "Stavebné práce",
  "48": "Softvér a informačné systémy", "50": "Opravy a údržba",
  "51": "Inštalačné služby", "55": "Hotelové, reštauračné a maloobchodné služby",
  "60": "Dopravné služby", "63": "Podporné dopravné služby",
  "64": "Poštové a telekomunikačné služby", "65": "Verejné služby",
  "66": "Finančné a poisťovacie služby", "70": "Realitné služby",
  "71": "Architektonické a inžinierske služby", "72": "IT služby",
  "73": "Výskum a vývoj", "75": "Verejná správa", "76": "Ropný a plynárenský priemysel",
  "77": "Poľnohospodárske služby", "79": "Podnikateľské služby",
  "80": "Vzdelávanie", "85": "Zdravotníctvo a sociálna práca",
  "90": "Odpady, čistenie, životné prostredie", "92": "Rekreácia, kultúra, šport",
  "98": "Iné komunálne služby",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Radar = {
  name: string;
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  countries: string[];
  active: boolean;
};

function fmtRadar(r: Radar): string {
  const parts: string[] = [];
  if (r.keywords?.length) parts.push(`kľúčové slová: ${r.keywords.join(", ")}`);
  if (r.cpv_codes?.length) {
    parts.push(
      "CPV: " +
        r.cpv_codes.map((c) => `${c} ${CPV_LABELS[c] ?? ""}`.trim()).join(" · "),
    );
  }
  const countries = r.countries ?? [];
  if (countries.includes("ALL")) {
    parts.push("Krajiny: všetky krajiny EÚ");
  } else if (countries.length) {
    parts.push(
      "Krajiny: " +
        countries.map((c) => EU_COUNTRIES[c] ?? c).join(", "),
    );
  }
  if ((countries.includes("SK") || countries.includes("ALL")) && r.regions?.length) {
    parts.push(`Kraje: ${r.regions.join(", ")}`);
  }
  if (!parts.length) parts.push("bez filtrov");
  return `<strong>${esc(r.name)}</strong> – ${esc(parts.join(" · "))}`;
}

function renderHtml(opts: {
  digest: string;
  emailNotif: boolean;
  deadlineRem: boolean;
  radars: Radar[];
  settingsUrl: string;
}): string {
  const digestLabel = !opts.emailNotif
    ? "vypnuté"
    : opts.digest === "weekly"
    ? "týždenne"
    : "denne";

  const active = opts.radars.filter((r) => r.active);
  const inactive = opts.radars.filter((r) => !r.active);
  const radarBlock = active.length === 0
    ? `<li>Momentálne nemáte žiadny aktívny radar${
        inactive.length ? ` (${inactive.length} vypnutých)` : ""
      }.</li>`
    : active.map((r) => `<li style="margin-bottom:8px;">${fmtRadar(r)}</li>`).join("") +
      (inactive.length
        ? `<li style="margin-top:8px;color:#525252;">Vypnuté radary: ${inactive
            .map((r) => esc(r.name))
            .join(", ")}</li>`
        : "");

  return `<!doctype html>
<html lang="sk"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Nastavenia uložené</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:2px solid #0a0a0a;">
  <tr><td style="padding:20px 24px;border-bottom:2px solid #0a0a0a;">
    <table role="presentation" width="100%"><tr>
      <td><span style="display:inline-block;width:14px;height:14px;background:#dc2626;vertical-align:middle;margin-right:8px;"></span><span style="font-weight:800;font-size:18px;letter-spacing:-0.01em;vertical-align:middle;">Tendrik</span></td>
      <td align="right" style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#525252;">Nastavenia</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 24px 8px 24px;">
    <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.01em;">Nastavenia uložené <span style="color:#dc2626;">✓</span></h1>
    <p style="margin:14px 0 0 0;font-size:15px;line-height:1.55;">Ďakujeme, že používate Tendrik. Vaše nastavenia sme uložili a od tejto chvíle sa nimi riadime pri hľadaní zákaziek.</p>
  </td></tr>
  <tr><td style="padding:20px 24px 0 24px;">
    <p style="margin:0 0 8px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#525252;font-weight:700;">Vaše aktuálne nastavenie</p>
    <ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;">
      <li>Frekvencia e-mailov: <strong>${digestLabel}</strong></li>
      <li>Pripomienky deadlinov: <strong>${opts.deadlineRem ? "zapnuté" : "vypnuté"}</strong></li>
    </ul>
  </td></tr>
  <tr><td style="padding:16px 24px 0 24px;">
    <p style="margin:0 0 8px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#525252;font-weight:700;">Vaše radary</p>
    <ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;">${radarBlock}</ul>
  </td></tr>
  <tr><td style="padding:20px 24px 0 24px;">
    <p style="margin:0;font-size:15px;line-height:1.55;">Ak niečo nesedí, kedykoľvek si to upravíte v nastaveniach.</p>
  </td></tr>
  <tr><td style="padding:20px 24px 8px 24px;" align="left">
    <a href="${opts.settingsUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border:2px solid #0a0a0a;">Upraviť nastavenia →</a>
  </td></tr>
  <tr><td style="padding:18px 24px 24px 24px;">
    <p style="margin:0;font-size:14px;line-height:1.55;"><strong>tím Tendrik</strong></p>
  </td></tr>
  <tr><td style="padding:16px 24px;border-top:2px solid #0a0a0a;font-size:12px;line-height:1.5;color:#525252;">
    Tento e-mail ste dostali, lebo ste zmenili nastavenia v Tendriku.<br/>
    <a href="${opts.settingsUrl}" style="color:#0a0a0a;text-decoration:underline;">Nastavenia notifikácií</a>
  </td></tr>
</table></td></tr></table></body></html>`;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "missing_authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;
    const userId = user.id;

    const admin = createClient(url, serviceKey);

    const { data: prefs, error: prefErr } = await admin
      .from("user_preferences")
      .select("email_notifications, deadline_reminders, digest_frequency, notification_email, last_settings_email_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (prefErr) throw prefErr;

    if (!prefs || prefs.email_notifications === false) {
      return new Response(JSON.stringify({ sent: false, reason: "notifications_off" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const last = (prefs as any).last_settings_email_at
      ? new Date((prefs as any).last_settings_email_at).getTime()
      : 0;
    if (last && Date.now() - last < 30 * 60 * 1000) {
      return new Response(JSON.stringify({ sent: false, reason: "rate_limited" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: radars } = await admin
      .from("user_radars")
      .select("name, keywords, cpv_codes, regions, countries, active")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const recipients = parseRecipients((prefs as any).notification_email, user.email);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: false, reason: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const html = renderHtml({
      digest: String((prefs as any).digest_frequency ?? "daily"),
      emailNotif: (prefs as any).email_notifications !== false,
      deadlineRem: (prefs as any).deadline_reminders !== false,
      radars: (radars ?? []) as Radar[],
      settingsUrl: `${APP_URL}/settings`,
    });

    // Reserve the rate-limit slot BEFORE sending to avoid duplicate emails
    // from concurrent saves; if send fails we roll it back.
    const previousLast = (prefs as any).last_settings_email_at ?? null;
    await admin
      .from("user_preferences")
      .update({ last_settings_email_at: new Date().toISOString() })
      .eq("user_id", userId);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM,
        to: recipients,
        subject: "Tendrik: vaše nastavenia sú uložené",
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      await admin
        .from("user_preferences")
        .update({ last_settings_email_at: previousLast })
        .eq("user_id", userId);
      throw new Error(`Resend error ${res.status}: ${text}`);
    }

    return new Response(JSON.stringify({ sent: true, recipients: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-settings-confirmation error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
