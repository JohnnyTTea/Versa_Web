import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { getProductCache, setProductCache } from "./productCache";
import labelQr from "../../assets/product-label-qr.png";
import labelHandling from "../../assets/product-label-handling.png";
import labelLogo from "../../assets/product-label-logo.png";

type PictureResp = {
  ok: boolean;
  message?: string;
  picfile1?: string | null;
  picfile2?: string | null;
};

type ProductSummaryResp = {
  ok: boolean;
  message?: string;
  product?: { Desc1?: string | null; Desc2?: string | null } | null;
};

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function code128BValues(value: string) {
  const text = Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code <= 126 ? char : "?";
  }).join("").slice(0, 24) || "UNKNOWN";
  const values = Array.from(text, (char) => Math.max(0, Math.min(94, char.charCodeAt(0) - 32)));
  const checksum = (104 + values.reduce((sum, item, index) => sum + item * (index + 1), 0)) % 103;
  return [104, ...values, checksum, 106];
}

function Barcode({ value }: { value: string }) {
  const values = code128BValues(value);
  let x = 10;
  const bars: ReactElement[] = [];

  values.forEach((code, codeIndex) => {
    const pattern = CODE128_PATTERNS[code];
    let isBar = true;
    Array.from(pattern).forEach((width, widthIndex) => {
      const size = Number(width) * 2;
      if (isBar) {
        bars.push(<rect key={`${codeIndex}-${widthIndex}`} x={x} y="0" width={size} height="54" fill="#111827" />);
      }
      x += size;
      isBar = !isBar;
    });
  });

  return (
    <svg className="product-label-barcode" viewBox={`0 0 ${x + 10} 54`} role="img" aria-label={`Barcode for ${value}`}>
      <rect width="100%" height="100%" fill="#ffffff" />
      {bars}
    </svg>
  );
}

