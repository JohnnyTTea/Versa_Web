import { Fragment, useEffect, useMemo, useState } from "react";
import "../../styles/report.css";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, idx) => CURRENT_YEAR - idx);
const YEAR_RANGE_LABEL = `${CURRENT_YEAR - 6}-${CURRENT_YEAR}`;
const CHART_BAR_MAX_HEIGHT = 88;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  ebayQty?: number;
  amznQty?: number;
};

type ChartMonth = {
  year: number;
  month: number;
  label: string;
};

type MonthOption = {
  value: string;
  label: string;
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

function formatMonthValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function defaultChartStartMonth() {
  const now = new Date();
  return formatMonthValue(new Date(now.getFullYear(), now.getMonth() - 12, 1));
}

function defaultChartEndMonth() {
  return formatMonthValue(new Date());
}

function minChartMonth() {
  return `${CURRENT_YEAR - 6}-01`;
}

function maxChartMonth() {
  return defaultChartEndMonth();
}

function buildChartMonths(startValue: string, endValue: string): ChartMonth[] {
  const startMatch = /^(\d{4})-(\d{2})$/.exec(startValue);
  const endMatch = /^(\d{4})-(\d{2})$/.exec(endValue);
  if (!startMatch || !endMatch) return [];

  const start = new Date(Number(startMatch[1]), Number(startMatch[2]) - 1, 1);
  const end = new Date(Number(endMatch[1]), Number(endMatch[2]) - 1, 1);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const out: ChartMonth[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push({
      year: cur.getFullYear(),
      month: cur.getMonth() + 1,
      label: `${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getFullYear()).slice(-2)}`,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function buildMonthOptions(minValue: string, maxValue: string): MonthOption[] {
  const months = buildChartMonths(minValue, maxValue);
  return months.map((m) => {
    const value = `${m.year}-${String(m.month).padStart(2, "0")}`;
    const label = new Date(m.year, m.month - 1, 1).toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    });
    return { value, label };
  });
}

function monthRowMap(rows: DataMonthRow[]) {
  return new Map(rows.map((r) => [`${r.year}-${String(r.month).padStart(2, "0")}`, r]));
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
  const [chartStartMonth, setChartStartMonth] = useState(defaultChartStartMonth);
  const [chartEndMonth, setChartEndMonth] = useState(defaultChartEndMonth);

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
  const chartMonths = useMemo(() => buildChartMonths(chartStartMonth, chartEndMonth), [chartStartMonth, chartEndMonth]);
  const chartMinMonth = useMemo(() => minChartMonth(), []);
  const chartMaxMonth = useMemo(() => maxChartMonth(), []);
  const chartMonthOptions = useMemo(() => buildMonthOptions(chartMinMonth, chartMaxMonth), [chartMinMonth, chartMaxMonth]);
  const chartMinWidth = `${Math.max(chartMonths.length * 84, 780)}px`;
  const vendorTrend = useMemo(() => {
    const rows = monthRowMap(vendorResp?.rows || []);
    return chartMonths.map((m) => {
      const row = rows.get(`${m.year}-${String(m.month).padStart(2, "0")}`);
      return {
        label: m.label,
        salesQty: Number(row?.salesQty || 0),
      };
    });
  }, [vendorResp, chartMonths]);
  const maxVendorTrend = useMemo(
    () => vendorTrend.reduce((m, x) => Math.max(m, x.salesQty), 0),
    [vendorTrend]
  );
  const trend = useMemo(() => {
    const rows = monthRowMap(skuResp?.rows || []);
    return chartMonths.map((m) => {
      const row = rows.get(`${m.year}-${String(m.month).padStart(2, "0")}`);
      return {
        label: m.label,
        ebay: Number(row?.ebayQty || 0),
        amzn: Number(row?.amznQty || 0),
        total: Number(row?.salesQty || 0),
      };
    });
  }, [skuResp, chartMonths]);

  const maxTrend = useMemo(() => trend.reduce((m, x) => Math.max(m, x.total), 0), [trend]);
  const vendorChartName = vendorResp?.vendor?.Company || vendorResp?.vendor?.Compno || vendor || "-";
  const skuChartName = skuResp?.item?.Itemno || sku || "-";

  return (
    <div className="dr-page progressive-enter">
      <section className="dr-section">
        <div className="dr-header">
          <h2>Vendor Sales Query ({YEAR_RANGE_LABEL})</h2>
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
            <button type="submit" disabled={vendorLoading}>{vendorLoading ? "Loading" : "Search"}</button>
          </form>
        </div>
        {vendorErr ? <div className="dr-error">{vendorErr}</div> : null}

        <div className="dr-table-frame">
          <table className="dr-month-table" aria-hidden="true">
            <thead>
              <tr>
                <th>Month</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((month) => (
                <tr key={month}>
                  <th>{month}</th>
                </tr>
              ))}
              <tr className="dr-summary">
                <th>Total</th>
              </tr>
              <tr className="dr-summary">
                <th>Average</th>
              </tr>
            </tbody>
          </table>

          <div className="dr-table-wrap">
            <table className="dr-table">
              <thead>
                <tr>
                {YEARS.map((y) => (
                  <th key={y} colSpan={4}>{y}</th>
                ))}
                </tr>
                <tr>
                {YEARS.map((y) => (
                  <FragmentCols key={y} prefix={`vendor-${y}`} labels={["Pur. Qty", "Pur. Amt", "Sales Qty", "Sales Amt"]} />
                ))}
                </tr>
              </thead>
              <tbody>
              {MONTHS.map((month, i) => (
                <tr key={month}>
                  {YEARS.map((y) => {
                    const row = vendorData[y][i];
                    return (
                      <Fragment key={`${y}-${month}`}>
                        <td className="dr-purchase-cell" key={`${y}-${month}-pq`}>{num(row.purchaseQty)}</td>
                        <td className="dr-purchase-cell" key={`${y}-${month}-pa`}>{currency(row.purchaseAmt)}</td>
                        <td className="dr-sales-cell" key={`${y}-${month}-sq`}>{num(row.salesQty)}</td>
                        <td className="dr-sales-cell" key={`${y}-${month}-sa`}>{currency(row.salesAmt)}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}

              <tr className="dr-summary">
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
                      <td className="dr-purchase-cell" key={`${y}-tpq`}>{num(total.purchaseQty)}</td>
                      <td className="dr-purchase-cell" key={`${y}-tpa`}>{currency(total.purchaseAmt)}</td>
                      <td className="dr-sales-cell" key={`${y}-tsq`}>{num(total.salesQty)}</td>
                      <td className="dr-sales-cell" key={`${y}-tsa`}>{currency(total.salesAmt)}</td>
                    </Fragment>
                  );
                })}
              </tr>

              <tr className="dr-summary">
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
                      <td className="dr-purchase-cell" key={`${y}-apq`}>{num(avg.purchaseQty)}</td>
                      <td className="dr-purchase-cell" key={`${y}-apa`}>{currency(avg.purchaseAmt)}</td>
                      <td className="dr-sales-cell" key={`${y}-asq`}>{num(avg.salesQty)}</td>
                      <td className="dr-sales-cell" key={`${y}-asa`}>{currency(avg.salesAmt)}</td>
                    </Fragment>
                  );
                })}
              </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="dr-chart-card">
          <div className="dr-chart-head">
            <div className="dr-chart-title">Vendor Sales Trend <span>Sales Volume</span></div>
            <ChartRangeControls
              start={chartStartMonth}
              end={chartEndMonth}
              options={chartMonthOptions}
              onStart={setChartStartMonth}
              onEnd={setChartEndMonth}
            />
          </div>
          <div className="dr-chart-legend">
            <span><i className="dr-dot dr-vendor-sales" />Sales Qty</span>
          </div>
          <div className="dr-chart-entity-title" style={{ minWidth: chartMinWidth }}>{vendorChartName}</div>
          <div className="dr-chart dr-chart-vendor" style={{ minWidth: chartMinWidth }}>
            {vendorTrend.map((m) => {
              const height = maxVendorTrend > 0 ? (m.salesQty / maxVendorTrend) * CHART_BAR_MAX_HEIGHT : 0;
              return (
                <div className="dr-bar-col" key={m.label}>
                  <div className="dr-bar-wrap" title={`${m.label}: Sales ${num(m.salesQty)}`}>
                    <div className="dr-bar-stack">
                      <div className="dr-bar-value">{num(m.salesQty)}</div>
                      <div className="dr-bar dr-vendor-sales" style={{ height: `${height}%` }} />
                    </div>
                  </div>
                  <div className="dr-bar-label">{m.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="dr-section">
        <div className="dr-header">
          <h2>SKU Sales Query ({YEAR_RANGE_LABEL})</h2>
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
            <button type="submit" disabled={skuLoading}>{skuLoading ? "Loading" : "Search"}</button>
          </form>
        </div>
        {skuErr ? <div className="dr-error">{skuErr}</div> : null}

        <div className="dr-table-frame">
          <table className="dr-month-table" aria-hidden="true">
            <thead>
              <tr>
                <th>Month</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((month) => (
                <tr key={month}>
                  <th>{month}</th>
                </tr>
              ))}
              <tr className="dr-summary">
                <th>Total</th>
              </tr>
            </tbody>
          </table>

          <div className="dr-table-wrap">
            <table className="dr-table">
              <thead>
                <tr>
                {YEARS.map((y) => (
                  <th key={y} colSpan={4}>{y}</th>
                ))}
                </tr>
                <tr>
                {YEARS.map((y) => (
                  <FragmentCols key={y} prefix={`sku-${y}`} labels={["Pur. Qty", "Sales Qty", "Return", "Return Rate"]} />
                ))}
                </tr>
              </thead>
              <tbody>
              {MONTHS.map((month, i) => (
                <tr key={month}>
                  {YEARS.map((y) => {
                    const row = skuData[y][i];
                    return (
                      <Fragment key={`${y}-${month}`}>
                        <td className="dr-purchase-cell" key={`${y}-${month}-pq`}>{num(row.purchaseQty)}</td>
                        <td className="dr-sales-cell" key={`${y}-${month}-sq`}>{num(row.soldQty)}</td>
                        <td key={`${y}-${month}-rq`}>{num(row.returnQty)}</td>
                        <td key={`${y}-${month}-rr`}>{percent(row.returnRate)}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}

              <tr className="dr-summary">
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
                      <td className="dr-purchase-cell" key={`${y}-tpq`}>{num(total.purchaseQty)}</td>
                      <td className="dr-sales-cell" key={`${y}-tsq`}>{num(total.soldQty)}</td>
                      <td key={`${y}-trq`}>{num(total.returnQty)}</td>
                      <td key={`${y}-trr`}>{percent(rr)}</td>
                    </Fragment>
                  );
                })}
              </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="dr-chart-card">
          <div className="dr-chart-head">
            <div className="dr-chart-title">SKU Sales Trend <span>Sales Volume</span></div>
            <ChartRangeControls
              start={chartStartMonth}
              end={chartEndMonth}
              options={chartMonthOptions}
              onStart={setChartStartMonth}
              onEnd={setChartEndMonth}
            />
          </div>
          <div className="dr-chart-legend">
            <span><i className="dr-dot dr-ebay" />eBay</span>
            <span><i className="dr-dot dr-amzn" />AMZN</span>
            <span><i className="dr-dot dr-total" />Total</span>
          </div>
          <div className="dr-chart-entity-title" style={{ minWidth: chartMinWidth }}>{skuChartName}</div>
          <div className="dr-chart" style={{ minWidth: chartMinWidth }}>
            {trend.map((m) => {
              const ebayH = maxTrend > 0 ? (m.ebay / maxTrend) * CHART_BAR_MAX_HEIGHT : 0;
              const amznH = maxTrend > 0 ? (m.amzn / maxTrend) * CHART_BAR_MAX_HEIGHT : 0;
              const totalH = maxTrend > 0 ? (m.total / maxTrend) * CHART_BAR_MAX_HEIGHT : 0;
              return (
                <div className="dr-bar-col" key={m.label}>
                  <div className="dr-bar-wrap" title={`${m.label}: eBay ${m.ebay} / AMZN ${m.amzn} / Total ${m.total}`}>
                    <div className="dr-bar-stack">
                      <div className="dr-bar-value">{num(m.ebay)}</div>
                      <div className="dr-bar dr-ebay" style={{ height: `${ebayH}%` }} />
                    </div>
                    <div className="dr-bar-stack">
                      <div className="dr-bar-value">{num(m.amzn)}</div>
                      <div className="dr-bar dr-amzn" style={{ height: `${amznH}%` }} />
                    </div>
                    <div className="dr-bar-stack">
                      <div className="dr-bar-value">{num(m.total)}</div>
                      <div className="dr-bar dr-total" style={{ height: `${totalH}%` }} />
                    </div>
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

function ChartRangeControls(props: {
  start: string;
  end: string;
  options: MonthOption[];
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  const startOptions = props.options.filter((option) => option.value <= props.end);
  const endOptions = props.options.filter((option) => option.value >= props.start);

  return (
    <div className="dr-chart-range">
      <span className="dr-chart-range-title">Date Range</span>
      <label>
        From
        <select
          value={props.start}
          onChange={(e) => props.onStart(e.target.value)}
        >
          {startOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <span className="dr-chart-range-sep">-</span>
      <label>
        To
        <select
          value={props.end}
          onChange={(e) => props.onEnd(e.target.value)}
        >
          {endOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
