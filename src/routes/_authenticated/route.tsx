import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Settings, LogOut } from "lucide-react";

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
  const navigate = useNavigate();
  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "login" }, replace: true });
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-foreground bg-background sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/dashboard" className="font-display font-bold text-xl text-foreground flex items-center gap-2.5">
            <span className="h-7 w-7 bg-primary" aria-hidden="true" />
            <span className="hidden sm:inline">Tendrik</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                <LayoutDashboard className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Zákazky</span>
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Nastavenia</span>
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Odhlásiť</span>
            </Button>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
