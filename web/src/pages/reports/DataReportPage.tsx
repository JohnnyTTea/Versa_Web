import { Fragment, useMemo, useState } from "react";
import "../../styles/report.css";

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

type VendorMetrics = {
  purchaseQty: number;
  purchaseAmt: number;
  salesQty: number;
  salesAmt: number;
};

type SkuMetrics = {
  purchaseQty: number;
  soldQty: number;
  returnQty: number;
  returnRate: number;
};

type TrendPoint = {
  label: string;
  ebay: number;
  amzn: number;
  total: number;
};

function hashSeed(v: string) {
  return [...v].reduce((s, ch) => s + ch.charCodeAt(0), 0) || 77;
}

function currency(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function num(v: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(v));
}

function percent(v: number) {
  return `${v.toFixed(1)}%`;
}

function buildVendorData(vendor: string): Record<number, VendorMetrics[]> {
  const seed = hashSeed(vendor);
  const out: Record<number, VendorMetrics[]> = {};
  YEARS.forEach((year, yi) => {
    out[year] = MONTHS.map((_, mi) => {
      const base = 75 + ((seed + yi * 17 + mi * 13) % 110);
      const salesQty = Math.max(base - (mi % 4) * 3 + yi * 2, 10);
      const purchaseQty = Math.max(base + ((mi + yi) % 5) * 6, 10);
      const purchaseAmt = purchaseQty * (14 + ((seed + mi) % 12));
      const salesAmt = salesQty * (18 + ((seed + yi + mi) % 14));
      return { purchaseQty, purchaseAmt, salesQty, salesAmt };
    });
  });
  return out;
}

function buildSkuData(sku: string): Record<number, SkuMetrics[]> {
  const seed = hashSeed(sku);
  const out: Record<number, SkuMetrics[]> = {};
  YEARS.forEach((year, yi) => {
    out[year] = MONTHS.map((_, mi) => {
      const purchaseQty = 90 + ((seed + yi * 11 + mi * 9) % 85);
      const soldQty = Math.max(purchaseQty - 10 - ((mi + yi) % 16), 10);
      const returnQty = Math.max(Math.round(soldQty * (0.03 + ((mi + seed) % 7) * 0.006)), 0);
      const returnRate = soldQty > 0 ? (returnQty / soldQty) * 100 : 0;
      return { purchaseQty, soldQty, returnQty, returnRate };
    });
  });
  return out;
}

function buildTrend(sku: string): TrendPoint[] {
  const seed = hashSeed(sku);
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (12 - i));
    const label = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
    const ebay = 50 + ((seed + i * 9) % 120);
    const amzn = 40 + ((seed + i * 13) % 100);
    const total = ebay + amzn;
    return { label, ebay, amzn, total };
  });
}

export default function DataReportPage() {
  const [vendor, setVendor] = useState("ALTEC-JHY");
  const [sku, setSku] = useState("9-T-0308");

  const vendorData = useMemo(() => buildVendorData(vendor), [vendor]);
  const skuData = useMemo(() => buildSkuData(sku), [sku]);
  const trend = useMemo(() => buildTrend(sku), [sku]);

  const maxTrend = useMemo(() => trend.reduce((m, x) => Math.max(m, x.total), 0), [trend]);
  const trendLine = useMemo(() => {
    if (!trend.length || maxTrend <= 0) return "";
    return trend
      .map((p, idx) => {
        const x = ((idx + 0.5) / trend.length) * 100;
        const y = 100 - (p.total / maxTrend) * 100;
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [trend, maxTrend]);

  return (
    <div className="dr-page progressive-enter">
      <section className="dr-section">
        <div className="dr-header">
          <h2>Vendor 销量查询 (2020-2026)</h2>
          <div className="dr-entity-current">
            Vendor: <strong>{vendor || "-"}</strong>
          </div>
          <div className="dr-filters">
            <label htmlFor="vendor">Vendor</label>
            <input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
        </div>

        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th rowSpan={2} className="dr-sticky-col">月份</th>
                {YEARS.map((y) => (
                  <th key={y} colSpan={4}>{y}年</th>
                ))}
              </tr>
              <tr>
                {YEARS.map((y) => (
                  <FragmentCols key={y} prefix={`vendor-${y}`} labels={["购入 Qty", "购入 Amt", "售出 Qty", "售出 Amt"]} />
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((month, i) => (
                <tr key={month}>
                  <th className="dr-sticky-col">{month}</th>
                  {YEARS.map((y) => {
                    const row = vendorData[y][i];
                    return (
                      <Fragment key={`${y}-${month}`}>
                        <td key={`${y}-${month}-pq`}>{num(row.purchaseQty)}</td>
                        <td key={`${y}-${month}-pa`}>{currency(row.purchaseAmt)}</td>
                        <td key={`${y}-${month}-sq`}>{num(row.salesQty)}</td>
                        <td key={`${y}-${month}-sa`}>{currency(row.salesAmt)}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}

              <tr className="dr-summary">
                <th className="dr-sticky-col">Total</th>
                {YEARS.map((y) => {
                  const total = vendorData[y].reduce(
                    (acc, r) => ({
                      purchaseQty: acc.purchaseQty + r.purchaseQty,
                      purchaseAmt: acc.purchaseAmt + r.purchaseAmt,
                      salesQty: acc.salesQty + r.salesQty,
                      salesAmt: acc.salesAmt + r.salesAmt,
                    }),
                    { purchaseQty: 0, purchaseAmt: 0, salesQty: 0, salesAmt: 0 }
                  );
                  return (
                    <Fragment key={`${y}-total`}>
                      <td key={`${y}-tpq`}>{num(total.purchaseQty)}</td>
                      <td key={`${y}-tpa`}>{currency(total.purchaseAmt)}</td>
                      <td key={`${y}-tsq`}>{num(total.salesQty)}</td>
                      <td key={`${y}-tsa`}>{currency(total.salesAmt)}</td>
                    </Fragment>
                  );
                })}
              </tr>

              <tr className="dr-summary">
                <th className="dr-sticky-col">Average</th>
                {YEARS.map((y) => {
                  const avg = vendorData[y].reduce(
                    (acc, r) => ({
                      purchaseQty: acc.purchaseQty + r.purchaseQty / 12,
                      purchaseAmt: acc.purchaseAmt + r.purchaseAmt / 12,
                      salesQty: acc.salesQty + r.salesQty / 12,
                      salesAmt: acc.salesAmt + r.salesAmt / 12,
                    }),
                    { purchaseQty: 0, purchaseAmt: 0, salesQty: 0, salesAmt: 0 }
                  );
                  return (
                    <Fragment key={`${y}-avg`}>
                      <td key={`${y}-apq`}>{num(avg.purchaseQty)}</td>
                      <td key={`${y}-apa`}>{currency(avg.purchaseAmt)}</td>
                      <td key={`${y}-asq`}>{num(avg.salesQty)}</td>
                      <td key={`${y}-asa`}>{currency(avg.salesAmt)}</td>
                    </Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="dr-section">
        <div className="dr-header">
          <h2>SKU 销量查询 (2020-2026)</h2>
          <div className="dr-entity-current">
            SKU: <strong>{sku || "-"}</strong>
          </div>
          <div className="dr-filters">
            <label htmlFor="sku">SKU</label>
            <input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
        </div>

        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th rowSpan={2} className="dr-sticky-col">月份</th>
                {YEARS.map((y) => (
                  <th key={y} colSpan={4}>{y}年</th>
                ))}
              </tr>
              <tr>
                {YEARS.map((y) => (
                  <FragmentCols key={y} prefix={`sku-${y}`} labels={["购入 Qty", "售出 Qty", "售后 Qty", "售后率"]} />
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((month, i) => (
                <tr key={month}>
                  <th className="dr-sticky-col">{month}</th>
                  {YEARS.map((y) => {
                    const row = skuData[y][i];
                    return (
                      <Fragment key={`${y}-${month}`}>
                        <td key={`${y}-${month}-pq`}>{num(row.purchaseQty)}</td>
                        <td key={`${y}-${month}-sq`}>{num(row.soldQty)}</td>
                        <td key={`${y}-${month}-rq`}>{num(row.returnQty)}</td>
                        <td key={`${y}-${month}-rr`}>{percent(row.returnRate)}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}

              <tr className="dr-summary">
                <th className="dr-sticky-col">Total</th>
                {YEARS.map((y) => {
                  const total = skuData[y].reduce(
                    (acc, r) => ({
                      purchaseQty: acc.purchaseQty + r.purchaseQty,
                      soldQty: acc.soldQty + r.soldQty,
                      returnQty: acc.returnQty + r.returnQty,
                    }),
                    { purchaseQty: 0, soldQty: 0, returnQty: 0 }
                  );
                  const rr = total.soldQty > 0 ? (total.returnQty / total.soldQty) * 100 : 0;
                  return (
                    <Fragment key={`${y}-total`}>
                      <td key={`${y}-tpq`}>{num(total.purchaseQty)}</td>
                      <td key={`${y}-tsq`}>{num(total.soldQty)}</td>
                      <td key={`${y}-trq`}>{num(total.returnQty)}</td>
                      <td key={`${y}-trr`}>{percent(rr)}</td>
                    </Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="dr-chart-card">
          <div className="dr-chart-title">过去13个月销量趋势 (柱状 + 折线)</div>
          <div className="dr-chart-legend">
            <span><i className="dr-dot dr-ebay" />eBay</span>
            <span><i className="dr-dot dr-amzn" />AMZN</span>
            <span><i className="dr-dot dr-total" />Total</span>
          </div>
          <div className="dr-chart">
            <svg className="dr-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={trendLine} />
            </svg>
            {trend.map((m) => {
              const ebayH = maxTrend > 0 ? (m.ebay / maxTrend) * 100 : 0;
              const amznH = maxTrend > 0 ? (m.amzn / maxTrend) * 100 : 0;
              return (
                <div className="dr-bar-col" key={m.label}>
                  <div className="dr-bar-wrap" title={`${m.label}: eBay ${m.ebay} / AMZN ${m.amzn} / Total ${m.total}`}>
                    <div className="dr-bar dr-ebay" style={{ height: `${ebayH}%` }} />
                    <div className="dr-bar dr-amzn" style={{ height: `${amznH}%` }} />
                  </div>
                  <div className="dr-bar-label">{m.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function FragmentCols({ labels, prefix }: { labels: string[]; prefix: string }) {
  return (
    <>
      {labels.map((label) => (
        <th key={`${prefix}-${label}`}>{label}</th>
      ))}
    </>
  );
}
