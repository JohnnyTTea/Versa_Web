import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

export type ModuleKey =
  | "product"
  | "sales"
  | "purchase"
  | "dto"
  | "modify"
  | "report"
  | "inventory"
  | "review"
  | "settings"
  | null;

type SidebarState = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  activeModule: ModuleKey;
  setActiveModule: (m: ModuleKey) => void; // 兼容保留
};

const Ctx = createContext<SidebarState | null>(null);

function inferModuleFromPath(pathname: string): ModuleKey {
  const p = (pathname || "").toLowerCase();

  // 首页/登录不属于任何模块
  if (p === "/" || p.startsWith("/login")) return null;

  if (p.startsWith("/product")) return "product";
  if (p.startsWith("/sales")) return "sales";
  if (p.startsWith("/purchase")) return "purchase";
  if (p.startsWith("/dto")) return "dto";
  if (p.startsWith("/modify")) return "modify";
  if (p.startsWith("/report")) return "report";
  if (p.startsWith("/inventory")) return "inventory";
  if (p.startsWith("/review")) return "review";
  if (p.startsWith("/settings")) return "settings";

  return null;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const loc = useLocation();

  const [collapsed, setCollapsed] = useState(false);

  // ✅ 手动设置（旧代码可能会用），现在变成“兜底”
  const [manualModule, setManualModule] = useState<ModuleKey>(null);

  // ✅ 自动推断：终极版本的核心
  const inferredModule = useMemo(() => inferModuleFromPath(loc.pathname), [loc.pathname]);

  // ✅ 路由变化时，清掉手动设置，避免旧逻辑残留
  useEffect(() => {
    setManualModule(null);
  }, [loc.pathname]);

  // ✅ activeModule 永远优先使用“自动推断”，推断不到才用“手动兜底”
  const activeModule: ModuleKey = inferredModule ?? manualModule;

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      activeModule,
      setActiveModule: setManualModule, // 兼容保留
    }),
    [collapsed, activeModule]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSidebar() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSidebar must be used within SidebarProvider");
  return v;
}
