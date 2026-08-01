import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useIsNative } from "@/lib/native";
import { disablePush, enablePush, getPushStatus, hasStoredToken } from "@/lib/push";

/** Sekcia "Notifikácie v aplikácii" – zobrazuje sa len na natívnej platforme. */
export function PushNotificationsCard() {
  const native = useIsNative();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!native) return;
    (async () => {
      const status = await getPushStatus();
      setDenied(status === "denied");
      setEnabled(status === "granted" && (await hasStoredToken()));
    })();
  }, [native]);

  if (!native) return null;

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const res = await enablePush();
        if (res.ok) {
          setEnabled(true);
          toast.success("Push notifikácie sú zapnuté.");
        } else if (res.reason === "denied") {
          setDenied(true);
          toast.error("Povolenie zamietnuté. Zapnite ho v nastaveniach telefónu.");
        } else {
          toast.error("Nepodarilo sa zapnúť notifikácie.");
        }
      } else {
        await disablePush();
        setEnabled(false);
        toast.success("Push notifikácie sú vypnuté.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
      <h2 className="font-display font-semibold text-lg tracking-tight">Notifikácie v aplikácii</h2>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="pushNotif">Push notifikácie na tomto zariadení</Label>
          <p className="text-sm text-muted-foreground">
            Nové zákazky podľa radaru, pripomienky deadlinov uložených zákaziek a dokončené AI
            analýzy. Rešpektuje vaše nastavenia vyššie.
          </p>
        </div>
        <Switch
          id="pushNotif"
          checked={enabled}
          disabled={busy}
          onCheckedChange={toggle}
          className="min-h-[24px]"
        />
      </div>
      {denied && (
        <p className="mt-3 text-xs text-muted-foreground">
          Povolenie na notifikácie je zamietnuté – zmeniť sa dá len v systémových nastaveniach
          telefónu.
        </p>
      )}
    </section>
  );
}

export default PushNotificationsCard;
