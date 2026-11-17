import * as XLSX from "xlsx";
import { fpoRows } from "./mock";

export type FpoLine = {
  itemId: string;
  desc: string;
  qty: number;
  price: number;
  shipQty: number;
  recvQty: number;
};
export type FpoOrder = {
  fpoNo: string;
  fpoDate: string;
  vendorId: string;
  vendorId2: string;
  warehouseId: string;
  forecastBy: string;
  confirmBy: string;
  remarks: string;
  status: string;
  lines: FpoLine[];
};

const storageKey = "versa_fpo_orders_v1";
const templateHeaders = ["Item ID", "Description", "Ord.Qty", "U.Price"];
export const money = (value: number) => `US$${value.toFixed(2)}`;
export const lineAmount = (line: FpoLine) =>
  Math.round(line.qty * line.price * 100) / 100;
export const orderAmount = (order: FpoOrder) =>
  order.lines.reduce(
    (sum, line) => sum + Math.round(line.qty * line.price * 100),
    0,
  ) / 100;
// Mock remaining quantity follows the existing example: ordered minus shipped.
export const remainingQty = (line: FpoLine) =>
  Math.max(0, line.qty - line.shipQty);

function seedOrders(): FpoOrder[] {
  return fpoRows.map((row) => ({
    fpoNo: row.fpoNo,
    fpoDate: row.fpoDate,
    vendorId: row.vend1,
    vendorId2: row.vend2,
    warehouseId: row.whse,
    forecastBy: "Demo User",
    confirmBy: "",
    remarks: row.remarks || "",
    status: row.status,
    lines: [
      {
        itemId: row.itemId,
        desc: "",
        qty: row.estQty,
        price: row.estPrice,
        shipQty: row.estQty - row.remainQty,
        recvQty: row.status === "Completed" ? row.estQty : 0,
      },
    ],
  }));
}

