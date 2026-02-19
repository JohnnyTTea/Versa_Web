import { useParams } from "react-router-dom";
import "../../styles/purchase.css";
import { fpoDetailLines } from "./mock";

const header = {
  fpoNo: "10004",
  whse: "CA",
  fpoDate: "2025-11-01",
  fpoPcs: 770,
  vend1: "BMC-TAIWEI",
  forecastBy: "user 001",
  amount: 4100,
  vend2: "WKD",
  confirmedBy: "admin 001",
};

export default function FpoDetail() {
  const { fpoNo } = useParams();
  const displayNo = fpoNo || header.fpoNo;

  return (
    <div className="purchase-page progressive-enter">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-title">FPO Detail</div>
        <div className="purchase-toolbar-actions">
          <button className="purchase-btn" type="button">
            EXPORT
          </button>
        </div>
      </div>

      <div className="purchase-summary-box">
        <table className="purchase-summary-table">
          <tbody>
            <tr>
              <th>FPO No.</th>
              <td>{displayNo}</td>
              <th>Whse</th>
              <td>{header.whse}</td>
              <th>FPO Date</th>
              <td>{header.fpoDate}</td>
            </tr>
            <tr>
              <th>FPO PCS</th>
              <td>{header.fpoPcs}</td>
              <th>Vend. ID 1</th>
              <td>{header.vend1}</td>
              <th>Forecast By</th>
              <td>{header.forecastBy}</td>
            </tr>
            <tr>
              <th>FPO Amount</th>
              <td>{`$${header.amount.toFixed(2)}`}</td>
              <th>Vend. ID 2</th>
              <td>{header.vend2}</td>
              <th>Confirmed By</th>
              <td>{header.confirmedBy}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <table className="purchase-detail-table">
        <thead>
          <tr>
            <th>Ln.</th>
            <th>ITEM ID</th>
            <th>ITEM Desc. 1</th>
            <th>预计数量</th>
            <th>出货数量</th>
            <th>到货数量</th>
            <th>剩余数量</th>
            <th>预计单价</th>
            <th>预计金额</th>
            <th>当前单价</th>
            <th>当前金额</th>
            <th>最终单价</th>
            <th>最终金额</th>
            <th>Remarks</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {fpoDetailLines.map((row) => (
            <tr key={row.ln}>
              <td style={{ textAlign: "right" }}>{row.ln}</td>
              <td>{row.itemId}</td>
              <td>{row.desc}</td>
              <td style={{ textAlign: "right" }}>{row.estQty}</td>
              <td style={{ textAlign: "right" }}>{row.shipQty}</td>
              <td style={{ textAlign: "right" }}>{row.recvQty}</td>
              <td style={{ textAlign: "right" }}>{row.remainQty}</td>
              <td style={{ textAlign: "right" }}>{`US$${row.estPrice.toFixed(2)}`}</td>
              <td style={{ textAlign: "right" }}>{`US$${row.estAmt.toFixed(2)}`}</td>
              <td style={{ textAlign: "right" }}>{`US$${row.curPrice.toFixed(2)}`}</td>
              <td style={{ textAlign: "right" }}>{`US$${row.curAmt.toFixed(2)}`}</td>
              <td style={{ textAlign: "right" }}>{`US$${row.finalPrice.toFixed(2)}`}</td>
              <td style={{ textAlign: "right" }}>{`US$${row.finalAmt.toFixed(2)}`}</td>
              <td>{row.remarks || ""}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
