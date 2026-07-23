// Shared helper: compute new grant matches for a user with baseline logic,
// mark them as sent, and render the HTML section for the daily digest.
//
// Baseline rule: the first time we ever evaluate a given radar (no prior
// rows in sent_grant_notifications for that radar_id, kind='new_match'),
// we silently insert all current matches as sent — never send them.
// From the second run onward, only truly new matches produce emails.

// deno-lint-ignore-file no-explicit-any

export type GrantRow = {
  id: string;
  kod: string | null;
  title: string;
  program: string | null;
  suma_eu: number | null;
  suma_sr: number | null;
  currency: string | null;
  deadline: string | null;
  opravneny_ziadatel: any;
  miesto_realizacie: any;
};

export type GrantRadar = {
  id: string;
  name: string;
  active: boolean;
};

export type GrantRadarGroup = {
  radar_id: string;
  radar_name: string;
  grants: GrantRow[];
};

const GRANT_SELECT =
  "id,kod,title,program,suma_eu,suma_sr,currency,deadline,opravneny_ziadatel,miesto_realizacie";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(d: string | null): string {
  if (!d) return "Priebežná (bez deadlinu)";
  const dt = new Date(d);
  return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
}

function formatMoney(v: number | null | undefined): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return (
    new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 })
      .format(n)
      .replace(/\u00a0/g, " ") + " €"
  );
}

function applicantChips(opravneny: any): string {
  const items = Array.isArray(opravneny) ? opravneny : [];
  const names = items
    .map((x: any) => (typeof x === "string" ? x : x?.nazov ?? x?.name))
    .filter((s: any): s is string => typeof s === "string" && s.length > 0);
  if (names.length === 0) return "";
  const show = names.slice(0, 4);
  const more = names.length - show.length;
  const chips = show
    .map(
      (n) =>
        `<span style="display:inline-block;padding:2px 8px;margin:2px 4px 2px 0;font-size:11px;color:#111;border:1px solid #d5d5d5;background:#fafafa;">${escapeHtml(
          n,
        )}</span>`,
    )
    .join("");
  const rest = more > 0
    ? `<span style="font-size:11px;color:#777;">+ ďalších ${more}</span>`
    : "";
  return `<div style="margin-top:8px;">${chips}${rest}</div>`;
}

function renderGrantRow(g: GrantRow, appUrl: string): string {
  const url = `${appUrl}/grant/${g.id}`;
  const titleHtml =
    `<a href="${escapeHtml(url)}" style="color:#111111;text-decoration:none;font-weight:600;font-family:'Source Serif 4',Georgia,serif;font-size:18px;line-height:1.25;">${escapeHtml(
      g.title || g.kod || "Grantová výzva",
    )}</a>`;
  const kodBadge = g.kod
    ? `<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;font-family:Inter,-apple-system,sans-serif;letter-spacing:0.12em;text-transform:uppercase;color:#0f7d3a;border:1px solid #0f7d3a;background:transparent;">${escapeHtml(
        g.kod,
      )}</span>`
    : "";
  const eu = formatMoney(g.suma_eu);
  const sr = formatMoney(g.suma_sr);
  const alloc = [eu ? `EÚ ${eu}` : null, sr ? `ŠR ${sr}` : null]
    .filter(Boolean)
    .join(" · ");
  const allocRow = alloc
    ? `<div style="margin-top:8px;font-family:Inter,-apple-system,sans-serif;font-variant-numeric:tabular-nums;font-weight:600;color:#0f7d3a;font-size:15px;">${escapeHtml(
      alloc,
    )}</div>`
    : "";
  const programRow = g.program
    ? `<b style="color:#111111;">Program:</b> ${escapeHtml(g.program)}<br/>`
    : "";
  return `
    <tr>
      <td style="padding:18px 0;border-top:1px solid #111111;border-bottom:1px solid #d5d5d5;">
        <div style="margin-bottom:8px;">${kodBadge}</div>
        <div style="margin-bottom:6px;">${titleHtml}</div>
        <div style="font-family:Inter,-apple-system,sans-serif;font-size:13px;color:#555555;line-height:1.6;">
          ${programRow}
          <b style="color:#111111;">Deadline:</b> <span style="font-variant-numeric:tabular-nums;">${escapeHtml(
    formatDate(g.deadline),
  )}</span>
        </div>
        ${allocRow}
        ${applicantChips(g.opravneny_ziadatel)}
      </td>
    </tr>`;
}

