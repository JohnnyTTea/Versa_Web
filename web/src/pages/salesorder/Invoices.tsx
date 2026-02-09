import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import "../../styles/sales.css";

type SearchType = "invoice" | "order" | "cpo" | "shipping";
type Head = Record<string, any>;
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
function fmtInt(v: any) {
  const n = num(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtDate(v: any) {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const s = String(v);
  return s.replace("T", " ").replace(/\.?\d*Z$/, "").trim().slice(0, 10);
}

export default function Invoice() {
  const nav = useNavigate();
  const loc = useLocation();
  const [sp] = useSearchParams();

  const typeRaw = (sp.get("type") || "invoice").toLowerCase();
  const urlType: SearchType =
    typeRaw === "invoice" || typeRaw === "order" || typeRaw === "cpo" || typeRaw === "shipping"
      ? (typeRaw as SearchType)
      : "invoice";

  const keyword = (sp.get("id") || "").trim();
  const STORAGE_KEY = "last_invoice_search";

  const [type, setType] = useState<SearchType>(urlType);
  const [input, setInput] = useState(keyword);

  useEffect(() => setType(urlType), [urlType]);
  useEffect(() => setInput(keyword), [keyword]);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [head, setHead] = useState<Head | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [matchedInvoices, setMatchedInvoices] = useState<string[]>([]);

  const restoredRef = useRef(false);

  // URL 没有 id：尝试恢复上次（不直接清空）
  useEffect(() => {
    if (keyword !== "" || restoredRef.current) return;
    restoredRef.current = true;

    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { type?: SearchType; id?: string };
      if (!parsed?.id) return;
      const next = new URLSearchParams();
      next.set("type", parsed.type || "invoice");
      next.set("id", parsed.id);
      nav(`${loc.pathname}?${next.toString()}`);
    } catch {
      // ignore malformed storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  // 校验：invoice 类型必须数字
  useEffect(() => {
    if (!keyword) {
      setMessage("");
      return;
    }
    if (urlType === "invoice" && !isDigits(keyword)) {
      setMessage(" Error: Please Enter the Numbers Only!");
      setHead(null);
      setLines([]);
      setBalance(0);
      setMatchedInvoices([]);
      return;
    }
    setMessage("");
  }, [keyword, urlType]);

  async function fetchInvoice(t: SearchType, id: string) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("type", t);
      if (id) qs.set("id", id);

      const res = await fetch(`/api/sales/invoice?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data?.ok) {
        setMessage(data?.message || "Not found");
        setHead(null);
        setLines([]);
        setBalance(0);
        setMatchedInvoices(Array.isArray(data?.matchedInvoices) ? data.matchedInvoices : []);
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }

      setHead(data.head || data.order || null);
      setLines(Array.isArray(data.lines) ? data.lines : []);
      setBalance(num(data.balance));
      setMatchedInvoices(Array.isArray(data.matchedInvoices) ? data.matchedInvoices : []);

      if (id) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ type: t, id }));
    } catch (e: any) {
      setMessage(e?.message ? `Error: ${e.message}` : "Error: request failed");
      setHead(null);
      setLines([]);
      setBalance(0);
      setMatchedInvoices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!keyword) return;
    if (urlType === "invoice" && !isDigits(keyword)) return;
    fetchInvoice(urlType, keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlType, keyword]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const nextId = (input || "").trim();
    const path = loc.pathname; // /sales/invoice

    const next = new URLSearchParams();
    next.set("type", type);
    if (nextId) next.set("id", nextId);
    nav(`${path}?${next.toString()}`);
  }

  const h = head || {};

  return (
    <div className="main-content progressive-enter">
      {message ? <div className="message-box">{message}</div> : null}

      {/* 多匹配列表 */}
      {matchedInvoices.length > 1 && (
        <div className="message-box" style={{ background: "#f7f7f7", border: "1px solid #ddd", color: "#333" }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>Matched Invoices:</div>
          {matchedInvoices.map((inv) => (
            <a
              key={inv}
              href="#"
              style={{ marginRight: 10 }}
              onClick={(e) => {
                e.preventDefault();
                const next = new URLSearchParams();
                next.set("type", "invoice");
                next.set("id", inv);
                nav(`/sales/invoice?${next.toString()}`);
              }}
            >
              {inv}
            </a>
          ))}
        </div>
      )}

      {/* 搜索框 */}
      <form className="search-form sales-search-form" onSubmit={submit}>
        <label className="search-label" htmlFor="id">Search:</label>

        <select
          value={type}
          onChange={(e) => setType(e.target.value as SearchType)}
          className="sales-search-input"
        >
          <option value="invoice">Invoice</option>
          <option value="order">Order</option>
          <option value="cpo">CPO</option>
          <option value="shipping">Shipping</option>
        </select>

        <input
          id="id"
          name="id"
          placeholder="Enter No."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="sales-search-input"
        />

        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Search"}
        </button>

      </form>

      <div className="product-info sales-info">
        {/* 顶部行 */}
        <div className="sales-row-top">
          <div className="sales-field">
            <label>Inv. No.</label>
            <input className="sales-input" name="invno" value={h.Trno ?? keyword ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Inv. Date</label>
            <input className="sales-input" name="invdate" value={fmtDate(h.Trdate ?? "")} readOnly />
          </div>
          <div className="sales-field">
            <label>Ord. No.</label>
            <input className="sales-input" name="ordno" value={h.Ordno ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Ord. Date</label>
            <input className="sales-input" name="orddate" value={fmtDate(h.Orddate ?? "")} readOnly />
          </div>
          <div className="sales-field">
            <label>Cust. ID</label>
            <input className="sales-input" name="custid" value={h.Compno ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Empl. ID</label>
            <input className="sales-input" name="emplid" value={h.Empno ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Prep. by</label>
            <input className="sales-input" name="prepby" value={h.Ename ?? ""} readOnly />
          </div>
          <div className="sales-field">
            <label>Orig. No.</label>
            <input className="sales-input" name="origno" value={h.Trorigno ?? ""} readOnly />
          </div>
        </div>

        {/* Bill/Ship */}
        <div className="sales-bill-ship">
          <div className="sales-panel">
            <div className="sales-panel-title">Bill To</div>

            <div className="sales-field">
              <label>Name</label>
              <input className="sales-input" name="bill_name" value={h.Company ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Address 1</label>
              <input className="sales-input" name="bill_addr1" value={h.Addr1 ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Address 2</label>
              <input className="sales-input" name="bill_addr2" value={h.Addr2 ?? ""} readOnly />
            </div>

            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>City</label>
                <input className="sales-input" name="bill_city" value={h.City ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>State</label>
                <input className="sales-input" name="bill_state" value={h.State ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Zip</label>
                <input className="sales-input" name="bill_zip" value={h.Zip ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Country</label>
                <input className="sales-input" name="bill_country" value={h.Country ?? ""} readOnly />
              </div>
            </div>

            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>Phone</label>
                <input className="sales-input" name="bill_phone" value={h.Phone1 ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Fax</label>
                <input className="sales-input" name="bill_fax" value={h.Fax ?? ""} readOnly />
              </div>
              <div className="sales-field">
                <label>Email</label>
                <input className="sales-input" name="bill_email" value={h.Email1 ?? ""} readOnly />
              </div>
            </div>
          </div>

          <div className="sales-panel">
            <div className="sales-panel-title">Ship To</div>

            <div className="sales-field">
              <label>Name</label>
              <input className="sales-input" name="ship_name" value={h.Scompany ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Address 1</label>
              <input className="sales-input" name="ship_addr1" value={h.Saddr1 ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Address 2</label>
              <input className="sales-input" name="ship_addr2" value={h.Saddr2 ?? ""} readOnly />
            </div>

            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>City</label>
                <input className="sales-input" name="ship_city" value={h.Scity ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>State</label>
                <input className="sales-input" name="ship_state" value={h.Sstate ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Zip</label>
                <input className="sales-input" name="ship_zip" value={h.Szip ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Country</label>
                <input className="sales-input" name="ship_country" value={h.Scountry ?? ""} readOnly />
              </div>
            </div>

            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>Phone</label>
                <input className="sales-input" name="ship_phone" value={h.Sphone1 ?? ""} readOnly />
              </div>
              <div className="sales-field small">
                <label>Fax</label>
                <input className="sales-input" name="ship_fax" value={h.Sfax ?? ""} readOnly />
              </div>
              <div className="sales-field">
                <label>Email</label>
                <input className="sales-input" name="ship_email" value={h.Semail1 ?? ""} readOnly />
              </div>
            </div>
          </div>
        </div>

        {/* Middle */}
        <div className="sales-middle">
          <div className="sales-middle-left">
            <div className="sales-row-inline">
              <div className="sales-field small">
                <label>Terms</label>
                <input className="sales-input" name="terms" value={h.Tdesc ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>N. Days</label>
                <input className="sales-input" name="ndays" value={h.Ndays ?? ""} readOnly />
              </div>
            </div>

            <div className="sales-row-inline">
              <div className="sales-field x-small">
                <label>Disc. %</label>
                <input className="sales-input" name="disc_percent" value={h.Disper ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>D. Days</label>
                <input className="sales-input" name="ddays" value={h.Ddays ?? ""} readOnly />
              </div>
              <div className="sales-field x-small">
                <label>L.Fee %</label>
                <input className="sales-input" name="fee_percent" value={h.Lfperc ?? ""} readOnly />
              </div>
            </div>

            <div className="sales-field">
              <label>Notes</label>
              <textarea className="sales-textarea" name="notes" value={h.Snote1 ?? ""} readOnly />
            </div>
          </div>

          <div className="sales-middle-right">
            <div className="sales-field">
              <label>Cust. PO No.</label>
              <input className="sales-input" name="cpo_no" value={h.Cpono ?? ""} readOnly />
            </div>
          <div className="sales-field">
            <label>Cust. PO Date</label>
            <input className="sales-input" name="cpo_date" value={fmtDate(h.Cpodate ?? "")} readOnly />
          </div>
            <div className="sales-field">
              <label>Contact</label>
              <input className="sales-input" name="contact" value={h.Contact ?? ""} readOnly />
            </div>

          <div className="sales-field">
            <label>Ship Date</label>
            <input className="sales-input" name="ship_date" value={fmtDate(h.Shdate ?? "")} readOnly />
          </div>
            <div className="sales-field">
              <label>Ship Via</label>
              <input className="sales-input" name="ship_via" value={h.Shipvia ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Freight</label>
              <input className="sales-input" name="freight" value={h.Freight ?? ""} readOnly />
            </div>

          <div className="sales-field">
            <label>Cancel Date</label>
            <input className="sales-input" name="cancel_date" value={fmtDate(h.Cadate ?? "")} readOnly />
          </div>
            <div className="sales-field">
              <label>Tracking No.</label>
              <input className="sales-input" name="tracking_no" value={h.Stracno ?? ""} readOnly />
            </div>
            <div className="sales-field">
              <label>Status</label>
              <input className="sales-input" name="status" value={h.Sstatus ?? ""} readOnly />
            </div>
          <div className="sales-field">
            <label>Shipped Date</label>
            <input className="sales-input" name="shipped_date" value={fmtDate(h.Sdate ?? "")} readOnly />
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
              <input className="sales-input" name="sub_total" value={h.Subamt ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Other Charges</label>
              <input className="sales-input" name="oth1" value={h.Othamt1 ?? ""} readOnly />
              <input className="sales-input second-row" name="oth2" value={h.Othamt2 ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Tax</label>
              <input className="sales-input" name="tax1" value={h.Taxamt1 ?? ""} readOnly />
              <input className="sales-input second-row" name="tax2" value={h.Taxamt2 ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Shipping</label>
              <input className="sales-input" name="ship1" value={h.Shiamt1 ?? ""} readOnly />
              <input className="sales-input second-row" name="ship2" value={h.Shiamt2 ?? ""} readOnly />
            </div>

            <div className="totals-cell one-line">
              <label>Total</label>
              <input className="sales-input highlight-total" name="total" value={h.Totamt ?? ""} readOnly />
            </div>

            <div className="totals-cell one-line">
              <label>Discount</label>
              <input className="sales-input" name="discount" value={h.Disamt ?? ""} readOnly />
            </div>

            <div className="totals-cell one-line">
              <label>Late Fee</label>
              <input className="sales-input" name="late_fee" value={h.Latamt ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Payment Type</label>
              <input className="sales-input" name="paytyp1" value={h.Paytyp1 ?? ""} readOnly />
              <input className="sales-input second-row" name="paytyp2" value={h.Paytyp2 ?? ""} readOnly />
            </div>

            <div className="totals-cell two-lines">
              <label>Paid</label>
              <input className="sales-input" name="paid1" value={h.Payamt1 ?? ""} readOnly />
              <input className="sales-input second-row" name="paid2" value={h.Payamt2 ?? ""} readOnly />
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
