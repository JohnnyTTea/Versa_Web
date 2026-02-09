import  { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

type PurchaseRow = {
  Trdate: any;
  Ordqty: any;
  Trum: any;
  Cost: any;
  Price: any;
  Lnamt: any;
  Company: any;
  Compno: any;
  Trno: any;
};

type PurchaseHistoryResp = {
  ok: boolean;
  message?: string;
  rows: PurchaseRow[];
};

function toNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(v: any, digits = 2): string {
  const n = toNumber(v);
  return n === null ? "" : `$${n.toFixed(digits)}`;
}

function formatDate(v: any): string {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  return String(v);
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

export default function ProductCost() {
  const [sp] = useSearchParams();
  const itemId = (sp.get("id") || "").trim();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<PurchaseRow[]>([]);

  useEffect(() => {
    if (!itemId) {
      setErr("");
      setRows([]);
      return;
    }

    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      setErr("");

      try {
        const p = new URLSearchParams();
        p.set("id", itemId);
        const data = await apiGet<PurchaseHistoryResp>(`/api/products/purchase-history?${p.toString()}`, controller.signal);

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
  }, [itemId]);

  return (
    <div className="progressive-enter">
      <h3>Purchase History</h3>

      {err ? <div className="message-box">{err}</div> : null}

      <table>
        <tbody>
          <tr>
            <th>Date</th>
            <th>Ship Qty</th>
            <th>UM</th>
            <th>Cost</th>
            <th>Price</th>
            <th>Total Amt</th>
            <th>Company Name</th>
            <th>Vend.ID</th>
            <th>RPO No.</th>
          </tr>

          {loading ? (
            <tr>
              <td colSpan={9} style={{ textAlign: "center" }}>
                加载中...
              </td>
            </tr>
          ) : rows.length ? (
            rows.map((row, idx) => (
              <tr key={idx}>
                <td>{formatDate(row.Trdate)}</td>
                <td>{row.Ordqty ?? ""}</td>
                <td>{row.Trum ?? ""}</td>
                <td>{money(row.Cost)}</td>
                <td>{money(row.Price)}</td>
                <td>{money(row.Lnamt)}</td>
                <td>{row.Company ?? ""}</td>
                <td>{row.Compno ?? ""}</td>
                <td>{row.Trno ?? ""}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={9} style={{ textAlign: "center" }}>
                无销售数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
