import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

export function DangerZoneSection({ email }: { email: string }) {
  const { t } = useTranslation("account");
  const navigate = useNavigate();
  const [step1, setStep1] = useState(false);
  const [step2, setStep2] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailOk = typedEmail.trim().toLowerCase() === (email ?? "").trim().toLowerCase();
  const canDelete = emailOk && understood && !busy;

  function reset() {
    setStep1(false); setStep2(false); setTypedEmail(""); setUnderstood(false);
  }

  function mapError(message: string): string {
    if (message.includes("potvrdzovaci e-mail nesedi")) return t("dangerZone.errors.emailMismatch");
    if (message.includes("najprv zrus opakovane predplatne")) return t("dangerZone.errors.cancelSubscriptionFirst");
    if (message.includes("admin ucet nie je mozne zmazat")) return t("dangerZone.errors.adminAccount");
    return message;
  }

  async function confirmDelete() {
    setBusy(true);
    const { error } = await (supabase.rpc as any)("delete_my_account", { _confirm_email: typedEmail.trim() });
    if (error) {
      setBusy(false);
      toast.error(mapError(error.message ?? ""));
      return;
    }
    await supabase.auth.signOut();
    setBusy(false);
    reset();
    toast.success(t("dangerZone.deleted"));
    void navigate({ to: "/" });
  }

  return (
    <section className="mt-10 rounded-lg border border-destructive bg-destructive/5 p-6">
      <h2 className="font-display font-semibold text-lg tracking-tight text-destructive flex items-center gap-2">
        <AlertTriangle className="h-5 w-5" /> {t("dangerZone.heading")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("dangerZone.description")}</p>
      <Button variant="destructive" className="mt-4" onClick={() => setStep1(true)}>
        {t("dangerZone.deleteButton")}
      </Button>

      <AlertDialog open={step1} onOpenChange={(o) => { if (!o) reset(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dangerZone.step1.title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>{t("dangerZone.step1.intro")}</p>
                <ul className="mt-2 list-disc pl-5 space-y-0.5">
                  <li>{t("dangerZone.step1.items.radars")}</li>
                  <li>{t("dangerZone.step1.items.savedTenders")}</li>
                  <li>{t("dangerZone.step1.items.analyses")}</li>
                  <li>{t("dangerZone.step1.items.notifications")}</li>
                  <li>{t("dangerZone.step1.items.billingDetails")}</li>
                </ul>
                <p className="mt-2">{t("dangerZone.step1.invoicesNote")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dangerZone.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setStep1(false); setStep2(true); }}>
              {t("dangerZone.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={step2} onOpenChange={(o) => { if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t("dangerZone.step2.title")}</DialogTitle>
            <DialogDescription>{t("dangerZone.step2.warning")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="self-delete-email">{t("dangerZone.step2.emailLabel", { email })}</Label>
              <Input
                id="self-delete-email"
                className="mt-1"
                value={typedEmail}
                onChange={(e) => setTypedEmail(e.target.value)}
                placeholder={email}
                autoComplete="off"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} />
              {t("dangerZone.step2.checkbox")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reset}>{t("dangerZone.cancel")}</Button>
            <Button variant="destructive" disabled={!canDelete} onClick={confirmDelete}>
              {busy ? t("dangerZone.deleting") : t("dangerZone.step2.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default DangerZoneSection;
