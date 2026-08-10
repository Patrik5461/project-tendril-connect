import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trackConversion } from "@/lib/analytics";
import { useTranslation } from "react-i18next";

type Search = { id?: string; payment_id?: string };
type Status = "checking" | "success" | "pending" | "failed";

const MAX_ATTEMPTS = 6;
const RETRY_MS = 2000;

export const Route = createFileRoute("/platba/vysledok")({
  head: () => ({
    meta: [
      { title: "Výsledok platby – Tendrik" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    id: typeof s.id === "string" ? s.id : undefined,
    payment_id: typeof s.payment_id === "string" ? s.payment_id : undefined,
  }),
  component: PlatbaVysledok,
});

function PlatbaVysledok() {
  const { t } = useTranslation("public");
  const queryClient = useQueryClient();
  const search = useSearch({ from: "/platba/vysledok" }) as Search;
  const paymentId = search.id ?? search.payment_id;
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    cancelled.current = false;
    setBusy(true);
    const busyTimer = setTimeout(() => setBusy(false), 2000);

    try {
      if (!paymentId) { setStatus("pending"); return; }
      setStatus("checking");

      let reprocessFired = false;
      const started = Date.now();

      while (Date.now() - started < POLL_TIMEOUT_MS) {
        if (cancelled.current) return;

        let state: string | null = null;
        try {
          const { data } = await supabase
            .from("gopay_payment_events")
            .select("state")
            .eq("gopay_payment_id", paymentId)
            .order("received_at", { ascending: false })
            .limit(1);
          const row = (data as { state: string | null }[] | null)?.[0];
          state = row?.state ? String(row.state).toUpperCase() : null;
        } catch { /* pokračuj v pollovaní */ }

        if (cancelled.current) return;

        if (state === "PAID") {
          trackConversion("subscription_purchase", { transaction_id: paymentId, currency: "EUR" });
          queryClient.invalidateQueries({ queryKey: ["user_preferences"] });
          queryClient.invalidateQueries({ queryKey: ["entitlements"] });
          queryClient.invalidateQueries({ queryKey: ["get_entitlements"] });
          setStatus("success");
          return;
        }
        if (state === "CANCELED" || state === "TIMEOUTED") { setStatus("failed"); return; }

        // Fallback: po 3 s bez záznamu jedenkrát pošli reprocess (fire-and-forget).
        if (!reprocessFired && !state && Date.now() - started >= REPROCESS_AFTER_MS) {
          reprocessFired = true;
          void supabase.functions
            .invoke("gopay-webhook", { body: { reprocess: true, payment_id: paymentId } })
            .catch(() => {});
        }

        await new Promise((r) => setTimeout(r, POLL_MS));
      }

      if (!cancelled.current) setStatus("pending");
    } finally {
      clearTimeout(busyTimer);
      setBusy(false);
      running.current = false;
    }
  }, [paymentId, queryClient]);

  useEffect(() => {
    void run();
    return () => { cancelled.current = true; running.current = false; };
  }, [run]);


  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      {status === "checking" ? (
        <>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          <h1 className="mt-6 font-display text-2xl font-bold">{t("platbaVysledok.verifying")}</h1>
          <p className="mt-3 text-muted-foreground">{t("platbaVysledok.verifyingText")}</p>
        </>
      ) : status === "success" ? (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-6 font-display text-3xl font-bold">{t("platbaVysledok.successTitle")}</h1>
          <p className="mt-3 text-muted-foreground">{t("platbaVysledok.successText")}</p>
          <Link to="/dashboard" search={{ tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never}>
            <Button className="mt-8" size="lg">
              {t("platbaVysledok.continueToApp")} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </>
      ) : status === "pending" ? (
        <>
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-6 font-display text-3xl font-bold">{t("platbaVysledok.processingTitle")}</h1>
          <p className="mt-3 text-muted-foreground">{t("platbaVysledok.processingText")}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => void run()}>
              <RefreshCw className="h-4 w-4 mr-2" /> {t("platbaVysledok.refreshStatus")}
            </Button>
            <Link to="/kontakt"><Button variant="outline">{t("platbaVysledok.contactSupport")}</Button></Link>
            <Link to="/dashboard" search={{ tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never}>
              <Button variant="ghost">{t("platbaVysledok.backToDashboard")}</Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-6 font-display text-3xl font-bold">{t("platbaVysledok.failedTitle")}</h1>
          <p className="mt-3 text-muted-foreground">{t("platbaVysledok.failedText")}</p>
          <Link to="/predplatne"><Button className="mt-8">{t("platbaVysledok.tryAgain")}</Button></Link>
        </>
      )}
      {paymentId && (
        <p className="mt-8 text-xs text-muted-foreground">{t("platbaVysledok.gopayId")} <span className="num">{paymentId}</span></p>
      )}
    </div>
  );
}
