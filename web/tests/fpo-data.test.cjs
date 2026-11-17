// Run with: node --test tests/fpo-data.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const XLSX = require("xlsx");

function setup() {
  const storage = new Map();
  const downloads = [];
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    vm.runInNewContext(
      source,
      {
        exports,
        require: (name) =>
          name === "xlsx"
            ? {
                ...XLSX,
                writeFile: (workbook, filename) =>
                  downloads.push({ workbook, filename }),
              }
            : load(path.resolve(path.dirname(filename), `${name}.ts`)),
        localStorage: {
          getItem: (key) => storage.get(key) ?? null,
          setItem: (key, value) => storage.set(key, value),
        },
      },
      { filename },
    );
    return exports;
  }
  return {
    api: load(path.resolve(__dirname, "../src/pages/purchase/fpoData.ts")),
    storage,
    downloads,
  };
}
function file(rows, formula = false) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (formula) sheet.C2 = { t: "n", v: 2, f: "1+1" };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Order Lines");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}
const headers = ["Item ID", "Description", "Ord.Qty", "U.Price"];
const order = (api) => ({
  ...api.loadOrders()[0],
  fpoNo: "UPLOAD-001",
  status: "Pending",
  lines: [
    {
      itemId: "00123",
      desc: "Test",
      qty: 3,
      price: 0.1,
      shipQty: 0,
      recvQty: 0,
    },
  ],
});

test("template downloads and can be imported as an actual workbook", () => {
  const { api, downloads } = setup();
  api.downloadTemplate();
  assert.equal(downloads[0].filename, "FPO_Upload_Template.xlsx");
  const bytes = XLSX.write(downloads[0].workbook, {
    type: "array",
    bookType: "xlsx",
  });
  const lines = api.parseOrderFile(bytes);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].itemId, "CP004RD");
  assert.equal(lines[0].qty, 30);
});

test("Excel and CSV preserve text item IDs, allow zero prices and skip blank rows", () => {
  const { api } = setup();
  const lines = api.parseOrderFile(
    file([headers, ["00123", "Part", 3, 0], [], ["OTHER", "", 2, 1.25]]),
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].itemId, "00123");
  assert.equal(lines[0].price, 0);
  const csv = new TextEncoder().encode(
    "Item ID,Description,Ord.Qty,U.Price\n00123,Part,2,1.25",
  );
  assert.equal(api.parseOrderFile(csv.buffer)[0].price, 1.25);
  assert.equal(api.parseOrderFile(csv.buffer)[0].itemId, "00123");
});

test("invalid imports fail with actionable row errors", () => {
  const { api } = setup();
  for (const [row, message] of [
    [["", "", 1, 5], /Row 2: Item ID/],
    [["A", "", 0, 5], /Row 2: quantity/],
    [["A", "", 1.5, 5], /Row 2: quantity/],
    [["A", "", 1, ""], /Row 2: price/],
    [["A", "", 1, -1], /Row 2: price/],
    [["A", "", 1, 1.234], /Row 2: price/],
    [["A", "", 1, 2, "unexpected"], /extra columns/],
  ])
    assert.throws(() => api.parseOrderFile(file([headers, row])), message);
  assert.throws(
    () => api.parseOrderFile(file([["Wrong headers"], ["A", "", 1, 2]])),
    /template headers/,
  );
  assert.throws(() => api.parseOrderFile(file([headers])), /no order lines/);
  assert.throws(
    () => api.parseOrderFile(file([headers, ["A", "", 2, 5]], true)),
    /Formulas/,
  );
});

test("saved orders survive a reload, reject duplicates and have consistent totals", () => {
  const { api } = setup();
  const originalCount = api.loadOrders().length;
  const entry = order(api);
  api.saveOrder(entry);
  assert.equal(api.loadOrders().length, originalCount + 1);
  const saved = api.loadOrders().find((item) => item.fpoNo === entry.fpoNo);
  assert.equal(saved.lines[0].itemId, "00123");
  assert.equal(api.orderAmount(saved), 0.3);
  assert.equal(
    api.orderAmount({
      ...saved,
      lines: [...saved.lines, { ...saved.lines[0], qty: 6 }],
    }),
    0.9,
  );
  assert.equal(api.remainingQty(saved.lines[0]), 3);
  assert.throws(
    () => api.saveOrder({ ...entry, fpoNo: "upload-001" }),
    /already exists/,
  );
  assert.throws(
    () => api.saveOrder({ ...entry, fpoNo: "OTHER", fpoDate: "2026-02-30" }),
    /valid FPO date/,
  );
});

test("corrupt storage is not overwritten and export includes full line data", () => {
  const { api, storage, downloads } = setup();
  const entry = order(api);
  api.exportOrders([entry]);
  const exported = XLSX.utils.sheet_to_json(
    downloads[0].workbook.Sheets["FPO Orders"],
  );
  assert.equal(exported[0]["FPO No."], entry.fpoNo);
  assert.equal(exported[0]["Item ID"], "00123");
  assert.equal(exported[0]["Amount (USD)"], 0.3);
  storage.set("versa_fpo_orders_v1", '[{"broken":true}]');
  assert.throws(() => api.saveOrder(entry), /could not be read/);
  assert.equal(storage.get("versa_fpo_orders_v1"), '[{"broken":true}]');
});
