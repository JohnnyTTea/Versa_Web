import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type Sales12moRow = {
  "Mo.Yr": any;
  "Pur.Qty(pc)": any;
  "Pur.Amt": any;
  "Sal.Qty(pc)": any;
  "Sal.Amt": any;
  "Cost Amt": any;
  "Gp $": any;
  "Gp %": any;
};

type Sales12moResp = {
  ok: boolean;
  message?: string;
  rows: Sales12moRow[];
};

function toNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(v: any, digits = 2): string {
  const n = toNumber(v);
  return n === null ? "" : `$${n.toFixed(digits)}`;
}

function num(v: any, digits = 0): string {
  const n = toNumber(v);
  return n === null ? "" : n.toFixed(digits);
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

export default function ProductSales12mo() {
  const [sp] = useSearchParams();
  const itemId = (sp.get("id") || "").trim();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Sales12moRow[]>([]);

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
        const data = await apiGet<Sales12moResp>(`/api/products/sales-12mo?${p.toString()}`, controller.signal);

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

  const total = useMemo(() => {
    const sum = {
      purQty: 0,
      purAmt: 0,
      salQty: 0,
      salAmt: 0,
      costAmt: 0,
      gp: 0,
    };
    rows.forEach((r) => {
      sum.purQty += Number(r["Pur.Qty(pc)"] || 0);
      sum.purAmt += Number(r["Pur.Amt"] || 0);
      sum.salQty += Number(r["Sal.Qty(pc)"] || 0);
      sum.salAmt += Number(r["Sal.Amt"] || 0);
      sum.costAmt += Number(r["Cost Amt"] || 0);
      sum.gp += Number(r["Gp $"] || 0);
    });
    const gpPercent =
      sum.salAmt > 0 ? Math.round(((sum.salAmt - sum.costAmt) / sum.salAmt) * 10000) / 100 : 0;
    return { ...sum, gpPercent };
  }, [rows]);

  return (
    <div className="progressive-enter">
      <h3>Last 12 Monthly History</h3>

      {err ? <div className="message-box">{err}</div> : null}

      <table>
        <tbody>
          <tr>
            <th>MO.Yr</th>
            <th className="narrow">Pur.Qty(pc)</th>
            <th className="narrow">Pur.Amt</th>
            <th className="narrow">Sal.Qty(pc)</th>
            <th>Sal.Amt</th>
            <th>Cost Amt</th>
            <th>GP$</th>
            <th>GP%</th>
          </tr>

          {loading ? (
            <tr>
              <td colSpan={9} style={{ textAlign: "center" }}>
                加载中...
              </td>
            </tr>
          ) : rows.length ? (
            <>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td>{row["Mo.Yr"]}</td>
                  <td>{num(row["Pur.Qty(pc)"], 0)}</td>
                  <td>{money(row["Pur.Amt"])}</td>
                  <td className="highlight">{num(row["Sal.Qty(pc)"], 0)}</td>
                  <td>{money(row["Sal.Amt"])}</td>
                  <td>{money(row["Cost Amt"])}</td>
                  <td>{money(row["Gp $"])}</td>
                  <td>{num(row["Gp %"], 2)} %</td>
                </tr>
              ))}

              <tr style={{ fontWeight: "bold", background: "#f5f5f5" }}>
                <td>Total</td>
                <td>{num(total.purQty, 0)} pc</td>
                <td>{money(total.purAmt)}</td>
                <td className="highlight">{num(total.salQty, 0)} pc</td>
                <td>{money(total.salAmt)}</td>
                <td>{money(total.costAmt)}</td>
                <td>{money(total.gp)}</td>
                <td>{num(total.gpPercent, 2)} %</td>
              </tr>
            </>
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
