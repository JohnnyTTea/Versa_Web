import React from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { moduleMenus } from "./menus";
import { useSidebar } from "./SidebarContext";
import "../styles/sidebar.css";

export default function Sidebar() {
  const { collapsed, activeModule } = useSidebar();
  const nav = useNavigate();
  const items = activeModule ? moduleMenus[activeModule] || [] : [];

  // ✅ 读取当前 query 的 id（保持 PHP 行为：切换子页面不丢 id）
  const [sp] = useSearchParams();
  const id = (sp.get("id") || "").trim();
  const q = id ? `?id=${encodeURIComponent(id)}` : "";

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-top-frame">
        <div className="sidebar-header">
          <strong className="sidebar-label sidebar-title">
            {activeModule ? activeModule.toUpperCase() : "HOME"}
          </strong>
          <button
            type="button"
            className="sidebar-back"
            onClick={() => nav("/")}
            title="返回上一级"
            aria-label="返回上一级"
          >
            ← Back
          </button>
        </div>
      </div>

      <div className="sidebar-divider" />

      <nav style={{ marginTop: 12 }}>
        <ul>
          <li>
            <NavLink to="/" end className={({ isActive }) => `home-link ${isActive ? "active" : ""}`}>
              {collapsed ? "🏠" : <span className="sidebar-label">🏡 Home</span>}
            </NavLink>
          </li>
        </ul>

        {items.length ? (
          <ul className="sidebar-submenu">
            {items.map((it) => {
              const to = activeModule === "product" ? `${it.to}${q}` : it.to;
              return (
                <li key={it.to}>
                  <NavLink
                    to={to}
                    end={it.end}
                    className={({ isActive }) => (isActive ? "active" : "")}
                  >
                    {collapsed ? it.label.slice(0, 1) : <span className="sidebar-label">{it.label}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        ) : (
          <div style={{ opacity: 0.6, marginTop: 8 }} className="sidebar-label">
            进入某个模块后显示菜单
          </div>
        )}
      </nav>
    </aside>
  );
}
