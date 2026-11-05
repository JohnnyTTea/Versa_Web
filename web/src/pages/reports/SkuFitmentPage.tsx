import { useState } from "react";
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

async function apiPost<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
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

export default function SkuFitmentPage() {
  const [uploading, setUploading] = useState(false);
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
    const headers = ["sku", "verdict", "confidence", "mismatches", "reason", "targetUrl", "fileName"];
    const rows = [
      headers.join(","),
      ...results.map((row) => headers.map((header) => {
        const value = row?.[header] ?? "";
        const str = String(value ?? "").replace(/"/g, '""');
        return `"${str}"`;
      }).join(",")),
    ].join("\r\n");

    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
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
            normalized[String(key)] = value ?? "";
          });
          return normalized;
        }),
        fileName: file.name,
        async: true,
      };

      const job = await apiPost<{ ok: boolean; jobId?: string; status?: string; message?: string; total?: number; done?: number; results?: any[]; fileName?: string }>(
        "/api/report/data/analyze",
        payload,
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

      const pollStatus = async () => {
        const status = await apiGet<{ ok: boolean; status?: string; total?: number; done?: number; results?: any[]; message?: string; error?: string; fileName?: string }>(`/api/report/data/analyze/progress?jobId=${encodeURIComponent(jobId)}`);

        if (!status.ok) {
          setUploadError(status.message || "Analysis failed");
          setUploading(false);
          setJobStatus(null);
          return;
        }

        setJobStatus({
          jobId,
          status: status.status || "running",
          total: status.total || rows.length,
          done: status.done || 0,
          results: status.results || [],
          fileName: status.fileName || file.name,
          error: status.error,
        });

        if (status.status === "done") {
          setUploadRows(status.results || []);
          setUploading(false);
          return;
        }

        if (status.status === "failed") {
          setUploadError(status.message || status.error || "Analysis failed");
          setUploading(false);
          return;
        }

        window.setTimeout(pollStatus, 800);
      };

      await pollStatus();
    } catch (error: any) {
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
          <div className="dr-entity-current">Upload a file with SKU + target URL to verify whether the product matches the target page.</div>
        </div>

        <div className="dr-table-frame" style={{ marginTop: 16 }}>
          <div className="dr-table-wrap">
            <div className="dr-chart-card" style={{ padding: 18 }}>
              <div className="dr-chart-head">
                <div className="dr-chart-title">Upload SKU Fitment File</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
                {(uploading || jobStatus) ? (
                  <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "#fff7ed", border: "1px solid #fdba74" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
                      <strong>{jobStatus?.status === "done" ? "Analysis completed" : "Analyzing uploaded file"}</strong>
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
                    <div className="dr-chart-title">Analysis Results</div>
                    <button
                      type="button"
                      onClick={() => downloadAnalyzeCsv(uploadRows)}
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #fdba74", background: "#fff7ed", cursor: "pointer", fontWeight: 600 }}
                    >
                      Download CSV
                    </button>
                  </div>

                  <div style={{ maxHeight: 420, overflow: "auto" }}>
                    <table className="dr-table" style={{ minWidth: 760 }}>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Verdict</th>
                          <th>Confidence</th>
                          <th>Mismatches</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadRows.map((row, index) => (
                          <tr key={`${row.sku || index}-${index}`}>
                            <td>{row.sku || "-"}</td>
                            <td>{row.verdict || "-"}</td>
                            <td>{row.confidence || "-"}</td>
                            <td>{Array.isArray(row.mismatches) ? row.mismatches.join("; ") : row.mismatches || "-"}</td>
                            <td>{row.reason || "-"}</td>
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
