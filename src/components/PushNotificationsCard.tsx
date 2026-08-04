import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useIsNative } from "@/lib/native";
import { disablePush, enablePush, getPushStatus, hasStoredToken } from "@/lib/push";
import { useTranslation } from "react-i18next";

/** Sekcia "Notifikácie v aplikácii" – zobrazuje sa len na natívnej platforme. */
export function PushNotificationsCard() {
  const { t } = useTranslation("account");
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
          toast.success(t("push.enabled"));
        } else if (res.reason === "denied") {
          setDenied(true);
          toast.error(t("push.denied"));
        } else {
          toast.error(t("push.enableFailed"));
        }
      } else {
        await disablePush();
        setEnabled(false);
        toast.success(t("push.disabled"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-primary/15 bg-card p-6">
      <h2 className="font-display font-semibold text-lg tracking-tight">{t("push.heading")}</h2>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="pushNotif">{t("push.toggleLabel")}</Label>
          <p className="text-sm text-muted-foreground">
            {t("push.description")}
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
          {t("push.deniedNote")}
        </p>
      )}
    </section>
  );
}

export default PushNotificationsCard;
