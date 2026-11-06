import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import "../../styles/report.css";

async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function apiPost<T>(url: string, body: any, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function readExcelRows(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read uploaded file"));
    reader.readAsArrayBuffer(file);
  });
}

const VERDICT_LABELS: Record<string, string> = { FIT: "四项匹配", "NOT FIT": "四项不匹配", REVIEW: "待人工复核", INVALID: "输入无效" };
const FIELD_LABELS: Record<string, string> = { fitmentRange: "年份", model: "车型", color: "颜色", style: "款式" };
const STATUS_LABELS: Record<string, string> = { same: "一致", different: "不同", partial: "部分重叠", unknown: "信息不足" };
const PAGE_LABELS: Record<string, string> = { ok: "已提取商品资料", blocked: "访问受限/验证码", unavailable: "链接失效/商品不可用", not_product: "未找到商品资料", ambiguous: "商品未确认", fetch_failed: "获取失败", invalid_url: "链接无效", invalid_input: "输入资料无效" };
const safeLink = (value: string) => /^https:\/\//i.test(value || "") ? value : undefined;

export default function SkuFitmentPage() {
  const [uploading, setUploading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const [uploadError, setUploadError] = useState("");
  const [uploadRows, setUploadRows] = useState<any[]>([]);
  const [jobStatus, setJobStatus] = useState<{
    jobId: string;
    status: string;
    total: number;
    done: number;
    fileName?: string;
    error?: string;
    results: any[];
  } | null>(null);

  const progressPercent = jobStatus && jobStatus.total ? Math.min(100, Math.round((jobStatus.done / jobStatus.total) * 100)) : 0;

  const downloadAnalyzeCsv = (results: any[]) => {
    if (!results.length) return;
    const headers = ["Goods ID", "SKU", "比价可比性", "程序状态", "资料覆盖", "网页状态", "具体变体", "抓取时间", "参考标题", "我方描述", "参考商品文字", "原因", "参考链接", "最终链接", "参考价格", "币种", "价格核查", "证据ID", "分析版本", ...Object.entries(FIELD_LABELS).flatMap(([, label]) => [`${label}结论`, `${label}我方`, `${label}参考`, `${label}依据`, `${label}我方来源`])];
    const csvCell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[\t\r ]*[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const lines = [headers, ...results.map(row => [
      row.goodsId, row.sku, VERDICT_LABELS[row.verdict] || row.verdict, row.verdict, row.evidenceCoverage, PAGE_LABELS[row.page?.status] || row.page?.status,
      row.page?.selectedVariant || (row.page?.variantStatus === "unconfirmed" ? "未确认" : "未检测到多变体"),
      row.page?.fetchedAt, row.page?.title, row.internal?.text, row.external?.text, row.reason,
      row.targetUrl, row.page?.finalUrl, row.page?.price, row.page?.currency, row.priceReview?.reason, row.evidenceId, row.version,
      ...Object.keys(FIELD_LABELS).flatMap(field => {
        const d = row.dimensions?.find((item: any) => item.field === field);
        return [STATUS_LABELS[d?.status] || "信息不足", d?.internal, d?.external, d?.reason, row.internal?.sources?.[field]];
      }),
    ])];
    const blob = new Blob(["\uFEFF", lines.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sku-fitment-${Date.now()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (event: any) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setUploading(true);
    setUploadError("");
    setUploadRows([]);
    setJobStatus(null);

    try {
      const rows = await readExcelRows(file);
      if (!Array.isArray(rows) || !rows.length) {
        throw new Error("No rows found in uploaded file");
      }

      const payload = {
        rows: rows.map((row) => {
          const normalized: Record<string, any> = {};
          Object.entries(row).forEach(([key, value]) => {
            const name = String(key).normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
            const inputKeys = ["sku", "itemno", "productsku", "partnumber", "productnumber", "货号", "cpono", "goodsid"];
            if (inputKeys.includes(name) || /url|link|链接|网址|参考地址|网页/.test(name)) normalized[String(key)] = value ?? "";
          });
          return normalized;
        }),
        fileName: file.name,
        async: true,
      };

      const job = await apiPost<{ ok: boolean; jobId?: string; status?: string; message?: string; total?: number; done?: number; results?: any[]; fileName?: string }>(
        "/api/report/data/analyze",
        payload,
        controller.signal,
      );

      const jobId = job.jobId;
      if (!job.ok || !jobId) {
        throw new Error(job.message || "Failed to start uploaded file analysis");
      }

      setJobStatus({
        jobId,
        status: job.status || "running",
        total: job.total || rows.length,
        done: job.done || 0,
        results: job.results || [],
        fileName: job.fileName || file.name,
      });

      while (!controller.signal.aborted) {
        const status = await apiGet<{ ok: boolean; status?: string; total?: number; done?: number; results?: any[]; message?: string; error?: string; fileName?: string }>(`/api/report/data/analyze/progress?jobId=${encodeURIComponent(jobId)}`, controller.signal);
        if (controller.signal.aborted) return;
        if (!status.ok) throw new Error(status.message || "Analysis failed");
        setJobStatus({ jobId, status: status.status || "running", total: status.total || rows.length, done: status.done || 0,
          results: status.results || [], fileName: status.fileName || file.name, error: status.error });
        if (status.status === "done") {
          setUploadRows(status.results || []);
          setUploading(false);
          break;
        }
        if (status.status === "failed") throw new Error(status.message || status.error || "Analysis failed");
        await new Promise(resolve => window.setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      if (controller.signal.aborted) return;
      setUploadRows([]);
      setJobStatus(null);
      setUploadError(String(error?.message || error || "Upload analyze failed"));
      setUploading(false);
    } finally {
      if (event?.target) event.target.value = "";
    }
  };

  return (
    <div className="dr-page progressive-enter">
      <section className="dr-section">
        <div className="dr-header">
          <h2>SKU Fitment Check</h2>
          <div className="dr-entity-current">上传 SKU 与参考链接，使用我方 SKU、Desc1/Desc2 与参考商品比对年份、车型、颜色及款式，并保存来源证据。品牌、图片、材质、尺寸和数量不参与判断。资料缺失、变体未确认或网页受限时转人工复核。</div>
        </div>

        <div className="dr-table-frame" style={{ marginTop: 16 }}>
          <div className="dr-table-wrap">
            <div className="dr-chart-card" style={{ padding: 18 }}>
              <div className="dr-chart-head">
                <div className="dr-chart-title">Upload SKU Fitment File</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} disabled={uploading} />
                {(uploading || jobStatus) ? (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "#fff7ed", border: "1px solid #fdba74" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
                      <strong>{jobStatus?.status === "done" ? "Analysis completed" : jobStatus?.status === "failed" ? "Analysis failed" : "Analyzing uploaded file"}</strong>
                      <span>{jobStatus && jobStatus.total ? `${progressPercent}%` : "0%"}</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: "#fed7aa", overflow: "hidden" }}>
                      <div style={{ width: `${progressPercent}%`, height: "100%", background: "linear-gradient(90deg, #f97316, #fb923c)", transition: "width 0.2s ease" }} />
                    </div>
                    <div style={{ marginTop: 8, color: "#7c2d12", fontSize: 13 }}>
                      {jobStatus ? `${jobStatus.done || 0} / ${jobStatus.total || 0} rows processed` : "Preparing crawl..."}
                    </div>
                  </div>
                ) : null}
                {uploadError ? <div className="dr-error" style={{ marginTop: 8 }}>{uploadError}</div> : null}
              </div>

              {uploadRows.length ? (
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
                    <div className="dr-chart-title">Analysis Results · 四项匹配 {uploadRows.filter(r => r.verdict === "FIT").length} · 不匹配 {uploadRows.filter(r => r.verdict === "NOT FIT").length} · 待复核 {uploadRows.filter(r => r.verdict === "REVIEW").length} · 无效输入 {uploadRows.filter(r => r.verdict === "INVALID").length}</div>
                    <button
                      type="button"
                      onClick={() => downloadAnalyzeCsv(uploadRows)}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #fdba74", background: "#fff7ed", cursor: "pointer", fontWeight: 600 }}
                    >
                      Download CSV
                    </button>
                  </div>

                  <p style={{ color: "#64748b", fontSize: 13 }}>资料覆盖表示已能比较的字段数量，并非准确率。按年份、车型、颜色、款式四项判断；年份范围有重叠按宽松规则接受。品牌和图片不作为通过条件，价格仍单独核查。</p>
                  <div style={{ maxHeight: 620, overflow: "auto" }}>
                    <table className="dr-table" style={{ minWidth: 760 }}>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Verdict</th>
                          <th>网页状态 / 资料覆盖</th>
                          <th>差异与待核查项</th>
                          <th>双方资料与证据</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadRows.map((row, index) => (
                          <tr key={`${row.sku || index}-${index}`}>
                            <td>{row.sku || "-"}</td>
                            <td>{VERDICT_LABELS[row.verdict] || row.verdict || "-"}</td>
                            <td>{PAGE_LABELS[row.page?.status] || "未完成"}<br />{row.evidenceCoverage || "0/4"}<br /><small>{row.page?.variantStatus === "unconfirmed" ? "变体未确认" : row.page?.selectedVariant || "未检测到多变体"}</small></td>
                            <td style={{ minWidth: 230, whiteSpace: "normal" }}>{row.reason || "-"}</td>
                            <td style={{ minWidth: 330 }}>
                              <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                                {safeLink(row.targetUrl) && <a href={safeLink(row.targetUrl)} target="_blank" rel="noreferrer">参考商品</a>}
                                {row.evidenceId && <a href={`/api/report/data/analyze/evidence?id=${encodeURIComponent(row.evidenceId)}`} download>下载来源证据</a>}
                              </div>
                              <details>
                                <summary style={{ cursor: "pointer" }}>展开双方资料与分项结果</summary>
                                <p style={{ whiteSpace: "normal" }}><strong>我方：</strong>{row.internal?.text || "无资料"}</p>
                                <p style={{ whiteSpace: "normal" }}><strong>参考：</strong>{row.page?.title || "未读取到商品标题"}</p>
                                <p>抓取时间：{row.page?.fetchedAt ? new Date(row.page.fetchedAt).toLocaleString() : "—"}</p>
                                <p style={{ whiteSpace: "normal" }}>选中变体：{row.page?.selectedVariant || "未确认具体选项"}</p>
                                <table className="dr-table" style={{ minWidth: 540 }}>
                                  <thead><tr><th>维度</th><th>结论</th><th>我方</th><th>参考</th><th>依据</th></tr></thead>
                                  <tbody>{row.dimensions?.map((d: any) => <tr key={d.field}>
                                    <td>{FIELD_LABELS[d.field] || d.field}</td><td>{STATUS_LABELS[d.status] || d.status}</td>
                                    <td style={{ whiteSpace: "normal" }}>{d.internal || "未提供"}<br /><small>{row.internal?.sources?.[d.field] || ""}</small></td><td style={{ whiteSpace: "normal" }}>{d.external || "未提供"}</td><td style={{ whiteSpace: "normal" }}>{d.reason}</td>
                                  </tr>)}</tbody>
                                </table>
                                <p style={{ whiteSpace: "normal" }}>价格核查：{row.priceReview?.reason || "需人工核查"}。参考页面价格：{row.page?.currency} {row.page?.price || "未获取"}</p>
                                {row.evidenceError && <p role="alert">{row.evidenceError}</p>}

                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
