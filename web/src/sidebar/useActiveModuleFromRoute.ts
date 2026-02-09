import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import type { ModuleKey } from "./menus";
import { useSidebar } from "./SidebarContext";

const routeToModule: Array<{ prefix: string; module: ModuleKey }> = [
  { prefix: "/product", module: "product" },
  { prefix: "/sales", module: "sales" },
  { prefix: "/purchase", module: "purchase" },
  { prefix: "/dto", module: "dto" },
  { prefix: "/modify", module: "modify" },
  { prefix: "/report", module: "report" },
  { prefix: "/inventory", module: "inventory" },
  { prefix: "/review", module: "review" },
  { prefix: "/settings", module: "settings" },
];

export function useActiveModuleFromRoute() {
  const { pathname } = useLocation();
  const { setActiveModule } = useSidebar();

  useEffect(() => {
    const hit = routeToModule.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
    setActiveModule(hit ? hit.module : null);
  }, [pathname, setActiveModule]);
}
