const CACHE_PREFIX = "product_cache_v1";
const TTL_MS = 5 * 60 * 1000;

type CacheRow<T> = {
  ts: number;
  data: T;
};

function key(itemId: string, kind: string) {
  return `${CACHE_PREFIX}:${itemId}:${kind}`;
}

export function setProductCache<T>(itemId: string, kind: string, data: T) {
  try {
    const row: CacheRow<T> = { ts: Date.now(), data };
    sessionStorage.setItem(key(itemId, kind), JSON.stringify(row));
  } catch {
    // ignore
  }
}

export function getProductCache<T>(itemId: string, kind: string): T | null {
  try {
    const raw = sessionStorage.getItem(key(itemId, kind));
    if (!raw) return null;
    const row = JSON.parse(raw) as CacheRow<T>;
    if (!row || typeof row.ts !== "number") return null;
    if (Date.now() - row.ts > TTL_MS) return null;
    return row.data;
  } catch {
    return null;
  }
}

