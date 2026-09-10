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

type CityWeather = {
  temperature?: number;
  windspeed?: number;
  weathercode?: number;
};

type CityInfo = {
  key: string;
  name: string;
  timezone: string;
  lat: number;
  lon: number;
  timeUrl: string;
  weatherUrl: string;
};

type ReviewPreview = {
  key: MonitorModuleKey;
  title: string;
  subtitle: string;
  value: string;
  tone: "inventory" | "sales" | "orders";
  rows: MonitorTableRow[];
  columns: MonitorColumn[];
  chart: MonitorChartBar[];
};

type MonitorModuleKey = "inventory" | "sales" | "orders";

type MonitorChartBar = {
  label: string;
  value: number;
  display: string;
};

type MonitorTableRow = Record<string, any>;

type MonitorColumn = {
  key: string;
  label: string;
  render?: (row: MonitorTableRow) => React.ReactNode;
};

type MonitorResp = {
  ok?: boolean;
  updatedAt?: string;
  summary?: {
    inventory?: number;
    sales?: number;
    orders?: number;
  };
  inventoryAlerts?: Array<{
    Itemno?: string;
    Desc1?: string;
    Vendno?: string;
    avgMonthlySales?: number;
    supplyQty?: number;
    shortageQty?: number;
  }>;
  salesAnomalies?: Array<{
    itemNo?: string;
    type?: string;
    latestMonth?: string;
    latestQty?: number;
    baseline?: number;
    delta?: number;
    ratio?: number;
    vendor?: string;
    desc1?: string;
    desc2?: string;
  }>;
  orderExceptions?: Array<{
    Trno?: string;
    Trdate?: string;
    Company?: string;
    Cpono?: string;
    Shipvia?: string;
    Totamt?: number;
    ageDays?: number;
  }>;
};

const DEFAULT_NOTICES = [
  "System maintenance window: Sunday 01:00-03:00.",
  "Role changes take effect after re-login.",
  "Use module search for faster navigation.",
];
const DEFAULT_NOTICE_TITLE = "Announcements";
const ANNOUNCEMENTS_URL = `${import.meta.env.BASE_URL}announcements.txt`;
const ANNOUNCEMENTS_SEEN_KEY = "versa-announcements-seen-date";
const MONITOR_PAGE_SIZE = 25;
const REVIEW_PREVIEWS: ReviewPreview[] = [
  {
    key: "inventory",
    title: "Inventory Alerts",
    subtitle: "库存异常",
    value: "--",
    tone: "inventory",
    rows: [],
    columns: [],
    chart: [],
  },
  {
    key: "sales",
    title: "Sales Anomalies",
    subtitle: "销量异常",
    value: "--",
    tone: "sales",
    rows: [],
    columns: [],
    chart: [],
  },
  {
    key: "orders",
    title: "Order Exceptions",
    subtitle: "订单异常",
    value: "--",
    tone: "orders",
    rows: [],
    columns: [],
    chart: [],
  },
];
const CITIES: CityInfo[] = [
  {
    key: "chengdu",
    name: "Chengdu",
    timezone: "Asia/Shanghai",
    lat: 30.5728,
    lon: 104.0668,
    timeUrl: "https://www.timeanddate.com/worldclock/china/chengdu",
    weatherUrl: "https://open-meteo.com/en/docs?latitude=30.5728&longitude=104.0668",
  },
  {
    key: "los-angeles",
    name: "Los Angeles",
    timezone: "America/Los_Angeles",
    lat: 34.0522,
    lon: -118.2437,
    timeUrl: "https://www.timeanddate.com/worldclock/usa/los-angeles",
    weatherUrl: "https://open-meteo.com/en/docs?latitude=34.0522&longitude=-118.2437",
  },
];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCityTime(now: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
}

function cityHour(now: Date, timezone: string) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return Number(hour);
}

function isCityNight(now: Date, timezone: string) {
  const hour = cityHour(now, timezone);
  return Number.isFinite(hour) && (hour < 6 || hour >= 18);
}

