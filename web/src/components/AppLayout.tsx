import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";

import Sidebar from "../sidebar/Sidebar";
import { useSidebar } from "../sidebar/SidebarContext";
import type { ModuleKey } from "../sidebar/menus";
import "../styles/layout.css";

async function logUserActivity(path: string) {
  const p = (path || "").trim();
  if (!p || p === "/" || p.startsWith("/settings/log")) return;
  try {
    await fetch("/api/log", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  } catch {
    // 不影响页面
  }
}

function detectModule(pathname: string): ModuleKey | null {
  if (pathname === "/product" || pathname.startsWith("/product/")) return "product";
  if (pathname === "/sales" || pathname.startsWith("/sales/")) return "sales";
  if (pathname === "/purchase" || pathname.startsWith("/purchase/")) return "purchase";
  if (pathname === "/dto" || pathname.startsWith("/dto/")) return "dto";
  if (pathname === "/modify" || pathname.startsWith("/modify/")) return "modify";
  if (pathname === "/report" || pathname.startsWith("/report/")) return "report";
  if (pathname === "/inventory" || pathname.startsWith("/inventory/")) return "inventory";
  if (pathname === "/review" || pathname.startsWith("/review/")) return "review";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { setActiveModule } = useSidebar();
  const prevModuleRef = useRef<ModuleKey | null>(null);

  // ✅ 每次切路由都记录一次（更合理）
  useEffect(() => {
    logUserActivity(pathname);
  }, [pathname]);

  // ✅ 每次切路由更新 sidebar 菜单所属模块
  useEffect(() => {
    setActiveModule(detectModule(pathname));
  }, [pathname, setActiveModule]);

  useEffect(() => {
    const nextModule = detectModule(pathname);
    const prevModule = prevModuleRef.current;
    if (prevModule === "sales" && nextModule !== "sales") {
      sessionStorage.removeItem("last_invoice_search");
    }
    prevModuleRef.current = nextModule;
  }, [pathname]);

  return (
    <div className="app-shell">
      <Navbar />

      <div className="app-body">
        <Sidebar />
        <main className="app-main">{children}</main>
      </div>

      <Footer />
    </div>
  );
}
