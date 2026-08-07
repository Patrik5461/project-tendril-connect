import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Settings, LogOut, ShieldCheck, Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HelpChatWidget } from "@/components/HelpChatWidget";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useIsNative } from "@/lib/native";
import { attachPushNavigation } from "@/lib/push";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { mode: "login" } });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) console.error("[admin-check]", error);
      setIsAdmin(!!data);
    })();
  }, []);

  const native = useIsNative();

  useEffect(() => {
    if (!native) return;
    document.documentElement.classList.add("capacitor-native");
    let cleanup: (() => void) | undefined;
    attachPushNavigation((path) => navigate({ to: path as never })).then((fn) => {
      cleanup = fn;
    });
    return () => {
      document.documentElement.classList.remove("capacitor-native");
      cleanup?.();
    };
  }, [native, navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "login" }, replace: true });
  }
  return (
    <div className="min-h-screen bg-background text-foreground safe-x">
      <header className="border-b-2 border-foreground bg-background sticky top-0 z-10 safe-top">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">

          <Link to="/dashboard" className="flex items-center gap-2.5 font-display font-bold text-xl text-foreground">
            <span
              className="relative inline-flex h-8 w-8 items-center justify-center bg-primary"
              aria-hidden="true"
            >
              <span className="font-display font-bold text-primary-foreground text-lg leading-none translate-y-[-1px]">
                T
              </span>
              <span className="absolute inset-0 border border-primary-foreground/30" />
            </span>
            <span className="hidden sm:inline">{t("nav.brand")}</span>
          </Link>
          <nav className="flex items-center gap-1">
            {!native && (
              <>
                <Link to="/dashboard">
                  <Button variant="ghost" size="sm">
                    <LayoutDashboard className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t("nav.tenders")}</span>
                  </Button>
                </Link>
                <Link to="/granty">
                  <Button variant="ghost" size="sm">
                    <Coins className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t("nav.grants")}</span>
                  </Button>
                </Link>
                <Link to="/settings">
                  <Button variant="ghost" size="sm">
                    <Settings className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t("nav.settings")}</span>
                  </Button>
                </Link>
              </>
            )}
            {isAdmin && (
              <Link to="/admin">
                <Button variant="ghost" size="sm">
                  <ShieldCheck className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t("nav.admin")}</span>
                </Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("nav.signOut")}</span>
            </Button>
            <LanguageSwitcher compact />
          </nav>
        </div>
      </header>
      <Outlet />
      <HelpChatWidget />
      <MobileBottomNav />

    </div>
  );
}
