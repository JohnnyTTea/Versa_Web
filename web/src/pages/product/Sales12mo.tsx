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

function moneyCompact(v: number): string {
  if (!Number.isFinite(v)) return "$0";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  } catch {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  }
}

function calcNiceStep(maxValue: number, tickCount: number): number {
  if (maxValue <= 0) return 1;
  const rawStep = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
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

  const chart = useMemo(() => {
    const data = [...rows].reverse().map((r) => {
      const salAmt = Math.max(Number(r["Sal.Amt"] || 0), 0);
      const costAmt = Math.max(Number(r["Cost Amt"] || 0), 0);
      return {
        label: String(r["Mo.Yr"] ?? ""),
        salAmt,
        costAmt,
      };
    });

    const maxSalAmt = data.reduce((m, d) => Math.max(m, d.salAmt), 0);
    const maxCostAmt = data.reduce((m, d) => Math.max(m, d.costAmt), 0);
    const maxValue = Math.max(maxSalAmt, maxCostAmt);
    const tickCount = 5;
    const step = calcNiceStep(maxValue, tickCount);
    const maxTick = Math.max(step, Math.ceil(maxValue / step) * step);
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => maxTick - i * step);
    const avgSalAmt = data.length ? data.reduce((s, d) => s + d.salAmt, 0) / data.length : 0;
    const avgCostAmt = data.length ? data.reduce((s, d) => s + d.costAmt, 0) / data.length : 0;
    const peak = data.reduce(
      (best, d) => (d.salAmt > best.salAmt ? d : best),
      data[0] || { label: "-", salAmt: 0 }
    );
    const costPoints = data.map((d, idx) => {
      const x = ((idx + 0.5) / data.length) * 100;
      const y = maxTick > 0 ? 100 - (d.costAmt / maxTick) * 100 : 100;
      return { x, y, label: d.label, costAmt: d.costAmt };
    });
    const costLinePath = costPoints
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    return { data, maxSalAmt, maxTick, ticks, avgSalAmt, avgCostAmt, peak, costPoints, costLinePath };
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

      {!loading && rows.length ? (
        <div className="sales12mo-chart-card">
          <div className="sales12mo-chart-head">
            <h4>Sales Amount Trend (12 Months)</h4>
            <div className="sales12mo-legend">
              <span className="sales12mo-legend-item">
                <i className="sales12mo-legend-swatch sales12mo-legend-swatch-bar" />
                Sales Amt
              </span>
              <span className="sales12mo-legend-item">
                <i className="sales12mo-legend-swatch sales12mo-legend-swatch-line" />
                Cost Amt
              </span>
            </div>
            <div className="sales12mo-chart-metrics">
              <div className="sales12mo-metric">
                <span>Total</span>
                <strong>{money(total.salAmt)}</strong>
              </div>
              <div className="sales12mo-metric">
                <span>Avg / Month</span>
                <strong>{money(chart.avgSalAmt)}</strong>
              </div>
              <div className="sales12mo-metric">
                <span>Cost Avg / Month</span>
                <strong>{money(chart.avgCostAmt)}</strong>
              </div>
              <div className="sales12mo-metric">
                <span>Peak</span>
                <strong>
                  {chart.peak.label} ({moneyCompact(chart.peak.salAmt)})
                </strong>
              </div>
            </div>
          </div>

          <div className="sales12mo-chart-layout">
            <div className="sales12mo-y-axis">
              {chart.ticks.map((tick, idx) => (
                <div className="sales12mo-y-tick" key={`${tick}-${idx}`}>
                  {moneyCompact(tick)}
                </div>
              ))}
            </div>

            <div className="sales12mo-chart-scroll">
              <div className="sales12mo-chart">
                <div className="sales12mo-grid-lines">
                  {chart.ticks.map((_, idx) => (
                    <div className="sales12mo-grid-line" key={idx} />
                  ))}
                </div>
                <svg className="sales12mo-line-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d={chart.costLinePath} className="sales12mo-cost-line" />
                  {chart.costPoints.map((p, idx) => (
                    <circle key={`${p.label}-${idx}`} cx={p.x} cy={p.y} r="1.35" className="sales12mo-cost-dot">
                      <title>
                        {p.label}: {money(p.costAmt)}
                      </title>
                    </circle>
                  ))}
                </svg>

                <div className="sales12mo-bars">
                  {chart.data.map((d, idx) => {
                    const heightPct =
                      chart.maxTick > 0 && d.salAmt > 0 ? Math.max((d.salAmt / chart.maxTick) * 100, 1.5) : 0;
                    return (
                      <div
                        className="sales12mo-bar-item"
                        key={`${d.label}-${idx}`}
                        title={`${d.label}: Sales ${money(d.salAmt)} / Cost ${money(d.costAmt)}`}
                      >
                        <div className="sales12mo-bar-value">{moneyCompact(d.salAmt)}</div>
                        <div className="sales12mo-bar-track">
                          <div className="sales12mo-bar-fill" style={{ height: `${heightPct}%` }} />
                        </div>
                        <div className="sales12mo-bar-label">{d.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
