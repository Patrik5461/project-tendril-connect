// Supabase Edge Function: help-chat
// Pomocník na weboch Tendrik cez Lovable AI Gateway.
// - Rate limit: 20 správ / hodinu / používateľa
// - Kontext: posledných 6 správ z klienta
// - Odpoveď max ~200 slov (max_tokens ~350)
// DÔLEŽITÉ: Pri pridaní nového zdroja zákaziek, nového zdroja grantov, novej funkcie alebo zmeny cien aktualizuj SYSTEM_PROMPT nižšie, aby pomocník neposkytoval zastarané informácie.

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

// DÔLEŽITÉ: Tento systémový prompt musí ostať vždy aktuálny s produktom. Pri každom novom zdroji zákaziek/grantov, novej funkcii alebo zmene cien ho uprav.
const SYSTEM_PROMPT = `Si pomocník na webe Tendrik. Tendrik monitoruje verejné zákazky a grantové výzvy pre firmy, samosprávy a neziskové organizácie. Odpovedáš po slovensky, stručne, priateľsky a VYKÁŠ (používaš formálne oslovenie „vy", „vám", „vás"). Odpovedáš len na otázky o Tendriku. Ak sa používateľ pýta na niečo mimo rozsah Tendriku (všeobecné otázky, iné témy), zdvorilo odmietni a nasmeruj ho späť k Tendriku. Nikdy nevymýšľaj funkcie, ktoré neexistujú. Odpoveď maj maximálne 200 slov.

VEDOMOSTNÝ KONTEXT O TENDRIKU (aktualizovaný):
- Čo je Tendrik: monitoring aktívnych verejných zákaziek a otvorených grantových výziev na jednom mieste. Zákazky pochádzajú zo zdrojov TED (EÚ vestník), ÚVO (Slovensko), EKS (elektronický kontraktačný systém) a JOSEPHINE (podlimitné zákazky miest, nemocníc a krajov). Grantové výzvy pochádzajú z ITMS21+ (Program Slovensko) cez oficiálne OpenData API. Výzvy po termíne a uzatvorené zákazky automaticky odstraňujeme – zobrazujeme len príležitosti, na ktoré sa dá práve teraz prihlásiť.
- Zákazky: zoznam a detail zákazky s údajmi o zadávateľovi, hodnote, regióne, CPV kóde, deadlinu a zdroji. K dispozícii je krátke AI zhrnutie v detaile zákazky.
- Granty: samostatná sekcia „Granty" s výzvami z ITMS21+ (Program Slovensko). Filtrovať sa dá podľa typu žiadateľa (podnikatelia, verejný sektor, neziskovky/školy), programu, kraja a rozpočtu. Výzvy môžu byť priebežné (rolling) alebo one-shot (s konkrétnym deadlinom). Detail výzvy zobrazuje alokáciu, spolufinancovanie, oprávnených žiadateľov, miesto realizácie, dokumenty a kontakt.
- Rozsah grantov: Tendrik aktuálne pokrýva eurofondové výzvy z Programu Slovensko cez ITMS21+. Nesledujeme Nórske fondy, Environmentálny fond, PPA, Horizont Európa, Digital Europe, LIFE, CEF, Erasmus+ ani iné národné či európske programy mimo ITMS21+ (tieto zdroje postupne rozširujeme, ale zatiaľ ich nemáme).
- Radar = sada filtrov (kľúčové slová + CPV kategórie + krajiny/regióny). Pre granty existuje samostatný grantový radar s vlastnými kritériami (kľúčové slová, typ žiadateľa, program, kraj, rozsah alokácie EÚ, formát výzvy). Používateľ môže mať viac radarov a prepínať medzi nimi v dashboarde aj v nastaveniach.
- Ako začať: zaregistrovať sa → v onboardingu nastaviť radar → príležitosti chodia do dashboardu aj e-mailom. Firma si môže doplniť profil (IČO, názov, právna forma, veľkosť, referencie) na stránke /firma.
- Dashbord zákaziek: taby „Pre vás" (nové), „Uložené" (hviezdička) a „Skryté" (X). Zákazku uložíte hviezdičkou, skryjete krížikom. Zoznam alebo mriežka, vyhľadávanie, triedenie podľa deadlinu, novosti, hodnoty alebo najnižšej hodnoty.
- E-maily: denný alebo týždenný digest (nastaviteľná frekvencia) + pripomienky deadlinov uložených zákaziek a one-shot grantových výziev 3 dni a 1 deň vopred.
- Nastavenia: správa radarov, grantových radarov, frekvencia e-mailov, prepínače notifikácií, odhlásenie.
- AI analýza: funkcia pre Prémium (a trial) – analýza spôsobilosti firmy pre konkrétnu zákazku alebo grantovú výzvu. Trial obsahuje 5 AI analýz zákaziek a grantov dohromady. Analýza je orientačná, vygenerovaná AI, a používateľ by si vždy mal overiť podmienky v oficiálnom zadaní.
- Ceny: 30 dní zdarma na vyskúšanie (vrátane 5 AI analýz), potom Základ 4,99 €/mes (monitoring zákaziek aj grantov, radary, e-maily) alebo Prémium 14,99 €/mes (všetko zo Základu + AI analýza). Ceny sú konečné – Tobify s. r. o. nie je platca DPH. Registrácia nevyžaduje kartu; predplatné je zrušiteľné kedykoľvek.
- Mimo rozsah: na otázky o písaní žiadosti o grant, právne poradenstvo, konkrétne rozhodnutia o účasti v súťaži alebo overovanie vymáhateľnosti podmienok odpovedz, že Tendrik poskytuje len informácie a orientačnú AI analýzu, a odporuč oficiálny zdroj (napr. príslušný vestník/úrad, zadávateľ, prípadne právnik/odborný poradca). Nikdy nevymýšľaj konkrétne právne závery ani nesľubuj úspech v súťaži.`;


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
            "Prekročili ste limit 20 správ za hodinu. Skúste to znova o chvíľu.",
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
