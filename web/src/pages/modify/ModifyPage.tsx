import { useEffect, useMemo, useState } from "react";
import "../../styles/Modify.css";
import "../../styles/report.css";
import { trackUserEvent } from "../../utils/userLog";

type ActionKey =
  | "Other Charge Remove(IKON)"
  | "Other Charge Remove(MD)"
  | "Sales Order Tax Update (IKON)"
  | "Sales Order Tax Update (MD)";

type SalesOrderTaxRow = {
  order_id: string;
  source_rows: number;
  tax_amount: number;
  trno: number;
  old_tax: number;
  new_tax: number;
  old_total: number;
  new_total: number;
};

type SalesOrderTaxUnmatchedRow = {
  order_id: string;
  source_rows: number;
  tax_amount: number;
  reason: string;
};

type SalesOrderTaxResult = {
  success: boolean;
  updated: boolean;
  affected_orders: number;
  updated_orders: number;
  matched: SalesOrderTaxRow[];
  unmatched: SalesOrderTaxUnmatchedRow[];
  company: "IKON" | "MD";
  schema: "aisdata1" | "aisdata3";
  error?: string;
  message?: string;
};

type ChangeRow = {
  trno: string | number;
  trdate?: string | null;

  old_othamt1: string | number;
  new_othamt1: string | number;

  subtotal_before: string | number;
  subtotal_after: string | number;
};

type ModifyResponse =
  | {
      success: true;
      affected_trno_count: number;
      updated_rows: number;
      changes: ChangeRow[];
      preview_file?: string | null;
      stdout?: string;
      stderr?: string;
      cmd?: string;
    }
  | {
      success: false;
      error?: string;
      message?: string;
      stdout?: string;
      stderr?: string;
      cmd?: string;
    };

function fmtDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function toNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeFixed2(v: any) {
  return toNumber(v).toFixed(2);
}

const DESCRIPTIONS: Record<string, string> = {
  "Other Charge Remove(IKON)":
    "重新修正有 promotion 订单金额：将 invoice 中 Other Charge 超过 0.05 的金额删除并分配到产品单价中。",
  "Other Charge Remove(MD)":
    "重新修正有 promotion 订单金额：将 invoice 中 Other Charge 超过 0.05 的金额删除并分配到产品单价中。",
  "Sales Order Tax Update (IKON)":
    "上传订单税额 Excel，按 order-id 匹配 IKON AIS 的 Cpono；汇总 item-tax 更新 Taxamt1，并按 Totamt - 原 Taxamt1 + 新税额更新总额。",
  "Sales Order Tax Update (MD)":
    "上传订单税额 Excel，按 order-id 匹配 MD AIS 的 Cpono；汇总 item-tax 更新 Taxamt1，并按 Totamt - 原 Taxamt1 + 新税额更新总额。",
};

type SortKey =
  | "trno"
  | "trdate"
  | "old_othamt1"
  | "new_othamt1"
  | "subtotal_before"
  | "subtotal_after";

type SortDir = "asc" | "desc";

