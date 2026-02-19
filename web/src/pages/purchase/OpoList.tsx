import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../../styles/purchase.css";

type OpoRow = {
  Opono: any;
  Opodate: any;
  Empno: any;
  Compno: any;
  Company: any;
  Addr1: any;
  Addr2: any;
  Country: any;
  Contact: any;
  Scompany: any;
  Sstate: any;
  Shdate: any;
  Eadate: any;
  Cadate: any;
  Shipvia: any;
  Totamt: any;
  Paytyp1: any;
  Ename: any;
  Contno: any;
  Ordqty: any;
  Itemno: any;
};

type OpoListResp = {
  ok: boolean;
  message?: string;
  rows: OpoRow[];
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

type ColumnDef = {
  key: keyof OpoRow;
  label: string;
  render?: (row: OpoRow, rowKey: string, isOpen: boolean, toggle: () => void) => React.ReactNode;
};

const OPO_FILTERS_STORAGE_KEY = "opo_list_filters";
const OPO_SORT_STORAGE_KEY = "opo_list_sort";

export default function OpoList() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<OpoRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [sort, setSort] = useState<{ key: keyof OpoRow | null; dir: "asc" | "desc" }>(() => {
    try {
      const raw = localStorage.getItem(OPO_SORT_STORAGE_KEY);
      if (!raw) return { key: null, dir: "asc" };
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        (parsed.key === null || typeof parsed.key === "string") &&
        (parsed.dir === "asc" || parsed.dir === "desc")
      ) {
        return { key: parsed.key as keyof OpoRow | null, dir: parsed.dir };
      }
    } catch {
      // ignore parse errors
    }
    return { key: null, dir: "asc" };
  });
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(OPO_FILTERS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        next[k] = v == null ? "" : String(v);
      }
      return next;
    } catch {
      return {};
    }
  });

  const columns: ColumnDef[] = [
    {
      key: "Opono",
      label: "OPO No.",
      render: (row) => {
        const opono = row.Opono ?? "";
        return opono ? <Link to={`/purchase/opo/${opono}`}>{opono}</Link> : "";
      },
    },
    { key: "Opodate", label: "OPO Date", render: (row) => formatDate(row.Opodate) },
    { key: "Empno", label: "Empno" },
    { key: "Compno", label: "Compno" },
    { key: "Company", label: "Company" },
    { key: "Addr1", label: "Addr1" },
    { key: "Addr2", label: "Addr2" },
    { key: "Country", label: "Country" },
    { key: "Contact", label: "Contact" },
    { key: "Scompany", label: "Recipient" },
    { key: "Sstate", label: "Whse" },
    { key: "Shdate", label: "Ship Date", render: (row) => formatDate(row.Shdate) },
    { key: "Eadate", label: "EA Date", render: (row) => formatDate(row.Eadate) },
    { key: "Cadate", label: "Cancel Date", render: (row) => formatDate(row.Cadate) },
    { key: "Shipvia", label: "Ship Via" },
    { key: "Ordqty", label: "Order Qty" },
    { key: "Totamt", label: "Total Amt", render: (row) => money(row.Totamt) },
    { key: "Paytyp1", label: "Pay Type" },
    { key: "Ename", label: "Ename" },
    { key: "Contno", label: "Container No." },
    {
      key: "Itemno",
      label: "Itemno",
      render: (row, rowKey, isOpen, toggle) => {
        const itemText = row.Itemno ? String(row.Itemno) : "";
        const hasMore = itemText.includes(",");
        return (
          <div className="opo-itemno-cell">
            <span className={`opo-itemno${isOpen ? " expanded" : ""}`}>{itemText}</span>
            {hasMore ? (
              <button className="opo-itemno-toggle" type="button" onClick={toggle}>
                {isOpen ? "收起" : "展开"}
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const defaultVisible: (keyof OpoRow)[] = [
    "Opono",
    "Opodate",
    "Compno",
    "Company",
    "Sstate",
    "Shdate",
    "Eadate",
    "Cadate",
    "Ordqty",
    "Totamt",
    "Contno",
  ];
  const [visibleCols, setVisibleCols] = useState<Set<keyof OpoRow>>(() => {
    try {
      const raw = localStorage.getItem("opo_list_visible_cols");
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

  const toggleColumn = (key: keyof OpoRow) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      try {
        localStorage.setItem("opo_list_visible_cols", JSON.stringify(Array.from(next)));
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
        const data = await apiGet<OpoListResp>("/api/purchase/opo", controller.signal);
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

  useEffect(() => {
    try {
      localStorage.setItem(OPO_FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // ignore storage errors
    }
  }, [filters]);

  useEffect(() => {
    try {
      localStorage.setItem(OPO_SORT_STORAGE_KEY, JSON.stringify(sort));
    } catch {
      // ignore storage errors
    }
  }, [sort]);

  const rowKey = (row: OpoRow, idx: number) => `${row.Opono ?? ""}-${row.Contno ?? ""}-${idx}`;

  const getSortValue = (row: OpoRow, key: keyof OpoRow) => {
    const v = row[key];
    if (v === null || v === undefined) return "";
    if (key === "Opodate" || key === "Shdate" || key === "Eadate" || key === "Cadate") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.getTime();
    }
    if (key === "Ordqty" || key === "Totamt") {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return String(v);
  };

  const getFilterText = (row: OpoRow, key: keyof OpoRow) => {
    const v = row[key];
    if (v === null || v === undefined) return "";
    if (key === "Opodate" || key === "Shdate" || key === "Eadate" || key === "Cadate") {
      return formatDate(v);
    }
    if (key === "Totamt") return money(v);
    return String(v);
  };

  const filteredRows = rows.filter((row) => {
    for (const col of visibleColumnDefs) {
      const key = col.key as keyof OpoRow;
      const q = (filters[key as string] || "").trim().toLowerCase();
      if (!q) continue;
      const text = getFilterText(row, key).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const sortedRows = sort.key
    ? [...filteredRows].sort((a, b) => {
        const va = getSortValue(a, sort.key as keyof OpoRow);
        const vb = getSortValue(b, sort.key as keyof OpoRow);
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

  const toggleSort = (key: keyof OpoRow) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  };

  return (
    <div className="purchase-page progressive-enter">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-title">OPO List</div>
        <div className="purchase-toolbar-actions">

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
                      <span className="opo-sort-indicator">
                        {sort.dir === "asc" ? " ▲" : " ▼"}
                      </span>
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
                  const isOpen = !!expanded[key];
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={(e) => toggleRow(key, e.target.checked)}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {(safePage - 1) * pageSize + idx + 1}
                      </td>
                      {visibleColumnDefs.map((col) => {
                        const cell = col.render
                          ? col.render(row, key, isOpen, () =>
                              setExpanded((prev) => ({ ...prev, [key]: !prev[key] })),
                            )
                          : (row[col.key] ?? "");
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
