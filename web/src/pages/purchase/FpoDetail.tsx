import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../../styles/purchase.css";
import {
  exportOrders,
  lineAmount,
  loadOrders,
  money,
  orderAmount,
  remainingQty,
} from "./fpoData";

export default function FpoDetail() {
  const { fpoNo } = useParams();
  const [data] = useState(() => {
    try {
      return { orders: loadOrders(), error: "" };
    } catch (error) {
      return {
        orders: [],
        error:
          error instanceof Error ? error.message : "Unable to load FPO orders.",
      };
    }
  });
  const [error, setError] = useState("");
  const order = data.orders.find((entry) => entry.fpoNo === fpoNo);
  return (
    <div className="purchase-page progressive-enter fpo-page">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-title">FPO Detail</div>
        <div className="purchase-toolbar-actions">
          <Link className="purchase-btn ghost" to="/purchase">
            Back to List
          </Link>
          {order ? (
            <button
              className="purchase-btn"
              type="button"
              onClick={() => {
                try {
                  exportOrders([order], `FPO_${order.fpoNo}.xlsx`);
                  setError("");
                } catch {
                  setError("Export failed. Please try again.");
                }
              }}
            >
              Export Order
            </button>
          ) : null}
        </div>
      </div>
      {data.error || error ? (
        <div className="fpo-message error" role="alert">
          {data.error || error}
        </div>
      ) : null}
      {!order ? (
        <div className="purchase-card">FPO order not found.</div>
      ) : (
        <>
          <div className="purchase-summary-box">
            <table className="purchase-summary-table">
              <tbody>
                <tr>
                  <th>FPO No.</th>
                  <td>{order.fpoNo}</td>
                  <th>Whse</th>
                  <td>{order.warehouseId}</td>
                  <th>FPO Date</th>
                  <td>{order.fpoDate}</td>
                </tr>
                <tr>
                  <th>Total PCS</th>
                  <td>
                    {order.lines.reduce((sum, line) => sum + line.qty, 0)}
                  </td>
                  <th>Vendor ID 1</th>
                  <td>{order.vendorId}</td>
                  <th>Forecast By</th>
                  <td>{order.forecastBy || "—"}</td>
                </tr>
                <tr>
                  <th>Total Amount</th>
                  <td>{money(orderAmount(order))}</td>
                  <th>Vendor ID 2</th>
                  <td>{order.vendorId2 || "—"}</td>
                  <th>Confirmed By</th>
                  <td>{order.confirmBy || "—"}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td>{order.status}</td>
                  <th>Remarks</th>
                  <td colSpan={3}>{order.remarks || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="fpo-help">
            Remaining Qty = Order Qty − Shipped Qty. All amounts are in USD.
          </p>
          <div className="fpo-table-scroll">
            <table className="purchase-detail-table">
              <thead>
                <tr>
                  {[
                    "Ln.",
                    "Item ID",
                    "Description",
                    "Order Qty",
                    "Shipped Qty",
                    "Received Qty",
                    "Remaining Qty",
                    "Unit Price",
                    "Amount",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{line.itemId}</td>
                    <td>{line.desc || "—"}</td>
                    <td>{line.qty}</td>
                    <td>{line.shipQty}</td>
                    <td>{line.recvQty}</td>
                    <td>{remainingQty(line)}</td>
                    <td>{money(line.price)}</td>
                    <td>{money(lineAmount(line))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
