import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { FormEvent } from "react";
import "../../styles/purchase.css";
import {
  downloadTemplate,
  lineAmount,
  money,
  parseOrderFile,
  saveOrder,
  validateOrder,
} from "./fpoData";
import type { FpoOrder } from "./fpoData";

type DraftLine = { itemId: string; desc: string; qty: string; price: string };
const emptyHeader = () => ({
  fpoNo: "",
  fpoDate: new Date().toLocaleDateString("en-CA"),
  vendorId: "",
  vendorId2: "",
  warehouseId: "",
  forecastBy: "",
  confirmBy: "",
  remarks: "",
});
const fields = [
  { key: "fpoNo", label: "FPO No.", required: true },
  { key: "fpoDate", label: "FPO Date", required: true },
  { key: "vendorId", label: "Vendor ID 1", required: true },
  { key: "vendorId2", label: "Vendor ID 2" },
  { key: "warehouseId", label: "Warehouse ID", required: true },
  { key: "forecastBy", label: "Forecast By" },
  { key: "confirmBy", label: "Confirmed By" },
  { key: "remarks", label: "Remarks" },
] as const;

export default function FpoUpload() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [header, setHeader] = useState(emptyHeader);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const toLines = () =>
    lines.map((line) => ({
      ...line,
      itemId: line.itemId.trim(),
      desc: line.desc.trim(),
      qty: line.qty.trim() ? Number(line.qty) : NaN,
      price: line.price.trim() ? Number(line.price) : NaN,
      shipQty: 0,
      recvQty: 0,
    }));
  const total = toLines().reduce(
    (sum, line) =>
      sum +
      (Number.isFinite(line.qty) && Number.isFinite(line.price)
        ? lineAmount(line)
        : 0),
    0,
  );
  const updateLine = (index: number, key: keyof DraftLine, value: string) => {
    setLines((previous) =>
      previous.map((line, position) =>
        position === index ? { ...line, [key]: value } : line,
      ),
    );
    setNotice("");
    setError("");
  };
  const importFile = async () => {
    if (!file) return;
    setError("");
    setNotice("");
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError("Choose an .xlsx, .xls or .csv file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The file must be 5 MB or smaller.");
      return;
    }
    if (
      lines.length &&
      !window.confirm("Replace the current order lines with the imported file?")
    )
      return;
    setBusy(true);
    try {
      const imported = parseOrderFile(await file.arrayBuffer());
      setLines(
        imported.map((line) => ({
          itemId: line.itemId,
          desc: line.desc,
          qty: String(line.qty),
          price: String(line.price),
        })),
      );
      setNotice(
        `Imported ${imported.length} order line${imported.length === 1 ? "" : "s"}. Review the preview, then save the order.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to read this file. Use the upload template.",
      );
    } finally {
      setBusy(false);
    }
  };
  const clear = () => {
    if (!window.confirm("Clear the order details and preview?")) return;
    setHeader(emptyHeader());
    setLines([]);
    setFile(null);
    setError("");
    setNotice("");
    if (fileInput.current) fileInput.current.value = "";
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const order: FpoOrder = {
      ...header,
      fpoNo: header.fpoNo.trim(),
      vendorId: header.vendorId.trim(),
      vendorId2: header.vendorId2.trim(),
      warehouseId: header.warehouseId.trim(),
      forecastBy: header.forecastBy.trim(),
      confirmBy: header.confirmBy.trim(),
      remarks: header.remarks.trim(),
      status: "Pending",
      lines: toLines(),
    };
    const validation = validateOrder(order);
    if (validation) {
      setError(validation);
      return;
    }
    try {
      saveOrder(order);
      navigate(`/purchase/fpo/${encodeURIComponent(order.fpoNo)}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save the order in this browser.",
      );
    }
  };

  return (
    <div className="purchase-page progressive-enter fpo-page">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-title">FPO Upload</div>
        <div className="purchase-toolbar-actions">
          <Link className="purchase-btn ghost" to="/purchase">
            Back to List
          </Link>
          <button
            className="purchase-btn"
            type="button"
            onClick={() => {
              try {
                downloadTemplate();
                setError("");
              } catch {
                setError("Template download failed. Please try again.");
              }
            }}
          >
            Download Template
          </button>
        </div>
      </div>
      <p className="fpo-help">
        Create an FPO using the upload template or enter order lines below.
        Orders are saved in this browser only.
      </p>
      <form className="purchase-card" onSubmit={save}>
        <h3 className="fpo-section-title">
          Order Information <span className="fpo-status">Pending</span>
        </h3>
        <fieldset className="fpo-fieldset" disabled={busy}>
          <div className="purchase-grid">
            {fields.map((field) => (
              <div className="purchase-field" key={field.key}>
                <label htmlFor={`fpo-${field.key}`}>
                  {field.label}
                  {"required" in field ? " *" : ""}
                </label>
                <input
                  id={`fpo-${field.key}`}
                  type={field.key === "fpoDate" ? "date" : "text"}
                  required={"required" in field}
                  maxLength={field.key === "remarks" ? 500 : 100}
                  value={header[field.key]}
                  onChange={(event) => {
                    setHeader({ ...header, [field.key]: event.target.value });
                    setError("");
                  }}
                />
              </div>
            ))}
          </div>
        </fieldset>
        <h3 className="fpo-section-title">Import Order Lines</h3>
        <p className="fpo-help">
          Use the first worksheet or the Order Lines sheet. Required headers:
          Item ID, Description, Ord.Qty, U.Price. Quantity must be a positive
          whole number; price is in USD, with up to two decimal places. Import
          replaces the preview. Maximum file size: 5 MB.
        </p>
        <div className="purchase-btn-row">
          <input
            ref={fileInput}
            type="file"
            aria-label="Order lines file"
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setError("");
              setNotice("");
            }}
          />
          <button
            className="purchase-btn primary"
            type="button"
            disabled={!file || busy}
            onClick={() => void importFile()}
          >
            {busy ? "Importing..." : "Import File"}
          </button>
          <button
            className="purchase-btn ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setLines([
                ...lines,
                { itemId: "", desc: "", qty: "1", price: "0" },
              ]);
              setNotice("");
              setError("");
            }}
          >
            Add Line
          </button>
        </div>
        {error ? (
          <div className="fpo-message error" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="fpo-message" role="status">
            {notice}
          </div>
        ) : null}
        <div className="fpo-table-scroll">
          <table className="purchase-lines-table">
            <thead>
              <tr>
                {[
                  "Ln.",
                  "Item ID *",
                  "Description",
                  "Order Qty *",
                  "Unit Price (USD) *",
                  "Amount (USD)",
                  "Action",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((line, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        className="fpo-line-input"
                        aria-label={`Line ${index + 1} Item ID`}
                        required
                        value={line.itemId}
                        disabled={busy}
                        onChange={(event) =>
                          updateLine(index, "itemId", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="fpo-line-input"
                        aria-label={`Line ${index + 1} Description`}
                        value={line.desc}
                        disabled={busy}
                        onChange={(event) =>
                          updateLine(index, "desc", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="fpo-line-input fpo-number"
                        aria-label={`Line ${index + 1} Order Qty`}
                        type="number"
                        required
                        min="1"
                        step="1"
                        value={line.qty}
                        disabled={busy}
                        onChange={(event) =>
                          updateLine(index, "qty", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="fpo-line-input fpo-number"
                        aria-label={`Line ${index + 1} Unit Price`}
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={line.price}
                        disabled={busy}
                        onChange={(event) =>
                          updateLine(index, "price", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      {line.qty.trim() &&
                      line.price.trim() &&
                      Number.isFinite(Number(line.qty) * Number(line.price))
                        ? money(
                            lineAmount({
                              ...line,
                              qty: Number(line.qty),
                              price: Number(line.price),
                              shipQty: 0,
                              recvQty: 0,
                            }),
                          )
                        : "—"}
                    </td>
                    <td>
                      <button
                        className="purchase-btn ghost"
                        type="button"
                        aria-label={`Remove line ${index + 1}`}
                        disabled={busy}
                        onClick={() => {
                          setLines(
                            lines.filter((_, position) => position !== index),
                          );
                          setNotice("");
                          setError("");
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="purchase-empty" colSpan={7}>
                    No order lines. Import a file or add a line to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="purchase-total">Total: {money(total)}</div>
        <div className="purchase-btn-row fpo-save-actions">
          <button
            className="purchase-btn ghost"
            type="button"
            disabled={busy}
            onClick={clear}
          >
            Clear
          </button>
          <button
            className="purchase-btn success"
            type="submit"
            disabled={busy || !lines.length}
          >
            Save New Order
          </button>
        </div>
      </form>
    </div>
  );
}
