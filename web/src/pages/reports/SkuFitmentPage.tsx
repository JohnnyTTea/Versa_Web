import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  CHECK_STATUS, FIELDS, FITMENT_RULES_VERSION, FITMENT_UPLOAD_LIMIT, PAGE_STATUS, PRICES, VERDICTS,
  canRecheck, downloadFitmentReport, downloadFitmentTemplate, httpsLink, priceFields, readFitmentWorkbook, reportProductText, reportRemark,
} from "./skuFitmentWorkbook";
import type { FitmentResult, Verdict } from "./skuFitmentWorkbook";
import "../../styles/report.css";
import "../../styles/sku-fitment.css";

type Workbook = Awaited<ReturnType<typeof readFitmentWorkbook>>;
type Job = { jobId: string; fileName: string; total: number; done: number; status: "running" | "done" | "failed" };
type JobResponse = Partial<Job> & { ok: boolean; version?: string; message?: string; error?: string; results?: FitmentResult[]; retryAt?: string };
const storedJob = "versa-sku-fitment-job";
const resultsPerPage = 20;
const fieldName = FIELDS as Record<string, string>;
const displayDate = (value: string) => value ? new Date(value).toLocaleString() : "—";

async function requestJob(path: string, signal: AbortSignal, body?: object): Promise<JobResponse> {
  const response = await fetch(path, {
    credentials: "include", signal, cache: "no-store", method: body ? "POST" : "GET",
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 || response.status === 403) throw new Error("登录状态已失效，请重新登录 Versa。");
  if (response.status === 413) throw new Error("表格数据超出上传大小，请拆成几个文件后再上传。");
  if (response.status === 404 && path.endsWith("/version")) throw new Error("当前连接的是旧版分析服务，请刷新页面后重试。");
  if (!response.ok) throw new Error(`服务暂不可用（HTTP ${response.status}）。`);
  return response.json();
}

function savedJob(): Job | null {
  try {
    const job = JSON.parse(sessionStorage.getItem(storedJob) || "null");
    return job?.jobId && job.fileName ? job : null;
  } catch { return null; }
}

function remember(job?: Job) {
  try {
    if (job) sessionStorage.setItem(storedJob, JSON.stringify(job));
    else sessionStorage.removeItem(storedJob);
  } catch { /* the current page remains usable without session storage */ }
}

export default function SkuFitmentPage() {
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [sheetIndex, selectSheet] = useState(0);
  const [job, setJob] = useState<Job | null>(savedJob);
  const [results, setResults] = useState<FitmentResult[]>([]);
  const [working, setWorking] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | Verdict>("all");
  const [resultPage, setResultPage] = useState(1);
  const [pollAttempt, retryPoll] = useState(0);
  const upload = useRef<AbortController | null>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const selected = workbook?.sheets[sheetIndex];
  const selectedCount = selected?.rows.length || 0;
  const overUploadLimit = selectedCount > FITMENT_UPLOAD_LIMIT;
  const jobId = job?.jobId;
  const fileName = job?.fileName;
  const filtered = filter === "all" ? results : results.filter(row => row.verdict === filter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / resultsPerPage));
  const currentPage = Math.min(resultPage, pageCount);
  const pageStart = (currentPage - 1) * resultsPerPage;
  const displayed = filtered.slice(pageStart, pageStart + resultsPerPage);
  const retryCount = results.filter(canRecheck).length;
  const progress = job?.total ? Math.min(100, Math.round(job.done * 100 / job.total)) : 0;

  useEffect(() => () => upload.current?.abort(), []);
  useEffect(() => {
    if (!jobId || !fileName) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function poll() {
      try {
        const reply = await requestJob(`/api/report/data/analyze/progress?jobId=${encodeURIComponent(jobId!)}`, controller.signal);
        if (controller.signal.aborted) return;
        if (!reply.ok) {
          if (reply.message === "Job not found") {
            remember();
            setJob(null);
            throw new Error("这次任务记录已失效，请重新选择表格开始。");
          }
          throw new Error(reply.message || "无法查询任务进度。");
        }
        const next: Job = {
          jobId: jobId!, fileName: reply.fileName || fileName!, status: reply.status || "running",
          total: reply.total ?? 0, done: reply.done ?? 0,
        };
        setJob(next);
        remember(next);
        if (next.status === "done") {
          const completed = reply.results || [];
          if (completed.some(row => row.version !== FITMENT_RULES_VERSION)) {
            remember();
            setJob(null);
            throw new Error("这次结果来自旧版分析服务，请重新上传表格运行。");
          }
          setResults(completed);
          setResultPage(1);
          setWorking(false);
        } else if (next.status === "failed") {
          remember();
          throw new Error(reply.error || reply.message || "分析失败，请重新上传。");
        } else {
          timer = window.setTimeout(poll, 1500);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "无法查询任务进度。");
        setWorking(false);
      }
    }
    setWorking(true);
    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [jobId, fileName, pollAttempt]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReading(true);
    setWorkbook(null);
    setError("");
    try {
      const parsed = await readFitmentWorkbook(file);
      setWorkbook(parsed);
      selectSheet(parsed.initialSheet);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取表格。");
    } finally {
      setReading(false);
    }
  }

  async function startAnalysis() {
    if (!selected || !workbook || overUploadLimit || upload.current) return;
    const controller = new AbortController();
    upload.current = controller;
    setError("");
    setWorking(true);
    setResults([]);
    setFilter("all");
    setJob(null);
    remember();
    try {
      const service = await requestJob("/api/report/data/analyze/version", controller.signal);
      if (service.version !== FITMENT_RULES_VERSION) throw new Error("当前连接的是旧版分析服务，请刷新页面后重试。");
      const reply = await requestJob("/api/report/data/analyze", controller.signal, {
        rows: selected.rows, fileName: workbook.name, async: true,
      });
      if (controller.signal.aborted) return;
      if (!reply.ok || !reply.jobId) throw new Error(reply.message || "未能启动分析任务。");
      const started: Job = {
        jobId: reply.jobId, fileName: reply.fileName || workbook.name,
        total: reply.total ?? selected.rows.length, done: reply.done ?? 0, status: "running",
      };
      remember(started);
      setJob(started);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "未能启动分析任务。");
      setWorking(false);
    } finally {
      upload.current = null;
    }
  }

  function download(format: "xlsx" | "csv") {
    try { downloadFitmentReport(results, job?.fileName || "SKU-Fitment", format); }
    catch { setError("未能生成报告，请重试下载。"); }
  }

  function downloadTemplate() {
    try { downloadFitmentTemplate(); }
    catch { setError("未能下载模板，请重试。"); }
  }

  function showResultPage(page: number) {
    setResultPage(page);
    if (tableScroll.current) tableScroll.current.scrollTop = 0;
  }

  function selectFilter(verdict: "all" | Verdict) {
    setFilter(verdict);
    showResultPage(1);
  }

  async function retryPending() {
    if (!job || working || upload.current) return;
    const controller = new AbortController();
    upload.current = controller;
    setWorking(true);
    setError("");
    try {
      const reply = await requestJob("/api/report/data/analyze/retry", controller.signal, { jobId: job.jobId });
      if (controller.signal.aborted) return;
      if (!reply.ok || !reply.jobId) {
        const extra = reply.retryAt ? " 最早补查时间 " + displayDate(reply.retryAt) + "。" : "";
        throw new Error((reply.message || "未能开始补查。") + extra);
      }
      const retry: Job = { jobId: reply.jobId, fileName: reply.fileName || job.fileName, status: "running",
        total: reply.total ?? job.total, done: reply.done ?? 0 };
      remember(retry);
      setJob(retry);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "未能开始补查。");
      setWorking(false);
    } finally {
      upload.current = null;
    }
  }

  return (
    <div className="dr-page progressive-enter sku-fitment">
      <section className="dr-section">
        <div className="dr-header">
          <h2>SKU Fitment</h2>
          <p>用 SKU 和参考商品链接检查适配、产品类型及当前售价。</p>
        </div>

        <div className="dr-chart-card sf-upload">
          <div>
            <label className="sf-file-label" htmlFor="fitment-file">选择表格</label>
            <div className="sf-actions">
              <input id="fitment-file" type="file" accept=".xlsx,.xls,.csv" aria-describedby="fitment-format"
                onChange={chooseFile} disabled={working || reading} />
              <button className="sf-button" type="button" onClick={downloadTemplate}>下载 Excel 模板</button>
            </div>
            <p id="fitment-format">支持 Excel 或 CSV。表头需要 SKU 和参考链接。每次上传不超过 {FITMENT_UPLOAD_LIMIT} 条数据（不含表头）。</p>
          </div>
          {workbook && selected && (
            <div className="sf-selection">
              <div>
                <strong>{workbook.name}</strong>
                {workbook.sheets.length > 1 ? (
                  <label className="sf-sheet">工作表
                    <select value={sheetIndex} onChange={event => selectSheet(Number(event.target.value))} disabled={working}>
                      {workbook.sheets.map((sheet, i) => <option key={sheet.name} value={i}>{sheet.name}</option>)}
                    </select>
                  </label>
                ) : <small className="sf-sheet">{selected.name}</small>}
              </div>
              <button className="sf-button sf-primary" type="button" onClick={startAnalysis} disabled={working || reading || overUploadLimit}>
                开始分析（{selectedCount} 条）
              </button>
            </div>
          )}
          {overUploadLimit && <p className="dr-error sf-error" role="alert">当前工作表有 {selectedCount} 条数据，请拆分为每次不超过 {FITMENT_UPLOAD_LIMIT} 条后再上传。</p>}
          {(working || reading || job) && (
            <div className="sf-progress" role="status" aria-live="polite">
              <div>
                <strong>{reading ? "正在读取表格" : job?.status === "done" ? "分析完成" :
                  job?.status === "failed" ? "分析失败" : working ? "正在分析" : "进度查询已暂停"}</strong>
                {job && <span>{job.fileName} · {job.done} / {job.total} 条 · {progress}%</span>}
              </div>
              {job && <progress aria-label="分析进度" value={job.done} max={Math.max(job.total, 1)} />}
              {job?.status === "running" && !working && (
                <button className="sf-button" type="button" onClick={() => { setError(""); retryPoll(n => n + 1); }}>继续查看进度</button>
              )}
            </div>
          )}
          {error && <p className="dr-error sf-error" role="alert">{error}</p>}
        </div>

        {!!results.length && (
          <section className="sf-results" aria-label="分析结果">
            <div className="sf-results-head">
              <h3>分析结果</h3>
              <div className="sf-actions">
                {retryCount > 0 && <button className="sf-button" type="button" onClick={retryPending} disabled={working}>仅补查未完成项（{retryCount}）</button>}
                <button className="sf-button sf-primary" type="button" onClick={() => download("xlsx")}>下载 Excel 报告</button>
                <button className="sf-button" type="button" onClick={() => download("csv")}>下载 CSV</button>
              </div>
            </div>
            <div className="sf-filters" aria-label="按判定筛选">
              <button type="button" className="sf-button" aria-pressed={filter === "all"} onClick={() => selectFilter("all")}>全部 {results.length}</button>
              {(Object.keys(VERDICTS) as Verdict[]).map(key => (
                <button key={key} type="button" className="sf-button" aria-pressed={filter === key} onClick={() => selectFilter(key)}>
                  {VERDICTS[key]} {results.filter(row => row.verdict === key).length}
                </button>
              ))}
            </div>
            <div className="dr-table-frame">
              <div className="dr-table-wrap sf-table-scroll" ref={tableScroll}>
                <table className="dr-table sf-results-table">
                  <thead><tr>
                    <th>SKU</th><th>判定</th><th>网页状态</th><th className="sf-remark">模型备注</th>
                    {PRICES.map(label => <th key={label}>{label}</th>)}
                    <th>商品证据</th>
                  </tr></thead>
                  <tbody>
                    {displayed.map((row, index) => {
                      const price = priceFields(row);
                      const link = httpsLink(row.targetUrl);
                      const remark = reportRemark(row.remark || row.reason);
                      const checks = row.dimensions?.filter(d => Object.hasOwn(FIELDS, d.field)) || [];
                      return (
                        <tr key={row.evidenceId || `${row.sku}-${row.sourceRow ?? index}`}>
                          <td className="sf-sku">{row.sku || "—"}</td>
                          <td><span className="sf-verdict" data-verdict={row.verdict}>{VERDICTS[row.verdict]}</span></td>
                          <td>
                            {PAGE_STATUS[row.page?.status ?? ""] || "未完成"}
                            {row.page?.retryAt && <div>可补查时间：{displayDate(row.page.retryAt)}</div>}
                          </td>
                          <td className="sf-remark">
                            <span className="sf-remark-text" title={remark || undefined}>{remark || "—"}</span>
                          </td>
                          <td className="sf-amount">{price.amount ? <strong>{price.amount}</strong> : "未核实"}</td>
                          <td>{price.kind || "—"}</td>
                          <td className="sf-date">{displayDate(price.time)}</td>
                          <td>{price.sourceUrl ? <a href={price.sourceUrl} target="_blank" rel="noreferrer">{price.source}</a> : price.source || "—"}</td>
                          <td className="sf-evidence">
                            <div className="sf-actions">
                              {link && <a href={link} target="_blank" rel="noreferrer">参考商品</a>}
                              {row.evidenceId && <a href={`/api/report/data/analyze/evidence?id=${encodeURIComponent(row.evidenceId)}`} download>下载证据</a>}
                            </div>
                            <details>
                              <summary>双方资料</summary>
                              <p>我方：{reportProductText(row.internal?.text) || "无资料"}</p>
                              <p>参考：{reportProductText(row.page?.title) || "无资料"}</p>
                              {row.page?.selectedVariant && <p>变体：{reportProductText(row.page.selectedVariant)}</p>}
                              {checks.map(d => <p key={d.field}>{fieldName[d.field]} · {CHECK_STATUS[d.status]} · {d.internal || "—"} / {d.external || "—"}</p>)}
                              {row.evidenceError && <p role="alert">{row.evidenceError}</p>}
                            </details>
                          </td>
                        </tr>
                      );
                    })}
                    {!displayed.length && <tr><td colSpan={9}>没有符合这个筛选条件的记录。</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            {pageCount > 1 && (
              <nav className="sf-actions sf-pagination" aria-label="分析结果分页">
                <button className="sf-button" type="button" onClick={() => showResultPage(currentPage - 1)} disabled={currentPage === 1}>上一页</button>
                <span aria-live="polite">第 {currentPage} / {pageCount} 页 · 共 {filtered.length} 条</span>
                <button className="sf-button" type="button" onClick={() => showResultPage(currentPage + 1)} disabled={currentPage === pageCount}>下一页</button>
              </nav>
            )}
          </section>
        )}
      </section>
    </div>
  );
}
