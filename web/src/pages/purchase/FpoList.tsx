import { useState } from "react";
import { Link } from "react-router-dom";
import "../../styles/purchase.css";
import {
  exportOrders,
  loadOrders,
  money,
  orderAmount,
  remainingQty,
} from "./fpoData";
import type { FpoOrder } from "./fpoData";

function summary(order: FpoOrder) {
  return {
    fpoNo: order.fpoNo,
    fpoDate: order.fpoDate,
    itemId: order.lines.map((line) => line.itemId).join(", "),
    whse: order.warehouseId,
    status: order.status,
    qty: order.lines.reduce((sum, line) => sum + line.qty, 0),
    remainQty: order.lines.reduce((sum, line) => sum + remainingQty(line), 0),
    amount: orderAmount(order),
    vend1: order.vendorId,
    vend2: order.vendorId2,
    forecastBy: order.forecastBy,
    confirmedBy: order.confirmBy,
    remarks: order.remarks,
  };
}
type Row = ReturnType<typeof summary>;
type Key = keyof Row;
const columns: { key: Key; label: string }[] = [
  { key: "fpoNo", label: "FPO No." },
  { key: "fpoDate", label: "FPO Date" },
  { key: "itemId", label: "Item ID" },
  { key: "whse", label: "Whse" },
  { key: "status", label: "Status" },
  { key: "qty", label: "Order Qty" },
  { key: "remainQty", label: "Remaining Qty" },
  { key: "amount", label: "Total Amount" },
  { key: "vend1", label: "Vendor ID 1" },
  { key: "vend2", label: "Vendor ID 2" },
  { key: "forecastBy", label: "Forecast By" },
  { key: "confirmedBy", label: "Confirmed By" },
  { key: "remarks", label: "Remarks" },
];
const defaultColumns = columns
  .filter((column) => !["forecastBy", "confirmedBy"].includes(column.key))
  .map((column) => column.key);
const pageSize = 15;

