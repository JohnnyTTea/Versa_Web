import { emptyEvidence, parseProductPage, type PageEvidence } from './sku-fitment';

const MAX_BYTES = 3 * 1024 * 1024;
function allowedUrl(value: string) {
  try {
    const url = new URL(value);
    const allowed = /^(?:[a-z0-9-]+\.)*(?:amazon\.(?:com|ca|co\.uk|de|com\.au)|ebay\.(?:com|ca|co\.uk|de|com\.au)|temu\.com)$/i.test(url.hostname);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && allowed;
  } catch { return false; }
}

export async function fetchProductEvidence(requestedUrl: string): Promise<{ page: PageEvidence; html: string }> {
  if (!allowedUrl(requestedUrl)) return { page: emptyEvidence(requestedUrl, 'invalid_url', '请提供 Amazon、eBay 或 Temu 的 HTTPS 商品链接'), html: '' };
  let finalUrl = requestedUrl;
  const signal = AbortSignal.timeout(20000);
  let httpStatus: number | undefined;
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetch(finalUrl, {
        redirect: 'manual', signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VersaProductReview/2.0)', Accept: 'text/html,application/xhtml+xml' },
      });
      httpStatus = response.status;
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirects === 5) throw new Error('重定向次数过多或缺少目标地址');
        finalUrl = new URL(location, finalUrl).href;
        if (!allowedUrl(finalUrl)) throw new Error('重定向到了非支持商品站点');
        continue;
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        await response.body?.cancel(); throw new Error('参考链接没有返回商品 HTML 页面');
      }
      if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) {
        await response.body?.cancel(); throw new Error('参考页面过大，需人工复核');
      }
      let html = '';
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let total = 0;
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            total += value.byteLength;
            if (total > MAX_BYTES) throw new Error('参考页面过大，需人工复核');
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        html = Buffer.concat(chunks).toString('utf8');
      } else html = await response.text();
      let page: PageEvidence;
      if (!response.ok) {
        const status = [404, 410].includes(response.status) ? 'unavailable' : [401, 403, 429, 503].includes(response.status) ? 'blocked' : 'fetch_failed';
        page = emptyEvidence(requestedUrl, status, `参考页面返回 HTTP ${response.status}，未能核实商品资料`);
      } else page = parseProductPage(html, finalUrl);
      const productId = (value: string) => new URL(value).pathname.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})|\/itm\/(?:[^/]+\/)?(\d+)/i)?.slice(1).find(Boolean);
      const requestedId = productId(requestedUrl), finalId = productId(finalUrl);
      if (page.status === 'ok' && requestedId && finalId && requestedId !== finalId) {
        page.status = 'ambiguous'; page.reason = '重定向后的商品编号与原参考链接不同，需人工确认商品';
      }
      return { page: { ...page, requestedUrl, finalUrl, httpStatus }, html };
    }
    throw new Error('无法完成参考链接请求');
  } catch (error) {
    const reason = signal.aborted ? '参考页面读取超时，需人工复核' : `参考页面读取失败：${error instanceof Error ? error.message : String(error)}`;
    return { page: { ...emptyEvidence(requestedUrl, 'fetch_failed', reason), finalUrl, httpStatus }, html: '' };
  }
}
