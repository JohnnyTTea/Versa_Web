import * as XLSX from "xlsx";

export const VERDICTS = { FIT: "同款", "NOT FIT": "不同款", REVIEW: "待复核", PENDING: "待补查", INVALID: "输入无效" } as const;
export type Verdict = keyof typeof VERDICTS;
export const FIELDS = { fitmentRange: "年份", model: "车型", color: "颜色" } as const;
export const PRICES = ["参考页售价", "售价类型", "价格证据时间", "报价来源"] as const;
export const PAGE_STATUS: Record<string, string> = {
  ok: "已提取商品资料", blocked: "访问受限", not_requested: "尚未请求",
  rate_limited: "站点限流", temporarily_unavailable: "站点暂时不可用", unavailable: "链接失效或商品不可用",
  not_product: "未找到商品资料", ambiguous: "商品未确认", fetch_failed: "获取失败",
  invalid_url: "链接无效", invalid_input: "输入无效",
};
export const CHECK_STATUS: Record<string, string> = { same: "一致", different: "不同", partial: "部分重叠", unknown: "未确认" };
export const FITMENT_RULES_VERSION = "rules-v4-fitment-resume";
export const FITMENT_UPLOAD_LIMIT = 200;

export type FitmentInput = { SKU: string; "参考链接": string; "Goods ID": string; sourceRow: number };
type Quote = { amount: string; currency: string; kind: string; fetchedAt: string; source: string; sourceUrl: string };
type Dimension = { field: string; status: string; internal: string; external: string; reason: string };
export type FitmentResult = {
  sku: string; goodsId?: string; sourceRow?: number; targetUrl?: string; verdict: Verdict;
  remark?: string; reason?: string; evidenceCoverage?: string; evidenceId?: string; evidenceError?: string; version?: string;
  internal?: { desc1?: string; desc2?: string; text?: string; partType?: string; sources?: Record<string, string> };
  external?: { partType?: string };
  page?: { title?: string; status: string; fetchedAt?: string; selectedVariant?: string; variantStatus?: string; finalUrl?: string; retryAt?: string };
  dimensions?: Dimension[];
  priceReview?: { current?: Quote | null; reason?: string };
};

export const canRecheck = (row: FitmentResult) => ["blocked", "not_requested", "rate_limited", "temporarily_unavailable"]
  .includes(row.page?.status ?? "") || (row.page?.status === "ok" && !!row.page.retryAt);

const fold = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const skuNames = new Set(["sku", "itemno", "productsku", "partnumber", "productnumber", "货号", "cpono"]);
const linkNames = /url|link|链接|网址|参考地址|网页/;
const cellText = (cell?: XLSX.CellObject) => cell ? XLSX.utils.format_cell(cell).trim() : "";
export const httpsLink = (value?: string) => /^https:\/\//i.test(value || "") ? value : undefined;
export const reportRemark = (text = "") => text.replaceAll("颜色未确认", "颜色待定");

export function reportProductText(value?: string) {
  return (value || "")
    .replace(/\b(?:carbon (?:fiber|fibre))[- ]+style\b/gi, "Carbon Fiber Look")
    .replace(/\b(?:ikon(?:\s+v\s*\d+)?|(?:jdm|oe)\s+[a-z0-9-]+|type[- ]r|[a-z0-9]+(?:-[a-z0-9]+)*)\s+(?:style|sty)\b/gi, "")
    .replace(/\b(?:style|sty)\s*:\s*[^,;]+|(?:款式|造型)\s*[：:]\s*[^,，;；]+/gi, "")
    .replace(/\b(?:style|sty)\b|款式/gi, "")
    .replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/,\s*$/g, "").replace(/\s{2,}/g, " ").trim();
}

export async function readFitmentWorkbook(file: File) {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheets = book.SheetNames.flatMap(name => {
    const sheet = book.Sheets[name];
    if (!sheet?.["!ref"]) return [];
    const { s, e } = XLSX.utils.decode_range(sheet["!ref"]);
    const cell = (r: number, c: number) => sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
    for (let r = s.r; r <= Math.min(e.r, s.r + 14); r++) {
      const headers = Array.from({ length: e.c - s.c + 1 }, (_, offset) => fold(cellText(cell(r, s.c + offset))));
      const skuColumn = headers.findIndex(header => skuNames.has(header));
      const linkColumn = headers.findIndex(header => linkNames.test(header));
      if (skuColumn < 0 || linkColumn < 0) continue;
      const goodsColumn = headers.indexOf("goodsid");
      const rowColumn = headers.indexOf("原表行号");
      const rows: FitmentInput[] = [];
      for (let y = r + 1; y <= e.r; y++) {
        const sku = cellText(cell(y, s.c + skuColumn));
        const linkCell = cell(y, s.c + linkColumn);
        const linkText = cellText(linkCell);
        const link = /^https?:\/\//i.test(linkText) ? linkText : linkCell?.l?.Target || linkText;
        const goodsId = goodsColumn < 0 ? "" : cellText(cell(y, s.c + goodsColumn));
        const originalRow = rowColumn < 0 ? 0 : Number(cellText(cell(y, s.c + rowColumn)));
        if (sku || link || goodsId) rows.push({ SKU: sku, "参考链接": link.trim(), "Goods ID": goodsId,
          sourceRow: Number.isSafeInteger(originalRow) && originalRow > 0 ? originalRow : y + 1 });
      }
      return rows.length ? [{ name, rows }] : [];
    }
    return [];
  });
  if (!sheets.length) throw new Error("未找到有数据的工作表。请在表头放入 SKU 和参考链接两列。");
  const priceSheet = sheets.findIndex(sheet => sheet.name === "查价记录");
  const preferred = priceSheet >= 0 ? priceSheet : sheets.findIndex(sheet => sheet.name === "待补查");
  return { name: file.name, sheets, initialSheet: Math.max(0, preferred) };
}