function labelText(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function printProductLabel() {
  const label = document.querySelector<HTMLElement>(".product-label");
  if (!label) return;

  const printWindow = window.open("", "_blank", "width=900,height=600");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html><head><title>Product Label</title>
    <style>
      @page { size: 6in 4in; margin: 0; }
      html, body { width: 6in; height: 4in; margin: 0; padding: 0; overflow: hidden; }
      body { background: #fff; }
      .product-label {
        width: 6in; height: 4in; box-sizing: border-box; padding: 0.2in 0.28in;
        overflow: hidden; background: #fff; color: #111827; text-align: center;
        font-family: Arial, Helvetica, sans-serif;
      }
      .product-label-sku { min-height: 0.38in; font-size: 27px; line-height: 1.05; font-weight: 800; overflow-wrap: anywhere; }
      .product-label-barcode { display: block; width: 100%; height: 0.56in; margin: 0.05in 0 0.08in; }
      .product-label-description { min-height: 0.38in; padding: 0.06in 0; border-top: 1px dashed #6b7280; border-bottom: 1px dashed #6b7280; font-size: 15px; line-height: 1.25; overflow-wrap: anywhere; }
      .product-label-branding { display: flex; align-items: center; justify-content: center; gap: 0.24in; height: 1.38in; margin-top: 0.12in; }
      .product-label-qr { width: 1.15in; height: 1.15in; object-fit: contain; }
      .product-label-branding-right { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.08in; width: 2.2in; }
      .product-label-handling { width: 1.6in; height: 0.72in; object-fit: contain; }
      .product-label-logo-image { width: 2.2in; height: auto; max-height: 0.42in; object-fit: contain; }
    </style></head><body>${label.outerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
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

export default function ProductPicture() {
  const [sp] = useSearchParams();
  const itemId = (sp.get("id") || "").trim();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [picfile1, setPicfile1] = useState("");
  const [picfile2, setPicfile2] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!itemId) {
      setErr("");
      setPicfile1("");
      setPicfile2("");
      setDescription("");
      return;
    }

    const controller = new AbortController();
    const cached = getProductCache<PictureResp>(itemId, "pictures");
    if (cached?.ok) {
      setPicfile1(cached?.picfile1 ? String(cached.picfile1) : "");
      setPicfile2(cached?.picfile2 ? String(cached.picfile2) : "");
    }
    const summaryCached = getProductCache<ProductSummaryResp>(itemId, "summary-basic");
    if (summaryCached?.ok) {
      const product = summaryCached.product;
      setDescription([labelText(product?.Desc1), labelText(product?.Desc2)].filter(Boolean).join(" "));
    }

    const run = async () => {
      setLoading(true);
      setErr("");

      try {
        const p = new URLSearchParams();
        p.set("id", itemId);
        const data = await apiGet<PictureResp>(`/api/products/pictures?${p.toString()}`, controller.signal);

        if (!data?.ok) throw new Error(data?.message || "Load failed");
        setPicfile1(data?.picfile1 ? String(data.picfile1) : "");
        setPicfile2(data?.picfile2 ? String(data.picfile2) : "");
        setProductCache(itemId, "pictures", data);

        const summary = await apiGet<ProductSummaryResp>(`/api/products/summary-basic?id=${encodeURIComponent(itemId)}`, controller.signal);
        if (summary?.ok) {
          const product = summary.product;
          setDescription([labelText(product?.Desc1), labelText(product?.Desc2)].filter(Boolean).join(" "));
          setProductCache(itemId, "summary-basic", summary);
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(e instanceof Error ? e.message : String(e || "Unknown error"));
        setPicfile1("");
        setPicfile2("");
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [itemId]);

  const baseUrl = "http://192.168.26.60/Items/";
  const pic1 = useMemo(
    () => (picfile1 ? `${baseUrl}${encodeURIComponent(picfile1)}` : ""),
    [picfile1],
  );
  const pic2 = useMemo(
    () => (picfile2 ? `${baseUrl}${encodeURIComponent(picfile2)}` : ""),
    [picfile2],
  );

  return (
    <div className="progressive-enter">
      <h3>Picture Display</h3>

      {err ? <div className="message-box">{err}</div> : null}

      {loading ? (
        <p>
          <em>加载中...</em>
        </p>
      ) : pic1 || pic2 ? (
        <div className="product-image-row">
          {pic1 ? (
            <div className="product-image">
              <a href={pic1} target="_blank" rel="noreferrer">
                <img src={pic1} alt="Picture 1 not available" />
              </a>
              <div>Picture 1</div>
            </div>
          ) : null}

          {pic2 ? (
            <div className="product-image">
              <a href={pic2} target="_blank" rel="noreferrer">
                <img src={pic2} alt="Picture 2 not available" />
              </a>
              <div>Picture 2</div>
            </div>
          ) : null}
        </div>
      ) : (
        <p>
          <em>No pictures available</em>
        </p>
      )}

      <section className="product-label-section" aria-labelledby="product-label-title">
        <div className="product-label-toolbar">
          <div>
            <h3 id="product-label-title">Product Label</h3>
            <p>6 × 4 inch landscape label for printing</p>
          </div>
          <button className="print-label-btn" type="button" onClick={printProductLabel} disabled={!itemId}>
            Print Label
          </button>
        </div>

        {itemId ? (
          <div className="product-label-preview">
            <div className="product-label">
              <div className="product-label-sku">{itemId}</div>
              <Barcode value={itemId} />
              <div className="product-label-description">{description || "No description available"}</div>
              <div className="product-label-branding">
                <img className="product-label-qr" src={labelQr} alt="Product QR code" />
                <div className="product-label-branding-right">
                  <img className="product-label-handling" src={labelHandling} alt="Product handling symbols" />
                  <img className="product-label-logo-image" src={labelLogo} alt="IKON MOTORSPORTS" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="product-label-empty">Search for a SKU to generate a product label.</p>
        )}
      </section>

      <div style={{ marginBottom: 60 }} />
    </div>
  );
}
