import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
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
          aria-label="Súhlas s používaním cookies"
          className="fixed inset-x-0 bottom-0 z-[60] border-t-2 border-foreground bg-white text-black shadow-[0_-4px_0_0_rgba(0,0,0,0.06)]"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:py-5">
            <div className="text-sm leading-relaxed md:pr-6">
              <p className="font-display font-semibold">Používame cookies</p>
              <p className="mt-1 text-black/80">
                Tendrik používa nevyhnutné cookies na fungovanie stránky (prihlásenie,
                nastavenia). Ak povolíte, budeme používať aj analytické cookies, aby sme
                lepšie rozumeli používaniu služby.{" "}
                <Link
                  to="/ochrana-osobnych-udajov"
                  className="underline underline-offset-2 hover:text-primary"
                >
                  Ochrana osobných údajov
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
              <button
                type="button"
                onClick={rejectOptional}
                className="rounded-md border-2 border-foreground bg-white px-3 py-2 text-sm font-medium text-black hover:bg-black/5"
              >
                Odmietnuť nepovinné
              </button>
              <button
                type="button"
                onClick={openSettings}
                className="border-2 border-foreground bg-white px-3 py-2 text-sm font-medium text-black hover:bg-black/5"
              >
                Nastavenia
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="border-2 border-foreground bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95"
              >
                Prijať všetky
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nastavenia cookies</DialogTitle>
            <DialogDescription>
              Vyberte, ktoré kategórie cookies chcete povoliť. Voľbu môžete kedykoľvek
              zmeniť cez odkaz v päte stránky.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div className="flex items-start justify-between gap-4 border border-foreground/15 p-3">
              <div>
                <Label className="font-semibold">Nevyhnutné</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Potrebné pre prihlásenie, session a základné nastavenia. Nedajú sa
                  vypnúť.
                </p>
              </div>
              <Switch checked disabled aria-label="Nevyhnutné cookies vždy zapnuté" />
            </div>

            <div className="flex items-start justify-between gap-4 border border-foreground/15 p-3">
              <div>
                <Label htmlFor="analytics-switch" className="font-semibold">
                  Analytické
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pomáhajú nám merať používanie služby (napr. Google Analytics, pixely).
                  Načítajú sa iba po vašom súhlase.
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
              Odmietnuť nepovinné
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={saveSettings}>
                Uložiť výber
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setConsent(true);
                  setSettingsOpen(false);
                }}
              >
                Prijať všetky
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
