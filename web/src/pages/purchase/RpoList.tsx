import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../../styles/purchase.css";

type RpoRow = {
  Trno: any;
  Trdate: any;
  Trref: any;
  Opono: any;
  Opodate: any;
  Vtrno: any;
  Empno: any;
  Compno: any;
  Company: any;
  Addr1: any;
  Addr2: any;
  City: any;
  State: any;
  Country: any;
  Phone1: any;
  Email1: any;
  Contact: any;
  Scompany: any;
  Scity: any;
  Sstate: any;
  Ddate: any;
  Cpodate: any;
  Shdate: any;
  Eadate: any;
  Cadate: any;
  Shipvia: any;
  Freight: any;
  Totamt: any;
  Tlines: any;
  Tpieces: any;
  Tweight: any;
  Ename: any;
};

type RpoListResp = {
  ok: boolean;
  message?: string;
  rows: RpoRow[];
};

type ColumnDef = {
  key: keyof RpoRow;
  label: string;
  render?: (row: RpoRow) => React.ReactNode;
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

export default function RpoList() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<RpoRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [sort, setSort] = useState<{ key: keyof RpoRow | null; dir: "asc" | "desc" }>({
    key: null,
    dir: "asc",
  });
  const [filters, setFilters] = useState<Record<string, string>>({});

  const columns: ColumnDef[] = [
    {
      key: "Trno",
      label: "RPO No.",
      render: (row) => {
        const trno = row.Trno ?? "";
        return trno ? <Link to={`/purchase/rpo/${trno}`}>{trno}</Link> : "";
      },
    },
    { key: "Trdate", label: "RPO Date", render: (row) => formatDate(row.Trdate) },
    { key: "Opono", label: "OPO No." },
    { key: "Opodate", label: "OPO Date", render: (row) => formatDate(row.Opodate) },
    { key: "Compno", label: "Compno" },
    { key: "Company", label: "Company" },
    { key: "Sstate", label: "Whse" },
    { key: "Shdate", label: "Ship Date", render: (row) => formatDate(row.Shdate) },
    { key: "Eadate", label: "EA Date", render: (row) => formatDate(row.Eadate) },
    { key: "Cadate", label: "Cancel Date", render: (row) => formatDate(row.Cadate) },
    { key: "Totamt", label: "Total Amt", render: (row) => money(row.Totamt) },
    { key: "Freight", label: "Freight", render: (row) => String(row.Freight ?? "") },
    { key: "Tlines", label: "Lines" },
    { key: "Tpieces", label: "Pieces" },
    { key: "Tweight", label: "Weight" },
    { key: "Shipvia", label: "Ship Via" },
    { key: "Vtrno", label: "Vtrno" },
    { key: "Empno", label: "Empno" },
    { key: "Contact", label: "Contact" },
    { key: "Phone1", label: "Phone" },
    { key: "Email1", label: "Email" },
    { key: "Addr1", label: "Addr1" },
    { key: "Addr2", label: "Addr2" },
    { key: "City", label: "City" },
    { key: "State", label: "State" },
    { key: "Country", label: "Country" },
    { key: "Scompany", label: "Scompany" },
    { key: "Scity", label: "Scity" },
    { key: "Ddate", label: "Ddate", render: (row) => formatDate(row.Ddate) },
    { key: "Cpodate", label: "CPO Date", render: (row) => formatDate(row.Cpodate) },
    { key: "Ename", label: "Ename" },
    { key: "Trref", label: "Trref" },
  ];

  const defaultVisible: (keyof RpoRow)[] = [
    "Trno",
    "Trdate",
    "Opono",
    "Opodate",
    "Company",
    "Sstate",
    "Shdate",
    "Eadate",
    "Totamt",
    "Tpieces",
    "Tweight",
    "Shipvia",
  ];

  const [visibleCols, setVisibleCols] = useState<Set<keyof RpoRow>>(() => {
    try {
      const raw = localStorage.getItem("rpo_list_visible_cols");
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

  const toggleColumn = (key: keyof RpoRow) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      try {
        localStorage.setItem("rpo_list_visible_cols", JSON.stringify(Array.from(next)));
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
        const data = await apiGet<RpoListResp>("/api/purchase/rpo", controller.signal);
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

  const rowKey = (row: RpoRow, idx: number) => `${row.Trno ?? ""}-${row.Opono ?? ""}-${idx}`;

  const getSortValue = (row: RpoRow, key: keyof RpoRow) => {
    const v = row[key];
    if (v === null || v === undefined) return "";
    if (key === "Trdate" || key === "Opodate" || key === "Shdate" || key === "Eadate" || key === "Cadate" || key === "Ddate" || key === "Cpodate") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.getTime();
    }
    if (key === "Totamt" || key === "Tpieces" || key === "Tweight" || key === "Tlines") {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return String(v);
  };

  const getFilterText = (row: RpoRow, key: keyof RpoRow) => {
    const v = row[key];
    if (v === null || v === undefined) return "";
    if (key === "Trdate" || key === "Opodate" || key === "Shdate" || key === "Eadate" || key === "Cadate" || key === "Ddate" || key === "Cpodate") {
      return formatDate(v);
    }
    if (key === "Totamt") return money(v);
    return String(v);
  };

  const filteredRows = rows.filter((row) => {
    for (const col of visibleColumnDefs) {
      const key = col.key as keyof RpoRow;
      const q = (filters[key as string] || "").trim().toLowerCase();
      if (!q) continue;
      const text = getFilterText(row, key).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const sortedRows = sort.key
    ? [...filteredRows].sort((a, b) => {
        const va = getSortValue(a, sort.key as keyof RpoRow);
        const vb = getSortValue(b, sort.key as keyof RpoRow);
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

  const toggleSort = (key: keyof RpoRow) => {
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
        <div className="purchase-toolbar-title">RPO List</div>
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
