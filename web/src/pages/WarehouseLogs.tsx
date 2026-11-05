import { useEffect, useMemo, useState } from "react";
import WarehouseLogDatePicker from "../components/WarehouseLogDatePicker";

type WarehouseLogRow = {
  user_id: number;
  username: string;
  tracking_number: string;
  shipvia?: string | null;
  freight?: string | null;
  packed_date: string;
  packed_at: string;
};

function getLocalDateValue(date = new Date()) {
  const offsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offsetMinutes * 60000);
  return local.toISOString().slice(0, 10);
}

type SummaryRow = {
  username: string;
  scan_count: number;
  last_packed_at: string | null;
};

function toCsv(rows: WarehouseLogRow[]) {
  const lines = [
    ["User", "Tracking Number", "Ship Via", "Freight", "Packed Date", "Packed At"],
    ...rows.map((row) => [
      row.username,
      row.tracking_number,
      row.shipvia || "",
      row.freight || "",
      row.packed_date,
      row.packed_at,
    ]),
  ];

  return lines
    .map((cells) =>
      cells
        .map((item) => `"${String(item ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

export default function WarehouseLogs() {
  const [date, setDate] = useState("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [datesLoading, setDatesLoading] = useState(true);
  const [usernameFilter, setUsernameFilter] = useState("");
  const [records, setRecords] = useState<WarehouseLogRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchLogs = async (targetDate: string, filter = "") => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ date: targetDate });
      if (filter.trim()) params.set("username", filter.trim());

      const res = await fetch(`/api/warehouse/logs?${params.toString()}`, {
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Unable to load warehouse log");
      }

      setRecords(Array.isArray(data?.records) ? data.records : []);
      setSummary(Array.isArray(data?.summary) ? data.summary : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load warehouse log");
      setRecords([]);
      setSummary([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    async function loadDates() {
      try {
        const response = await fetch("/api/warehouse/log-dates", { credentials: "include", cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data?.ok) throw new Error(data?.message || "Unable to load log dates");
        const dates: string[] = Array.isArray(data.dates) ? data.dates : [];
        if (controller.signal.aborted) return;
        setAvailableDates(dates);
        const today = getLocalDateValue();
        setDate(dates.includes(today) ? today : dates[0] || "");
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load log dates");
      } finally {
        if (!controller.signal.aborted) setDatesLoading(false);
      }
    }
    loadDates();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (date && availableDates.includes(date)) fetchLogs(date, usernameFilter);
  }, [date, usernameFilter, availableDates]);

  const totalScans = useMemo(() => records.length, [records]);
  const uniqueUsers = useMemo(() => new Set(records.map((r) => r.username)).size, [records]);

  const selectedUserLabel = usernameFilter || "All users";

  const handleExport = () => {
    const csv = toCsv(records);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `warehouse-log-${date}${usernameFilter ? `-${usernameFilter}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const userOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.username))).sort((a, b) => a.localeCompare(b)),
    [records],
  );

  return (
    <div style={{ padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1.1, textTransform: "uppercase", color: "#475569", fontWeight: 700 }}>
              Warehouse
            </div>
            <h2 style={{ margin: 0, fontSize: 30, color: "#0f172a" }}>Packer Activity Log</h2>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label htmlFor="log-date" style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
              Date
            </label>
            <WarehouseLogDatePicker dates={availableDates} value={date} loading={datesLoading} onChange={setDate} />

            <label htmlFor="log-user" style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
              User
            </label>
            <select
              id="log-user"
              value={usernameFilter}
              onChange={(e) => setUsernameFilter(e.target.value)}
              style={{ borderRadius: 10, border: "1px solid #cbd5e1", padding: "10px 12px", minWidth: 180 }}
            >
              <option value="">All users</option>
              {userOptions.map((user) => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExport}
              disabled={!records.length || loading}
              style={{
                border: "none",
                borderRadius: 10,
                padding: "10px 14px",
                background: records.length ? "#0f172a" : "#cbd5e1",
                color: "#fff",
                fontWeight: 700,
                cursor: records.length && !loading ? "pointer" : "not-allowed",
              }}
            >
              Export CSV
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 12px", borderRadius: 10, marginBottom: 16 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
          <div style={{ background: "#dbeafe", borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 700 }}>Total scans</div>
            <div style={{ marginTop: 8, fontSize: 32, fontWeight: 800, color: "#0f172a" }}>{loading ? "..." : totalScans}</div>
          </div>
          <div style={{ background: "#ecfeff", borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 12, color: "#0f766e", fontWeight: 700 }}>Unique users</div>
            <div style={{ marginTop: 8, fontSize: 32, fontWeight: 800, color: "#0f172a" }}>{loading ? "..." : uniqueUsers}</div>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(15,23,42,0.06)", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Summary by user</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Current view:</span>
              <span style={{ background: "#e2e8f0", borderRadius: 999, padding: "4px 10px", fontWeight: 700, color: "#0f172a", fontSize: 12 }}>
                {selectedUserLabel}
              </span>
              {usernameFilter ? (
                <button
                  type="button"
                  onClick={() => setUsernameFilter("")}
                  style={{ border: "none", background: "#0f172a", color: "#fff", borderRadius: 999, padding: "6px 10px", fontWeight: 700, cursor: "pointer" }}
                >
                  Show all users
                </button>
              ) : null}
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {summary.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {summary.map((row) => (
                  <button
                    key={row.username}
                    type="button"
                    onClick={() => setUsernameFilter(row.username)}
                    style={{
                      display: "flex",
                      width: "100%",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: usernameFilter === row.username ? "#dbeafe" : "#f8fafc",
                      border: usernameFilter === row.username ? "1px solid #93c5fd" : "1px solid transparent",
                      borderRadius: 12,
                      padding: "10px 12px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.username}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        Last packed: {row.last_packed_at ? new Date(row.last_packed_at).toLocaleString() : "—"}
                      </div>
                    </div>
                    <div style={{ background: "#dbeafe", borderRadius: 999, padding: "6px 10px", fontWeight: 700, color: "#1d4ed8" }}>
                      {row.scan_count}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ color: "#64748b", padding: 8 }}>No scan records for this tab.</div>
            )}
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(15,23,42,0.06)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
            Record list
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#334155", fontSize: 12 }}>User</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#334155", fontSize: 12 }}>Tracking Number</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#334155", fontSize: 12 }}>Ship Via</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#334155", fontSize: 12 }}>Freight</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#334155", fontSize: 12 }}>Packed At</th>
                </tr>
              </thead>
              <tbody>
                {records.length ? records.map((row, index) => (
                  <tr key={`${row.username}-${row.tracking_number}-${row.packed_at}-${index}`} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 12px", color: "#0f172a" }}>{row.username}</td>
                    <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 600 }}>{row.tracking_number}</td>
                    <td style={{ padding: "10px 12px", color: "#475569" }}>{row.shipvia || "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#475569" }}>{row.freight || "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#475569" }}>{new Date(row.packed_at).toLocaleString()}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} style={{ padding: "18px 12px", textAlign: "center", color: "#64748b" }}>
                      No records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
