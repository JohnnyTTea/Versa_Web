import { setTimeout as delay } from 'node:timers/promises';
import { emptyEvidence, type PageEvidence } from './sku-fitment';
import type { fetchProductEvidence } from './sku-fitment-fetch';

const MARKETPLACE = 'ATVPDKIKX0DER';
const API = 'https://sellingpartnerapi-na.amazon.com';
const PRICING_PATH = '/products/pricing/2022-05-01/items/competitiveSummary';
const CATALOG_SOURCE = 'Amazon SP-API Catalog Items';
const PRICE_SOURCE = 'Amazon SP-API Featured Offer';
const BATCH_SIZE = 20;

type FetchPage = typeof fetchProductEvidence;
type Credentials = { clientId: string; clientSecret: string; refreshToken: string };
type CatalogItem = {
  asin: string;
  attributes?: Record<string, { marketplace_id?: string; value?: unknown }[]>;
  summaries?: { marketplaceId: string; itemName?: string; color?: string }[];
  relationships?: { marketplaceId: string; relationships?: { type: string; parentAsins?: string[]; childAsins?: string[] }[] }[];
};
type Offer = { condition?: string; listingPrice?: { amount?: number; currencyCode?: string } };
type PriceResponse = {
  status?: { statusCode?: number };
  body?: { asin?: string; marketplaceId?: string; featuredBuyingOptions?: { buyingOptionType?: string; segmentedFeaturedOffers?: Offer[] }[] };
};

class AmazonApiError extends Error {
  constructor(readonly operation: string, readonly status: number, readonly retryAt?: string) {
    super(`${operation} 返回 HTTP ${status}`);
  }
}

function requestRetryAt(header: string | null) {
  const now = Date.now();
  const value = header?.trim() || '';
  const time = /^\d+$/.test(value) ? now + Number(value) * 1_000 : Date.parse(value);
  return new Date(Number.isFinite(time) && time > now && time <= 8.64e15 ? time : now + 60_000).toISOString();
}

