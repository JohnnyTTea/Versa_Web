import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/home.css";

type PermKey =
  | "product"
  | "sales"
  | "purchase"
  | "dto"
  | "modify"
  | "report"
  | "inventory"
  | "review"
  | "settings";

type Perms = Partial<Record<PermKey, boolean>>;

type MenuItem = {
  key: PermKey;
  icon: React.ReactNode;
  cn: string;
  en: string;
  to: string;
  forceDisabled?: boolean;
};

type MenuButtonProps = {
  disabled: boolean;
  to: string;
  icon: React.ReactNode;
  cn: string;
  en: string;
  style?: React.CSSProperties;
};

type MeApiResp = {
  ok?: boolean;
  user?: {
    username?: string;
    perms?: Perms;
  };
};

const DEFAULT_NOTICES = [
  "System maintenance window: Sunday 01:00-03:00.",
  "Role changes take effect after re-login.",
  "Use module search for faster navigation.",
];
const DEFAULT_NOTICE_TITLE = "Announcements";
const ANNOUNCEMENTS_URL = `${import.meta.env.BASE_URL}announcements.txt`;

async function fetchMe(): Promise<MeApiResp | null> {
  try {
    const res = await fetch("/api/me", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as MeApiResp;
  } catch {
    return null;
  }
}

function MenuButton({ disabled, to, icon, cn, en, style }: MenuButtonProps) {
  const className = disabled ? "menu-btn disabled" : "menu-btn";

  if (disabled) {
    return (
      <button
        className={className}
        type="button"
        disabled
        aria-disabled="true"
        style={style}
      >
        {icon} {cn}
        <br />
        <span className="en">{en}</span>
      </button>
    );
  }

  return (
    <Link className={className} to={to} style={style}>
      {icon} {cn}
      <br />
      <span className="en">{en}</span>
    </Link>
  );
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<Perms | null>(null);
  const [username, setUsername] = useState("");
  const [noticeTitle, setNoticeTitle] = useState(DEFAULT_NOTICE_TITLE);
  const [notices, setNotices] = useState<string[]>(DEFAULT_NOTICES);

  useEffect(() => {
    let mounted = true;

    fetchMe().then((me) => {
      if (!mounted) return;

      // ✅ 对齐后端：me = { ok: true, user: { username, perms } }
      setUsername(me?.user?.username || "");
      setPerms(me?.user?.perms || null);

      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    fetch(ANNOUNCEMENTS_URL, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("failed to load announcements");
        return res.text();
      })
      .then((text) => {
        if (!mounted) return;
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith("#"));
        const [title, ...items] = lines;
        setNoticeTitle(title || DEFAULT_NOTICE_TITLE);
        setNotices(items.length ? items : DEFAULT_NOTICES);
      })
      .catch(() => {
        if (!mounted) return;
        setNoticeTitle(DEFAULT_NOTICE_TITLE);
        setNotices(DEFAULT_NOTICES);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const canMenu = (key: PermKey) => {
    // 权限还在加载时：先不禁用，避免“点不进去”的错觉
    if (loading) return true;

    // 没拿到 perms（比如后端没返回）时：默认全开放（和你 PHP 逻辑一致）
    if (!perms) return true;

    return !!perms[key];
  };

  // ✅ 关键：强类型 menus，让 m.key 是 PermKey（不再是 string）
  const menus = useMemo<MenuItem[]>(
    () => [
      { key: "product", icon: "🔍", cn: "查找产品", en: "Product Search", to: "/product" },
      { key: "sales", icon: "📈", cn: "订单查询", en: "Sales Order", to: "/sales?reset=1" },
      { key: "purchase", icon: "📋", cn: "采购管理", en: "Purchase", to: "/purchase" },
      { key: "dto", icon: "➕", cn: "DTO 业务", en: "DTO Process", to: "/dto" },
      { key: "modify", icon: "📥", cn: "数据更新", en: "Data Modification", to: "/modify" },
      { key: "report", icon: "🖨", cn: "数据下载", en: "Report Download", to: "/report" },
      { key: "inventory", icon: "📦", cn: "库存管理", en: "Inventory Manage", to: "/inventory" },
      { key: "review", icon: "📝", cn: "审核记录", en: "Pending Review", to: "/review" },
      { key: "settings", icon: "⚙", cn: "系统设置", en: "System Settings", to: "/settings" },
    ],
    []
  );

  const availableCount = useMemo(() => {
    if (loading) return menus.length;
    if (!perms) return menus.length;
    return menus.filter((m) => !!perms[m.key]).length;
  }, [loading, menus, perms]);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="hero-card">
          <div className="hero-title">Versa Web System</div>
          <div className="hero-subtitle">Advance Tuning</div>
          <div className="hero-user">
            👤 {username ? `Hello, ${username}` : "Not signed in"}
          </div>
          <div className="hero-meta">
            <span className="meta-pill">Modules Available: {availableCount}</span>
            <span className="meta-pill">Total Modules: {menus.length}</span>
          </div>
        </div>

        <div className="hero-side">
          <div className="notice-card">
            <div className="notice-title">{noticeTitle}</div>
            <ul className="notice-list">
              {notices.map((notice, idx) => (
                <li key={`${idx}-${notice}`}>{notice}</li>
              ))}
            </ul>
          </div>

          <div className="hero-panels">
            <div className="mini-card">
              <div className="mini-title">Quick Tip</div>
              <div className="mini-body">Use the sidebar to jump between modules fast.</div>
            </div>
            <div className="mini-card">
              <div className="mini-title">Permissions</div>
              <div className="mini-body">
                {perms ? "Role-based access enabled." : "Default access (no perms loaded)."}
              </div>
            </div>
            <div className="mini-card">
              <div className="mini-title">Status</div>
              <div className="mini-body">{loading ? "Loading user info..." : "System ready."}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="section-title">Quick Access</div>
        <div className="menu-grid">
          {menus.map((m, idx) => {
            const disabled = m.forceDisabled ? true : !canMenu(m.key);
            return (
              <MenuButton
                key={m.key}
                disabled={disabled}
                to={m.to}
                icon={m.icon}
                cn={m.cn}
                en={m.en}
                style={{ ["--i" as any]: idx }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
