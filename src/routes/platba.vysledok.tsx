import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trackConversion } from "@/lib/analytics";

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
          <h1 className="mt-6 font-display text-2xl font-bold">Overujem platbu…</h1>
          <p className="mt-3 text-muted-foreground">
            Chvíľu to potrvá, kým nám GoPay potvrdí stav.
          </p>
        </>
      ) : isSuccess ? (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-6 font-display text-3xl font-bold">Platba úspešná</h1>
          <p className="mt-3 text-muted-foreground">
            Vaše predplatné Tendrik Premium je aktívne. Ďakujeme!
          </p>
          <Link to="/dashboard" search={{ tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never}>
            <Button className="mt-8" size="lg">
              Pokračovať na dashboard <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </>
      ) : status === "trial" ? (
        <>
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-6 font-display text-3xl font-bold">Platba ešte nie je potvrdená</h1>
          <p className="mt-3 text-muted-foreground">
            Ak ste platbu zrušili, môžete ju spustiť znova. Ak ste zaplatili,
            potvrdenie môže prísť s malým oneskorením – skúste stránku obnoviť.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/predplatne"><Button>Skúsiť znova</Button></Link>
            <Link to="/dashboard" search={{ tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never}>
              <Button variant="outline">Späť na dashboard</Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-6 font-display text-3xl font-bold">Platba neprešla</h1>
          <p className="mt-3 text-muted-foreground">Skúste to prosím znova alebo nás kontaktujte.</p>
          <Link to="/predplatne"><Button className="mt-8">Skúsiť znova</Button></Link>
        </>
      )}
      {paymentId && (
        <p className="mt-8 text-xs text-muted-foreground">GoPay ID platby: <span className="num">{paymentId}</span></p>
      )}
    </div>
  );
}