function weatherIcon(code?: number, night = false) {
  if (code === undefined) return "·";
  if (code === 0) return night ? "🌙" : "☀️";
  if ([1, 2].includes(code)) return night ? "☁️" : "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

function weatherLabel(code?: number) {
  if (code === undefined) return "Weather";
  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Partly Cloudy";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Weather";
}

function weatherTone(code?: number) {
  if (code === undefined) return "unknown";
  if (code === 0) return "clear";
  if ([1, 2].includes(code)) return "partly";
  if (code === 3) return "cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "unknown";
}

function formatTemperaturePair(celsius?: number) {
  if (celsius === undefined) return "--";
  const fahrenheit = (celsius * 9) / 5 + 32;
  return `${Math.round(celsius)}°C / ${Math.round(fahrenheit)}°F`;
}

function formatNumber(value: any, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDateOnly(value: any) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return String(value).replace("T", " ").replace(/\.?\d*Z$/, "").trim().slice(0, 10);
}

function escapeExcelCell(value: React.ReactNode) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "export";
}

const INVENTORY_COLUMNS: MonitorColumn[] = [
  { key: "Itemno", label: "Item No." },
  { key: "Desc1", label: "Description" },
  { key: "Vendno", label: "Vendor" },
  { key: "avgMonthlySales", label: "Avg Monthly", render: (row) => formatNumber(row.avgMonthlySales, 2) },
  { key: "supplyQty", label: "Supply", render: (row) => formatNumber(row.supplyQty, 0) },
  { key: "shortageQty", label: "Shortage", render: (row) => formatNumber(row.shortageQty, 0) },
];

const SALES_COLUMNS: MonitorColumn[] = [
  { key: "itemNo", label: "Item No." },
  { key: "type", label: "Type" },
  { key: "latestMonth", label: "Month" },
  { key: "latestQty", label: "Latest Qty", render: (row) => formatNumber(row.latestQty, 0) },
  { key: "baseline", label: "Baseline", render: (row) => formatNumber(row.baseline, 2) },
  { key: "delta", label: "Delta", render: (row) => formatNumber(row.delta, 2) },
  { key: "ratio", label: "Ratio", render: (row) => `${formatNumber(row.ratio, 2)}x` },
  { key: "vendor", label: "Vendor" },
  { key: "desc1", label: "Description" },
];

const ORDER_COLUMNS: MonitorColumn[] = [
  { key: "Trno", label: "Order No." },
  { key: "Trdate", label: "Order Date", render: (row) => formatDateOnly(row.Trdate) },
  { key: "ageDays", label: "Age Days", render: (row) => formatNumber(row.ageDays, 0) },
  { key: "Company", label: "Company" },
  { key: "Cpono", label: "Cust PO" },
  { key: "Shipvia", label: "Ship Via" },
  { key: "Totamt", label: "Total", render: (row) => formatNumber(row.Totamt, 2) },
];

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

