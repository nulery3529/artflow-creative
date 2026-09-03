import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  ShoppingCart,
  Images,
  Receipt,
  Package,
  BarChart3,
  CalendarDays,
  Settings,
  RefreshCw,
  CheckCircle2,
  LogOut,
  Sun,
  Moon,
  Search,
  Bell,
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

const tabPaths = new Set(tabs.map((item) => item.path));

const navItems = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Orders", to: "/orders", icon: ShoppingCart },
  { label: "Gallery", to: "/gallery", icon: Images },
  { label: "Expenses", to: "/expenses", icon: Receipt },
  { label: "Inventory", to: "/inventory", icon: Package },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Calendar", to: "/calendar", icon: CalendarDays },
  { label: "Settings", to: "/account", icon: Settings },
];

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const firstName =
    String(user?.full_name || user?.name || "Artist")
      .trim()
      .split(/\s+/)[0] || "Artist";

  const isActive = (to) => {
    if (to === "/") return pathname === "/";
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-[260px] p-3">
        <div className="w-full h-full rounded-[26px] border border-white/60 bg-white/75 dark:bg-slate-950/75 backdrop-blur-2xl shadow-xl flex flex-col">

          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-3 px-5 py-5 text-left"
          >
            <Logo size={42} />

            <div>
              <div className="text-xl font-semibold text-[#594187]">
                ART FLOW
              </div>

              <div className="text-[10px] tracking-[0.3em] text-[#806d9e]">
                CREATIVE
              </div>
            </div>
          </button>

          <nav className="px-3 space-y-1">
            {navItems.map(({ label, to, icon: Icon }) => {
              const active = isActive(to);

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => navigate(to)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition ${
                    active
                      ? "bg-gradient-to-r from-[#d9c2ff] to-[#eadcff] text-[#51317f]"
                      : "text-[#403451] hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.8} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>          <div className="flex-1" />

          <div className="mx-3 mb-3 rounded-[20px] border border-purple-100 bg-white/70 dark:bg-white/5 p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#7550b7]" />
              <span className="text-xs font-semibold">
                Sync Status
              </span>
            </div>

            <div className="flex items-center justify-between mt-3 text-[11px]">
              <span className="text-muted-foreground">
                Last synced
              </span>
              <span className="font-semibold">
                2 min ago
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-600 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              All Connected
            </div>
          </div>

          <div className="mx-3 mb-3 rounded-[20px] border border-purple-100 bg-white/70 dark:bg-white/5 p-3">
            <p className="text-xs font-semibold">
              {firstName}
            </p>

            <p className="text-[10px] text-muted-foreground truncate">
              {user?.email || "Art Flow Creative"}
            </p>
          </div>

          <div className="mx-3 mb-3 rounded-[20px] border border-purple-100 bg-white/70 dark:bg-white/5 p-3 flex items-center">
            <span className="text-[11px] font-medium">
              Theme
            </span>

            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  theme !== "dark"
                    ? "bg-white shadow-sm text-purple-600"
                    : "text-muted-foreground"
                }`}
              >
                <Sun className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  theme === "dark"
                    ? "bg-purple-600 text-white"
                    : "text-muted-foreground"
                }`}
              >
                <Moon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => logout(true)}
            className="mx-3 mb-4 flex items-center gap-2 px-4 py-3 rounded-2xl text-xs font-medium text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-500/10"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </aside>
            <div className="lg:ml-[260px] min-h-screen">
        <header className="hidden lg:flex sticky top-0 z-30 items-center px-7 xl:px-10 pt-5 pb-3">
          <div className="ml-auto flex items-center gap-3">
            <div className="w-[380px] h-11 rounded-full border border-white/70 bg-white/75 dark:bg-slate-950/65 backdrop-blur-xl shadow-sm flex items-center px-4">
              <Search className="w-4 h-4 text-muted-foreground" />

              <input
                type="search"
                placeholder="Search orders, listings, expenses..."
                className="flex-1 bg-transparent border-0 outline-none px-3 text-xs"
              />
            </div>

            <button
              type="button"
              className="relative w-11 h-11 rounded-2xl border border-white/70 bg-white/75 dark:bg-slate-950/65 backdrop-blur-xl shadow-sm flex items-center justify-center"
            >
              <Bell className="w-5 h-5 text-[#5f477f]" />

              <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-pink-500 text-white text-[10px] flex items-center justify-center">
                3
              </span>
            </button>
          </div>
        </header>

        <main className="max-w-[1700px] mx-auto px-4 sm:px-5 lg:px-7 xl:px-10 pb-28 lg:pb-10 overflow-x-hidden">
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

      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );