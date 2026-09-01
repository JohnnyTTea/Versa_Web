import { Fragment, useEffect, useMemo, useState } from "react";
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

type DataMonthRow = {
  year: number;
  month: number;
  purchaseQty: number;
  purchaseAmt: number;
  salesQty: number;
  salesAmt: number;
  returnQty: number;
};

type VendorDataResp = {
  ok: boolean;
  message?: string;
  vendor: { Compno: string; Company: string } | null;
  rows: DataMonthRow[];
};

type SkuDataResp = {
  ok: boolean;
  message?: string;
  item: { Itemno: string; Desc1: string; Desc2: string; Vendno: string } | null;
  rows: DataMonthRow[];
  trend: TrendPoint[];
};

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

function emptyVendorData(): Record<number, VendorMetrics[]> {
  return Object.fromEntries(
    YEARS.map((year) => [
      year,
      MONTHS.map(() => ({ purchaseQty: 0, purchaseAmt: 0, salesQty: 0, salesAmt: 0 })),
    ])
  ) as Record<number, VendorMetrics[]>;
}

function emptySkuData(): Record<number, SkuMetrics[]> {
  return Object.fromEntries(
    YEARS.map((year) => [
      year,
      MONTHS.map(() => ({ purchaseQty: 0, soldQty: 0, returnQty: 0, returnRate: 0 })),
    ])
  ) as Record<number, SkuMetrics[]>;
}

function buildVendorData(rows: DataMonthRow[]): Record<number, VendorMetrics[]> {
  const out = emptyVendorData();
  rows.forEach((r) => {
    const idx = Number(r.month) - 1;
    if (!out[r.year] || idx < 0 || idx >= 12) return;
    out[r.year][idx] = {
      purchaseQty: Number(r.purchaseQty || 0),
      purchaseAmt: Number(r.purchaseAmt || 0),
      salesQty: Number(r.salesQty || 0),
      salesAmt: Number(r.salesAmt || 0),
    };
  });
  return out;
}

function buildSkuData(rows: DataMonthRow[]): Record<number, SkuMetrics[]> {
  const out = emptySkuData();
  rows.forEach((r) => {
    const idx = Number(r.month) - 1;
    const soldQty = Number(r.salesQty || 0);
    const returnQty = Number(r.returnQty || 0);
    if (!out[r.year] || idx < 0 || idx >= 12) return;
    out[r.year][idx] = {
      purchaseQty: Number(r.purchaseQty || 0),
      soldQty,
      returnQty,
      returnRate: soldQty > 0 ? (returnQty / soldQty) * 100 : 0,
    };
  });
  return out;
}

async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
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

export default function DataReportPage() {
  const [vendorInput, setVendorInput] = useState("ALTEC-YR");
  const [skuInput, setSkuInput] = useState("9-T-0308");
  const [vendor, setVendor] = useState("ALTEC-YR");
  const [sku, setSku] = useState("9-T-0308");

  const [vendorResp, setVendorResp] = useState<VendorDataResp | null>(null);
  const [skuResp, setSkuResp] = useState<SkuDataResp | null>(null);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [skuLoading, setSkuLoading] = useState(false);
  const [vendorErr, setVendorErr] = useState("");
  const [skuErr, setSkuErr] = useState("");

  useEffect(() => {
    if (!vendor) {
      setVendorResp(null);
      setVendorErr("");
      return;
    }

    const controller = new AbortController();
    setVendorLoading(true);
    setVendorErr("");

    apiGet<VendorDataResp>(`/api/report/data/vendor?vendor=${encodeURIComponent(vendor)}`, controller.signal)
      .then((data) => {
        setVendorResp(data);
        setVendorErr(data.ok ? "" : data.message || "Vendor load failed");
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setVendorResp(null);
        setVendorErr(String(e?.message || e || "Vendor load failed"));
      })
      .finally(() => setVendorLoading(false));

    return () => controller.abort();
  }, [vendor]);

  useEffect(() => {
    if (!sku) {
      setSkuResp(null);
      setSkuErr("");
      return;
    }

    const controller = new AbortController();
    setSkuLoading(true);
    setSkuErr("");

    apiGet<SkuDataResp>(`/api/report/data/sku?sku=${encodeURIComponent(sku)}`, controller.signal)
      .then((data) => {
        setSkuResp(data);
        setSkuErr(data.ok ? "" : data.message || "SKU load failed");
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setSkuResp(null);
        setSkuErr(String(e?.message || e || "SKU load failed"));
      })
      .finally(() => setSkuLoading(false));

    return () => controller.abort();
  }, [sku]);

  const vendorData = useMemo(() => buildVendorData(vendorResp?.rows || []), [vendorResp]);
  const skuData = useMemo(() => buildSkuData(skuResp?.rows || []), [skuResp]);
  const trend = useMemo(() => skuResp?.trend || [], [skuResp]);

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
            Vendor: <strong>{vendorResp?.vendor?.Compno || vendor || "-"}</strong>
            {vendorResp?.vendor?.Company ? ` · ${vendorResp.vendor.Company}` : ""}
          </div>
          <form
            className="dr-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setVendor(vendorInput.trim());
            }}
          >
            <label htmlFor="vendor">Vendor</label>
            <input id="vendor" value={vendorInput} onChange={(e) => setVendorInput(e.target.value)} />
            <button type="submit" disabled={vendorLoading}>{vendorLoading ? "Loading" : "查询"}</button>
          </form>
        </div>
        {vendorErr ? <div className="dr-error">{vendorErr}</div> : null}

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
            SKU: <strong>{skuResp?.item?.Itemno || sku || "-"}</strong>
            {skuResp?.item?.Vendno ? ` · Vendor ${skuResp.item.Vendno}` : ""}
          </div>
          <form
            className="dr-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setSku(skuInput.trim());
            }}
          >
            <label htmlFor="sku">SKU</label>
            <input id="sku" value={skuInput} onChange={(e) => setSkuInput(e.target.value)} />
            <button type="submit" disabled={skuLoading}>{skuLoading ? "Loading" : "查询"}</button>
          </form>
        </div>
        {skuErr ? <div className="dr-error">{skuErr}</div> : null}

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
