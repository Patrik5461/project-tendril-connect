// Sync parciel zo ZBGIS do cadastral_parcels (interný modul Kataster).
// Chránené rovnakým apikey headerom ako sync-poo, spúšťa sa výhradne ručne
// z admina – žiadny cron. Zákaziek, grantov ani platieb sa netýka.
//
// Vstup:  { ku_code, register: 'C'|'E'|'both', mode: 'test'|'full' }
// Výstup: 202 { run_id } – beh pokračuje na pozadí, progres je v
//         cadastral_sync_runs (admin ho polluje).
import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TEST_PARCEL_LIMIT, ownersHaveSpf } from "@/lib/kataster";
import type { ParcelRegister, SyncMode, SyncRegister } from "@/lib/kataster";
// Len typ – hodnoty zo ZBGIS klienta ťaháme dynamickým importom, aby serverový
// kód neskončil v klientskom bundli.
import type { ZbgisParcelRef } from "@/server/kataster/zbgis";

/** Beh, ktorý takto dlho visí v stave running, považujeme za spadnutý (reštart procesu). */
const STALE_RUN_HOURS = 6;
/** Ako často zapisujeme progres, nech z toho nie je update na každú parcelu. */
const PROGRESS_EVERY = 10;
const MAX_ERRORS = 50;

type RunError = { parcel?: string; message: string };

// Tabuľky modulu Kataster ešte nie sú v generovaných typoch (types.ts sa
// regeneruje mimo repa), preto beztypový klient.
async function db(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

async function patchRun(runId: string, patch: Record<string, unknown>) {
  const supabase = await db();
  const { error } = await supabase.from("cadastral_sync_runs").update(patch).eq("id", runId);
  if (error) console.error("[sync-kataster] zápis behu zlyhal:", error.message);
}

async function runSync(runId: string, kuCode: string, registers: ParcelRegister[], mode: SyncMode) {
  const supabase = await db();
  const zbgis = await import("@/server/kataster/zbgis");
  const errors: RunError[] = [];
  const pushError = (e: RunError) => {
    if (errors.length < MAX_ERRORS) errors.push(e);
  };

  let done = 0;
  let spfCount = 0;

  try {
    // 1) Zoznam parciel pre všetky vybrané registre.
    const refs: Array<{ register: ParcelRegister; ref: ZbgisParcelRef }> = [];
    for (const register of registers) {
      const list = await zbgis.fetchParcelsInKu(kuCode, register);
      for (const ref of list) refs.push({ register, ref });
    }

    const planned = mode === "test" ? refs.slice(0, TEST_PARCEL_LIMIT) : refs;
    await patchRun(runId, { parcels_total: planned.length });

    // 2) Detail LV ku každej parcele + upsert.
    for (const { register, ref } of planned) {
      try {
        const detail = await zbgis.fetchLvDetail(ref.parcelId);
        const hasSpf = detail.hasSpf || ownersHaveSpf(detail.owners);
        const { error } = await supabase.from("cadastral_parcels").upsert(
          {
            ku_code: kuCode,
            parcel_register: register,
            parcel_number: ref.parcelNumber,
            lv_number: detail.lvNumber,
            area_m2: detail.areaM2,
            land_type: detail.landType,
            owners: detail.owners,
            has_spf: hasSpf,
            centroid_lat: ref.centroidLat,
            centroid_lng: ref.centroidLng,
            raw: { list: ref.raw, detail: detail.raw },
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "ku_code,parcel_register,parcel_number" },
        );
        if (error) throw new Error(error.message);
        if (hasSpf) spfCount++;
      } catch (e) {
        if (e instanceof zbgis.ZbgisBlockedError) throw e;
        pushError({ parcel: `${register} ${ref.parcelNumber}`, message: (e as Error).message });
      }

      done++;
      if (done % PROGRESS_EVERY === 0) {
        await patchRun(runId, { parcels_done: done, spf_count: spfCount, errors });
      }
    }

    await patchRun(runId, {
      status: "done",
      parcels_done: done,
      spf_count: spfCount,
      errors,
      finished_at: new Date().toISOString(),
    });
    console.log(
      `[sync-kataster] ${kuCode} hotovo: ${done}/${planned.length} parciel, SPF ${spfCount}, chýb ${errors.length}`,
    );
  } catch (e) {
    const blocked = e instanceof zbgis.ZbgisBlockedError;
    pushError({ message: (e as Error).message });
    await patchRun(runId, {
      status: blocked ? "blocked" : "failed",
      parcels_done: done,
      spf_count: spfCount,
      errors,
      finished_at: new Date().toISOString(),
    });
    console.error(`[sync-kataster] ${kuCode} ${blocked ? "zablokované" : "zlyhalo"}:`, e);
  }
}

function parseRegisters(value: unknown): ParcelRegister[] | null {
  const v = String(value ?? "both").toUpperCase();
  if (v === "C") return ["C"];
  if (v === "E") return ["E"];
  if (v === "BOTH") return ["C", "E"];
  return null;
}

export const Route = createFileRoute("/api/public/hooks/sync-kataster")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        const expected =
          process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!expected || apikey !== expected) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const kuCode = String(body["ku_code"] ?? "").trim();
        const registers = parseRegisters(body["register"]);
        const mode: SyncMode = body["mode"] === "full" ? "full" : "test";
        const registerLabel = (
          String(body["register"] ?? "both").toLowerCase() === "both"
            ? "both"
            : String(body["register"]).toUpperCase()
        ) as SyncRegister;

        if (!kuCode) return Response.json({ error: "ku_code je povinné" }, { status: 400 });
        if (!registers) {
          return Response.json({ error: "register musí byť C, E alebo both" }, { status: 400 });
        }

        try {
          const supabase = await db();

          // k.ú. musí byť v číselníku – inak by to spadlo až na FK uprostred behu.
          const { data: ku, error: kuError } = await supabase
            .from("ku_list")
            .select("ku_code")
            .eq("ku_code", kuCode)
            .maybeSingle();
          if (kuError) throw new Error(kuError.message);
          if (!ku) {
            return Response.json(
              { error: `k.ú. ${kuCode} nie je v ku_list – naimportuj číselník ÚGKK` },
              { status: 400 },
            );
          }

          // Dva paralelné behy nad tým istým k.ú. by si prepisovali progres.
          const staleBefore = new Date(Date.now() - STALE_RUN_HOURS * 3600_000).toISOString();
          const { data: running } = await supabase
            .from("cadastral_sync_runs")
            .select("id,started_at")
            .eq("ku_code", kuCode)
            .eq("status", "running")
            .gte("started_at", staleBefore)
            .limit(1);
          if (running && running.length > 0) {
            return Response.json(
              { error: "pre toto k.ú. už beží sync", run_id: running[0].id },
              { status: 409 },
            );
          }

          const { data: run, error: insertError } = await supabase
            .from("cadastral_sync_runs")
            .insert({ ku_code: kuCode, register: registerLabel, mode, status: "running" })
            .select("id")
            .single();
          if (insertError) throw new Error(insertError.message);

          // Full sync trvá pri limite 1 req/s hodiny, takže odpovedáme hneď
          // a beh dobehne na pozadí; admin sleduje cadastral_sync_runs.
          void runSync(run.id as string, kuCode, registers, mode);

          return Response.json(
            { run_id: run.id, ku_code: kuCode, register: registerLabel, mode },
            { status: 202 },
          );
        } catch (e) {
          console.error("sync-kataster failed", e);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