export function downloadFitmentTemplate() {
  const book = XLSX.utils.book_new();
  const input = XLSX.utils.aoa_to_sheet([["SKU", "参考链接"]]);
  input["!cols"] = [{ wch: 26 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(book, input, "上传数据");

  const instructions = XLSX.utils.aoa_to_sheet([
    [`在「上传数据」中填写 SKU 和参考链接。每次最多 ${FITMENT_UPLOAD_LIMIT} 条数据，不含表头。`],
    ["SKU 示例", "YOUR-SKU-001"],
    ["参考链接示例", "https://www.amazon.com/dp/B0CQBSD5L2"],
  ]);
  instructions["!cols"] = [{ wch: 80 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(book, instructions, "填写说明");

  XLSX.writeFile(book, "SKU-Fitment-Template.xlsx", { compression: true });
}

export function priceFields(row: FitmentResult) {
  const current = row.priceReview?.current;
  if (!current?.amount || !current.currency) return { amount: "", kind: "", time: "", source: "", sourceUrl: undefined };
  return {
    amount: `${current.currency} ${current.amount}`,
    kind: current.kind === "featured_offer" ? "新品推荐报价" : current.kind === "promotion" ? "促销价" : "页面显示价",
    time: current.fetchedAt, source: current.source, sourceUrl: httpsLink(current.sourceUrl),
  };
}

export function downloadFitmentReport(results: FitmentResult[], sourceName: string, format: "xlsx" | "csv") {
  const headers = [
    "原表行号", "Goods ID", "SKU", "模型结果", "模型备注", ...PRICES, "网页状态", "选中变体",
    "判定依据", "商品标题", "我方 Desc1", "我方 Desc2", "我方产品类型", "参考产品类型",
    ...Object.values(FIELDS).flatMap(label => [label, `我方${label}`, `参考${label}`]),
    "参考链接", "证据ID", "分析版本", "最早补查时间",
  ];
  const detail = results.map(row => {
    const price = priceFields(row);
    return [
      row.sourceRow ?? "", row.goodsId || "", row.sku, VERDICTS[row.verdict], reportRemark(row.remark || row.reason),
      price.amount, price.kind, price.time, price.source, PAGE_STATUS[row.page?.status ?? ""] || "",
      reportProductText(row.page?.selectedVariant), reportRemark(row.reason), reportProductText(row.page?.title), reportProductText(row.internal?.desc1),
      reportProductText(row.internal?.desc2), row.internal?.partType || "", row.external?.partType || "",
      ...Object.keys(FIELDS).flatMap(field => {
        const check = row.dimensions?.find(item => item.field === field);
        return [CHECK_STATUS[check?.status ?? ""] || "", check?.internal || "", check?.external || ""];
      }),
      row.targetUrl || "", row.evidenceId || "", row.version || "", row.page?.retryAt || "",
    ];
  });
  const book = XLSX.utils.book_new();
  const appendDetails = (name: string, rows: (number | string)[][]) => {
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = headers.map(header => ({ wch: header === "模型备注" ? 78 :
      ["判定依据", "商品标题", "参考链接", "我方 Desc1", "我方 Desc2"].includes(header) ? 50 :
      header === "价格证据时间" ? 28 : header === "SKU" || header === "报价来源" ? 23 : 16 }));
    sheet["!autofilter"] = { ref: sheet["!ref"]! };
    XLSX.utils.book_append_sheet(book, sheet, name);
  };
  const base = sourceName.replace(/\.(xlsx?|csv)$/i, "") || "SKU-Fitment";
  if (format === "csv") {
    const escape = (value: string | number) => {
      const str = String(value);
      const safe = /^[\t\r\n]/.test(str) || /^\s*[=+@-]/.test(str) ? "'" + str : str;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const bytes = "\uFEFF" + [headers, ...detail].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([bytes], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${base}-SKU-Fitment.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }
  const summary = XLSX.utils.aoa_to_sheet([
    ["SKU Fitment", sourceName], ["总行数", results.length],
    ...Object.entries(VERDICTS).map(([verdict, label]) => [label, results.filter(row => row.verdict === verdict).length]),
    ["已核实参考售价", results.filter(row => priceFields(row).amount).length],
    ["规则版本", results.find(row => row.version)?.version || ""],
  ]);
  summary["!cols"] = [{ wch: 23 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(book, summary, "汇总");
  appendDetails("全部逐条结果", detail);
  appendDetails("不同款", detail.filter((_, i) => results[i].verdict === "NOT FIT"));
  appendDetails("待复核", detail.filter((_, i) => results[i].verdict === "REVIEW"));
  if (results.some(canRecheck)) appendDetails("待补查", detail.filter((_, i) => canRecheck(results[i])));
  XLSX.writeFile(book, `${base}-SKU-Fitment.xlsx`, { compression: true });
}
