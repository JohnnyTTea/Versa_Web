import { useEffect, useState } from "react";
import "../../styles/purchase.css";

type VendorRow = {
  Compno: any;
  Sdate: any;
  Company: any;
  Addr1: any;
  Addr2: any;
  City: any;
  State: any;
  Zip: any;
  Country: any;
  Contact1: any;
  Contact2: any;
  Phone1: any;
  Phone2: any;
  Email1: any;
  Email2: any;
  Accno: any;
  Accno2: any;
  Accpur: any;
};

type VendorListResp = {
  ok: boolean;
  message?: string;
  rows: VendorRow[];
};

type ColumnDef = {
  key: keyof VendorRow;
  label: string;
  render?: (row: VendorRow) => React.ReactNode;
};

function formatDate(v: any): string {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  return String(v);
}

function toNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(v: any, digits = 2): string {
  const n = toNumber(v);
  return n === null ? "" : `$${n.toFixed(digits)}`;
}

async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function Vendor() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [sort, setSort] = useState<{ key: keyof VendorRow | null; dir: "asc" | "desc" }>({
    key: null,
    dir: "asc",
  });
  const [filters, setFilters] = useState<Record<string, string>>({});

  const columns: ColumnDef[] = [
    { key: "Compno", label: "Compno" },
    { key: "Sdate", label: "Sdate", render: (row) => formatDate(row.Sdate) },
    { key: "Company", label: "Company" },
    { key: "Addr1", label: "Addr1" },
    { key: "Addr2", label: "Addr2" },
    { key: "City", label: "City" },
    { key: "State", label: "State" },
    { key: "Zip", label: "Zip" },
    { key: "Country", label: "Country" },
    { key: "Contact1", label: "Contact1" },
    { key: "Contact2", label: "Contact2" },
    { key: "Phone1", label: "Phone1" },
    { key: "Phone2", label: "Phone2" },
    { key: "Email1", label: "Email1" },
    { key: "Email2", label: "Email2" },
    { key: "Accno", label: "Accno" },
    { key: "Accno2", label: "Accno2" },
    { key: "Accpur", label: "Accpur", render: (row) => money(row.Accpur) },
  ];

  const defaultVisible: (keyof VendorRow)[] = [
    "Compno",
    "Sdate",
    "Company",
    "City",
    "State",
    "Country",
    "Contact1",
    "Phone1",
    "Email1",
    "Accno",
    "Accpur",
  ];

  const [visibleCols, setVisibleCols] = useState<Set<keyof VendorRow>>(() => {
    try {
      const raw = localStorage.getItem("vendor_list_visible_cols");
      if (!raw) return new Set(defaultVisible);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set(defaultVisible);
      const allowed = new Set(columns.map((c) => c.key));
      const filtered = parsed.filter((k) => allowed.has(k));
      return new Set(filtered.length ? filtered : defaultVisible);
    } catch {
      return new Set(defaultVisible);
    }
  });

  const toggleColumn = (key: keyof VendorRow) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem("vendor_list_visible_cols", JSON.stringify(Array.from(next)));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const visibleColumnDefs = columns.filter((c) => visibleCols.has(c.key));
  const allColumnDefs = columns;

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      setErr("");
      try {
        const data = await apiGet<VendorListResp>("/api/purchase/vendor", controller.signal);
        if (!data?.ok) throw new Error(data?.message || "Load failed");
        setRows(Array.isArray(data.rows) ? data.rows : []);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setErr(String(e?.message || e || "Unknown error"));
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setPage(1);
  }, [rows]);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, visibleCols]);

  const rowKey = (row: VendorRow, idx: number) => `${row.Compno ?? ""}-${idx}`;

  const getSortValue = (row: VendorRow, key: keyof VendorRow) => {
    const v = row[key];
    if (v === null || v === undefined) return "";
    if (key === "Sdate") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.getTime();
    }
    if (key === "Accpur") {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return String(v);
  };

  const getFilterText = (row: VendorRow, key: keyof VendorRow) => {
    const v = row[key];
    if (v === null || v === undefined) return "";
    if (key === "Sdate") return formatDate(v);
    if (key === "Accpur") return money(v);
    return String(v);
  };

  const filteredRows = rows.filter((row) => {
    for (const col of visibleColumnDefs) {
      const key = col.key as keyof VendorRow;
      const q = (filters[key as string] || "").trim().toLowerCase();
      if (!q) continue;
      const text = getFilterText(row, key).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const sortedRows = sort.key
    ? [...filteredRows].sort((a, b) => {
        const va = getSortValue(a, sort.key as keyof VendorRow);
        const vb = getSortValue(b, sort.key as keyof VendorRow);
        if (va < vb) return sort.dir === "asc" ? -1 : 1;
        if (va > vb) return sort.dir === "asc" ? 1 : -1;
        return 0;
      })
    : filteredRows;

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const allPageSelected =
    pageRows.length > 0 && pageRows.every((row, idx) => selected.has(rowKey(row, idx)));

  const toggleSelectAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        pageRows.forEach((row, idx) => next.add(rowKey(row, idx)));
      } else {
        pageRows.forEach((row, idx) => next.delete(rowKey(row, idx)));
      }
      return next;
    });
  };

  const toggleRow = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleSort = (key: keyof VendorRow) => {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
  };

  return (
    <div className="purchase-page progressive-enter">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-title">Vendor List</div>
        <div className="purchase-toolbar-actions">
          <button className="purchase-btn" type="button">
            FILTER▼
          </button>
          <button className="purchase-btn" type="button">
            EXPORT
          </button>
        </div>
      </div>

      <div className="purchase-layout">
        <div className="purchase-table-wrapper">
          {err ? <div className="message-box">{err}</div> : null}
          <table className="purchase-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <th style={{ width: 30 }}>#</th>
                {visibleColumnDefs.map((col) => (
                  <th
                    key={col.key}
                    className="opo-sortable-th"
                    onClick={() => toggleSort(col.key)}
                    title="Sort"
                  >
                    {col.label}
                    {sort.key === col.key ? (
                      <span className="opo-sort-indicator">{sort.dir === "asc" ? " ▲" : " ▼"}</span>
                    ) : null}
                  </th>
                ))}
              </tr>
              <tr className="purchase-search-row">
                <th />
                <th />
                {visibleColumnDefs.map((col) => (
                  <th key={col.key}>
                    <input
                      className="purchase-search-input"
                      placeholder="Search"
                      value={filters[col.key as string] || ""}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
                      }
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleColumnDefs.length + 2} style={{ textAlign: "center" }}>
                    加载中...
                  </td>
                </tr>
              ) : pageRows.length ? (
                pageRows.map((row, idx) => {
                  const key = rowKey(row, idx);
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={(e) => toggleRow(key, e.target.checked)}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>{(safePage - 1) * pageSize + idx + 1}</td>
                      {visibleColumnDefs.map((col) => {
                        const cell = col.render ? col.render(row) : (row[col.key] ?? "");
                        return <td key={col.key}>{cell}</td>;
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={visibleColumnDefs.length + 2} style={{ textAlign: "center" }}>
                    无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="opo-pagination">
            <div className="opo-pagination-center">
              <button
                className="purchase-btn ghost"
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(1)}
              >
                First
              </button>
              <button
                className="purchase-btn ghost"
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <button
                className="purchase-btn ghost"
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
              <button
                className="purchase-btn ghost"
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                Last
              </button>
            </div>
            <span className="opo-page-info">
              Page {safePage}/{totalPages} · Total {sortedRows.length} · {pageSize}/page
            </span>
          </div>
        </div>

        <aside className="purchase-filter-panel">
          <div className="purchase-filter-title">FILTER</div>
          <ul className="purchase-filter-list">
            {allColumnDefs.map((col) => (
              <li key={col.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleCols.has(col.key)}
                    onChange={() => toggleColumn(col.key)}
                  />{" "}
                  {col.label}
                </label>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
