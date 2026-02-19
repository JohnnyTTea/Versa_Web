import React, { useEffect, useState } from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
  useMatch,
} from "react-router-dom";
import "../../styles/product.css";

type Product = Record<string, any>;
type Onhand = { onhand1?: any; onhand2?: any; onhand3?: any };

function formatDate(v: any): string {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s.replace("T", " ").replace(/\.?\d*Z$/, "").trim().slice(0, 10);
}

function formatDateOnly(v: any): string {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s.replace("T", " ").replace(/\.?\d*Z$/, "").trim().slice(0, 10);
}


function money(v: number | null | undefined, digits = 2) {
  return typeof v === "number" && Number.isFinite(v) ? `$${v.toFixed(digits)}` : "";
}

function numMoney(v: any, digits = 2) {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(digits)}` : "";
}

export default function ProductPage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();

  // ✅ 只有 /product 才算“主页面”
  const isProductRoot = !!useMatch({ path: "/product", end: true });

  const itemId = (sp.get("id") || "").trim();
  const [input, setInput] = useState(itemId);

  useEffect(() => setInput(itemId), [itemId]);

  // ====== ✅ 真正的数据 state（不再用占位符） ======
  const [message, setMessage] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [onhand, setOnhand] = useState<Onhand | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [transit, setTransit] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [ebayPrice, setEbayPrice] = useState<number | null>(null);
  const [amznPrice, setAmznPrice] = useState<number | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [Apirate, setApirate] = useState<number | null>(null);
  const [shippingDate, setShippingDate] = useState<string | null>(null);
  const [returnPct, setReturnPct] = useState<number | null>(null);
  const [caPct, setCaPct] = useState<number | null>(null);
  const [gaPct, setGaPct] = useState<number | null>(null);

  function renderBox(value: any, format?: (v: any) => string) {
    const raw = typeof value === "string" ? value.trim() : value;
    if (raw === null || raw === undefined || raw === "") return null;
    const text = format ? format(raw) : String(raw);
    if (!text) return null;
    return <span className="field-box">{text}</span>;
  }

  // ====== ✅ itemId 变化就拉后端数据 ======
  useEffect(() => {
    const id = itemId.trim();
    let cancelled = false;

    async function run() {
      if (!id) {
        setMessage("");
        setProduct(null);
        setOnhand(null);
        setOrders([]);
        setTransit([]);
        setHistoryLoading(false);
        setEbayPrice(null);
        setAmznPrice(null);
        setLastCost(null);
        setApirate(null);
        setShippingDate(null);
        setReturnPct(null);
        setCaPct(null);
        setGaPct(null);
        return;
      }

      try {
        setMessage("");

        // --- summary ---
        const summaryPromise = fetch(
          `/api/products/summary?id=${encodeURIComponent(id)}`,
          { credentials: "include" },
        );
        const onOrderPromise = isProductRoot
          ? fetch(`/api/products/on-order?id=${encodeURIComponent(id)}`, { credentials: "include" })
          : null;

        const sResp = await summaryPromise;
        const sJson = await sResp.json();
        console.log("summary resp =", sJson);

        if (cancelled) return;

        if (!sResp.ok || !sJson?.ok) {
          setMessage(sJson?.message || `Summary HTTP ${sResp.status}`);
          setProduct(null);
          setOnhand(null);
          setOrders([]);
          setTransit([]);
          setHistoryLoading(false);
          setEbayPrice(null);
          setAmznPrice(null);
          setLastCost(null);
          setApirate(null);
          setShippingDate(null);
          setReturnPct(null);
          setCaPct(null);
          setGaPct(null);
        } else {
          setProduct(sJson.product || null);
          setOnhand(sJson.onhand || null);

          const ebayP = Number(sJson?.prices?.ebay?.Price);
          setEbayPrice(Number.isFinite(ebayP) ? ebayP : null);

          const amznP = Number(sJson?.prices?.amzn?.Price);
          setAmznPrice(Number.isFinite(amznP) ? amznP : null);

          const shipC = Number(sJson?.prices?.shipping52?.Apirate);
          setApirate(Number.isFinite(shipC) ? shipC : null);

          const shipD = sJson?.prices?.shipping52?.AddedDate;
          setShippingDate(shipD ? String(shipD).slice(0, 10) : null);

          // 后端目前没有 lastCost 字段，先用 product.Cost 顶一下
          const costN = Number(sJson?.product?.Cost);
          setLastCost(Number.isFinite(costN) ? costN : null);

          const rmaReturn = Number(sJson?.rma?.returnPct);
          setReturnPct(Number.isFinite(rmaReturn) ? rmaReturn : null);
          const rmaCa = Number(sJson?.rma?.caPct);
          setCaPct(Number.isFinite(rmaCa) ? rmaCa : null);
          const rmaGa = Number(sJson?.rma?.gaPct);
          setGaPct(Number.isFinite(rmaGa) ? rmaGa : null);

          setHistoryLoading(!!onOrderPromise);
        }

        // --- on-order (sales history) ---
        if (sResp.ok && sJson?.ok && onOrderPromise) {
          const oResp = await onOrderPromise;
          const oJson = await oResp.json();
          console.log("on-order resp =", oJson);

          if (cancelled) return;

          if (!oResp.ok || !oJson?.ok) {
            setOrders([]);
            setTransit([]);
          } else {
            setOrders(Array.isArray(oJson.orders) ? oJson.orders : []);
            setTransit(Array.isArray(oJson.transit) ? oJson.transit : []);
          }
          setHistoryLoading(false);
        } else if (!onOrderPromise) {
          setOrders([]);
          setTransit([]);
          setHistoryLoading(false);
        }
      } catch (e: any) {
        if (cancelled) return;
        setMessage(e?.message || "Fetch failed");
        setProduct(null);
        setOnhand(null);
        setOrders([]);
        setTransit([]);
        setHistoryLoading(false);
        setEbayPrice(null);
        setAmznPrice(null);
        setLastCost(null);
        setApirate(null);
        setShippingDate(null);
        setReturnPct(null);
        setCaPct(null);
        setGaPct(null);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [itemId, isProductRoot]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = (input || "").trim();

    // 保持当前子页面不变，只改 id 参数（和 PHP 一样）
    const path = loc.pathname;
    if (next) nav(`${path}?id=${encodeURIComponent(next)}`);
    else nav(path);
  }

  return (
    <div className="main-content progressive-enter">
      {message ? <div className="message-box">{message}</div> : null}

      {/* 搜索框 */}
      <form className="search-form sticky-search" onSubmit={submit}>
        <label className="search-label">Item ID:</label>
        <input
          type="text"
          name="id"
          placeholder="ID"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>

      {/* 顶部大信息卡 */}
      <div className="product-info">
        <div className="product-header">
          <h2>
            Item ID: <span>{(product && product.Itemno) || itemId || ""}</span>
          </h2>
          <div className="product-prices">
            <span className="product-field">
              RMB: {renderBox(product?.RMB)}
            </span>
            <span className="product-field">
              TWD: {renderBox(product?.TWD)}
            </span>
            <span className="product-field">
              USD: {renderBox(product?.USD)}
            </span>
          </div>
        </div>

        <div className="product-desc">
          <span className="product-field">
            Description 1:{" "}
            {renderBox(product?.Desc1)}
          </span>
          <span className="product-field">
            Description 2:{" "}
            {renderBox(product?.Desc2)}
          </span>
        </div>

        <div className="product-row">
          <div className="product-field">
            CA On Hand(pc):
            {renderBox(onhand?.onhand1, (v) => `${v} pc`)}
          </div>
          <div className="product-field">
            Subst. Item1: {renderBox(product?.Sitem1)}
          </div>
          <div className="product-field">
            Category: {renderBox(product?.Categ)}
          </div>
          <div className="product-field">
            Box Length:
            {renderBox(product?.Sboxlen, (v) => `${v}"`)}
          </div>
          <div className="product-field">Handled By:</div>
          <div className="product-field">
            Return(%): {renderBox(returnPct, (v) => `${Number(v).toFixed(2)}%`)}
          </div>
        </div>

        <div className="product-row">
          <div className="product-field">
            GA On Hand(pc):
            {renderBox(onhand?.onhand2, (v) => `${v} pc`)}
          </div>
          <div className="product-field">
            Subst. Item2: {renderBox(product?.Sitem2)}
          </div>
          <div className="product-field">
            Class: {renderBox(product?.Class)}
          </div>
          <div className="product-field">
            Box Width:
            {renderBox(product?.Sboxwid, (v) => `${v}"`)}
          </div>
          <div className="product-field">
            Vend.ID: {renderBox(product?.Vendno)}
          </div>
          <div className="product-field">
            CA (%): {renderBox(caPct, (v) => `${Number(v).toFixed(2)}%`)}
          </div>
        </div>

        <div className="product-row">
          <div className="product-field">
            FBA On Hand(pc):
            {renderBox(onhand?.onhand3, (v) => `${v} pc`)}
          </div>
          <div className="product-field">
            Subst. Item3: {renderBox(product?.Sitem3)}
          </div>
          <div className="product-field">
            Sub Div. 1: {renderBox(product?.Subd1)}
          </div>
          <div className="product-field">
            Box Height:
            {renderBox(product?.Sboxhei, (v) => `${v}"`)}
          </div>
          <div className="product-field">
            Created Date: {renderBox(formatDateOnly(product?.Redate ?? ""))}
          </div>
          <div className="product-field">
            GA (%): {renderBox(gaPct, (v) => `${Number(v).toFixed(2)}%`)}
          </div>
        </div>

        <div className="product-row">
          <div className="product-field">
            On Ord.(pc):{" "}
            {renderBox(product?.Onord, (v) => `${v} pc`)}
          </div>
          <div className="product-field">
            ADI No.: {renderBox(product?.Adino)}
          </div>
          <div className="product-field">
            Sub Div. 2: {renderBox(product?.Subd2)}
          </div>
          <div className="product-field">
            Box Weight:
            {renderBox(product?.Sboxwei, (v) => `${v} lb.`)}
          </div>
          <div className="product-field">
            Box Code: {renderBox(product?.Sboxno)}
          </div>
        </div>

        <div className="product-row">
          <div className="product-field">
            Pur. Qty (pc):{" "}
            {renderBox(product?.Accpqty, (v) => `${v} pc`)}
          </div>
          <div className="product-field">
            Sales Qty (pc):{" "}
            {renderBox(product?.Accsqty, (v) => `${v} pc`)}
          </div>
          <div className="product-field">
            Purchases ($):{" "}
            {renderBox(product?.Accpur, (v) => numMoney(v, 2))}
          </div>
          <div className="product-field">
            Sales ($):{" "}
            {renderBox(product?.Accsal, (v) => numMoney(v, 2))}
          </div>
          <div className="product-field">
            Cost ($):{" "}
            {renderBox(product?.Acccos, (v) => numMoney(v, 2))}
          </div>
          <div className="product-field">
            Reset: {renderBox(formatDateOnly(product?.Redate ?? ""))}
          </div>
        </div>

        <div className="product-footer">
          <div className="footer-block">FOB:</div>
          <div className="footer-block">Freight:</div>
          <div className="footer-block">Total (FOB):</div>
          <div className="footer-block">
            BIN (eBay):
            {renderBox(money(ebayPrice, 2))}
          </div>
          <div className="footer-block">Cost Issue (eBay):</div>
        </div>

        <div className="product-footer">
          <div className="footer-block">
            Cost:
            {renderBox(money(lastCost, 2))}
          </div>
          <div className="footer-block">
            Shipping:
            {renderBox(
              Apirate !== null || shippingDate
                ? `${money(Apirate, 2)}${shippingDate ? ` (${shippingDate})` : ""}`
                : ""
            )}
          </div>
          <div className="footer-block">Total (Cost):</div>
          <div className="footer-block">
            BIN (AMZN):
            {renderBox(money(amznPrice, 2))}
          </div>
          <div className="footer-block">Cost Issue (AMZN):</div>
        </div>
      </div>

      {/* ✅ 下面内容：/product 显示 OnOrder/Transit；其他子页面显示 Outlet */}
      {isProductRoot ? (
        <div>
          <h3>On Order</h3>
          <table>
            <tbody>
              <tr>
                <th>Order Date</th>
                <th>Order no.</th>
                <th>Ordqty</th>
                <th>UM</th>
                <th>#/UM</th>
                <th>VendorID</th>
                <th>TPO NO.</th>
                <th>TPO Date</th>
                <th>WHS</th>
              </tr>

              {orders.length ? (
                orders.map((row, idx) => (
                  <tr key={idx}>
                    <td>{formatDate(row.Opodate)}</td>
                    <td>{row.Opono}</td>
                    <td>{row.Ordqty}</td>
                    <td>{row.Trum}</td>
                    <td>{row.Qtum}</td>
                    <td>{row.Compno}</td>
                    <td>{row.Tpono}</td>
                    <td>{formatDate(row.Tpodate)}</td>
                    <td>{row.Sstate}</td>
                  </tr>
                ))
              ) : historyLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center" }}>
                    Loading sales history...
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center" }}>
                    无订单数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <h3>On Transit</h3>
          <table>
            <tbody>
              <tr>
                <th>ETA Date</th>
                <th>Ship Date</th>
                <th>ord.Qty</th>
                <th>ShipQty</th>
                <th>UM</th>
                <th>cost</th>
                <th>VendorID</th>
                <th>PO No</th>
                <th>PO Date</th>
                <th>WHS</th>
              </tr>

              {transit.length ? (
                transit.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.eta_date}</td>
                    <td>{row.ship_date}</td>
                    <td>{row.order_qty}</td>
                    <td>{row.ship_qty}</td>
                    <td>{row.um}</td>
                    <td>{row.cost}</td>
                    <td>{row.vendor_id}</td>
                    <td>{row.po_no}</td>
                    <td>{row.po_date}</td>
                    <td>{row.whs}</td>
                  </tr>
                ))
              ) : historyLoading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center" }}>
                    Loading sales history...
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center" }}>
                    无运输数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <Outlet />
      )}

      <div style={{ marginBottom: 60 }} />
    </div>
  );
}
