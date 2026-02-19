import { Link } from "react-router-dom";
import "../../styles/purchase.css";
import { fpoRows } from "./mock";

const filterFields = [
  "Adino",
  "Class",
  "Confirmed By",
  "Forecast By",
  "FPO Date",
  "FPO No.",
  "ITEM Desc.",
  "ITEM ID",
  "Remarks",
  "Status",
  "Sub Div. 2",
  "Vend. ID 1",
  "Vend. ID 2",
  "Voided By",
  "Whse",
  "到货数量",
  "到货金额",
  "剩余数量",
  "剩余金额",
  "预计金额",
  "实际单价",
  "实际金额",
  "最终单价",
];

export default function FpoList() {
  return (
    <div className="purchase-page progressive-enter">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-title">FPO List</div>
        <div className="purchase-toolbar-actions">
          <button className="purchase-btn" type="button">
            FILTER▼
          </button>
          <button className="purchase-btn" type="button">
            EXPORT
          </button>
        </div>
      </div>

      <div className="purchase-layout">
        <div className="purchase-table-wrapper">
          <table className="purchase-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" />
                </th>
                <th>FPO No.</th>
                <th>FPO Date</th>
                <th>ITEM ID</th>
                <th>Whse</th>
                <th>Status</th>
                <th>预计数量</th>
                <th>剩余数量</th>
                <th>预计单价</th>
                <th>Vend. ID 1</th>
                <th>Vend. ID 2</th>
                <th>Remarks</th>
              </tr>
              <tr className="purchase-search-row">
                <th />
                {Array.from({ length: 11 }).map((_, idx) => (
                  <th key={idx}>
                    <input className="purchase-search-input" placeholder="Search" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fpoRows.map((row) => (
                <tr key={row.fpoNo}>
                  <td>
                    <input type="checkbox" />
                  </td>
                  <td>
                    <Link to={`/purchase/fpo/${row.fpoNo}`}>{row.fpoNo}</Link>
                  </td>
                  <td>{row.fpoDate}</td>
                  <td>{row.itemId}</td>
                  <td>{row.whse}</td>
                  <td>{row.status}</td>
                  <td style={{ textAlign: "right" }}>{row.estQty}</td>
                  <td style={{ textAlign: "right" }}>{row.remainQty}</td>
                  <td style={{ textAlign: "right" }}>{`US$${row.estPrice.toFixed(2)}`}</td>
                  <td>{row.vend1}</td>
                  <td>{row.vend2}</td>
                  <td>{row.remarks || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="purchase-filter-panel">
          <div className="purchase-filter-title">FILTER</div>
          <ul className="purchase-filter-list">
            {filterFields.map((f) => (
              <li key={f}>
                <label>
                  <input type="checkbox" /> {f}
                </label>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
