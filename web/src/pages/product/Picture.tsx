import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type PictureResp = {
  ok: boolean;
  message?: string;
  picfile1?: any;
  picfile2?: any;
};

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

  useEffect(() => {
    if (!itemId) {
      setErr("");
      setPicfile1("");
      setPicfile2("");
      return;
    }

    const controller = new AbortController();

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
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setErr(String(e?.message || e || "Unknown error"));
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

      <div style={{ marginBottom: 60 }} />
    </div>
  );
}