export default function FpoList() {
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
  const [filters, setFilters] = useState<Partial<Record<Key, string>>>({});
  const [visible, setVisible] = useState<Key[]>(defaultColumns);
  const [showColumns, setShowColumns] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: Key; direction: number }>({
    key: "fpoDate",
    direction: -1,
  });
  const [exportError, setExportError] = useState("");
  const defs = columns.filter((column) => visible.includes(column.key));
  const rows = data.orders
    .map(summary)
    .filter((row) =>
      columns.every(({ key }) => {
        const text = key === "amount" ? money(row.amount) : String(row[key]);
        return text
          .toLowerCase()
          .includes((filters[key] || "").trim().toLowerCase());
      }),
    )
    .sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true })) *
        sort.direction
      );
    });
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedRows = rows.filter((row) => selected.has(row.fpoNo));
  const toggleSelection = (ids: string[], checked: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  const download = () => {
    try {
      const ids = new Set(
        (selectedRows.length ? selectedRows : rows).map((row) => row.fpoNo),
      );
      exportOrders(data.orders.filter((order) => ids.has(order.fpoNo)));
      setExportError("");
    } catch {
      setExportError("Export failed. Please try again.");
    }
  };

  return (
    <div className="purchase-page progressive-enter fpo-page purchase-filter-popover">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-title">FPO List</div>
        <div className="purchase-toolbar-actions">
          <Link className="purchase-btn primary" to="/purchase/fpo/upload">
            New FPO
          </Link>
          <button
            className="purchase-btn ghost"
            type="button"
            onClick={() => {
              setFilters({});
              setSelected(new Set());
              setPage(1);
            }}
            disabled={!Object.values(filters).some(Boolean)}
          >
            Clear Filters
          </button>
          <button
            className="purchase-btn"
            type="button"
            aria-expanded={showColumns}
            aria-controls="fpo-columns"
            onClick={() => setShowColumns(!showColumns)}
          >
            Filter {showColumns ? "▲" : "▼"}
          </button>
          <button
            className="purchase-btn"
            type="button"
            disabled={!rows.length}
            onClick={download}
          >
            {selectedRows.length
              ? `Export Selected (${selectedRows.length})`
              : "Export Results"}
          </button>
        </div>
      </div>
      <p className="fpo-help">
        Demo orders and orders saved in this browser. Export includes all
        matching orders unless rows are selected.
      </p>
      {data.error || exportError ? (
        <div className="fpo-message error" role="alert">
          {data.error || exportError}
        </div>
      ) : null}
      <div className="purchase-layout">
        <div className="purchase-table-wrapper">
          <div className="fpo-table-scroll">
            <table className="purchase-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all orders on this page"
                      checked={
                        pageRows.length > 0 &&
                        pageRows.every((row) => selected.has(row.fpoNo))
                      }
                      disabled={!pageRows.length}
                      onChange={(event) =>
                        toggleSelection(
                          pageRows.map((row) => row.fpoNo),
                          event.target.checked,
                        )
                      }
                    />
                  </th>
                  <th>#</th>
                  {defs.map(({ key, label }) => (
                    <th
                      key={key}
                      aria-sort={
                        sort.key === key
                          ? sort.direction === 1
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="fpo-sort"
                        onClick={() => {
                          setSort({
                            key,
                            direction: sort.key === key ? -sort.direction : 1,
                          });
                          setPage(1);
                        }}
                      >
                        {label}
                        {sort.key === key
                          ? sort.direction === 1
                            ? " ▲"
                            : " ▼"
                          : ""}
                      </button>
                    </th>
                  ))}
                </tr>
                <tr className="purchase-search-row">
                  <th />
                  <th />
                  {defs.map(({ key, label }) => (
                    <th key={key}>
                      <input
                        className="purchase-search-input"
                        aria-label={`Search ${label}`}
                        placeholder="Search"
                        value={filters[key] || ""}
                        onChange={(event) => {
                          setFilters({ ...filters, [key]: event.target.value });
                          setPage(1);
                          setSelected(new Set());
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length ? (
                  pageRows.map((row, index) => (
                    <tr key={row.fpoNo}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select FPO ${row.fpoNo}`}
                          checked={selected.has(row.fpoNo)}
                          onChange={(event) =>
                            toggleSelection([row.fpoNo], event.target.checked)
                          }
                        />
                      </td>
                      <td>{(safePage - 1) * pageSize + index + 1}</td>
                      {defs.map(({ key }) => (
                        <td key={key}>
                          {key === "fpoNo" ? (
                            <Link
                              to={`/purchase/fpo/${encodeURIComponent(row.fpoNo)}`}
                            >
                              {row.fpoNo}
                            </Link>
                          ) : key === "amount" ? (
                            money(row.amount)
                          ) : (
                            row[key]
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={defs.length + 2} className="purchase-empty">
                      No matching orders.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="opo-pagination">
            <div className="opo-pagination-center">
              <button
                className="purchase-btn ghost"
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(1)}
              >
                First
              </button>
              <button
                className="purchase-btn ghost"
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                Prev
              </button>
              <button
                className="purchase-btn ghost"
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </button>
              <button
                className="purchase-btn ghost"
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                Last
              </button>
            </div>
            <span className="opo-page-info">
              Page {safePage}/{totalPages} · Total {rows.length} · {pageSize}
              /page
            </span>
          </div>
        </div>
        {showColumns ? (
          <aside className="purchase-filter-panel" id="fpo-columns">
            <div className="purchase-filter-title">COLUMNS</div>
            <ul className="purchase-filter-list">
              {columns.map(({ key, label }) => (
                <li key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={visible.includes(key)}
                      disabled={key === "fpoNo"}
                      onChange={(event) => {
                        setVisible(
                          event.target.checked
                            ? [...visible, key]
                            : visible.filter((value) => value !== key),
                        );
                        setFilters({ ...filters, [key]: "" });
                        setPage(1);
                        setSelected(new Set());
                      }}
                    />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
