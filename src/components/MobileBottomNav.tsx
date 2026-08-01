import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Coins, Settings, Building2 } from "lucide-react";
import { useIsNative } from "@/lib/native";

const ITEMS = [
  { to: "/dashboard", label: "Zákazky", icon: LayoutDashboard },
  { to: "/granty", label: "Granty", icon: Coins },
  { to: "/firma", label: "Firma", icon: Building2 },
  { to: "/settings", label: "Nastavenia", icon: Settings },
] as const;

/** Spodná navigácia – iba v natívnej aplikácii. */
export function MobileBottomNav() {
  const native = useIsNative();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!native) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-foreground bg-background pb-[env(safe-area-inset-bottom)]"
      aria-label="Hlavná navigácia"
    >
      <ul className="mx-auto flex max-w-2xl">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                {...(item.to === "/dashboard"
                  ? {
                      search: {
                        tab: "foryou",
                        sort: "deadline",
                        q: "",
                        view: "list",
                        radar: "all",
                        country: "",
                        page: 1,
                        pageSize: 20,
                      } as never,
                    }
                  : {})}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MobileBottomNav;
