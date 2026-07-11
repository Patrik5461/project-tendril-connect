import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MONTHLY_PRICE_EUR, formatEur } from "@/lib/subscription";
import { PaymentBadges } from "@/components/LegalFooter";
import { toast } from "sonner";

export const Route = createFileRoute("/predplatne")({
  head: () => ({
    meta: [
      { title: "Aktivovať predplatné – Tendrik" },
      { name: "description", content: "Aktivujte Tendrik Premium za 6,14 € s DPH / mesiac cez GoPay." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PredplatnePage,
});

function PredplatnePage() {
  const [loading, setLoading] = useState(false);
  const [env, setEnv] = useState<string | null>(null);
  const navigate = useNavigate();

  async function activate() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gopay-create-subscription", { body: {} });
      if (error || !data) {
        const msg = (error as any)?.context?.body
          ? await (error as any).context.body.text?.() ?? ""
          : "";
        toast.error("Nepodarilo sa spustiť platbu. " + (msg || (error?.message ?? "")));
        return;
      }
      if (data.error === "GOPAY_NOT_CONFIGURED") {
        setEnv(data.env ?? "sandbox");
        toast.error("GoPay kľúče zatiaľ nie sú vyplnené (režim: " + (data.env ?? "sandbox") + ").");
        return;
      }
      if (data.gw_url) {
        window.location.href = data.gw_url;
        return;
      }
      toast.error("GoPay nevrátil URL brány.");
    } catch (e) {
      toast.error("Chyba: " + String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="eyebrow flex items-center justify-center text-foreground">
        <span className="red-square" aria-hidden="true" />
        Predplatné
      </div>
      <h1 className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight text-center">
        Aktivujte Tendrik Premium
      </h1>
      <p className="mt-4 text-center text-muted-foreground">
        <b className="text-foreground">{formatEur(MONTHLY_PRICE_EUR)}</b> bez DPH mesačne
        (6,14 € s DPH). Automatické obnovenie cez GoPay, zrušenie kedykoľvek.
      </p>

      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-primary" />
          <div className="text-sm">
            <b>Bezpečná platba cez GoPay</b>
            <p className="text-muted-foreground">Visa / Mastercard, 3D Secure.</p>
          </div>
        </div>
        <PaymentBadges className="mt-4" />
        <Button className="mt-6 w-full" size="lg" onClick={activate} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Pokračovať na platbu
        </Button>
        {env === "sandbox" && (
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Režim: <b>SANDBOX</b> – testovacia prevádzka.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground text-center">
          Kliknutím súhlasíte s{" "}
          <Link to="/pravne/obchodne-podmienky" className="underline">obchodnými podmienkami</Link> a{" "}
          <Link to="/pravne/opakovane-platby" className="underline">opakovanými platbami</Link>.
        </p>
      </div>

      <div className="mt-8 text-center">
        <Button variant="ghost" onClick={() => navigate({ to: "/dashboard", search: { tab: "foryou", sort: "deadline", q: "", view: "list", radar: "all", country: "", page: 1, pageSize: 20 } as never })}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Späť na dashboard
        </Button>
      </div>
    </div>
  );
}
