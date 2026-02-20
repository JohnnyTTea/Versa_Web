import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { moduleMenus } from "./menus";
import { useSidebar } from "./SidebarContext";
import { trackUserEvent } from "../utils/userLog";
import "../styles/sidebar.css";

export default function Sidebar() {
  const { collapsed, activeModule } = useSidebar();
  const nav = useNavigate();
  const loc = useLocation();
  const items = activeModule ? moduleMenus[activeModule] || [] : [];
  const purchaseDetail =
    activeModule === "purchase"
      ? (() => {
          if (loc.pathname.startsWith("/purchase/opo/")) {
            return { parent: "/purchase/opo", label: "OPO Detail" };
          }
          if (loc.pathname.startsWith("/purchase/rpo/")) {
            return { parent: "/purchase/rpo", label: "RPO Detail" };
          }
          if (
            loc.pathname.startsWith("/purchase/fpo/") &&
            !loc.pathname.startsWith("/purchase/fpo/upload")
          ) {
            return { parent: "/purchase", label: "FPO Detail" };
          }
          return null;
        })()
      : null;

  // ✅ 读取当前 query 的 id（保持 PHP 行为：切换子页面不丢 id）
  const [sp] = useSearchParams();
  const id = (sp.get("id") || "").trim();
  const q = id ? `?id=${encodeURIComponent(id)}` : "";

  const fallbackTo = (() => {
    if (!activeModule) return "/";
    const modItems = moduleMenus[activeModule] || [];
    const preferred = modItems.find((x) => x.end) || modItems[0];
    if (!preferred) return "/";
    return activeModule === "product" ? `${preferred.to}${q}` : preferred.to;
  })();

  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      nav(-1);
      return;
    }
    nav(fallbackTo);
  };
  const isHomePage = loc.pathname === "/";

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-title-panel">
        <strong className="sidebar-label sidebar-title">
          {activeModule ? activeModule.toUpperCase() : "HOME"}
        </strong>
      </div>

      <div className="sidebar-menu-panel">
        <div className="sidebar-home-wrap">
          <NavLink to="/" end className={({ isActive }) => `home-link ${isActive ? "active" : ""}`}>
            {collapsed ? "🏠" : <span className="sidebar-label">🏠 Home</span>}
          </NavLink>
        </div>

        {!isHomePage ? (
          <div className="sidebar-nav-back-wrap">
            <button
              type="button"
              className="sidebar-back sidebar-nav-back"
              onClick={handleBack}
              title="返回上一级"
              aria-label="返回上一级"
            >
               ⟵ Back
            </button>
          </div>
        ) : null}

        <div className="sidebar-divider" />

        <nav style={{ marginTop: 12 }}>
        {items.length ? (
          <ul className="sidebar-submenu">
            {items.map((it) => {
              const to = activeModule === "product" ? `${it.to}${q}` : it.to;
              return (
                <li
                  key={it.to}
                  className={purchaseDetail?.parent === it.to ? "submenu-parent-active" : ""}
                >
                  <NavLink
                    to={to}
                    end={it.end}
                    onClick={() =>
                      trackUserEvent({
                        event: `Sidebar Menu: ${it.label}`,
                        module: activeModule || "unknown",
                        action: "submenu_click",
                        target: to,
                      })
                    }
                    className={({ isActive }) =>
                      isActive || purchaseDetail?.parent === it.to ? "active" : ""
                    }
                  >
                    {collapsed ? it.label.slice(0, 1) : <span className="sidebar-label">{it.label}</span>}
                  </NavLink>
                  {purchaseDetail?.parent === it.to ? (
                    <ul className="sidebar-submenu sidebar-submenu-child">
                      <li>
                        <NavLink to={loc.pathname} className="active">
                          {collapsed ? "D" : <span className="sidebar-label">{purchaseDetail.label}</span>}
                        </NavLink>
                      </li>
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div style={{ opacity: 0.6, marginTop: 8 }} className="sidebar-submenu">
            进入某个模块后显示菜单
          </div>
        )}
        </nav>
      </div>
    </aside>
  );
}
