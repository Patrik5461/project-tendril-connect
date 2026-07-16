// Supabase Edge Function: help-chat
// Pomocník na weboch Tendrik cez Lovable AI Gateway.
// - Rate limit: 20 správ / hodinu / používateľa
// - Kontext: posledných 6 správ z klienta
// - Odpoveď max ~200 slov (max_tokens ~350)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "google/gemini-3.1-flash-lite";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const RATE_LIMIT = 20;
const MAX_HISTORY = 6;

const SYSTEM_PROMPT = `Si pomocník na webe Tendrik – služba na monitoring verejného obstarávania na Slovensku a v EÚ. Odpovedáš PO-slovensky, stručne a priateľsky, len na otázky o používaní Tendriku. Ak sa niekto pýta na niečo mimo Tendriku (všeobecné otázky, iné témy), zdvorilo odmietni a nasmeruj späť k Tendriku. Nikdy nevymýšľaj funkcie, ktoré neexistujú. Odpoveď maj maximálne 200 slov.

VEDOMOSTNÝ KONTEXT O TENDRIKU:
- Čo je Tendrik: monitoring verejných zákaziek zo zdrojov TED (EÚ vestník) a vestníka ÚVO (Slovensko), denne aktualizovaný.
- Radar = sada filtrov (kľúčové slová + CPV kategórie + kraje). Používateľ môže mať viac radarov pre rôzne odbory (napr. „Stavby", „Upratovanie") a prepínať medzi nimi v dashboarde. Kto robí jednu vec, stačí mu jeden radar.
- Ako začať: zaregistrovať sa → v onboardingu nastaviť prvý radar → zákazky chodia do dashboardu aj e-mailom.
- V dashboarde sú taby: „Pre teba" (nové), „Uložené" (hviezdička) a „Skryté" (X). Zákazku uložíš hviezdičkou, skryješ krížikom.
- E-maily: denný alebo týždenný digest (nastaviteľná frekvencia) + pripomienky deadlinov uložených zákaziek 3 dni a 1 deň vopred.
- Zobrazenie zoznam alebo mriežka, vyhľadávanie a triedenie podľa deadlinu, novosti alebo hodnoty.
- AI zhrnutie: pri každej zákazke krátke AI zhrnutie v detaile zákazky.
- Nastavenia: správa radarov, frekvencia e-mailov, prepínače notifikácií, odhlásenie.
- Cena: 30 dní zdarma na vyskúšanie (vrátane 5 AI analýz zákaziek), potom 4,99 €/mes (Základ, monitoring) alebo 14,99 €/mes (Prémium, s AI analýzou). Konečná cena – Tobify s. r. o. nie je platca DPH. Registrácia nevyžaduje kartu.`;


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: uData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !uData.user) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = uData.user.id;

    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit: 20/hour
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: cErr } = await admin
      .from("help_chat_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if (cErr) throw cErr;
    if ((count ?? 0) >= RATE_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message:
            "Prekročil si limit 20 správ za hodinu. Skús to znova o chvíľu.",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const history = Array.isArray(body?.messages) ? body.messages : [];
    const cleanHistory = history
      .filter(
        (m: any) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-MAX_HISTORY)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    if (cleanHistory.length === 0 || cleanHistory[cleanHistory.length - 1].role !== "user") {
      return new Response(
        JSON.stringify({ error: "invalid_input", message: "Chýba otázka." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
          ...cleanHistory,
        ],
        max_tokens: 350,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("gateway error", res.status, txt);
      if (res.status === 429) {
        return new Response(
          JSON.stringify({ error: "ai_rate_limited", message: "AI je momentálne preťažené, skús to o chvíľu." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (res.status === 402) {
        return new Response(
          JSON.stringify({ error: "credits_exhausted", message: "Pomocníkovi došli kredity. Kontaktuj prevádzkovateľa." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`gateway ${res.status}`);
    }
    const data = await res.json();
    const reply: string =
      data?.choices?.[0]?.message?.content?.trim() ??
      "Prepáč, teraz neviem odpovedať. Skús otázku preformulovať.";

    await admin.from("help_chat_usage").insert({ user_id: userId });

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("help-chat failed:", err);
    return new Response(
      JSON.stringify({ error: "internal", message: "Niečo sa pokazilo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
