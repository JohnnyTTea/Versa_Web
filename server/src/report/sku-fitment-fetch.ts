import { emptyEvidence, parseProductPage, type PageEvidence } from './sku-fitment';

const MAX_BYTES = 3 * 1024 * 1024;
function retryTime(value: string | null) {
  if (!value) return undefined;
  const timestamp = /^\d+$/.test(value.trim()) ? Date.now() + Number(value) * 1_000 : Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now() && timestamp <= 8.64e15 ? new Date(timestamp).toISOString() : undefined;
}

function failedPage(status: number, retryAfter: string | null, html: string, url: string): PageEvidence {
  const temporary = status === 429 || status === 503;
  const challenge = temporary && !!html && parseProductPage(html, url).status === 'blocked';
  const pageStatus: PageEvidence['status'] = [404, 410].includes(status) ? 'unavailable' :
    challenge || [401, 403].includes(status) ? 'blocked' :
      status === 429 ? 'rate_limited' : status === 503 ? 'temporarily_unavailable' : 'fetch_failed';
  const reason = pageStatus === 'rate_limited' ? '参考站点暂时限制请求频率（HTTP 429）' :
    pageStatus === 'temporarily_unavailable' ? '参考站点暂时不可用（HTTP 503）' :
      challenge ? '参考页面要求验证码或访问验证' : `参考页面返回 HTTP ${status}，未能核实商品资料`;
  return { ...emptyEvidence(url, pageStatus, reason), httpStatus: status, retryAt: retryTime(retryAfter) };
}

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
  let retryAfter: string | null = null;
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetch(finalUrl, {
        redirect: 'manual', signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VersaProductReview/2.0)', Accept: 'text/html,application/xhtml+xml' },
      });
      httpStatus = response.status;
      retryAfter = response.headers.get('retry-after');
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirects === 5) throw new Error('重定向次数过多或缺少目标地址');
        finalUrl = new URL(location, finalUrl).href;
        if (!allowedUrl(finalUrl)) throw new Error('重定向到了非支持商品站点');
        continue;
      }
      const contentType = response.headers.get('content-type') || '';
      const nonHtml = contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType);
      const tooLarge = Number(response.headers.get('content-length') || 0) > MAX_BYTES;
      if (!response.ok && (nonHtml || tooLarge)) {
        await response.body?.cancel();
        return { page: { ...failedPage(response.status, retryAfter, '', finalUrl), requestedUrl }, html: '' };
      }
      if (nonHtml) {
        await response.body?.cancel(); throw new Error('参考链接没有返回商品 HTML 页面');
      }
      if (tooLarge) {
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
      const page = response.ok ? parseProductPage(html, finalUrl) : failedPage(response.status, retryAfter, html, finalUrl);
      const productId = (value: string) => new URL(value).pathname.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})|\/itm\/(?:[^/]+\/)?(\d+)/i)?.slice(1).find(Boolean);
      const requestedId = productId(requestedUrl), finalId = productId(finalUrl);
      if (page.status === 'ok' && requestedId && finalId && requestedId !== finalId) {
        page.status = 'ambiguous'; page.reason = '重定向后的商品编号与原参考链接不同，需人工确认商品';
      }
      return { page: { ...page, requestedUrl, finalUrl, httpStatus }, html };
    }
    throw new Error('无法完成参考链接请求');
  } catch (error) {
    if (httpStatus && [401, 403, 429, 503].includes(httpStatus)) {
      return { page: { ...failedPage(httpStatus, retryAfter, '', finalUrl), requestedUrl }, html: '' };
    }
    const reason = signal.aborted ? '参考页面读取超时，需人工复核' : `参考页面读取失败：${error instanceof Error ? error.message : String(error)}`;
    return { page: { ...emptyEvidence(requestedUrl, 'fetch_failed', reason), finalUrl, httpStatus }, html: '' };
  }
}
