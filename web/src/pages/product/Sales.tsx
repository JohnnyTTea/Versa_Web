import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getProductCache, setProductCache } from "./productCache";

type SalesRow = {
  Trdate: any;
  Price: any;
  Shiqty: any;
  Trum: any;
  Company: any;
  Trno: any;
  Ordno: any;
  Trorig1: any;
  Trorig2: any;
  Shipvia: any;
  Stracno: any;
};

type SalesHistoryResp = {
  ok: boolean;
  message?: string;

  rows: SalesRow[];
  page: number;
  pages: number;
  total: number;
  limit: number;
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
  if (n === null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
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

export default function ProductSales() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();

  const itemId = useMemo(() => (sp.get("id") || "").trim(), [sp.get("id")]);

  const sort = (sp.get("sort") || "Trdate").trim();
  const order = (sp.get("order") || "desc").trim(); // 后端接受 desc/asc
  const limit = Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);

  const API_LIST = "/api/products/sales-history";
  const API_EXPORT = "/api/products/sales-history/export";

  function setQuery(params: Record<string, string>) {
    const p = new URLSearchParams(sp);
    Object.entries(params).forEach(([k, v]) => {
      if (v === "") p.delete(k);
      else p.set(k, v);
    });
    nav(`${loc.pathname}?${p.toString()}`);
  }

  function exportCsv(e: React.MouseEvent) {
    e.preventDefault();
    if (!itemId) return;

    const p = new URLSearchParams();
    p.set("id", itemId);
    if (sort) p.set("sort", sort);
    if (order) p.set("order", order);
    window.open(`${API_EXPORT}?${p.toString()}`, "_blank");
  }

  useEffect(() => {
    if (!itemId) {
      setErr("");
      setRows([]);
      setPages(1);
      setTotal(0);
      return;
    }

    const controller = new AbortController();
    const isDefaultQuery =
      page === 1 &&
      limit === 50 &&
      (sort || "Trdate") === "Trdate" &&
      (order || "desc").toLowerCase() === "desc";

    if (isDefaultQuery) {
      const cached = getProductCache<SalesHistoryResp>(itemId, "sales-history-default");
      if (cached?.ok && Array.isArray(cached.rows)) {
        setRows(cached.rows);
        setPages(Number.isFinite(Number(cached.pages)) ? Number(cached.pages) : 1);
        setTotal(Number.isFinite(Number(cached.total)) ? Number(cached.total) : 0);
      }
    }

    const run = async () => {
      setLoading(true);
      setErr("");
      setRows([]);
      setPages(1);
      setTotal(0);

      try {
        const p = new URLSearchParams();
        p.set("id", itemId);
        p.set("page", String(page));
        p.set("limit", String(limit));
        if (sort) p.set("sort", sort);
        if (order) p.set("order", order);

        const data = await apiGet<SalesHistoryResp>(
          `${API_LIST}?${p.toString()}`,
          controller.signal
        );

        if (!data?.ok) throw new Error(data?.message || "Load failed");

        setRows(Array.isArray(data.rows) ? data.rows : []);
        setPages(Number.isFinite(Number(data.pages)) ? Number(data.pages) : 1);
        setTotal(Number.isFinite(Number(data.total)) ? Number(data.total) : 0);
        if (isDefaultQuery) setProductCache(itemId, "sales-history-default", data);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setErr(String(e?.message || e || "Unknown error"));
        setRows([]);
        setPages(1);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [itemId, page, limit, sort, order]);

  const canPrev = page > 1;
  const canNext = page < pages;

  return (
    <div className="progressive-enter">
      <h3 style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>Sales History</span>
        <a href="#" onClick={exportCsv} className="export-link">
          Export CSV
        </a>

        <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: 12 }}>
          Page {page}/{pages} · Total {total} · {limit}/page
        </span>
      </h3>

      {err ? <div className="message-box">{err}</div> : null}

      <table id="sales-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Price</th>
            <th>Date</th>
            <th>Ship Qty</th>
            <th>UM</th>
            <th>Company Name</th>
            <th>Inv. No.</th>
            <th>Order. No.</th>
            <th>Origin1</th>
            <th>Origin2</th>
            <th>Shipping Carrier</th>
            <th>Tracking No.</th>
          </tr>
        </thead>

        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={`${row.Trno ?? "trno"}-${i}`}>
                <td>{(page - 1) * limit + i + 1}</td>
                <td>{money(row.Price, 2)}</td>
                <td>{formatDate(row.Trdate)}</td>
                <td>{toNumber(row.Shiqty) ?? row.Shiqty ?? ""}</td>
                <td>{row.Trum ?? ""}</td>
                <td>{row.Company ?? ""}</td>
                <td>{row.Trno ?? ""}</td>
                <td>{row.Ordno ?? ""}</td>
                <td>{row.Trorig1 ?? ""}</td>
                <td>{row.Trorig2 ?? ""}</td>
                <td>{row.Shipvia ?? ""}</td>
                <td>{row.Stracno ?? ""}</td>
              </tr>
            ))
          ) : loading ? (
            <tr>
              <td colSpan={12} style={{ textAlign: "center" }}>
                加载中...
              </td>
            </tr>
          ) : (
            <tr>
              <td colSpan={12} style={{ textAlign: "center" }}>
                无订单数据
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div
        className="pagination floating-pagination"
        style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}
      >
        <span style={{ fontSize: 12, opacity: 0.7 }}>Go to</span>
        <input
          type="number"
          min={1}
          max={pages}
          defaultValue={page}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const v = Number((e.target as HTMLInputElement).value);
            if (!Number.isFinite(v)) return;
            const next = Math.min(Math.max(1, v), pages);
            setQuery({ page: String(next) });
          }}
          style={{ width: 64, padding: "6px 8px", borderRadius: 8, border: "1px solid #e2e8f0" }}
        />

        <button
          type="button"
          disabled={!canPrev || loading}
          onClick={() => setQuery({ page: String(page - 1) })}
          style={{ opacity: !canPrev || loading ? 0.5 : 1 }}
        >
          « Prev
        </button>

        <button
          type="button"
          disabled={!canNext || loading}
          onClick={() => setQuery({ page: String(page + 1) })}
          style={{ opacity: !canNext || loading ? 0.5 : 1 }}
        >
          Next »
        </button>

        <button
          type="button"
          disabled={page === 1 || loading}
          onClick={() => setQuery({ page: "1" })}
          style={{ opacity: page === 1 || loading ? 0.5 : 1 }}
        >
          First
        </button>

        <button
          type="button"
          disabled={page === pages || loading}
          onClick={() => setQuery({ page: String(pages) })}
          style={{ opacity: page === pages || loading ? 0.5 : 1 }}
        >
          Last
        </button>
      </div>
    </div>
  );
}
