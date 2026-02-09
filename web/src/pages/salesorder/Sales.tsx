import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import "../../styles/sales.css";

type Order = Record<string, any>;
type Line = Record<string, any>;

function isDigits(s: string) {
  return /^[0-9]+$/.test(s);
}
function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney(v: any) {
  const n = num(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v: any) {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const s = String(v);
  return s.replace("T", " ").replace(/\.?\d*Z$/, "").trim().slice(0, 10);
}
function fmtInt(v: any) {
  const n = num(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function Sales() {
  const nav = useNavigate();
  const loc = useLocation();
  const [sp, setSp] = useSearchParams();

  const reset = (sp.get("reset") || "").trim();
  const orderId = (sp.get("id") || "").trim();
  const STORAGE_KEY = "last_sales_order_id";

  const [input, setInput] = useState(orderId);
  useEffect(() => setInput(orderId), [orderId]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [order, setOrder] = useState<Order | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [balance, setBalance] = useState<number>(0);

  // reset=1 -> 清空并保持空白
  useEffect(() => {
    if (reset === "1") {
      sessionStorage.removeItem(STORAGE_KEY);
      setMessage("");
      setOrder(null);
      setLines([]);
      setBalance(0);
      setInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset]);

  // URL 没带 id 且不是 reset=1：恢复上次
  useEffect(() => {
    if (reset === "1") return;
    if (orderId) return;

    const last = (sessionStorage.getItem(STORAGE_KEY) || "").trim();
    if (last) {
      const next = new URLSearchParams();
      next.set("id", last);
      next.set("reset", "0");
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, reset]);

  // 校验
  useEffect(() => {
    if (!orderId) {
      setMessage("");
      setOrder(null);
      setLines([]);
      setBalance(0);
      return;
    }
    if (!isDigits(orderId)) {
      setMessage(" Error: Please Enter the Numbers Only!");
      setOrder(null);
      setLines([]);
      setBalance(0);
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    setMessage("");
  }, [orderId]);

  async function fetchOrder(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/order?id=${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data?.ok) {
        setMessage(data?.message || "Not found");
        setOrder(null);
        setLines([]);
        setBalance(0);
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }

      setOrder(data.order || null);
      setLines(Array.isArray(data.lines) ? data.lines : []);
      setBalance(num(data.balance));
      sessionStorage.setItem(STORAGE_KEY, id);
    } catch (e: any) {
      setMessage(e?.message ? `Error: ${e.message}` : "Error: request failed");
      setOrder(null);
      setLines([]);
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!orderId) return;
    if (!isDigits(orderId)) return;
    if (reset === "1") return;

    // 若你后端还没接，这里不会影响排版，只会显示 Error
    fetchOrder(orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, reset]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const nextId = (input || "").trim();
    const path = loc.pathname; // /sales

    if (nextId) nav(`${path}?id=${encodeURIComponent(nextId)}&reset=0`);
    else {
      sessionStorage.removeItem(STORAGE_KEY);
      nav(`${path}?reset=0`);
    }
  }

  const o = order || {};

  return (
    <div className="main-content progressive-enter">
      {message ? <div className="message-box">{message}</div> : null}

      {/* 搜索框 */}
      <form className="search-form sales-search-form sticky-search" onSubmit={submit}>
        <label className="search-label" htmlFor="id">Order No:</label>
        <input
          id="id"
          name="id"
          placeholder="Order No"
          className="sales-search-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={loading}>{loading ? "Loading..." : "Search"}</button>

        <button type="button" className="sales-search-reset" onClick={() => nav("/sales?reset=1")}>
          Reset
        </button>
      </form>

      <div className="product-info sales-info">
        {/* 顶部行（你的 CSS: .sales-row-top） */}
        <div className="sales-row-top">
          <div className="sales-field">
            <label>Ord. No.</label>
            <input className="sales-input" name="ordno" value={o.Trno ?? orderId ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Date</label>
            <input className="sales-input" name="trdate" value={fmtDate(o.Trdate ?? "")} readOnly />
          </div>
          <div className="sales-field">
            <label>Cust. ID</label>
            <input className="sales-input" name="custid" value={o.Compno ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Empl. ID</label>
            <input className="sales-input" name="emplid" value={o.Empno ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Prep. by</label>
            <input className="sales-input" name="prepby" value={o.Ename ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Origin1</label>
            <input className="sales-input" name="origin1" value={o.Trorig1 ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Origin2</label>
            <input className="sales-input" name="origin2" value={o.Trorig2 ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Orig. No.</label>
            <input className="sales-input" name="origno" value={o.Trorigno ?? ""} readOnly />
          </div>
        </div>

        {/* Bill To / Ship To（你的 CSS: .sales-bill-ship + .sales-panel） */}
        <div className="sales-bill-ship">
          {/* Bill To */}
          <div className="sales-panel">
            <div className="sales-panel-title">Bill To</div>

            <div className="sales-field">
              <label>Name</label>
              <input className="sales-input" name="bill_name" value={o.Company ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Address 1</label>
              <input className="sales-input" name="bill_addr1" value={o.Addr1 ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Address 2</label>
              <input className="sales-input" name="bill_addr2" value={o.Addr2 ?? ""} readOnly />
            </div>

            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>City</label>
                <input className="sales-input" name="bill_city" value={o.City ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>State</label>
                <input className="sales-input" name="bill_state" value={o.State ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Zip</label>
                <input className="sales-input" name="bill_zip" value={o.Zip ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Country</label>
                <input className="sales-input" name="bill_country" value={o.Country ?? ""} readOnly />
              </div>
            </div>

            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>Phone</label>
                <input className="sales-input" name="bill_phone" value={o.Phone1 ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Fax</label>
                <input className="sales-input" name="bill_fax" value={o.Fax ?? ""} readOnly />
              </div>
              <div className="sales-field">
                <label>Email</label>
                <input className="sales-input" name="bill_email" value={o.Email1 ?? ""} readOnly />
              </div>
            </div>
          </div>

          {/* Ship To */}
          <div className="sales-panel">
            <div className="sales-panel-title">Ship To</div>

            <div className="sales-field">
              <label>Name</label>
              <input className="sales-input" name="ship_name" value={o.Scompany ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Address 1</label>
              <input className="sales-input" name="ship_addr1" value={o.Saddr1 ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Address 2</label>
              <input className="sales-input" name="ship_addr2" value={o.Saddr2 ?? ""} readOnly />
            </div>

            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>City</label>
                <input className="sales-input" name="ship_city" value={o.Scity ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>State</label>
                <input className="sales-input" name="ship_state" value={o.Sstate ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Zip</label>
                <input className="sales-input" name="ship_zip" value={o.Szip ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Country</label>
                <input className="sales-input" name="ship_country" value={o.Scountry ?? ""} readOnly />
              </div>
            </div>

            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>Phone</label>
                <input className="sales-input" name="ship_phone" value={o.Sphone1 ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Fax</label>
                <input className="sales-input" name="ship_fax" value={o.Sfax ?? ""} readOnly />
              </div>
              <div className="sales-field">
                <label>Email</label>
                <input className="sales-input" name="ship_email" value={o.Semail1 ?? ""} readOnly />
              </div>
            </div>
          </div>
        </div>

        {/* 中间区（你的 CSS: .sales-middle, .sales-middle-left/right） */}
        <div className="sales-middle">
          {/* 左半 */}
          <div className="sales-middle-left">
            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>Terms</label>
                <input className="sales-input" name="terms" value={o.Tdesc ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>N. Days</label>
                <input className="sales-input" name="ndays" value={o.Ndays ?? ""} readOnly />
              </div>
            </div>

            <div className="sales-row-inline">
              <div className="sales-field x-small">
                <label>Disc. %</label>
                <input className="sales-input" name="disc_percent" value={o.Disper ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>D. Days</label>
                <input className="sales-input" name="ddays" value={o.Ddays ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>L.Fee %</label>
                <input className="sales-input" name="fee_percent" value={o.Lfperc ?? ""} readOnly />
              </div>
            </div>

            <div className="sales-field">
              <label>Notes</label>
              <textarea className="sales-textarea" name="notes" value={o.Snote1 ?? ""} readOnly />
            </div>
          </div>

          {/* 右半 */}
          <div className="sales-middle-right">
            <div className="sales-field">
              <label>Cust. PO No.</label>
              <input className="sales-input" name="cpo_no" value={o.Cpono ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Cust. PO Date</label>
            <input className="sales-input" name="cpo_date" value={fmtDate(o.Cpodate ?? "")} readOnly />
            </div>
            <div className="sales-field">
              <label>Contact</label>
              <input className="sales-input" name="contact" value={o.Contact ?? ""} readOnly />
            </div>

            <div className="sales-field">
              <label>Ship Date</label>
            <input className="sales-input" name="ship_date" value={fmtDate(o.Shdate ?? "")} readOnly />
            </div>
            <div className="sales-field">
              <label>Ship Via</label>
              <input className="sales-input" name="ship_via" value={o.Shipvia ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Freight</label>
              <input className="sales-input" name="freight" value={o.Freight ?? ""} readOnly />
            </div>

            <div className="sales-field">
              <label>Cancel Date</label>
            <input className="sales-input" name="cancel_date" value={fmtDate(o.Cadate ?? "")} readOnly />
            </div>
            <div className="sales-field">
              <label>Tracking No.</label>
              <input className="sales-input" name="tracking_no" value={o.Stracno ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Status</label>
              <input className="sales-input" name="status" value={o.Sstatus ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Shipped Date</label>
            <input className="sales-input" name="shipped_date" value={fmtDate(o.Sdate ?? "")} readOnly />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="sales-lines-wrapper">
          <div className="sales-lines-title">Items</div>
          <table className="sales-lines-table">
            <thead>
              <tr>
                <th>Ln.</th>
                <th>Item ID</th>
                <th>Description</th>
                <th>Ord. Qty</th>
                <th>Ship Qty</th>
                <th>UM</th>
                <th>#/UM</th>
                <th>U. Price</th>
                <th>Ext. Amount</th>
                <th>FOB Price</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((r, idx) => (
                  <tr key={r.Lnno ?? idx}>
                    <td>{r.Lnno ?? ""}</td>
                    <td>{r.Itemno ?? ""}</td>
                    <td>{r.Desc1 ?? ""}</td>
                    <td>{fmtInt(r.Ordqty)}</td>
                    <td>{fmtInt(r.Shipqty)}</td>
                    <td>{r.Trum ?? ""}</td>
                    <td>{fmtInt(r.Qtum)}</td>
                    <td>{fmtMoney(r.Price)}</td>
                    <td>{fmtMoney(r.Lnamt)}</td>
                    <td>{fmtMoney(r.Fob1)}</td>
                    <td>{fmtMoney(r.Cost)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center" }}>
                    无订单数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals（你的 CSS: totals-grid 10 列 + two-lines/one-line） */}
        <div className="sales-totals totals-legacy">
          <div className="totals-grid">
            <div className="totals-cell one-line">
              <label>Sub Total</label>
              <input className="sales-input" name="sub_total" value={o.Subamt ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Other Charges</label>
              <input className="sales-input" name="oth1" value={o.Othamt1 ?? ""} readOnly />
              <input className="sales-input second-row" name="oth2" value={o.Othamt2 ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Tax</label>
              <input className="sales-input" name="tax1" value={o.Taxamt1 ?? ""} readOnly />
              <input className="sales-input second-row" name="tax2" value={o.Taxamt2 ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Shipping</label>
              <input className="sales-input" name="ship1" value={o.Shiamt1 ?? ""} readOnly />
              <input className="sales-input second-row" name="ship2" value={o.Shiamt2 ?? ""} readOnly />
            </div>

            <div className="totals-cell one-line">
              <label>Total</label>
              <input className="sales-input highlight-total" name="total" value={o.Totamt ?? ""} readOnly />
            </div>

            <div className="totals-cell one-line">
              <label>Discount</label>
              <input className="sales-input" name="discount" value={o.Disamt ?? ""} readOnly />
            </div>

            <div className="totals-cell one-line">
              <label>Late Fee</label>
              <input className="sales-input" name="late_fee" value={o.Latamt ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Payment Type</label>
              <input className="sales-input" name="paytyp1" value={o.Paytyp1 ?? ""} readOnly />
              <input className="sales-input second-row" name="paytyp2" value={o.Paytyp2 ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Paid</label>
              <input className="sales-input" name="paid1" value={o.Payamt1 ?? ""} readOnly />
              <input className="sales-input second-row" name="paid2" value={o.Payamt2 ?? ""} readOnly />
            </div>

            <div className="totals-cell one-line">
              <label>Balance</label>
              <input className="sales-input highlight-total" name="balance" value={fmtMoney(balance)} readOnly />
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 60 }} />
    </div>
  );
}
