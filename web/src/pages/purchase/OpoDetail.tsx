import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "../../styles/purchase.css";

type OpoLine = {
  Opono: any;
  Compno: any;
  Itemno: any;
  Adino: any;
  Refno: any;
  Desc1: any;
  Ordqty: any;
  Price: any;
  Lnamt: any;
  Fob1: any;
  Cost: any;
};

type OpoDetailResp = {
  ok: boolean;
  message?: string;
  head: any;
  containers: { Contno: any }[];
  lines: OpoLine[];
};

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

export default function OpoDetail() {
  const { opono } = useParams();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lines, setLines] = useState<OpoLine[]>([]);
  const [head, setHead] = useState<any>(null);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      if (!opono) {
        setErr("Missing OPO no.");
        setLines([]);
        setHead(null);
        return;
      }

      setLoading(true);
      setErr("");
      setLines([]);
      setHead(null);

      try {
        const data = await apiGet<OpoDetailResp>(
          `/api/purchase/opo/detail?opono=${encodeURIComponent(opono)}`,
          controller.signal
        );
        if (!data?.ok) throw new Error(data?.message || "Load failed");
        setLines(Array.isArray(data.lines) ? data.lines : []);
        setHead(data.head || null);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setErr(String(e?.message || e || "Unknown error"));
        setLines([]);
        setHead(null);
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [opono]);

  return (
    <div className="purchase-page progressive-enter">
      <div className="purchase-toolbar">
        <div className="purchase-toolbar-title">OPO Detail</div>
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
              <strong>Whse:</strong> {head?.Sstate ?? ""}
            </div>
            <div>
              <strong>Total PCS:</strong>{" "}
              {lines.reduce((sum, r) => sum + (Number(r.Ordqty) || 0), 0)}
            </div>
            <div>
              <strong>Total Amount:</strong> {head?.Totamt ? `$${Number(head.Totamt).toFixed(2)}` : ""}
            </div>
          </div>
          <div>
            <div>
              <strong>OPO No:</strong> {opono || ""}
            </div>
            <div>
              <strong>Ship Date:</strong> {head?.Shdate ? String(head.Shdate).slice(0, 10) : ""}
            </div>
            <div>
              <strong>EA Date:</strong> {head?.Eadate ? String(head.Eadate).slice(0, 10) : ""}
            </div>
          </div>
        </div>
      </div>

      <table className="purchase-detail-table">
        <thead>
          <tr>
            <th>#</th>
            <th>OPO No.</th>
            <th>Compno</th>
            <th>ITEM ID</th>
            <th>Adino</th>
            <th>Refno</th>
            <th>Desc</th>
            <th className="opo-ordqty-col">Ordqty</th>
            <th>Price</th>
            <th>Lnamt</th>
            <th>Fob1</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={12} style={{ textAlign: "center" }}>
                加载中...
              </td>
            </tr>
          ) : lines.length ? (
            lines.map((row, idx) => (
              <tr key={`${row.Opono ?? ""}-${row.Itemno ?? ""}-${idx}`}>
                <td style={{ textAlign: "right" }}>{idx + 1}</td>
                <td>{row.Opono ?? ""}</td>
                <td>{row.Compno ?? ""}</td>
                <td>{row.Itemno ?? ""}</td>
                <td>{row.Adino ?? ""}</td>
                <td>{row.Refno ?? ""}</td>
                <td>{row.Desc1 ?? ""}</td>
                <td className="opo-ordqty-col">{row.Ordqty ?? ""}</td>
                <td style={{ textAlign: "right" }}>{money(row.Price)}</td>
                <td style={{ textAlign: "right" }}>{money(row.Lnamt)}</td>
                <td style={{ textAlign: "right" }}>{money(row.Fob1)}</td>
                <td style={{ textAlign: "right" }}>{money(row.Cost)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={12} style={{ textAlign: "center" }}>
                无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
