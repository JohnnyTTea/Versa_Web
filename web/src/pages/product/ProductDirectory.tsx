import { useEffect, useRef, useState } from "react";
import "../../styles/product.css";

type ProductDirectoryRow = {
  Itemno: string;
  Type: string | null;
  Desc1: string | null;
  Desc2: string | null;
  Bin: string | null;
  Onhand: number | string | null;
  Sboxlen: number | string | null;
  Sboxwid: number | string | null;
  Sboxhei: number | string | null;
  Sboxwei: number | string | null;
  CreatedDate: string | null;
};

type ProductDirectoryProps = {
  modal?: boolean;
  onClose?: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export default function ProductDirectory({ modal = false, onClose }: ProductDirectoryProps) {
  const [rows, setRows] = useState<ProductDirectoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    if (modal) searchRef.current?.focus();
  }, [modal]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "50", search: query });

    async function loadDirectory() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/products/directory?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data?.ok) {
          throw new Error(data?.message || `Directory HTTP ${response.status}`);
        }
        const nextRows = Array.isArray(data.rows) ? data.rows : [];
        setRows(nextRows);
        hasMoreRef.current = Boolean(data.hasMore);
        setHasMore(hasMoreRef.current);
      } catch (cause: unknown) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDirectory();
    return () => controller.abort();
  }, [page, query, reload]);

  const content = (
    <section className={`product-directory${modal ? " product-directory--modal-content" : ""}`} aria-labelledby="product-directory-title">
      <div className="product-directory-heading">
        <div>
          <h2 id="product-directory-title">Product Directory</h2>
          <p>{rows.length.toLocaleString()} products loaded</p>
        </div>
        <form
          className="product-directory-search"
          onSubmit={(event) => {
            event.preventDefault();
            const nextQuery = search.trim();
            setRows([]);
            setPage(1);
            hasMoreRef.current = true;
            setHasMore(true);
            setQuery(nextQuery);
            setReload((current) => current + 1);
          }}
        >
          <input
            ref={searchRef}
            aria-label="Search product directory"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search SKU or Description1"
          />
          <button type="submit">Regex Search</button>
        </form>
        <p className="product-directory-search-hint">
          Regex: <code>^BLF</code> matches SKUs starting with BLF; <code>BLF</code> matches it anywhere in Itemno or Desc1.
        </p>
      </div>

      {error ? (
        <div className="product-directory-error">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              hasMoreRef.current = true;
              setHasMore(true);
              setReload((current) => current + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      <div className="product-directory-table-wrap">
        <table className="product-directory-table">
          <thead>
            <tr>
              <th>Index</th>
              <th>Itemno</th>
              <th>Type</th>
              <th>Desc1</th>
              <th>Desc2</th>
              <th>Bin</th>
              <th>Onhand</th>
              <th>Created Date</th>
              <th>Sboxlen</th>
              <th>Sboxwid</th>
              <th>Sboxhei</th>
              <th>Sboxwei</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12}>Loading products...</td></tr>
            ) : rows.length ? (
              rows.map((row, index) => (
                <tr key={row.Itemno}>
                  <td>{(page - 1) * 50 + index + 1}</td>
                  <td>{row.Itemno}</td>
                  <td>{row.Type || ""}</td>
                  <td>{row.Desc1 || ""}</td>
                  <td>{row.Desc2 || ""}</td>
                  <td>{row.Bin || ""}</td>
                  <td>{row.Onhand ?? ""}</td>
                  <td>{formatDate(row.CreatedDate)}</td>
                  <td>{row.Sboxlen ?? ""}</td>
                  <td>{row.Sboxwid ?? ""}</td>
                  <td>{row.Sboxhei ?? ""}</td>
                  <td>{row.Sboxwei ?? ""}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={12}>No products found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="product-directory-pagination">
        <button type="button" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page <= 1 || loading}>
          Previous
        </button>
        <span>Page {page}</span>
        <button type="button" onClick={() => setPage((currentPage) => currentPage + 1)} disabled={!hasMore || loading}>
          Next
        </button>
      </div>
    </section>
  );

  if (!modal) return <div className="progressive-enter">{content}</div>;

  return (
    <div className="product-directory-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <div className="product-directory-dialog" role="dialog" aria-modal="true" aria-labelledby="product-directory-title">
        <div className="product-directory-modal-heading">
          <span>Product</span>
          <button type="button" className="product-directory-close" onClick={onClose} aria-label="Close product directory">×</button>
        </div>
        {content}
      </div>
    </div>
  );
}
