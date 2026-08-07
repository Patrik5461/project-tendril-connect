import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

type Preview = {
  user_id: string;
  email: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  is_admin: boolean;
  is_self: boolean;
  invoices: number;
  radars: number;
  grant_radars: number;
  tender_analyses: number;
  grant_analyses: number;
  saved_tenders: number;
  payment_events: number;
  has_billing_details: boolean;
  subscription_status: string | null;
  subscription_tier: string | null;
  subscription_source: string | null;
};

export function DeleteUserDialog({
  userId,
  onClose,
  onDeleted,
}: {
  userId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation("account");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [typedEmail, setTypedEmail] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [forceInvoices, setForceInvoices] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase.rpc as any)("admin_user_delete_preview", { _user_id: userId });
      if (cancelled) return;
      setLoading(false);
      if (error) { toast.error(error.message); onClose(); return; }
      setPreview(data as Preview);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const emailOk =
    !!preview && typedEmail.trim().toLowerCase() === (preview.email ?? "").trim().toLowerCase();
  const hasInvoices = (preview?.invoices ?? 0) > 0;
  const canDelete =
    !!preview && !preview.is_admin && understood && emailOk && (!hasInvoices || forceInvoices) && !busy;

  const items: Array<{ label: string; count: number }> = preview
    ? [
        { label: t("adminDelete.items.radars"), count: preview.radars },
        { label: t("adminDelete.items.grantRadars"), count: preview.grant_radars },
        { label: t("adminDelete.items.tenderAnalyses"), count: preview.tender_analyses },
        { label: t("adminDelete.items.grantAnalyses"), count: preview.grant_analyses },
        { label: t("adminDelete.items.savedTenders"), count: preview.saved_tenders },
        { label: t("adminDelete.items.paymentEvents"), count: preview.payment_events },
      ].filter((i) => (i.count ?? 0) > 0)
    : [];

  async function confirmDelete() {
    if (!preview) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("admin_delete_user", {
      _user_id: userId,
      _force: forceInvoices,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("adminDelete.deleted", { email: preview.email }));
    onDeleted();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {loading ? t("adminDelete.loading") : t("adminDelete.title", { email: preview?.email ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("adminDelete.description")}</DialogDescription>
        </DialogHeader>

        {loading && <div className="text-sm text-muted-foreground">{t("adminDelete.loading")}</div>}

        {preview && preview.is_admin && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {t("adminDelete.isAdmin")}
          </div>
        )}

        {preview && !preview.is_admin && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium">{t("adminDelete.willDelete")}</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
                {items.map((i) => (
                  <li key={i.label}>{i.label}: <b className="text-foreground">{i.count}</b></li>
                ))}
                <li>{t("adminDelete.items.settings")}</li>
                {preview.has_billing_details && <li>{t("adminDelete.items.billingDetails")}</li>}
              </ul>
            </div>

            {hasInvoices && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{t("adminDelete.invoicesWarning", { count: preview.invoices })}</span>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={forceInvoices} onCheckedChange={(v) => setForceInvoices(v === true)} />
                  {t("adminDelete.forceCheckbox")}
                </label>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} />
              {t("adminDelete.understandCheckbox")}
            </label>

            <div>
              <Label htmlFor="confirm-email">{t("adminDelete.retypeEmail", { email: preview.email })}</Label>
              <Input
                id="confirm-email"
                className="mt-1"
                value={typedEmail}
                onChange={(e) => setTypedEmail(e.target.value)}
                placeholder={preview.email}
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("adminDelete.cancel")}</Button>
          <Button variant="destructive" disabled={!canDelete} onClick={confirmDelete}>
            {busy ? t("adminDelete.deleting") : t("adminDelete.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteUserDialog;
