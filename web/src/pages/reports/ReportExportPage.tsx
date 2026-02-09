import { useMemo, useState } from "react";
import "../../styles/report.css";

type ReportKey =
  | "AIS SLS Report"
  | "Whse SSI Report"
  | "RMA Report"
  | "Ikon Item Bin"
  | "ModernDepot Item Bin"
  | "DTO Item Bin";

type GenerateResponse =
  | { success: true; file: string }
  | { success: false; error?: string };

const DESCRIPTIONS: Record<ReportKey, string> = {
  "AIS SLS Report": "生成销售分析报表（含每月销售数量、平均售价、库存等）。",
  "Whse SSI Report": "生成仓库库存快照报告（SSI 库存状态）。",
  "RMA Report": "生成所有产品退货报告（credit memo, 订单详情，退货率等）。",
  "Ikon Item Bin": "导出 Ikon 仓库中商品的 bin 分布信息。",
  "ModernDepot Item Bin": "导出 ModernDepot(3) 仓库中商品的 bin 分布信息。",
  "DTO Item Bin": "导出 DTO 仓库中商品的 bin 分布信息。",
};

const EXPORT_MESSAGES: Record<ReportKey, string> = {
  "AIS SLS Report": "生成销售分析报表（AIS）成功，浏览器正在下载。",
  "Whse SSI Report": "生成仓库快照报表成功，浏览器正在下载。",
  "RMA Report": "RMA报表 成功，浏览器正在下载。",
  "Ikon Item Bin": "Ikon bin 报表成功，浏览器正在下载。",
  "ModernDepot Item Bin": "ModenDepot bin 报表成功，浏览器正在下载。",
  "DTO Item Bin": "DTO bin 报表成功，浏览器正在下载。",
};

function defaultFileName(report: string) {
  return report.replace(/\s+/g, "_") + ".xlsx";
}

export default function ReportExportPage() {
  const options: ReportKey[] = useMemo(
    () => [
      "AIS SLS Report",
      "Whse SSI Report",
      "RMA Report",
      "Ikon Item Bin",
      "ModernDepot Item Bin",
      "DTO Item Bin",
    ],
    []
  );

  const [selected, setSelected] = useState<ReportKey | "">("");
  const [exportName, setExportName] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState("Waiting for user action...");
  const [loading, setLoading] = useState(false);

  function onSelect(v: string) {
    const key = v as ReportKey;
    setSelected(key);
    setExportName(defaultFileName(key));
    setDesc(DESCRIPTIONS[key] || "暂无描述。");
    setStatus("Waiting for user action...");
  }

  async function onExport() {
    if (!selected) {
      alert("请先选择一个报表！");
      return;
    }
    const name = exportName.trim() || defaultFileName(selected);

    setLoading(true);
    setStatus("⏳ 正在生成报表，请稍候...");

    try {
      // ✅ 你 PHP 原逻辑：POST /Versa/ajax/generate_report.php
      // ✅ React/Nest 版本：建议你 NestJS 提供同语义接口
      //    POST /api/report/generate  { report, export_name, event }
      const res = await fetch("/api/report/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: selected,
          export_name: name,
          event: "Download: " + selected,
        }),
      });

      const data = (await res.json()) as GenerateResponse;

      if (!res.ok || !data || data.success === false) {
        const msg = (data && "error" in data && data.error) ? data.error : "报表生成失败";
        setStatus("❌ 报表生成失败：" + msg);
        return;
      }

      const msg = EXPORT_MESSAGES[selected] || "报表生成成功，浏览器正在下载。";
      setStatus("✅ " + msg);

      // 触发下载（跟你 PHP 一样用 <a>）
      const a = document.createElement("a");
      a.href = data.file;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e: any) {
      setStatus("❌ 请求出错：" + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="report-container progressive-enter">
      <div className="report-left">
        <h3>📂 AIS Data Exports List</h3>

        <select
          id="reportSelect"
          size={25}
          className="report-list"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <div className="report-export-bar">
          <label>导出名称：</label>
          <input
            type="text"
            id="exportName"
            value={exportName}
            onChange={(e) => setExportName(e.target.value)}
          />
          <button id="exportButton" onClick={onExport} disabled={loading}>
            {loading ? "生成中..." : "确认导出"}
          </button>
        </div>
      </div>

      <div className="report-right">
        <h3>📄 Export Description</h3>
        <textarea
          id="descriptionBox"
          placeholder="描述将在这里显示..."
          rows={8}
          readOnly
          value={desc}
        />

        <h3>📦 Export Status</h3>
        <div className={"status-box" + (loading ? " loading" : "")}>{status}</div>
      </div>
    </div>
  );
}