export function renderGrantSection(
  groups: GrantRadarGroup[],
  appUrl: string,
): { html: string; totalNew: number } {
  const totalNew = groups.reduce((s, g) => s + g.grants.length, 0);
  if (totalNew === 0) return { html: "", totalNew: 0 };
  const showMulti = groups.length > 1;
  const items = groups
    .map((g) => {
      const header = showMulti
        ? `<tr><td style="padding:20px 0 8px 0;">
            <div style="font-family:Inter,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#0f7d3a;">
              Grantový radar · ${escapeHtml(g.radar_name)} (${g.grants.length})
            </div>
          </td></tr>`
        : "";
      return header + g.grants.map((x) => renderGrantRow(x, appUrl)).join("");
    })
    .join("");
  const label = totalNew === 1
    ? "nová grantová výzva"
    : totalNew < 5
    ? "nové grantové výzvy"
    : "nových grantových výziev";
  const html = `
    <hr style="border:none;border-top:2px solid #111111;margin:32px 0 12px 0;"/>
    <div style="font-family:Inter,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#0f7d3a;margin-bottom:8px;">
      <span style="display:inline-block;width:8px;height:8px;background:#0f7d3a;vertical-align:1px;margin-right:8px;"></span>
      Grantové výzvy (ITMS21+)
    </div>
    <h2 style="margin:0 0 6px 0;font-family:'Source Serif 4',Georgia,serif;font-weight:700;font-size:22px;line-height:1.2;letter-spacing:-0.01em;color:#111111;">${totalNew} ${label}</h2>
    <p style="margin:0 0 16px 0;color:#555555;font-size:13px;">Vyhovujú vašim grantovým radarom.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
    <p style="text-align:left;margin:20px 0 0 0;">
      <a href="${appUrl}/granty" style="display:inline-block;background:#0f7d3a;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 24px;font-family:Inter,-apple-system,sans-serif;letter-spacing:0.02em;">
        Otvoriť granty v Tendriku →
      </a>
    </p>`;
  return { html, totalNew };
}

// Core: for a user compute new grant matches per radar, using baseline rule.
// If `dryRun=true`, no rows are inserted (used by preview/test mode) — but
// baseline decisions still apply based on the current DB state.
export async function computeAndMarkGrantMatches(
  supabase: any,
  userId: string,
  opts: { dryRun?: boolean } = {},
): Promise<{ groups: GrantRadarGroup[]; totalNew: number }> {
  const dryRun = !!opts.dryRun;
  const { data: radars, error: rErr } = await supabase
    .from("user_grant_radars")
    .select("id,name,active")
    .eq("user_id", userId)
    .eq("active", true);
  if (rErr) throw rErr;
  const activeRadars = (radars ?? []) as GrantRadar[];
  if (activeRadars.length === 0) return { groups: [], totalNew: 0 };

  const groups: GrantRadarGroup[] = [];

  for (const radar of activeRadars) {
    // Get current matches for this radar via RPC
    const { data: matched, error: mErr } = await supabase.rpc(
      "match_grants_for_radar",
      { _radar_id: radar.id },
    );
    if (mErr) {
      console.error(`match_grants_for_radar failed for ${radar.id}`, mErr);
      continue;
    }
    const rows = (matched ?? []) as any[];
    if (rows.length === 0) continue;

    // Prior sent notifications for THIS radar (baseline check + dedup)
    // We use `extra = radar.id` to scope per-radar (a grant matched by two
    // radars can legitimately notify twice, once per radar).
    const { data: priorRows, error: pErr } = await supabase
      .from("sent_grant_notifications")
      .select("grant_id")
      .eq("user_id", userId)
      .eq("kind", "new_match")
      .eq("extra", radar.id);
    if (pErr) throw pErr;
    const priorIds = new Set<string>((priorRows ?? []).map((r: any) => r.grant_id as string));
    const isFirstRun = priorIds.size === 0;

    // New = currently matched but not previously sent
    const currentIds = rows.map((r: any) => r.id as string);
    const newIds = currentIds.filter((id) => !priorIds.has(id));

    if (isFirstRun) {
      // Silent baseline — insert all current matches, notify none
      if (!dryRun && currentIds.length > 0) {
        const insertRows = currentIds.map((gid) => ({
          user_id: userId,
          grant_id: gid,
          kind: "new_match",
          extra: radar.id,
        }));
        const { error: iErr } = await supabase
          .from("sent_grant_notifications")
          .insert(insertRows);
        if (iErr) console.error("baseline insert failed", iErr);
      }
      continue;
    }

    if (newIds.length === 0) continue;

    // Fetch full grant rows for the new matches (RPC returned all fields, but
    // some may lack columns; re-select to be explicit).
    const newRows = rows
      .filter((r: any) => newIds.includes(r.id))
      .map((r: any) => ({
        id: r.id,
        kod: r.kod ?? null,
        title: r.title,
        program: r.program ?? null,
        suma_eu: r.suma_eu ?? null,
        suma_sr: r.suma_sr ?? null,
        currency: r.currency ?? null,
        deadline: r.deadline ?? null,
        opravneny_ziadatel: r.opravneny_ziadatel ?? null,
        miesto_realizacie: r.miesto_realizacie ?? null,
      })) as GrantRow[];

    // Mark as sent
    if (!dryRun) {
      const insertRows = newIds.map((gid) => ({
        user_id: userId,
        grant_id: gid,
        kind: "new_match",
        extra: radar.id,
      }));
      const { error: iErr } = await supabase
        .from("sent_grant_notifications")
        .insert(insertRows);
      if (iErr) console.error("mark sent failed", iErr);
    }

    groups.push({
      radar_id: radar.id,
      radar_name: radar.name,
      grants: newRows,
    });
  }

  const totalNew = groups.reduce((s, g) => s + g.grants.length, 0);
  return { groups, totalNew };
}

export { GRANT_SELECT };
