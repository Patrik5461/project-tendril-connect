// Supabase Edge Function: send-trial-ending
// Dva e-maily okolo konca 30-dňového trialu:
//   • "ending" – 3 dni pred koncom, pripomienka
//   • "ended"  – v deň, keď trial padne: oznam + zákazky, ktoré ich radar
//                medzičasom zachytil (posledné dva týždne)
//
// expire_trials() beží o 03:15 a status len prehodí na 'expired' – nikomu nič
// nepošle. Navyše send-daily-digest, send-weekly-digest aj send-deadline-reminders
// expirovaných preskakujú, takže bez tejto funkcie zákazníkovi maily zo dňa na deň
// prestanú chodiť bez jediného slova.
//
// Módy:
//   POST {}                                   -> cron: rozošle oba typy komu treba
//   POST { preview_user_id, kind }            -> { html, subject, tender_count }, nič sa neposiela
//   POST { test_send_to, test_user_id, kind } -> ostrý mail na zadanú adresu
//   POST { user_ids: [...], kind }            -> jednorazová rozoslávka konkrétnym ľuďom

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const FROM = "Tendrik <novinky@tendrik.sk>";
const APP_URL =
  Deno.env.get("APP_BASE_URL") ?? Deno.env.get("APP_URL") ??
  "https://www.tendrik.sk";

const TRIAL_DAYS = 30;
/** Koľko dní pred koncom trialu chodí pripomienka. */
const REMIND_BEFORE_DAYS = 3;
/** Ako ďaleko dozadu sa hľadajú zákazky do maily o skončení. */
const LOOKBACK_DAYS = 14;
/** Poistka, aby cron nedobehol dávno expirované kontá. */
const ENDED_GRACE_DAYS = 3;
const MAX_ITEMS = 15;
const PAGE_SIZE = 1000;

type Kind = "ending" | "ended";

type Tender = {
  id: string;
  title: string;
  contracting_authority: string;
  description: string | null;
  cpv_code: string | null;
  region: string | null;
  country: string | null;
  country_name: string | null;
  deadline: string | null;
  published_at: string | null;
  source_url: string | null;
  source: string;
  created_at: string;
  estimated_value?: number | null;
};

type Radar = {
  id: string;
  user_id: string;
  name: string;
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  countries: string[] | null;
  active: boolean;
};

// Zhodné s send-daily-digest – matching musí sedieť s tým, čo im chodilo počas trialu.
function matchesRadar(t: Tender, r: Radar): boolean {
  const countries = (r.countries && r.countries.length > 0) ? r.countries : ["SK"];
  const allCountries = countries.includes("ALL");
  if (!allCountries) {
    if (!t.country || !countries.includes(t.country)) return false;
  }
  if (t.country === "SK") {
    const wholeSk = r.regions.includes("Celé Slovensko");
    const regionOk =
      wholeSk || r.regions.length === 0 || (t.region ? r.regions.includes(t.region) : true);
    if (!regionOk) return false;
  }
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

function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n < 5 ? few : many;
}

