import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "../../styles/purchase.css";

type RpoLine = {
  Trno: any;
  Trdate: any;
  Opono: any;
  Opodate: any;
  Shdate: any;
  Eadate: any;
  Compno: any;
  Company: any;
  Lnno: any;
  Itemno: any;
  Desc1: any;
  Desc2: any;
  Ordqty: any;
  Shiqty: any;
  Price: any;
  Lnamt: any;
  Fob1: any;
  Cost: any;
};

type RpoDetailResp = {
  ok: boolean;
  message?: string;
  head: any;
  containers: { Contno: any }[];
  lines: RpoLine[];
};

function formatDate(v: any): string {
  if (!v) return "";
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  return String(v);
}

function toNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(v: any, digits = 2): string {
  const n = toNumber(v);
  return n === null ? "" : `$${n.toFixed(digits)}`;
}

async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
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

export default function RpoDetail() {
  const { trno } = useParams();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lines, setLines] = useState<RpoLine[]>([]);
  const [head, setHead] = useState<any>(null);
  const [containers, setContainers] = useState<{ Contno: any }[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      if (!trno) {
        setErr("Missing RPO no.");
        setLines([]);
        setHead(null);
        setContainers([]);
        return;
      }

      setLoading(true);
      setErr("");
      setLines([]);
      setHead(null);
      setContainers([]);

      try {
        const data = await apiGet<RpoDetailResp>(
          `/api/purchase/rpo/detail?trno=${encodeURIComponent(trno)}`,
          controller.signal
        );
        if (!data?.ok) throw new Error(data?.message || "Load failed");
        setLines(Array.isArray(data.lines) ? data.lines : []);
        setHead(data.head || null);
        setContainers(Array.isArray(data.containers) ? data.containers : []);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setErr(String(e?.message || e || "Unknown error"));
        setLines([]);
        setHead(null);
        setContainers([]);
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [trno]);

  const totalOrdqty = lines.reduce((sum, r) => sum + (Number(r.Ordqty) || 0), 0);
  const totalAmount = lines.reduce((sum, r) => sum + (Number(r.Lnamt) || 0), 0);

  return (
    <div className="purchase-page progressive-enter">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-title">RPO Detail</div>
        <div className="purchase-toolbar-actions">
          <button className="purchase-btn" type="button">
            EXPORT
          </button>
        </div>
      </div>

      {err ? <div className="message-box">{err}</div> : null}

      <div className="purchase-summary-box" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div>
              <strong>Compno:</strong> {head?.Compno ?? ""}
            </div>
            <div>
              <strong>Total Ordqty:</strong> {totalOrdqty}
            </div>
            <div>
              <strong>Total Amount:</strong> {money(totalAmount)}
            </div>
          </div>
          <div>
            <div>
              <strong>RPO No:</strong> {trno || ""}
            </div>
            <div>
              <strong>RPO Date:</strong> {head?.Trdate ? String(head.Trdate).slice(0, 10) : ""}
            </div>
            <div>
              <strong>Container No:</strong>{" "}
              {containers.length ? containers.map((c) => c.Contno).filter(Boolean).join(", ") : ""}
            </div>
          </div>
        </div>
      </div>

      <table className="purchase-detail-table">
        <thead>
          <tr>
            <th>#</th>
            <th>RPO No.</th>
            <th>OPO No.</th>
            <th>Compno</th>
            <th>ITEM ID</th>
            <th>Desc1</th>
            <th>Desc2</th>
            <th className="opo-ordqty-col">Ordqty</th>
            <th className="opo-ordqty-col">Shiqty</th>
            <th>Price</th>
            <th>Lnamt</th>
            <th>Fob1</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={14} style={{ textAlign: "center" }}>
                加载中...
              </td>
            </tr>
          ) : lines.length ? (
            lines.map((row, idx) => (
              <tr key={`${row.Trno ?? ""}-${row.Lnno ?? ""}-${idx}`}>
                <td style={{ textAlign: "right" }}>{idx + 1}</td>
                <td>{row.Trno ?? ""}</td>
                <td>{row.Opono ?? ""}</td>
                <td>{row.Compno ?? ""}</td>
                <td>{row.Itemno ?? ""}</td>
                <td>{row.Desc1 ?? ""}</td>
                <td>{row.Desc2 ?? ""}</td>
                <td className="opo-ordqty-col">{row.Ordqty ?? ""}</td>
                <td className="opo-ordqty-col">{row.Shiqty ?? ""}</td>
                <td style={{ textAlign: "right" }}>{money(row.Price)}</td>
                <td style={{ textAlign: "right" }}>{money(row.Lnamt)}</td>
                <td style={{ textAlign: "right" }}>{money(row.Fob1)}</td>
                <td style={{ textAlign: "right" }}>{money(row.Cost)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={14} style={{ textAlign: "center" }}>
                无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