export function validateOrder(order: FpoOrder): string {
  if (
    !order.fpoNo.trim() ||
    !order.fpoDate ||
    !order.vendorId.trim() ||
    !order.warehouseId.trim()
  ) {
    return "FPO No., FPO Date, Vendor ID and Warehouse ID are required.";
  }
  if (!/^[A-Za-z0-9_-]+$/.test(order.fpoNo))
    return "FPO No. may contain only letters, numbers, hyphens and underscores.";
  const date = new Date(`${order.fpoDate}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== order.fpoDate
  )
    return "Enter a valid FPO date.";
  if (!order.lines.length) return "Add at least one order line.";
  for (const [index, line] of order.lines.entries()) {
    if (!line.itemId.trim()) return `Line ${index + 1}: Item ID is required.`;
    if (!Number.isSafeInteger(line.qty) || line.qty <= 0)
      return `Line ${index + 1}: quantity must be a positive whole number.`;
    if (
      !Number.isFinite(line.price) ||
      line.price < 0 ||
      Math.abs(line.price * 100 - Math.round(line.price * 100)) > 0.000001
    ) {
      return `Line ${index + 1}: price must be zero or greater, with at most two decimal places.`;
    }
    if (!Number.isSafeInteger(Math.round(line.qty * line.price * 100)))
      return `Line ${index + 1}: amount is too large.`;
  }
  if (
    !Number.isSafeInteger(
      order.lines.reduce(
        (sum, line) => sum + Math.round(line.qty * line.price * 100),
        0,
      ),
    )
  )
    return "Order amount is too large.";
  return "";
}

function isOrder(value: unknown): value is FpoOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as FpoOrder;
  return (
    [
      order.fpoNo,
      order.fpoDate,
      order.vendorId,
      order.vendorId2,
      order.warehouseId,
      order.forecastBy,
      order.confirmBy,
      order.remarks,
      order.status,
    ].every((field) => typeof field === "string") &&
    Array.isArray(order.lines) &&
    order.lines.every(
      (line) =>
        line &&
        typeof line.itemId === "string" &&
        typeof line.desc === "string" &&
        [line.qty, line.price, line.shipQty, line.recvQty].every(
          (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
        ),
    ) &&
    !validateOrder(order)
  );
}

export function loadOrders(): FpoOrder[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return seedOrders();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Saved FPO data could not be read. Check browser storage before saving more orders.",
    );
  }
  if (!Array.isArray(parsed) || !parsed.every(isOrder))
    throw new Error(
      "Saved FPO data could not be read. Check browser storage before saving more orders.",
    );
  const orders = new Map(
    seedOrders().map((order) => [order.fpoNo.toLowerCase(), order]),
  );
  for (const order of parsed) orders.set(order.fpoNo.toLowerCase(), order);
  return [...orders.values()];
}

export function saveOrder(order: FpoOrder) {
  const error = validateOrder(order);
  if (error) throw new Error(error);
  const orders = loadOrders();
  if (
    orders.some(
      (existing) => existing.fpoNo.toLowerCase() === order.fpoNo.toLowerCase(),
    )
  )
    throw new Error("This FPO No. already exists. Use a unique number.");
  try {
    localStorage.setItem(storageKey, JSON.stringify([...orders, order]));
  } catch {
    throw new Error(
      "The order could not be saved. Browser storage is unavailable or full. Your preview has been kept; free up storage and try again.",
    );
  }
}

export function downloadTemplate() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    templateHeaders,
    ["CP004RD", "Example item - replace before importing", 30, 5],
  ]);
  sheet["!cols"] = [{ wch: 24 }, { wch: 50 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Order Lines");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["FPO Upload Instructions"],
      [
        "Enter order lines on the Order Lines sheet. Keep all four column headers unchanged.",
      ],
      [
        "Replace the example row. Item ID is required; format IDs as text to preserve leading zeros.",
      ],
      ["Description is optional. Ord.Qty must be a positive whole number."],
      [
        "U.Price is required, must be zero or greater, and allows up to two decimal places (USD).",
      ],
      ["Use values only; spreadsheet formulas are not supported."],
      [
        "Enter FPO No., date, vendor and warehouse on the upload page, then import and save.",
      ],
      [
        "Import replaces the current preview. Orders are saved only in this browser.",
      ],
    ]),
    "Instructions",
  );
  XLSX.writeFile(workbook, "FPO_Upload_Template.xlsx");
}

export function parseOrderFile(data: ArrayBuffer): FpoLine[] {
  const workbook = XLSX.read(data, {
    type: "array",
    cellFormula: true,
    raw: true,
  });
  const sheet =
    workbook.Sheets[
      workbook.SheetNames.includes("Order Lines")
        ? "Order Lines"
        : workbook.SheetNames[0]
    ];
  if (!sheet) throw new Error("The file has no worksheet.");
  if (
    Object.values(sheet).some(
      (cell) => cell && typeof cell === "object" && "f" in cell,
    )
  )
    throw new Error(
      "Formulas are not supported. Replace formulas with values before importing.",
    );
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });
  if (
    !templateHeaders.every(
      (header, index) => String(rows[0]?.[index] ?? "").trim() === header,
    ) ||
    rows[0]?.slice(4).some((cell) => String(cell).trim())
  ) {
    throw new Error(
      "Use the template headers: Item ID, Description, Ord.Qty, U.Price.",
    );
  }
  const lines: FpoLine[] = [];
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (row.every((cell) => String(cell).trim() === "")) continue;
    if (row.slice(4).some((cell) => String(cell).trim()))
      throw new Error(
        `Row ${index + 1}: unexpected extra columns. Use the template layout.`,
      );
    const numeric = (value: unknown) =>
      typeof value === "number"
        ? value
        : typeof value === "string" &&
            value.trim() &&
            /^\d+(\.\d+)?$/.test(value.trim())
          ? Number(value)
          : NaN;
    const line: FpoLine = {
      itemId: String(row[0] ?? "").trim(),
      desc: String(row[1] ?? "").trim(),
      qty: numeric(row[2]),
      price: numeric(row[3]),
      shipQty: 0,
      recvQty: 0,
    };
    const error = validateOrder({
      fpoNo: "IMPORT",
      fpoDate: "2026-01-01",
      vendorId: "IMPORT",
      vendorId2: "",
      warehouseId: "IMPORT",
      forecastBy: "",
      confirmBy: "",
      remarks: "",
      status: "Pending",
      lines: [line],
    });
    if (error)
      throw new Error(`Row ${index + 1}: ${error.replace(/^Line 1: /, "")}`);
    lines.push(line);
  }
  if (!lines.length)
    throw new Error(
      "The file has no order lines. Add data below the header row.",
    );
  return lines;
}

export function exportOrders(orders: FpoOrder[], filename = "FPO_Orders.xlsx") {
  const rows = orders.flatMap((order) =>
    order.lines.map((line, index) => ({
      "FPO No.": order.fpoNo,
      "FPO Date": order.fpoDate,
      "Vendor ID": order.vendorId,
      "Vendor ID 2": order.vendorId2,
      Warehouse: order.warehouseId,
      Status: order.status,
      "Forecast By": order.forecastBy,
      "Confirmed By": order.confirmBy,
      Remarks: order.remarks,
      "Line No.": index + 1,
      "Item ID": line.itemId,
      Description: line.desc,
      "Order Qty": line.qty,
      "Shipped Qty": line.shipQty,
      "Received Qty": line.recvQty,
      "Remaining Qty": remainingQty(line),
      "Unit Price (USD)": line.price,
      "Amount (USD)": lineAmount(line),
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows),
    "FPO Orders",
  );
  XLSX.writeFile(workbook, filename);
}