function pace(minimumMs: number) {
  let tail = Promise.resolve();
  let next = 0;
  let cooldown: AmazonApiError | undefined;
  return <T>(request: () => Promise<T>) => {
    const result = tail.then(async () => {
      if (cooldown?.retryAt && Date.parse(cooldown.retryAt) > Date.now()) throw cooldown;
      if (next > Date.now()) await delay(next - Date.now());
      next = Date.now() + minimumMs;
      try {
        return await request();
      } catch (error) {
        if (error instanceof AmazonApiError && error.retryAt) cooldown = error;
        throw error;
      }
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

function amazonAsin(link: string) {
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !/(^|\.)amazon\.com$/i.test(url.hostname)) return undefined;
    return url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([a-z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase();
  } catch {
    return undefined;
  }
}

async function requestJson<T>(url: string, operation: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new AmazonApiError(operation, 503, requestRetryAt(null));
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const retryAt = response.status === 429 || response.status >= 500 ? requestRetryAt(response.headers.get('retry-after')) : undefined;
    throw new AmazonApiError(operation, response.status, retryAt);
  }
  return await response.json() as T;
}

function createAmazonClient({ clientId, clientSecret, refreshToken }: Credentials) {
  let token: { value: string; freshUntil: number } | undefined;
  let refreshing: Promise<string> | undefined;
  const catalogRequest = pace(550);
  const priceRequest = pace(31_000);

  async function accessToken() {
    if (token && token.freshUntil > Date.now()) return token.value;
    refreshing ??= requestJson<{ access_token?: string; expires_in?: number }>('https://api.amazon.com/auth/o2/token', 'Amazon 鉴权', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
    }).then(data => {
      if (!data.access_token) throw new Error('Amazon 鉴权成功响应缺少访问 Token');
      token = { value: data.access_token, freshUntil: Date.now() + Math.max(0, (Number(data.expires_in) - 60) * 1_000) };
      return token.value;
    }).finally(() => { refreshing = undefined; });
    return refreshing;
  }

  async function api<T>(path: string, operation: string, body?: unknown) {
    const access = await accessToken();
    return requestJson<T>(API + path, operation, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-amz-access-token': access, Accept: 'application/json', 'Content-Type': 'application/json',
        'x-amz-date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
        'User-Agent': `VersaFitment/1.0 (Language=JavaScript; Platform=Node.js/${process.versions.node})` },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  return {
    catalog(asins: string[]) {
      const query = new URLSearchParams({ identifiers: asins.join(','), identifiersType: 'ASIN', marketplaceIds: MARKETPLACE,
        includedData: 'attributes,summaries,relationships', pageSize: String(BATCH_SIZE) });
      return catalogRequest(() => api<{ items: CatalogItem[] }>(`/catalog/2022-04-01/items?${query}`, 'Amazon 商品目录'));
    },
    prices(asins: string[]) {
      return priceRequest(() => api<{ responses: PriceResponse[] }>(`/batches${PRICING_PATH}`, 'Amazon 报价', {
        requests: asins.map(asin => ({ asin, marketplaceId: MARKETPLACE, includedData: ['featuredBuyingOptions'],
          method: 'GET', uri: PRICING_PATH })),
      }));
    },
  };
}

function catalogEvidence(asin: string, item?: CatalogItem): PageEvidence {
  const page = emptyEvidence(`https://www.amazon.com/dp/${asin}`, 'not_product', 'Amazon 商品目录未返回此 ASIN 的商品资料');
  page.sources = [CATALOG_SOURCE];
  const summary = item?.summaries?.find(entry => entry.marketplaceId === MARKETPLACE);
  const relationship = item?.relationships?.find(entry => entry.marketplaceId === MARKETPLACE)?.relationships ?? [];
  const variations = relationship.filter(entry => entry.type === 'VARIATION');
  if (!summary?.itemName) return page;
  const field = (name: string) => (item?.attributes?.[name] ?? [])
    .filter(entry => !entry.marketplace_id || entry.marketplace_id === MARKETPLACE)
    .map(entry => entry.value).filter((value): value is string => typeof value === 'string' && !!value.trim());
  const color = [...new Set([...field('color'), ...field('color_name')])];
  const variantStatus = variations.some(entry => entry.childAsins?.length) ? 'unconfirmed' :
    variations.some(entry => entry.parentAsins?.length) ? 'selected' : 'single_product';
  const selectedVariant = color.length === 1 ? color[0] : summary.color || '';
  return { ...page, title: summary.itemName, status: 'ok', reason: '', variantStatus,
    selectedVariant: variantStatus === 'unconfirmed' ? '' : selectedVariant,
    text: [summary.itemName, ...field('bullet_point'), ...field('product_description'), ...field('material')].join('\n') };
}

function failedEvidence(asin: string, error: unknown) {
  const failure = error instanceof AmazonApiError ? error : undefined;
  const status = failure?.status === 429 ? 'rate_limited' : failure?.retryAt ? 'temporarily_unavailable' : 'fetch_failed';
  return { ...emptyEvidence(`https://www.amazon.com/dp/${asin}`, status, failure?.message || '无法读取 Amazon SP-API 商品资料'),
    sources: [CATALOG_SOURCE], httpStatus: failure?.status, retryAt: failure?.retryAt };
}

export const usesAmazonCatalog = (page: PageEvidence) => page.sources?.includes(CATALOG_SOURCE);

function addPrice(page: PageEvidence, result: PriceResponse | undefined, quotedAt: string) {
  const status = result?.status?.statusCode;
  if (status === 429 || (status !== undefined && status >= 500)) {
    page.retryAt = requestRetryAt(null);
    page.priceReason = `Amazon SP-API 报价返回 HTTP ${status}，待补查`;
    return;
  }
  const offers = status === 200 ? (result?.body?.featuredBuyingOptions ?? [])
    .filter(option => option.buyingOptionType === 'New')
    .flatMap(option => option.segmentedFeaturedOffers ?? []).filter(offer => offer.condition === 'New') : [];
  const amounts = offers.map(offer => offer.listingPrice?.currencyCode === 'USD' &&
    Number.isFinite(offer.listingPrice.amount) && Number(offer.listingPrice.amount) > 0 ? offer.listingPrice.amount : undefined);
  if (offers.length && amounts.every(amount => amount !== undefined) && new Set(amounts).size === 1) {
    Object.assign(page, { price: amounts[0]!.toFixed(2), currency: 'USD', priceKind: 'featured_offer',
      priceSource: PRICE_SOURCE, priceFetchedAt: quotedAt });
    return;
  }
  page.priceReason = status && status !== 200 ? `Amazon SP-API 报价返回 HTTP ${status}` :
    offers.length ? 'Amazon SP-API 返回的推荐报价无法确定为单一价格' : 'Amazon SP-API 未返回新品推荐报价';
}

let client: ReturnType<typeof createAmazonClient> | undefined;

export function amazonFitmentFetcher(links: string[], fallback: FetchPage): FetchPage {
  const clientId = process.env.FITMENT_AMAZON_CLIENT_ID?.trim();
  const clientSecret = process.env.FITMENT_AMAZON_CLIENT_SECRET?.trim();
  const refreshToken = process.env.FITMENT_AMAZON_SELLER_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return fallback;
  const amazon = client ??= createAmazonClient({ clientId, clientSecret, refreshToken });
  const asins = [...new Set(links.flatMap(link => amazonAsin(link) ?? []))];
  const batches = new Map<string, () => Promise<Map<string, PageEvidence>>>();
  for (let index = 0; index < asins.length; index += BATCH_SIZE) {
    const batch = asins.slice(index, index + BATCH_SIZE);
    let pending: Promise<Map<string, PageEvidence>> | undefined;
    for (const asin of batch) batches.set(asin, () => pending ??= loadBatch(amazon, batch));
  }
  return async link => {
    const asin = amazonAsin(link);
    const batch = asin && batches.get(asin);
    if (!batch) return fallback(link);
    const page = (await batch()).get(asin)!;
    return { page: { ...page, requestedUrl: link }, html: '' };
  };
}

async function loadBatch(amazon: ReturnType<typeof createAmazonClient>, asins: string[]) {
  const results = new Map<string, PageEvidence>();
  try {
    const data = await amazon.catalog(asins);
    const items = new Map(data.items.map(item => [item.asin, item]));
    for (const asin of asins) results.set(asin, catalogEvidence(asin, items.get(asin)));
  } catch (error) {
    for (const asin of asins) results.set(asin, failedEvidence(asin, error));
    return results;
  }
  const quoteAsins = asins.filter(asin => {
    const page = results.get(asin)!;
    return page.status === 'ok' && page.variantStatus !== 'unconfirmed';
  });
  if (!quoteAsins.length) return results;
  try {
    const data = await amazon.prices(quoteAsins);
    const quotedAt = new Date().toISOString();
    const prices = new Map(data.responses.filter(entry => entry.body?.marketplaceId === MARKETPLACE)
      .map(entry => [entry.body?.asin, entry]));
    for (const asin of quoteAsins) addPrice(results.get(asin)!, prices.get(asin), quotedAt);
  } catch (error) {
    for (const asin of quoteAsins) {
      const page = results.get(asin)!;
      page.priceReason = error instanceof AmazonApiError ? error.message : '无法读取 Amazon SP-API 报价';
      if (error instanceof AmazonApiError) page.retryAt = error.retryAt;
    }
  }
  return results;
}
