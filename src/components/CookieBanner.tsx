import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  EVENT_OPEN_SETTINGS,
  getConsent,
  setConsent,
  subscribeConsent,
  type ConsentRecord,
} from "@/lib/cookie-consent";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CookieBanner() {
  const { t } = useTranslation("legal");
  const [mounted, setMounted] = useState(false);
  const [record, setRecord] = useState<ConsentRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyticsDraft, setAnalyticsDraft] = useState(false);

  useEffect(() => {
    setMounted(true);
    setRecord(getConsent());
    const unsub = subscribeConsent(setRecord);
    const openHandler = () => {
      setAnalyticsDraft(getConsent()?.categories.analytics === true);
      setSettingsOpen(true);
    };
    window.addEventListener(EVENT_OPEN_SETTINGS, openHandler);
    return () => {
      unsub();
      window.removeEventListener(EVENT_OPEN_SETTINGS, openHandler);
    };
  }, []);

  if (!mounted) return null;

  const showBanner = !record && !settingsOpen;

  const acceptAll = () => setConsent(true);
  const rejectOptional = () => setConsent(false);
  const openSettings = () => {
    setAnalyticsDraft(record?.categories.analytics === true);
    setSettingsOpen(true);
  };
  const saveSettings = () => {
    setConsent(analyticsDraft);
    setSettingsOpen(false);
  };

  return (
    <>
      {showBanner && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label={t("cookieBanner.ariaLabel")}
          className="fixed inset-x-0 bottom-0 z-[60] border-t-2 border-foreground bg-white text-black shadow-[0_-4px_0_0_rgba(0,0,0,0.06)]"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:py-5">
            <div className="text-sm leading-relaxed md:pr-6">
              <p className="font-display font-semibold">{t("cookieBanner.title")}</p>
              <p className="mt-1 text-black/80">
                {t("cookieBanner.text")}{" "}
                <Link
                  to="/ochrana-osobnych-udajov"
                  className="underline underline-offset-2 hover:text-primary"
                >
                  {t("cookieBanner.privacyLink")}
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
              <button
                type="button"
                onClick={rejectOptional}
                className="rounded-md border-2 border-foreground bg-white px-3 py-2 text-sm font-medium text-black hover:bg-black/5"
              >
                {t("cookieBanner.rejectOptional")}
              </button>
              <button
                type="button"
                onClick={openSettings}
                className="rounded-md border-2 border-foreground bg-white px-3 py-2 text-sm font-medium text-black hover:bg-black/5"
              >
                {t("cookieBanner.settings")}
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="rounded-md border-2 border-foreground bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95"
              >
                {t("cookieBanner.acceptAll")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cookieBanner.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("cookieBanner.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div className="flex items-start justify-between gap-4 border border-foreground/15 p-3">
              <div>
                <Label className="font-semibold">{t("cookieBanner.necessaryLabel")}</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("cookieBanner.necessaryDesc")}
                </p>
              </div>
              <Switch checked disabled aria-label={t("cookieBanner.necessaryAria")} />
            </div>

            <div className="flex items-start justify-between gap-4 border border-foreground/15 p-3">
              <div>
                <Label htmlFor="analytics-switch" className="font-semibold">
                  {t("cookieBanner.analyticsLabel")}
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("cookieBanner.analyticsDesc")}
                </p>
              </div>
              <Switch
                id="analytics-switch"
                checked={analyticsDraft}
                onCheckedChange={setAnalyticsDraft}
              />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConsent(false);
                setSettingsOpen(false);
              }}
            >
              {t("cookieBanner.rejectOptional")}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={saveSettings}>
                {t("cookieBanner.saveSelection")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setConsent(true);
                  setSettingsOpen(false);
                }}
              >
                {t("cookieBanner.acceptAll")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
