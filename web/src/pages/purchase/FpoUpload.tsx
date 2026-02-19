import React, { useMemo, useState } from "react";
import "../../styles/purchase.css";

type UploadLine = {
  itemId: string;
  desc: string;
  qty: number;
  price: number;
};

const initialLines: UploadLine[] = [
  { itemId: "CP004RD", desc: "08-10 BMW E60 5…", qty: 30, price: 5 },
  { itemId: "CP015BK", desc: "05-10 BMW E60 5…", qty: 40, price: 5 },
  { itemId: "CP015BR", desc: "05-10 BMW E60 5…", qty: 30, price: 5 },
];

export default function FpoUpload() {
  const [header, setHeader] = useState({
    fpoNo: "",
    fpoDate: "",
    vendorId: "",
    warehouseId: "",
    forecastBy: "",
    confirmBy: "",
  });
  const [lines, setLines] = useState<UploadLine[]>(initialLines);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.price, 0),
    [lines]
  );

  function updateHeader(key: keyof typeof header, value: string) {
    setHeader((prev) => ({ ...prev, [key]: value }));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  return (
    <div className="purchase-page progressive-enter">
      <div className="purchase-upload-topbar">
        <div className="purchase-tabs">
          <div className="purchase-tab active">➕ New（新建订单）</div>
          <div className="purchase-tab">📂 Open</div>
          <div className="purchase-tab">✏️ Modify</div>
        </div>
      </div>

      <div className="purchase-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: "#18345b" }}>订单基本信息</h3>
          <div style={{ fontWeight: 800, fontSize: 12, color: "#1d4ed8" }}>状态：新建</div>
        </div>

        <div className="purchase-grid" style={{ marginTop: 12 }}>
          <div className="purchase-field">
            <label>FPO No.</label>
            <input
              className="readonly"
              value={header.fpoNo}
              onChange={(e) => updateHeader("fpoNo", e.target.value)}
              placeholder="例如：FPO20250101"
            />
          </div>
          <div className="purchase-field">
            <label>FPO Date</label>
            <input
              type="date"
              value={header.fpoDate}
              onChange={(e) => updateHeader("fpoDate", e.target.value)}
            />
          </div>
          <div className="purchase-field">
            <label>Vendor ID</label>
            <input
              value={header.vendorId}
              onChange={(e) => updateHeader("vendorId", e.target.value)}
              placeholder="供应商编号"
            />
          </div>

          <div className="purchase-field">
            <label>Warehouse ID</label>
            <input
              value={header.warehouseId}
              onChange={(e) => updateHeader("warehouseId", e.target.value)}
              placeholder="仓库编号"
            />
          </div>
          <div className="purchase-field">
            <label>Forecast By</label>
            <input
              value={header.forecastBy}
              onChange={(e) => updateHeader("forecastBy", e.target.value)}
              placeholder="预测人/部门"
            />
          </div>
          <div className="purchase-field">
            <label>Confirm By</label>
            <input
              value={header.confirmBy}
              onChange={(e) => updateHeader("confirmBy", e.target.value)}
              placeholder="确认人/部门"
            />
          </div>
        </div>

        <div className="purchase-btn-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="file" accept=".xlsx,.xls,.csv" />
            <button className="purchase-btn primary" type="button">
              ⬆ 上传 Excel 文件
            </button>
          </div>
          <button className="purchase-btn success" type="button">
            💾 保存新订单
          </button>
          <button className="purchase-btn ghost" type="button">
            🧹 清空
          </button>
        </div>

        <div style={{ color: "#5c6b7d", fontSize: 12 }}>
          Excel 默认列映射：A=Item ID，B=Description，C=Ord.Qty，D=U.Price（从第 2 行开始读取）。
        </div>

        <table className="purchase-lines-table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Ln.</th>
              <th style={{ width: 180 }}>Item ID</th>
              <th>Description</th>
              <th style={{ width: 120 }}>Ord.Qty</th>
              <th style={{ width: 120 }}>U.Price</th>
              <th style={{ width: 140 }}>Ext.Amount</th>
              <th style={{ width: 110 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.length ? (
              lines.map((l, idx) => (
                <tr key={`${l.itemId}-${idx}`}>
                  <td>{idx + 1}</td>
                  <td>{l.itemId}</td>
                  <td>{l.desc}</td>
                  <td style={{ textAlign: "right" }}>{l.qty.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{l.price.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{(l.qty * l.price).toFixed(2)}</td>
                  <td>
                    <button className="purchase-btn" type="button" onClick={() => removeLine(idx)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="purchase-empty" colSpan={7}>
                  暂无订单明细数据
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="purchase-total">Total: {total.toFixed(2)}</div>
      </div>
    </div>
  );
}