function renderTenderRow(t: Tender): string {
  const titleHtml = t.source_url
    ? `<a href="${escapeHtml(t.source_url)}" style="color:#111111;text-decoration:none;font-weight:600;font-family:'Source Serif 4',Georgia,serif;font-size:18px;line-height:1.25;">${escapeHtml(t.title)}</a>`
    : `<span style="color:#111111;font-weight:600;font-family:'Source Serif 4',Georgia,serif;font-size:18px;line-height:1.25;">${escapeHtml(t.title)}</span>`;
  const valueStr = formatValue(t.estimated_value);
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
          <b style="color:#111111;">${t.country && t.country !== "SK" ? "Krajina" : "Región"}:</b> ${escapeHtml(t.country && t.country !== "SK" ? (t.country_name ?? t.country) : (t.region ?? "—"))}<br/>
          <b style="color:#111111;">Deadline:</b> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(formatDeadline(t.deadline))}</span>
        </div>
        ${valueRow}
      </td>
    </tr>`;
}

function shell(kicker: string, h1: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tendrik</title></head>
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
            ${kicker}
          </div>
          <h1 style="margin:0 0 6px 0;font-family:'Source Serif 4',Georgia,serif;font-weight:700;font-size:28px;line-height:1.15;letter-spacing:-0.01em;color:#111111;">${h1}</h1>
          ${bodyHtml}
          <hr style="border:none;border-top:2px solid #111111;margin:32px 0 12px 0;"/>
          <p style="font-size:12px;color:#777777;text-align:left;margin:0;">
            Píšeme vám, lebo máte konto v Tendriku. Konto ani vaše radary sa nemažú –
            po zaplatení všetko pokračuje tam, kde prestalo.<br/>
            <a href="${APP_URL}/settings" style="color:#26428B;text-decoration:underline;">Spravovať nastavenia</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function cta(label: string): string {
  return `<p style="text-align:left;margin:28px 0 8px 0;">
    <a href="${APP_URL}/predplatne" style="display:inline-block;background:#C8102E;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 28px;font-family:Inter,-apple-system,sans-serif;letter-spacing:0.02em;">
      ${label} →
    </a>
  </p>`;
}

function renderEnded(tenders: Tender[], totalCount: number): string {
  const intro = `<p style="margin:0 0 20px 0;color:#555555;font-size:14px;">
    Tridsať dní ubehlo. Váš radar sme pozastavili – nové zákazky vám odteraz
    nebudú chodiť a v aplikácii ich neuvidíte. Predplatné ho zapne späť hneď.
  </p>`;

  const list = totalCount > 0
    ? `<div style="font-family:Inter,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#C8102E;margin:28px 0 4px 0;">
         Čo váš radar zachytil za posledné dva týždne
       </div>
       <p style="margin:0 0 8px 0;color:#555555;font-size:14px;">
         ${totalCount} ${plural(totalCount, "zákazka, ktorá", "zákazky, ktoré", "zákaziek, ktoré")} ${totalCount === 1 ? "sedela" : "sedeli"} vašim filtrom.${totalCount > tenders.length ? ` Nižšie je prvých ${tenders.length}.` : ""}
       </p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tenders.map(renderTenderRow).join("")}</table>`
    : `<p style="margin:24px 0 0 0;color:#555555;font-size:14px;">
         Za posledné dva týždne vášmu radaru nič nesadlo. Zákazky pribúdajú
         každý deň – ak boli filtre úzke, po zapnutí predplatného ich viete
         kedykoľvek rozšíriť.
       </p>`;

  return intro + list + cta("Aktivovať predplatné");
}

function renderEnding(daysLeft: number, matchCount: number): string {
  const when = daysLeft <= 0 ? "dnes" : daysLeft === 1 ? "zajtra" : `o ${daysLeft} dni`;
  const countStr = matchCount > 300
    ? "vyše 300 zákaziek"
    : `${matchCount} ${plural(matchCount, "zákazku", "zákazky", "zákaziek")}`;
  const found = matchCount > 0
    ? `<p style="margin:0 0 20px 0;color:#555555;font-size:14px;">
         Len za posledné dva týždne vám radar našiel
         <b style="color:#111111;">${countStr}</b>.
         Po skončení trialu vám prestanú chodiť.
       </p>`
    : `<p style="margin:0 0 20px 0;color:#555555;font-size:14px;">
         Po skončení trialu sa radar pozastaví a nové zákazky vám prestanú chodiť.
       </p>`;
  return `<p style="margin:0 0 6px 0;color:#555555;font-size:14px;">
      Skúšobné obdobie vám končí ${when}.
    </p>` + found + cta("Pokračovať v Tendriku");
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

    let body: {
      preview_user_id?: string;
      test_send_to?: string;
      test_user_id?: string;
      user_ids?: string[];
      kind?: Kind;
    } = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    // Dva týždne zákaziek je cez 3 000 riadkov, PostgREST vracia naraz max 1 000 – preto stránkovanie.
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const tenders: Tender[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("tenders")
        .select(
          "id,title,contracting_authority,description,cpv_code,region,country,country_name,deadline,published_at,source_url,source,created_at,estimated_value",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as Tender[];
      tenders.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    async function buildForUser(userId: string, kind: Kind) {
      const { data: rData } = await supabase
        .from("user_radars").select("*").eq("user_id", userId);
      const radars = ((rData ?? []) as Radar[]).filter((r) => r.active);

      const seen = new Set<string>();
      const matched: Tender[] = [];
      for (const t of tenders) {
        if (seen.has(t.id)) continue;
        if (radars.some((r) => matchesRadar(t, r))) {
          seen.add(t.id);
          matched.push(t);
        }
      }

      if (kind === "ended") {
        const limited = matched.slice(0, MAX_ITEMS);
        return {
          subject: matched.length > 0
            ? `Váš trial skončil – ${matched.length} ${plural(matched.length, "zákazka", "zákazky", "zákaziek")} pre váš radar`
            : "Váš trial v Tendriku skončil",
          html: shell(
            "Skúšobné obdobie sa skončilo",
            "Váš trial v Tendriku skončil",
            renderEnded(limited, matched.length),
          ),
          tenderCount: matched.length,
        };
      }

      const { data: pref } = await supabase
        .from("user_preferences")
        .select("trial_started_at")
        .eq("user_id", userId)
        .maybeSingle();
      const startedAt = pref?.trial_started_at ? new Date(pref.trial_started_at as string) : null;
      const endsAt = startedAt
        ? new Date(startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
        : null;
      const daysLeft = endsAt
        ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : REMIND_BEFORE_DAYS;
      return {
        subject: daysLeft <= 0
          ? "Trial vám v Tendriku končí dnes"
          : daysLeft === 1
          ? "Trial vám v Tendriku končí zajtra"
          : `Trial vám v Tendriku končí o ${daysLeft} dni`,
        html: shell(
          "Trial sa blíži ku koncu",
          daysLeft <= 0
            ? "Trial vám končí dnes"
            : daysLeft === 1
            ? "Zostáva posledný deň"
            : `Zostávajú ${daysLeft} dni`,
          renderEnding(daysLeft, matched.length),
        ),
        tenderCount: matched.length,
      };
    }

    async function recipientsFor(userId: string): Promise<string[]> {
      const { data: pref } = await supabase
        .from("user_preferences")
        .select("notification_email")
        .eq("user_id", userId)
        .maybeSingle();
      const list = parseRecipients(pref?.notification_email as string | null, null);
      if (list.length > 0) return list;
      const { data: uRes, error: uErr } = await supabase.auth.admin.getUserById(userId);
      if (uErr || !uRes.user?.email) return [];
      return [uRes.user.email];
    }

    // Značka sa píše po odoslaní; keď stĺpec ešte nie je v DB, mail už odišiel
    // a padnúť na tom nesmieme – len to zalogujeme.
    async function markSent(userId: string, kind: Kind) {
      const col = kind === "ended" ? "trial_ended_email_sent_at" : "trial_ending_email_sent_at";
      const { error } = await supabase
        .from("user_preferences")
        .update({ [col]: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) console.error(`markSent(${kind}) failed for ${userId}:`, error);
    }

    // PREVIEW
    if (body.preview_user_id) {
      const out = await buildForUser(body.preview_user_id, body.kind ?? "ended");
      return new Response(
        JSON.stringify({ subject: out.subject, tender_count: out.tenderCount, html: out.html }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // TEST-SEND
    if (body.test_send_to && body.test_user_id) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) throw new Error("RESEND_API_KEY not configured");
      const to = parseRecipients(body.test_send_to, null);
      if (to.length === 0) throw new Error("test_send_to has no valid email");
      const out = await buildForUser(body.test_user_id, body.kind ?? "ended");
      const subject = `[TEST] ${out.subject}`;
      await sendEmail(to, subject, out.html, resendKey);
      return new Response(
        JSON.stringify({ sent_to: to, subject, tender_count: out.tenderCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    async function sendBatch(userIds: string[], kind: Kind) {
      let sent = 0;
      let errors = 0;
      for (const userId of userIds) {
        try {
          const to = await recipientsFor(userId);
          if (to.length === 0) {
            console.error(`No email for user ${userId}`);
            errors++;
            continue;
          }
          const out = await buildForUser(userId, kind);
          await sendEmail(to, out.subject, out.html, resendKey!);
          await markSent(userId, kind);
          sent++;
          await new Promise((r) => setTimeout(r, 100));
        } catch (err) {
          console.error(`trial ${kind} mail failed for ${userId}:`, err);
          errors++;
        }
      }
      return { sent, errors };
    }

    // JEDNORAZOVÁ ROZOSLÁVKA
    if (body.user_ids && body.user_ids.length > 0) {
      const kind = body.kind ?? "ended";
      const res = await sendBatch(body.user_ids, kind);
      return new Response(
        JSON.stringify({ mode: "manual", kind, users: body.user_ids.length, ...res }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // CRON
    const day = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();

    // Pripomienka: trial beží a do konca ostávajú najviac 3 dni.
    const { data: endingRows, error: e1 } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("subscription_status", "trial")
      .neq("subscription_source", "manual")
      .is("trial_ending_email_sent_at", null)
      .not("trial_started_at", "is", null)
      .lte("trial_started_at", iso(nowMs - (TRIAL_DAYS - REMIND_BEFORE_DAYS) * day))
      .gt("trial_started_at", iso(nowMs - TRIAL_DAYS * day));
    if (e1) throw e1;

    // Oznam o konci: expire_trials() ich už prehodil, chytáme len čerstvé.
    const { data: endedRows, error: e2 } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("subscription_status", "expired")
      .neq("subscription_source", "manual")
      .is("trial_ended_email_sent_at", null)
      .not("trial_started_at", "is", null)
      .gt("trial_started_at", iso(nowMs - (TRIAL_DAYS + ENDED_GRACE_DAYS) * day));
    if (e2) throw e2;

    const endedRes = await sendBatch((endedRows ?? []).map((r: any) => r.user_id as string), "ended");
    const endingRes = await sendBatch((endingRows ?? []).map((r: any) => r.user_id as string), "ending");

    return new Response(
      JSON.stringify({
        mode: "cron",
        ended: { users: endedRows?.length ?? 0, ...endedRes },
        ending: { users: endingRows?.length ?? 0, ...endingRes },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-trial-ending failed:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
