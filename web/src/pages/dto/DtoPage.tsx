import React, { useMemo, useState } from "react";
import "../../styles/DTO.css";
import { trackUserEvent } from "../../utils/userLog";

type UploadResult = {
  success: boolean;
  message?: string;
  error?: string;
  table?: {
    columns: string[];
    data: Array<Array<string | number | null>>;
  };
};

type SaveResult =
  | { status: "ok"; download_url: string }
  | { status: "error"; message?: string; error?: string };

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/**
 * 你给后端后我再统一对齐：
 * - upload: POST /api/dto/upload (multipart/form-data)
 * - save:   POST /api/dto/save   (json { data })
 *
 * 现在先按旧地址跑通 UI，后端接好后只需要改这里两个 fetch URL。
 */
async function apiUploadCsv(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("csvFile", file);

  const res = await fetch("/api/dto/upload", {
    method: "POST",
    body: fd,
    credentials: "include",
  });

  return await res.json();
}

async function apiSaveTable(data: any[][]): Promise<SaveResult> {
  const res = await fetch("/api/dto/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
    credentials: "include",
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: "error", message: "Invalid JSON response" };
  }
}

export default function DtoPage() {
  const [originalTable, setOriginalTable] = useState<any[][]>([]);
  const [currentTable, setCurrentTable] = useState<any[][]>([]);
  const [mode, setMode] = useState<"empty" | "view" | "edit">("empty");
  const [lastDownloadUrl, setLastDownloadUrl] = useState<string | null>(null);

  const canModify = mode === "view";
  const canSave = mode === "edit";
  const canCancel = mode === "edit";

  const headers = currentTable?.[0] || [];

  const colWidthCh = useMemo(() => {
    if (!headers || headers.length === 0) return [];
    const WIDE_CH = 17;
    const NARROW_CH = 6;
    const MEDIUM_CH = 10;

    const wideSet = new Set(["itemno", "alt1", "alt2", "adino"]);
    const narrowSet = new Set(["d1","d5","qty", "stock", "lno", "state", "w/e"]);

    return headers.map((h: any) => {
      const key = String(h ?? "").toLowerCase().trim();
      const headerLen = String(h ?? "").length || 1;
      if (wideSet.has(key)) return Math.max(WIDE_CH, headerLen);
      if (narrowSet.has(key)) return Math.max(NARROW_CH, headerLen);
      return Math.max(MEDIUM_CH, headerLen);
    });
  }, [headers]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const input = (e.currentTarget.elements.namedItem("csvFile") as HTMLInputElement) || null;
    const file = input?.files?.[0];
    if (!file) return;
    trackUserEvent({
      event: `DTO Upload: ${file.name}`,
      module: "dto",
      action: "upload_csv",
      target: file.name,
      meta: { size: file.size },
    });

    try {
      const data = await apiUploadCsv(file);
      if (data.success && data.table?.columns && data.table?.data) {
        const merged = [data.table.columns, ...data.table.data];
        setOriginalTable(deepClone(merged));
        setCurrentTable(deepClone(merged));
        setMode("view");
        setLastDownloadUrl(null);
      } else {
        alert("❌ Failed to process CSV: " + (data.message || data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("❌ Failed to upload or parse response");
    }
  }

  function handleModify() {
    if (!canModify) return;
    trackUserEvent({
      event: "DTO Enter Edit",
      module: "dto",
      action: "enter_edit",
    });
    setMode("edit");
  }

  function handleCancel() {
    if (!canCancel) return;
    setCurrentTable(deepClone(originalTable));
    setMode("view");
  }

  async function handleSave() {
    if (!canSave) return;

    const ok = window.confirm("确定要保存并下载 Excel 吗？");
    if (!ok) return;

    try {
      const payload = await apiSaveTable(currentTable);

      if (payload && payload.status === "ok" && payload.download_url) {
        trackUserEvent({
          event: `DTO Save & Download: ${payload.download_url}`,
          module: "dto",
          action: "save_download",
          target: payload.download_url,
        });
        // 自动下载
        const a = document.createElement("a");
        a.href = payload.download_url;
        a.download = payload.download_url.split("/").pop() || "dto.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();

        setLastDownloadUrl(payload.download_url);
        // 保存成功：把当前表变成原始表（新的“取消”基准）
        setOriginalTable(deepClone(currentTable));
        setMode("view");
      } else {
        const msg = (payload as any)?.message || (payload as any)?.error || "Unknown error";
        alert("❌ 保存失败: " + msg);
      }
    } catch (err) {
      console.error(err);
      alert("❌ 网络错误或服务器异常");
    }
  }

  // 表格编辑：更新 currentTable
  function setCellValue(r: number, c: number, value: string) {
    setCurrentTable((prev) => {
      const next = deepClone(prev);
      if (!next[r]) next[r] = [];
      next[r][c] = value;
      return next;
    });
  }

  return (
    <div className="dto-page">
      <div className="dto-main progressive-enter">
        {/* 标题 + 操作按钮（右上角） */}
        <div className="dto-header">
          <h2>📄 DTO Order Processing</h2>

          <div className="dto-actions">
            <button
              type="button"
              className="dto-btn"
              disabled={!canModify}
              onClick={handleModify}
              title={canModify ? "进入编辑模式" : "请先导入 CSV 或退出编辑"}
            >
              Modify
            </button>

            <button
              type="button"
              className="dto-btn"
              disabled={!canCancel}
              onClick={handleCancel}
              title={canCancel ? "取消修改并恢复" : "当前不是编辑状态"}
            >
              Cancel
            </button>

            <button
              type="button"
              className="dto-btn dto-btn-primary"
              disabled={!canSave}
              onClick={handleSave}
              title={canSave ? "保存并下载 Excel" : "当前不是编辑状态"}
            >
              Save
            </button>
          </div>
        </div>

        {/* 上传 */}
        <form className="dto-upload" onSubmit={handleUpload}>
          <input type="file" name="csvFile" accept=".csv" required />
          <button type="submit">📥 Import CSV</button>
        </form>

        {/* 表格 */}
        <div className="dto-table-wrap">
          {currentTable.length === 0 ? (
            <div className="dto-empty">请先上传 CSV</div>
          ) : (
            <div id="tableContainer" className="dto-table-container">
              <table className="dto-table">
                <thead>
                  <tr>
                    {headers.map((col: any, i: number) => (
                      <th
                        key={i}
                        style={{
                          width: `${colWidthCh[i]}ch`,
                          minWidth: `${colWidthCh[i]}ch`,
                        }}
                      >
                        {String(col ?? "")}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {currentTable.slice(1).map((row: any[], rIdx: number) => {
                    const rr = rIdx + 1; // 第0行是表头
                    return (
                      <tr key={rr}>
                        {headers.map((_: any, cIdx: number) => {
                          const v = row?.[cIdx] == null ? "" : String(row[cIdx]);
                          return (
                            <td
                              key={cIdx}
                              style={{
                                width: `${colWidthCh[cIdx]}ch`,
                                minWidth: `${colWidthCh[cIdx]}ch`,
                              }}
                            >
                              <input
                                type="text"
                                value={v}
                                disabled={mode !== "edit"}
                                onChange={(e) => setCellValue(rr, cIdx, e.target.value)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {lastDownloadUrl ? (
          <div className="dto-last-download">
            Last download: <span>{lastDownloadUrl}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
