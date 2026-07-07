// Supabase Edge Function: generate-missing-summaries
// Generuje AI zhrnutia (3 vety) pre aktívne zákazky bez zhrnutia
// cez Lovable AI Gateway (LOVABLE_API_KEY).
//
// - Spracuje max BATCH_SIZE zákaziek na beh (default 20).
// - Iba aktívne (deadline > now() alebo deadline IS NULL).
// - Iba tie, kde ai_summary IS NULL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BATCH_SIZE = 20;
const DELAY_MS = 400;
const MODEL = "google/gemini-3.1-flash-lite";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type Tender = {
  id: string;
  title: string;
  contracting_authority: string;
  description: string | null;
  estimated_value: number | null;
  currency: string | null;
  deadline: string | null;
};

function formatValue(v: number | null, currency: string | null): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  const cur = currency ?? "EUR";
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 })
    .format(n) + " " + cur;
}

function buildPrompt(t: Tender): string {
  const parts: string[] = [];
  parts.push(`Názov: ${t.title}`);
  parts.push(`Obstarávateľ: ${t.contracting_authority}`);
  const val = formatValue(t.estimated_value, t.currency);
  if (val) parts.push(`Predpokladaná hodnota: ${val}`);
  if (t.deadline) {
    const d = new Date(t.deadline);
    parts.push(
      `Lehota na predkladanie ponúk: ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`,
    );
  }
  if (t.description) {
    const desc = t.description.length > 4000 ? t.description.slice(0, 4000) + "…" : t.description;
    parts.push(`Popis:\n${desc}`);
  }
  return parts.join("\n");
}

const SYSTEM_PROMPT =
  "Zhrň túto verejnú zákazku do 3 krátkych viet: (1) čo sa obstaráva, (2) kľúčové podmienky účasti ak sú uvedené, (3) na čo si dať pozor – termíny, zábezpeka, obmedzenia. Píš vecne, bez marketingu. Ak niektorý údaj chýba, vynechaj vetu. Odpovedaj po slovensky, bez úvodu a bez odrážok, len samotné vety.";

async function summarize(t: Tender, apiKey: string): Promise<string | null> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(t) },
      ],
      max_tokens: 300,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error(`rate_limited: ${body}`);
    if (res.status === 402) throw new Error(`credits_exhausted: ${body}`);
    throw new Error(`gateway ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("tenders")
      .select("id,title,contracting_authority,description,estimated_value,currency,deadline")
      .is("ai_summary", null)
      .or(`deadline.gt.${nowIso},deadline.is.null`)
      .order("created_at", { ascending: false })
      .limit(BATCH_SIZE);
    if (error) throw error;

    const tenders = (data ?? []) as Tender[];
    let generated = 0;
    let failed = 0;

    for (const t of tenders) {
      try {
        const summary = await summarize(t, apiKey);
        if (!summary) {
          failed++;
          continue;
        }
        const { error: uErr } = await supabase
          .from("tenders")
          .update({ ai_summary: summary, ai_summary_generated_at: new Date().toISOString() })
          .eq("id", t.id);
        if (uErr) {
          console.error("update failed", t.id, uErr);
          failed++;
        } else {
          generated++;
        }
      } catch (err) {
        console.error("summarize failed", t.id, err);
        failed++;
        if (String(err).startsWith("Error: rate_limited") || String(err).startsWith("Error: credits_exhausted")) {
          break;
        }
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    console.log(`generate-missing-summaries: checked=${tenders.length} generated=${generated} failed=${failed}`);
    return new Response(
      JSON.stringify({ checked: tenders.length, generated, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-missing-summaries failed:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
