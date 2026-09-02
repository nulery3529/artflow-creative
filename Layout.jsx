import React, { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  ShoppingBag,
  Images,
  Receipt,
  Package,
  BarChart3,
  CalendarDays,
  Settings,
  Percent,
  Car,
  Sparkles,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import Inventory from "@/pages/Inventory";
import Expenses from "@/pages/Expenses";
import Logo from "@/components/Logo";
import { useAuth } from "@/lib/AuthContext";

const tabs = [
  { path: "/", Comp: Dashboard },
  { path: "/orders", Comp: Orders },
  { path: "/inventory", Comp: Inventory },
  { path: "/expenses", Comp: Expenses },
];

const tabPaths = new Set(tabs.map((t) => t.path));

const mainNav = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Orders", to: "/orders", icon: ShoppingBag },
  { label: "Gallery", to: "/gallery", icon: Images },
  { label: "Expenses", to: "/expenses", icon: Receipt },
  { label: "Inventory", to: "/inventory", icon: Package },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Calendar", to: "/calendar", icon: CalendarDays },
  { label: "Settings", to: "/account", icon: Settings },
];

const secondaryNav = [
  { label: "Taxes", to: "/taxes", icon: Percent },
  { label: "Mileage", to: "/mileage", icon: Car },
  { label: "Advisor", to: "/assistant", icon: Sparkles },
];

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scrollPositions = useRef({});
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const isActive = (to) =>
    to === "/"
      ? pathname === "/"
      : pathname === to || pathname.startsWith(`${to}/`);

  useEffect(() => {
    if (!tabPaths.has(pathname)) return;

    const onScroll = () => {
      scrollPositions.current[pathname] = window.scrollY;
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  useEffect(() => {
    if (!tabPaths.has(pathname)) return;

    const saved = scrollPositions.current[pathname] ?? 0;
    const id = requestAnimationFrame(() => window.scrollTo(0, saved));

    return () => cancelAnimationFrame(id);
  }, [pathname]);

  const firstName =
    String(user?.full_name || user?.name || "Artist")
      .trim()
      .split(/\s+/)[0] || "Artist";

  const renderNavItem = ({ label, to, icon: Icon }) => {
    const active = isActive(to);

    return (
      <button
        type="button"
        key={to}
        onClick={() => navigate(to)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
          active
            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_10px_26px_rgba(124,79,218,0.25)]"
            : "text-muted-foreground hover:bg-white/55 hover:text-foreground dark:hover:bg-white/5"
        }`}
      >
        <Icon
          className="w-5 h-5 shrink-0"
          strokeWidth={active ? 2.5 : 2}
        />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-72 flex-col border-r border-[hsl(var(--border))] bg-[rgba(245,236,255,0.82)] dark:bg-[rgba(13,18,33,0.88)] backdrop-blur-xl px-4 py-5">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-3 px-2 pb-5 mb-3 text-left"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 flex items-center justify-center shadow-sm">
            <Logo size={38} />
          </div>

          <div className="min-w-0">
            <div className="font-heading text-xl leading-none artflow-gradient-text">
              ART FLOW
            </div>
            <div className="text-[11px] tracking-[0.28em] text-muted-foreground mt-1">
              CREATIVE
            </div>
          </div>
        </button>

        <nav className="space-y-1.5">
          {mainNav.map(renderNavItem)}
        </nav>

        <div className="my-4 border-t border-[hsl(var(--border))]" />

        <nav className="space-y-1">
          {secondaryNav.map(renderNavItem)}
        </nav>

        <div className="mt-auto space-y-3 pt-5">
          <div className="rounded-3xl border border-[hsl(var(--border))] bg-white/55 dark:bg-white/5 p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
              Signed in
            </p>

            <p className="font-semibold mt-1 truncate">
              {firstName}
            </p>

            <p className="text-xs text-muted-foreground truncate">
              {user?.email || "Art Flow Creative"}
            </p>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--border))] bg-white/45 dark:bg-white/5 p-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium px-2 mr-auto">
              Theme
            </span>

            <button
              type="button"
              aria-label="Light theme"
              onClick={() => setTheme("light")}
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                theme !== "dark"
                  ? "bg-white text-[hsl(var(--primary))] shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              <Sun className="w-4 h-4" />
            </button>

            <button
              type="button"
              aria-label="Dark theme"
              onClick={() => setTheme("dark")}
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                theme === "dark"
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => logout(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
          >
            <LogOut className="w-5 h-5" />
            Log Out
          </button>
        </div>
      </aside>

      <div className="md:ml-72 min-h-screen">
        <main className="max-w-md md:max-w-none md:w-full md:px-8 lg:px-10 xl:px-12 mx-auto px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] md:pt-8 pb-28 md:pb-10 overflow-x-clip">
          {tabs.map(({ path, Comp }) => (
            <div
              key={path}
              style={{
                display: pathname === path ? "block" : "none",
              }}
            >
              <Comp />
            </div>
          ))}

          {!tabPaths.has(pathname) && (
            <div key={pathname} className="screen-slide">
              <Outlet />
            </div>
          )}
        </main>
      </div>

      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}