export default function ModifyPage() {
  // 左侧选择
  const [selectedAction, setSelectedAction] = useState<ActionKey>("Other Charge Remove(IKON)");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [salesOrderResult, setSalesOrderResult] = useState<SalesOrderTaxResult | null>(null);

  // 右侧展示
  const [statusText, setStatusText] = useState<string>("Waiting for user action...");
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  // UI 状态
  const [loading, setLoading] = useState<boolean>(false);

  // 表格排序/分页
  const [sortKey, setSortKey] = useState<SortKey>("trdate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  // 默认日期：过去 30 天
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    setStartDate(fmtDateInput(start));
    setEndDate(fmtDateInput(end));
  }, []);

  // 切换 action 时：更新描述 & 清空结果（等同 PHP）
  useEffect(() => {
    setStatusText("Waiting for user action...");
    setChanges([]);
    setPreviewFile(null);
    setUploadedFile(null);
    setSalesOrderResult(null);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAction]);

  const description = DESCRIPTIONS[selectedAction] || "暂无描述。";
  const isSalesOrderTaxAction = selectedAction.startsWith("Sales Order Tax Update");
  const salesOrderCompany = selectedAction.endsWith("(MD)") ? "MD" : "IKON";

  const sortedChanges = useMemo(() => {
    const data = changes.slice();

    const numKeys: SortKey[] = [
      "trno",
      "old_othamt1",
      "new_othamt1",
      "subtotal_before",
      "subtotal_after",
    ];

    const cmp = (a: any, b: any) => {
      let va: any = a[sortKey];
      let vb: any = b[sortKey];

      if (sortKey === "trdate") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      } else if (numKeys.includes(sortKey)) {
        va = Number(va);
        vb = Number(vb);
      }

      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    };

    data.sort(cmp);
    return data;
  }, [changes, sortKey, sortDir]);

  const total = sortedChanges.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const startIdx = (pageClamped - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRows = sortedChanges.slice(startIdx, endIdx);

  useEffect(() => {
    if (page !== pageClamped) setPage(pageClamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  function validatePayload(): { action: string; start_date: string; end_date: string } | null {
    if (!selectedAction) {
      alert("请先选择一个修改项！");
      return null;
    }
    if (!startDate || !endDate) {
      alert("请输入起止日期！");
      return null;
    }
    return { action: selectedAction, start_date: startDate, end_date: endDate };
  }

  async function sendRequest(dryRun: boolean) {
    const payloadBase = validatePayload();
    if (!payloadBase) return;

    const payload = { ...payloadBase, dry_run: !!dryRun };
    trackUserEvent({
      event: `Modify Execute: ${payload.action} (${dryRun ? "dry-run" : "write"}) ${payload.start_date}~${payload.end_date}`,
      module: "modify",
      action: dryRun ? "dry_run" : "execute",
      target: payload.action,
    });

    setStatusText(dryRun ? "⏳ 正在预演，请稍候..." : "⏳ 正在执行修改，请稍候...");
    setLoading(true);

    try {
      // 新接口：NestJS
      const res = await fetch("/api/modify/other-charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const text = await res.text();
      let data: ModifyResponse | null = null;

      try {
        data = JSON.parse(text);
      } catch {
        setStatusText("❌ 返回的不是 JSON（前 800 字）：\n" + text.slice(0, 800));
        return;
      }

      if (!data || (data as any).success !== true) {
        const d: any = data || {};
        let extra = "";
        if (d.stdout) extra += "\n[stdout 前 500] " + String(d.stdout).slice(0, 500);
        if (d.stderr) extra += "\n[stderr 前 500] " + String(d.stderr).slice(0, 500);
        if (d.cmd) extra += "\n[cmd] " + d.cmd;
        setStatusText("❌ 失败：" + (d.error || d.message || "未知错误") + extra);
        setChanges([]);
        setPreviewFile(null);
        return;
      }

      const ok = data as Extract<ModifyResponse, { success: true }>;
      const prefix = dryRun ? "（预演）" : "（已执行）";
      setStatusText(`✅ ${prefix} 影响发票 ${ok.affected_trno_count} 张，更新明细 ${ok.updated_rows} 行。`);
      setChanges(ok.changes || []);
      setPreviewFile(ok.preview_file ? String(ok.preview_file) : null);
      setPage(1);
    } catch (e: any) {
      setStatusText("❌ 请求出错：" + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  function setSalesOrderFile(file?: File) {
    if (!file) return;
    const allowed = [".xlsx", ".xls", ".csv", ".tsv", ".txt"];
    const isAllowed = allowed.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!isAllowed) {
      setUploadedFile(null);
      setSalesOrderResult(null);
      setStatusText("❌ 请选择 .xlsx/.xls/.csv/.tsv/.txt 格式的文件。");
      return;
    }
    setUploadedFile(file);
    setSalesOrderResult(null);
    setStatusText(`已选择文件：${file.name}`);
  }

  async function processSalesOrderTax(write: boolean) {
    if (!uploadedFile) {
      setStatusText("❌ 请先选择或拖入 .xlsx 文件。");
      return;
    }
    if (write && !salesOrderResult) {
      setStatusText("❌ 请先预览文件，再确认写入。");
      return;
    }
    if (
      write &&
      !window.confirm(
        `确认更新 ${salesOrderCompany} AIS 中预览匹配的 ${salesOrderResult?.matched.length ?? 0} 张销售订单？`,
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadedFile);
    formData.append("company", salesOrderCompany);
    if (write && salesOrderResult) {
      formData.append("expected", JSON.stringify(salesOrderResult.matched));
    }

    trackUserEvent({
      event: `Sales Order Tax ${write ? "execute" : "preview"} (${salesOrderCompany}) ${uploadedFile.name}`,
      module: "modify",
      action: write ? "execute" : "dry_run",
      target: `Sales Order Tax Update (${salesOrderCompany})`,
    });
    setStatusText(write ? "⏳ 正在核对预览并更新 AIS 订单..." : "⏳ 正在读取文件并匹配 AIS 订单...");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/modify/sales-order-tax/${write ? "execute" : "preview"}`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        },
      );
      const data = (await res.json()) as SalesOrderTaxResult;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.message || `请求失败（HTTP ${res.status}）`);
      }
      setSalesOrderResult(data);
      setStatusText(
        write
          ? `✅ 已更新 ${data.updated_orders} 张订单；未匹配 ${data.unmatched.length} 条。`
          : `✅ 预览完成：匹配 ${data.matched.length} 张订单，未匹配 ${data.unmatched.length} 条。`,
      );
    } catch (error) {
      setStatusText(`❌ ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  function downloadSalesOrderResult() {
    if (!salesOrderResult) return;
    const columns = [
      "status",
      "order-id",
      "AIS order no (Trno)",
      "source rows",
      "file tax sum",
      "old Taxamt1",
      "new Taxamt1",
      "old Totamt",
      "new Totamt",
      "message",
    ];
    const quote = (value: unknown) => {
      let text = String(value ?? "");
      if (typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(text)) {
        text = `'${text}`;
      }
      return `"${text.replace(/"/g, '""')}"`;
    };
    const matchedRows = salesOrderResult.matched.map((row) => [
      salesOrderResult.updated ? "updated" : "matched",
      row.order_id,
      row.trno,
      row.source_rows,
      row.tax_amount.toFixed(2),
      row.old_tax.toFixed(2),
      row.new_tax.toFixed(2),
      row.old_total.toFixed(2),
      row.new_total.toFixed(2),
      "",
    ]);
    const unmatchedRows = salesOrderResult.unmatched.map((row) => [
      "unmatched",
      row.order_id,
      "",
      row.source_rows,
      row.tax_amount.toFixed(2),
      "",
      "",
      "",
      "",
      row.reason,
    ]);
    const csv = [columns, ...matchedRows, ...unmatchedRows]
      .map((row) => row.map(quote).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `AIS-${salesOrderCompany}-sales-order-tax-result.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function onClickHeader(k: SortKey) {
    // 与 PHP：点击同列切换 asc/desc；切换列默认 trdate desc，其它 asc
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "trdate" ? "desc" : "asc");
    }
    setPage(1);
  }

  const headers = [
    { key: "index" as const, label: "#", align: "center" as const, sortable: false },
    { key: "trno" as const, label: "Invoice No.", align: "left" as const, sortable: true },
    { key: "trdate" as const, label: "Invoice Date", align: "left" as const, sortable: true },
    { key: "old_othamt1" as const, label: "OtherCharge(前)", align: "right" as const, sortable: true },
    { key: "new_othamt1" as const, label: "OtherCharge(后)", align: "right" as const, sortable: true },
    { key: "subtotal_before" as const, label: "Subtotal(前)", align: "right" as const, sortable: true },
    { key: "subtotal_after" as const, label: "Subtotal(后)", align: "right" as const, sortable: true },
  ];

  function sortArrow(k: any) {
    if (k !== sortKey) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div className="report-container modify-page progressive-enter">
      {/* 左侧 */}
      <div className="report-left modify-left">
          <h3>📂 AIS Data Modification</h3>

          <select
            className="report-list"
            size={6}
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value as ActionKey)}
          >
            <option>Other Charge Remove(IKON)</option>
            <option>Other Charge Remove(MD)</option>
            <option>Sales Order Tax Update (IKON)</option>
            <option>Sales Order Tax Update (MD)</option>
          </select>

          {isSalesOrderTaxAction ? (
            <div className="report-export-bar sales-order-upload">
              <label
                className={`sales-order-dropzone${isDragOver ? " is-drag-over" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragOver(false);
                  setSalesOrderFile(event.dataTransfer.files[0]);
                }}
              >
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt"
                  onChange={(event) => {
                    setSalesOrderFile(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                <strong>选择 Excel / CSV / TXT 文件</strong>
                <span>或将 .xlsx / .csv / .txt 文件拖放到此处（最大 10 MB）</span>
                {uploadedFile ? <small>{uploadedFile.name}</small> : null}
              </label>
              {uploadedFile ? (
                <button
                  type="button"
                  className="pager-btn"
                  disabled={loading}
                  onClick={() => {
                    setUploadedFile(null);
                    setSalesOrderResult(null);
                    setStatusText("已移除文件。");
                  }}
                >
                  移除文件
                </button>
              ) : null}
              <button disabled={loading || !uploadedFile} onClick={() => processSalesOrderTax(false)}>
                预览匹配及金额（不改库）
              </button>
              <button
                disabled={loading || !uploadedFile || !salesOrderResult?.matched.length}
                className="danger"
                onClick={() => processSalesOrderTax(true)}
              >
                确认并写入 AIS
              </button>
              {salesOrderResult ? (
                <button disabled={loading} onClick={downloadSalesOrderResult}>
                  下载处理结果（CSV）
                </button>
              ) : null}
            </div>
          ) : (
            <div className="report-export-bar">
              <label>开始日期：</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />

              <label>结束日期：</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />

              <button disabled={loading} onClick={() => sendRequest(true)}>
                预演（不改库）
              </button>

              <button
                disabled={loading}
                className="danger"
                onClick={() => {
                  if (!window.confirm("⚠️ 确认要执行写库修改吗？此操作将更新发票明细与分录。")) return;
                  sendRequest(false);
                }}
              >
                执行（写入数据库）
              </button>
            </div>
          )}
        </div>

      {/* 右侧 */}
      <div className="report-right modify-right">
          <h3>📄 Target Description</h3>
          <textarea value={description} placeholder="描述将在这里显示..." rows={5} readOnly />

          <h3>📦 Target Status</h3>
          <div className="status-box">{statusText}</div>

          <h3>{isSalesOrderTaxAction ? "🧾 Sales Order Tax Results" : "🧾 Changed Invoices"}</h3>

          <div className="change-list">
            {isSalesOrderTaxAction ? (
              salesOrderResult ? (
                <>
                  <div className="sales-order-result-summary">
                    {salesOrderResult.updated ? "已更新" : "预览匹配"} {salesOrderResult.matched.length} 张订单；
                    未匹配 {salesOrderResult.unmatched.length} 条。
                  </div>
                  <div className="chg-table-wrap">
                    <table className="chg-table sales-order-result-table">
                      <thead>
                        <tr>
                          <th>状态</th>
                          <th>order-id / AIS Trno</th>
                          <th>文件行数</th>
                          <th>文件税额</th>
                          <th>Taxamt1（前 → 后）</th>
                          <th>Totamt（前 → 后）</th>
                          <th>结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesOrderResult.matched.map((row) => (
                          <tr key={`matched-${row.order_id}`}>
                            <td className="pad ta-center">
                              {salesOrderResult.updated ? "已写入" : "待确认"}
                            </td>
                            <td className="pad ta-left">
                              {row.order_id}<br />{row.trno}
                            </td>
                            <td className="pad ta-center">{row.source_rows}</td>
                            <td className="pad ta-right">{row.tax_amount.toFixed(2)}</td>
                            <td className="pad ta-right">{row.old_tax.toFixed(2)} → {row.new_tax.toFixed(2)}</td>
                            <td className="pad ta-right">{row.old_total.toFixed(2)} → {row.new_total.toFixed(2)}</td>
                            <td className="pad ta-left">匹配成功</td>
                          </tr>
                        ))}
                        {salesOrderResult.unmatched.map((row) => (
                          <tr key={`unmatched-${row.order_id}`}>
                            <td className="pad ta-center">未匹配</td>
                            <td className="pad ta-left">{row.order_id}</td>
                            <td className="pad ta-center">{row.source_rows}</td>
                            <td className="pad ta-right">{row.tax_amount.toFixed(2)}</td>
                            <td className="pad ta-right">—</td>
                            <td className="pad ta-right">—</td>
                            <td className="pad ta-left">{row.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="no-data">请上传 Excel 并预览匹配结果。</div>
              )
            ) : (
              <>
                {(!changes || changes.length === 0) && !loading ? (
                  <div className="no-data">（无变更或未命中条件）</div>
                ) : null}

                {changes && changes.length > 0 ? (
              <>
                <div className="chg-table-wrap">
                  <table className="chg-table">
                    <colgroup>
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "15.33%" }} />
                      <col style={{ width: "15.33%" }} />
                      <col style={{ width: "15.33%" }} />
                      <col style={{ width: "15.33%" }} />
                      <col style={{ width: "15.33%" }} />
                      <col style={{ width: "15.33%" }} />
                    </colgroup>

                    <thead>
                      <tr>
                        {headers.map((h) => (
                          <th
                            key={h.key}
                            className={`ta-${h.align} ${h.sortable ? "" : "no-cursor"}`}
                            onClick={h.sortable ? () => onClickHeader(h.key as SortKey) : undefined}
                          >
                            {h.label}
                            {h.sortable ? sortArrow(h.key) : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {pageRows.map((r, i) => {
                        const rowIndex = startIdx + i + 1;
                        return (
                          <tr key={`${r.trno}-${rowIndex}`}>
                            <td className="pad ta-center">{rowIndex}</td>
                            <td className="pad ta-left">{String(r.trno ?? "")}</td>
                            <td className="pad ta-left">{String(r.trdate ?? "")}</td>
                            <td className="pad ta-right">{safeFixed2(r.old_othamt1)}</td>
                            <td className="pad ta-right">{safeFixed2(r.new_othamt1)}</td>
                            <td className="pad ta-right">{safeFixed2(r.subtotal_before)}</td>
                            <td className="pad ta-right">{safeFixed2(r.subtotal_after)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 分页 */}
                <div className="pager">
                  <button
                    className="pager-btn"
                    disabled={pageClamped === 1}
                    onClick={() => setPage(1)}
                  >
                    « First
                  </button>
                  <button
                    className="pager-btn"
                    disabled={pageClamped === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ‹ Prev
                  </button>

                  <span className="pager-info">
                    第 {pageClamped}/{totalPages} 页 · 显示 {total === 0 ? 0 : startIdx + 1}-{endIdx} / 共{" "}
                    {total} 行
                  </span>

                  <button
                    className="pager-btn"
                    disabled={pageClamped === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next ›
                  </button>
                  <button
                    className="pager-btn"
                    disabled={pageClamped === totalPages}
                    onClick={() => setPage(totalPages)}
                  >
                    Last »
                  </button>
                </div>

                {/* 预演文件下载 */}
                {previewFile ? (
                  <a className="download-link" href={previewFile} download>
                    下载完整明细（Excel）
                  </a>
                ) : null}
              </>
                ) : null}
              </>
            )}
          </div>
        </div>
    </div>
  );
}