async function fetchMonitor(): Promise<MonitorResp | null> {
  try {
    const res = await fetch("/api/monitor/summary", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as MonitorResp;
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
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeDocked, setNoticeDocked] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<Record<string, CityWeather | null>>({});
  const [monitor, setMonitor] = useState<MonitorResp | null>(null);
  const [monitorLoaded, setMonitorLoaded] = useState(false);
  const [activeMonitor, setActiveMonitor] = useState<MonitorModuleKey | null>(null);
  const [monitorPage, setMonitorPage] = useState(1);

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
    fetchMonitor().then((data) => {
      if (!mounted) return;
      setMonitor(data?.ok ? data : null);
      setMonitorLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const seenToday = localStorage.getItem(ANNOUNCEMENTS_SEEN_KEY) === localDateKey();
      setShowNoticeModal(!seenToday);
      setNoticeDocked(seenToday);
    } catch {
      setShowNoticeModal(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    Promise.all(
      CITIES.map(async (city) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current_weather=true&temperature_unit=celsius&windspeed_unit=mph`;
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) throw new Error("weather failed");
          const data = await res.json();
          return [city.key, data.current_weather || null] as const;
        } catch {
          return [city.key, null] as const;
        }
      })
    ).then((entries) => {
      if (!mounted) return;
      setWeather(Object.fromEntries(entries));
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
      { key: "report", icon: "🖨", cn: "数据报告", en: "Data Report", to: "/report" },
      { key: "inventory", icon: "📦", cn: "库存管理", en: "Inventory Manage", to: "/inventory", forceDisabled: true },
      { key: "review", icon: "📝", cn: "审核记录", en: "Pending Review", to: "/review", forceDisabled: true },
      { key: "settings", icon: "⚙", cn: "系统设置", en: "System Settings", to: "/settings" },
    ],
    []
  );

  const availableCount = useMemo(() => {
    const enabledMenus = menus.filter((m) => !m.forceDisabled);
    if (loading) return enabledMenus.length;
    if (!perms) return enabledMenus.length;
    return enabledMenus.filter((m) => !!perms[m.key]).length;
  }, [loading, menus, perms]);

  const closeNoticeModal = () => {
    try {
      localStorage.setItem(ANNOUNCEMENTS_SEEN_KEY, localDateKey());
    } catch {
      // Ignore storage failures; closing the modal should still work.
    }
    setShowNoticeModal(false);
    setNoticeDocked(true);
  };

  const monitorModules = useMemo<ReviewPreview[]>(() => {
    if (!monitor?.ok) return REVIEW_PREVIEWS;

    const inventoryRows = monitor.inventoryAlerts || [];
    const salesRows = monitor.salesAnomalies || [];
    const orderRows = monitor.orderExceptions || [];

    const items: ReviewPreview[] = [
      {
        key: "inventory",
        title: "Inventory Alerts",
        subtitle: "库存异常",
        value: String(monitor.summary?.inventory ?? 0),
        tone: "inventory",
        rows: inventoryRows,
        columns: INVENTORY_COLUMNS,
        chart: inventoryRows.slice(0, 5).map((row) => ({
          label: row.Itemno || "-",
          value: Math.max(0, Number(row.shortageQty || 0)),
          display: `Short ${formatNumber(row.shortageQty, 0)}`,
        })),
      },
      {
        key: "sales",
        title: "Sales Anomalies",
        subtitle: "销量异常",
        value: String(monitor.summary?.sales ?? 0),
        tone: "sales",
        rows: salesRows,
        columns: SALES_COLUMNS,
        chart: salesRows.slice(0, 5).map((row) => {
          const delta = Number(row.delta ?? Number(row.latestQty || 0) - Number(row.baseline || 0));
          return {
            label: row.itemNo || "-",
            value: Math.abs(delta),
            display: `${row.type || "Change"} ${formatNumber(delta, 0)}`,
          };
        }),
      },
      {
        key: "orders",
        title: "Order Exceptions",
        subtitle: "订单异常",
        value: String(monitor.summary?.orders ?? 0),
        tone: "orders",
        rows: orderRows,
        columns: ORDER_COLUMNS,
        chart: orderRows.slice(0, 5).map((row) => ({
          label: row.Trno || "-",
          value: Math.max(0, Number(row.ageDays || 0)),
          display: `${formatNumber(row.ageDays, 0)} days`,
        })),
      },
    ];

    return items;
  }, [monitor]);

  const visibleMonitorModules = activeMonitor
    ? monitorModules.filter((item) => item.key === activeMonitor)
    : monitorModules;
  const activeMonitorModule = activeMonitor
    ? monitorModules.find((item) => item.key === activeMonitor) || null
    : null;
  const monitorTotalRows = activeMonitorModule?.rows.length || 0;
  const monitorTotalPages = Math.max(1, Math.ceil(monitorTotalRows / MONITOR_PAGE_SIZE));
  const safeMonitorPage = Math.min(monitorPage, monitorTotalPages);
  const monitorPageStart = monitorTotalRows ? (safeMonitorPage - 1) * MONITOR_PAGE_SIZE : 0;
  const monitorPageRows = activeMonitorModule
    ? activeMonitorModule.rows.slice(monitorPageStart, monitorPageStart + MONITOR_PAGE_SIZE)
    : [];
  const monitorPageEnd = monitorPageStart + monitorPageRows.length;

  useEffect(() => {
    setMonitorPage(1);
  }, [activeMonitor]);

  useEffect(() => {
    if (monitorPage > monitorTotalPages) setMonitorPage(monitorTotalPages);
  }, [monitorPage, monitorTotalPages]);

  function exportMonitorExcel(module: ReviewPreview) {
    const headerCells = module.columns
      .map((column) => `<th>${escapeExcelCell(column.label)}</th>`)
      .join("");
    const bodyRows = module.rows
      .map((row) => {
        const cells = module.columns
          .map((column) => {
            const value = column.render ? column.render(row) : row[column.key] ?? "";
            return `<td>${escapeExcelCell(value)}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    const emptyRow = module.rows.length
      ? ""
      : `<tr><td colspan="${Math.max(1, module.columns.length)}">No active exceptions</td></tr>`;
    const html = `
      <html>
        <head><meta charset="UTF-8" /></head>
        <body>
          <table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows || emptyRow}</tbody>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilePart(module.key)}_exceptions_${localDateKey()}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="home-page">
      {showNoticeModal && (
        <div className="notice-modal-backdrop" role="presentation">
          <div className="notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-modal-title">
            <div className="notice-modal-header">
              <div id="notice-modal-title" className="notice-title">{noticeTitle}</div>
              <button className="notice-close" type="button" onClick={closeNoticeModal} aria-label="Close updates">
                ×
              </button>
            </div>
            <ul className="notice-list">
              {notices.map((notice, idx) => (
                <li key={`${idx}-${notice}`}>{notice}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section className="home-hero">
        <div className="hero-card">
          <div className="hero-card-inner">
            <div className="hero-main">
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

            <div className="hero-city-grid">
              {CITIES.map((city) => {
                const cityWeather = weather[city.key];
                const night = isCityNight(now, city.timezone);
                return (
                  <div
                    className={`city-card weather-${weatherTone(cityWeather?.weathercode)} ${night ? "is-night" : "is-day"}`}
                    key={city.key}
                  >
                    <div>
                      <div className="city-name">{city.name}</div>
                      <a className="city-time" href={city.timeUrl} target="_blank" rel="noreferrer">
                        {formatCityTime(now, city.timezone)}
                      </a>
                    </div>
                    <a className="city-weather" href={city.weatherUrl} target="_blank" rel="noreferrer">
                      <span className="weather-icon" aria-hidden="true">{weatherIcon(cityWeather?.weathercode, night)}</span>
                      <span>
                        <strong>{formatTemperaturePair(cityWeather?.temperature)}</strong>
                        <small>
                          {weatherLabel(cityWeather?.weathercode)}
                          {cityWeather?.windspeed !== undefined
                            ? ` · ${Math.round(cityWeather.windspeed)} mph`
                            : ""}
                        </small>
                      </span>
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          {noticeDocked && (
            <button
              className="hero-announcement-dock"
              type="button"
              onClick={() => setShowNoticeModal(true)}
            >
              <div className="dock-title-row">
                <span className="dock-label">Updates</span>
                <span className="dock-title">{noticeTitle}</span>
              </div>
              <div className="dock-preview">
                {notices.slice(0, 4).map((notice, idx) => (
                  <span key={`${idx}-${notice}`} className="dock-item">
                    {notice}
                  </span>
                ))}
              </div>
            </button>
          )}
        </div>

        <section className="quick-access-card">
          <div className="section-title">Main Menu</div>
          <div className="menu-grid quick-menu-grid">
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
      </section>

      <section className="review-overview">
        <div className="review-header">
          <div>
            <div className="review-kicker">Daily Review</div>
            <div className="review-title">Exception Monitor <span>异常监控</span></div>
          </div>
          {activeMonitor ? (
            <button
              className="review-state review-state-button"
              type="button"
              onClick={() => setActiveMonitor(null)}
            >
              Back · {monitor?.ok ? "Live Data" : monitorLoaded ? "Unavailable" : "Loading"}
            </button>
          ) : (
            <div className="review-state">
              {monitor?.ok ? "Live Data" : monitorLoaded ? "Unavailable" : "Loading"}
            </div>
          )}
        </div>

        <div className={`review-grid ${activeMonitor ? "review-grid-focused" : ""}`}>
          {visibleMonitorModules.map((item) => {
            const maxChartValue = Math.max(1, ...item.chart.map((bar) => bar.value));
            return (
            <button
              className={`review-card review-${item.tone} ${activeMonitor === item.key ? "is-active" : ""}`}
              key={item.key}
              type="button"
              onClick={() => setActiveMonitor(item.key)}
            >
              <div className="review-card-top">
                <div>
                  <div className="review-card-title">{item.title}</div>
                  <div className="review-card-subtitle">{item.subtitle}</div>
                </div>
                <div className="review-value">{item.value}</div>
              </div>
              <div className="review-chart" aria-label={`${item.title} chart`}>
                {item.chart.length ? (
                  item.chart.map((bar) => (
                    <div className="review-bar-row" key={`${item.key}-${bar.label}`}>
                      <span className="review-bar-label">{bar.label}</span>
                      <span className="review-bar-track">
                        <span
                          className="review-bar-fill"
                          style={{ width: `${Math.max(8, (bar.value / maxChartValue) * 100)}%` }}
                        />
                      </span>
                      <span className="review-bar-value">{bar.display}</span>
                    </div>
                  ))
                ) : (
                  <div className="review-empty-chart">No active exceptions</div>
                )}
              </div>
            </button>
            );
          })}
        </div>

        {activeMonitorModule && (
          <div className="review-detail">
            <div className="review-detail-header">
              <div>
                <div className="review-detail-title">{activeMonitorModule.title}</div>
                <div className="review-detail-subtitle">
                  {activeMonitorModule.subtitle} · Total {activeMonitorModule.rows.length}
                </div>
              </div>
              <button
                className="review-export"
                type="button"
                onClick={() => exportMonitorExcel(activeMonitorModule)}
              >
                Export all
              </button>
            </div>

            <div className="review-table-wrap">
              <table className="review-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {activeMonitorModule.columns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monitorPageRows.length ? (
                    monitorPageRows.map((row, idx) => (
                      <tr key={`${activeMonitorModule.key}-${monitorPageStart + idx}`}>
                        <td>{monitorPageStart + idx + 1}</td>
                        {activeMonitorModule.columns.map((column) => (
                          <td key={column.key}>
                            {column.render ? column.render(row) : row[column.key] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={Math.max(1, activeMonitorModule.columns.length + 1)}>
                        No active exceptions
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="review-pagination">
              <div className="review-page-summary">
                {monitorTotalRows
                  ? `Showing ${monitorPageStart + 1}-${monitorPageEnd} of ${monitorTotalRows}`
                  : "Showing 0 of 0"}
              </div>
              <div className="review-page-controls">
                <button
                  type="button"
                  disabled={safeMonitorPage === 1}
                  onClick={() => setMonitorPage(1)}
                >
                  First
                </button>
                <button
                  type="button"
                  disabled={safeMonitorPage === 1}
                  onClick={() => setMonitorPage((page) => Math.max(1, page - 1))}
                >
                  Prev
                </button>
                <span>
                  Page {safeMonitorPage} / {monitorTotalPages}
                </span>
                <button
                  type="button"
                  disabled={safeMonitorPage === monitorTotalPages}
                  onClick={() => setMonitorPage((page) => Math.min(monitorTotalPages, page + 1))}
                >
                  Next
                </button>
                <button
                  type="button"
                  disabled={safeMonitorPage === monitorTotalPages}
                  onClick={() => setMonitorPage(monitorTotalPages)}
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
