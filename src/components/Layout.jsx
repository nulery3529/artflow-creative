import React, { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  ShoppingCart,
  Images,
  Receipt,
  Package,
  BarChart3,
  Plug,
  CalendarDays,
  Settings,
  RefreshCw,
  CheckCircle2,
  LogOut,
  Sun,
  Moon,
  Search,
  Bell,
  ChevronDown,
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
  { label: "Integrations", to: "/account", icon: Plug },
  { label: "Calendar", to: "/calendar", icon: CalendarDays, badge: "NEW" },
  { label: "Settings", to: "/account", icon: Settings },
];

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scrollPositions = useRef({});
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const firstName =
    String(user?.full_name || user?.name || "Natasha")
      .trim()
      .split(/\s+/)[0] || "Natasha";