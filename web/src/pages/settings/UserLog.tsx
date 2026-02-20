import { useEffect, useMemo, useState } from "react";
import "../../styles/settings.css";

type LogRow = {
  username: string;
  ip_address: string;
  event: string;
  module?: string;
  action?: string;
  target?: string;
  meta_json?: string;
  timestamp: string;
};

type LogResp = {
  ok: boolean;
  message?: string;
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  rows: LogRow[];
};

function fmtDateTime(v: string) {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }
  return String(v).replace("T", " ").replace(/\.?\d*Z$/, "").trim();
}

export default function UserLog() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [username, setUsername] = useState("");
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const pageSize = 50;

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      if (username.trim()) qs.set("username", username.trim());
      if (keyword.trim()) qs.set("keyword", keyword.trim());
      if (startDate) qs.set("startDate", startDate);
      if (endDate) qs.set("endDate", endDate);

      const res = await fetch(`/api/log/list?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as LogResp;
      if (!res.ok || !data?.ok) {
        setMessage(data?.message || `HTTP ${res.status}`);
        setRows([]);
        setPages(1);
        setTotal(0);
        return;
      }
      const rawRows = Array.isArray(data.rows) ? data.rows : [];
      const u = username.trim().toLowerCase();
      const safeRows = u
        ? rawRows.filter((r) => String(r.username || "").toLowerCase() === u)
        : rawRows;
      setRows(safeRows);
      setPages(Math.max(1, Number(data.pages || 1)));
      setTotal(Number(data.total || 0));
    } catch (e: any) {
      setMessage(e?.message || "Load failed");
      setRows([]);
      setPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const rangeText = useMemo(() => {
    if (!total) return "0";
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    return `${from}-${to} / ${total}`;
  }, [page, total]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  return (
    <div className="container user-management progressive-enter">
      <div className="roles-header">
        <div>
          <h2>用户操作日志（User Activity Log）</h2>
          <p>记录用户在系统中的关键操作轨迹。</p>
        </div>
      </div>

      <form className="users-actions" onSubmit={onSearch} style={{ marginBottom: 12, gap: 8 }}>
        <input
          className="compact-input"
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: 140 }}
        />
        <input
          className="compact-input"
          placeholder="keyword (sku / order / report)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 280 }}
        />
        <label style={{ fontSize: 13, color: "#5b6b82" }}>From:</label>
        <input
          className="compact-input"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{ width: 150 }}
        />
        <label style={{ fontSize: 13, color: "#5b6b82" }}>To:</label>
        <input
          className="compact-input"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{ width: 150 }}
        />
        <button type="submit" className="save-btn userlog-search-btn" disabled={loading}>
          {loading ? "Loading..." : "Search"}
        </button>
      </form>

      {message ? <div className="message-box">{message}</div> : null}

      <div className="table-wrapper role-table-wrapper">
        <table className="user-table role-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>User</th>
              <th style={{ width: 110 }}>Module</th>
              <th style={{ width: 130 }}>Action</th>
              <th className="userlog-col-target">Target</th>
              <th style={{ width: 160 }}>IP</th>
              <th className="userlog-col-event">Event</th>
              <th style={{ width: 200 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "#6b7280" }}>
                  {loading ? "Loading..." : "No logs"}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.username}-${r.timestamp}-${r.event}`}>
                  <td>{r.username}</td>
                  <td>{r.module || "-"}</td>
                  <td>{r.action || "-"}</td>
                  <td className="userlog-col-target" title={r.target || ""}>{r.target || "-"}</td>
                  <td>{r.ip_address}</td>
                  <td className="userlog-col-event" title={r.event || ""}>{r.event}</td>
                  <td>{fmtDateTime(r.timestamp)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="users-actions" style={{ marginTop: 12, justifyContent: "space-between" }}>
        <div style={{ color: "#5b6b82", fontSize: 13 }}>Rows: {rangeText}</div>
        <div className="users-actions">
          <button type="button" className="cancel-btn" disabled={page <= 1} onClick={() => setPage(1)}>
            First
          </button>
          <button
            type="button"
            className="cancel-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span style={{ minWidth: 80, textAlign: "center" }}>
            {page} / {pages}
          </span>
          <button
            type="button"
            className="cancel-btn"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            Next
          </button>
          <button
            type="button"
            className="cancel-btn"
            disabled={page >= pages}
            onClick={() => setPage(pages)}
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}
