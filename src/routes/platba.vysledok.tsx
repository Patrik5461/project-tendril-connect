import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trackConversion } from "@/lib/analytics";
import { useTranslation } from "react-i18next";

type Search = { id?: string; payment_id?: string };

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
  const search = useSearch({ from: "/platba/vysledok" }) as Search;
  const paymentId = search.id ?? search.payment_id;
  const [status, setStatus] = useState<"loading" | "active" | "trial" | "expired" | "unknown">("loading");

  useEffect(() => {
    let cancelled = false;
    async function poll(attempt = 0) {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setStatus("unknown"); return; }
      const { data } = await supabase
        .from("user_preferences")
        .select("subscription_status")
        .eq("user_id", u.user.id)
        .maybeSingle();
      const s = (data?.subscription_status ?? "trial") as string;
      if (cancelled) return;
      if (s === "active" || attempt >= 6) {
        if (s === "active") {
          trackConversion("subscription_purchase", {
            transaction_id: paymentId,
            currency: "EUR",
          });
        }
        setStatus(s as "active" | "trial" | "expired");
      } else {
        setTimeout(() => poll(attempt + 1), 1500);
      }
    }
    poll();
    return () => { cancelled = true; };
  }, [paymentId]);

  const isSuccess = status === "active";
  const isLoading = status === "loading";

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      {isLoading ? (
        <>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          <h1 className="mt-6 font-display text-2xl font-bold">{t("platbaVysledok.verifying")}</h1>
          <p className="mt-3 text-muted-foreground">
            {t("platbaVysledok.verifyingText")}
          </p>
        </>
      ) : isSuccess ? (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-6 font-display text-3xl font-bold">{t("platbaVysledok.successTitle")}</h1>
          <p className="mt-3 text-muted-foreground">
            {t("platbaVysledok.successText")}
          </p>
          <Link to="/dashboard" search={{ tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never}>
            <Button className="mt-8" size="lg">
              {t("platbaVysledok.continueToDashboard")} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </>
      ) : status === "trial" ? (
        <>
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-6 font-display text-3xl font-bold">{t("platbaVysledok.pendingTitle")}</h1>
          <p className="mt-3 text-muted-foreground">
            {t("platbaVysledok.pendingText")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/predplatne"><Button>{t("platbaVysledok.tryAgain")}</Button></Link>
            <Link to="/dashboard" search={{ tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never}>
              <Button variant="outline">{t("platbaVysledok.backToDashboard")}</Button>
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
