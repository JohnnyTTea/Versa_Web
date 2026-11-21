import { load } from 'cheerio';

export const FITMENT_VERSION = 'rules-v4-fitment-resume';
export type CheckStatus = 'same' | 'different' | 'partial' | 'unknown';
export type FeatureSet = {
  text: string; make: string; model: string; partType: string;
  color: string; material: string; fitmentRange: string; chassis: string;
  body: string; trim: string; exclusions: string; universal: boolean;
  dimensions: string; quantity: string;
  sources?: Record<string, string>; conflicts?: string[];
};
export type DimensionCheck = { field: string; status: CheckStatus; internal: string; external: string; reason: string };
type PriceKind = 'displayed' | 'promotion' | 'featured_offer';
export type PageEvidence = {
  status: 'ok' | 'blocked' | 'not_requested' | 'rate_limited' | 'temporarily_unavailable' | 'unavailable' | 'not_product' | 'ambiguous' | 'fetch_failed' | 'invalid_url' | 'invalid_input';
  requestedUrl: string; finalUrl: string; fetchedAt: string; httpStatus?: number; retryAt?: string;
  title: string; text: string; sources: string[]; images: string[];
  variantStatus: 'unconfirmed' | 'single_product' | 'selected'; selectedVariant: string;
  price: string; currency: string; priceKind?: PriceKind; priceSource?: string; priceFetchedAt?: string; priceReason?: string;
  availability: string; reason: string;
};

export const needsFitmentRecheck = (page?: PageEvidence) => !!page &&
  (['blocked', 'not_requested', 'rate_limited', 'temporarily_unavailable'].includes(page.status) || (page.status === 'ok' && !!page.retryAt));
export type FitmentPriceQuote = {
  amount: string; currency: string; kind: PriceKind;
  fetchedAt: string; source: string; sourceUrl: string; selectedVariant: string;
};

export function fitmentPriceQuote(page: PageEvidence): FitmentPriceQuote | null {
  const fetchedAt = page.priceFetchedAt || page.fetchedAt;
  if (page.status !== 'ok' || !['single_product', 'selected'].includes(page.variantStatus) ||
    !/^\d+(?:\.\d+)?$/.test(page.price) || !Number.isFinite(Number(page.price)) || Number(page.price) <= 0 ||
    !/^[A-Z]{3}$/i.test(page.currency) || !Number.isFinite(Date.parse(fetchedAt))) return null;
  return {
    amount: page.price,
    currency: page.currency.toUpperCase(),
    kind: page.priceKind || 'displayed',
    fetchedAt,
    source: page.priceKind === 'featured_offer' ? page.priceSource || 'Amazon SP-API' :
      page.priceSource && page.priceSource !== '商品结构化报价' ? 'Amazon 商品购买区' : '商品结构化报价',
    sourceUrl: page.finalUrl || page.requestedUrl,
    selectedVariant: page.selectedVariant || '',
  };
}
const tidy = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
const listed = (values: string[]) => unique(values).join(' | ');
const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const values = (v: string) => v.split(' | ').filter(Boolean);
const unknown = (v: unknown) => !v || ['not specified', 'generic accessory', 'standard', 'n/a'].includes(String(v).toLowerCase());
const makePattern = /\b(?:lexus|bmw|honda|subaru|toyota|audi|nissan|ford|mercedes(?:-benz)?|volkswagen|vw|acura|mazda|tesla|mini|jaguar|cadillac|chrysler|porsche|hyundai|kia|mitsubishi|volvo|chevrolet|chevy|gmc|dodge|infiniti|scion)\b/g;
const makeAliases: Record<string, string> = { chevy: 'chevrolet', 'mercedes-benz': 'mercedes', vw: 'volkswagen', tesl: 'tesla', dodg: 'dodge', mazd: 'mazda', hond: 'honda', hd: 'honda', fd: 'ford' };
const modelMakes: Record<string, string> = { civic: 'honda', accord: 'honda', q50: 'infiniti', q60: 'infiniti', charger: 'dodge', challenger: 'dodge', miata: 'mazda', mustang: 'ford' };
const leadYear = /^((?:19|20)\d{2}|\d{2})(?:\s*(?:-\s*(?:(?:19|20)\d{2}|\d{2}|up)|\+))?(?=\s)/;
const vehicleModels = (text: string) => {
  const models: string[] = text.match(/\b(?:is\s?(?:250|300|350|500|f)|q\s?50|q\s?60|g\s?35|g\s?37|mdx|suburban|tahoe|yaris|camry|corolla|rav-?4|mr-?2|highlander|tacoma|grand highlander|civic|accord|cr-?v|hr-?v|ridgeline|pilot|integra|prelude|brz|fr-?s|wrx|impreza|lancer|genesis|elantra|ioniq\s?5|k5|charger|challenger|durango|mustang|explorer|camaro|corvette|silverado|sierra|jetta|golf|ct[45]|tx\s?(?:350|500h|550h)|350z|370z|x[1-7]|[1357][ -]series|sl-class|e-class|scion\s+(?:tc|xb)|toyota\s+86|miata|mx[ -]?5)\b/g) || [];
  for (const match of text.matchAll(/\b(?:tesla\s+(model\s*[3syx])|audi\s+((?:rs|sq|a|q|s)\s*[1-8]|tt)|bmw\s+([1-8])(?=\s+(?:[efg]\d{2}|series)\b)|mazda\s*([236]|cx[ -]?[3-9]0?))\b/g)) {
    models.push(match[1] || match[2] || (match[3] ? match[3] + 'series' : 'mazda' + match[4]));
  }
  return listed(models.map(v => v.replace(/[-\s]/g, '').replace(/^(?:scion|toyota)/, '').replace(/^mx5$/, 'miata')));
};

export function extractProductFeatures(input: string): FeatureSet {
  const text = tidy(input).toLowerCase().replace(/[–—]/g, '-')
    .replace(/\b(tesl|dodg|mazd|hond)\b/g, token => makeAliases[token])
    .replace(/\bmazda(?=[236]\b)/g, 'mazda ');
  const exclusionPattern = /(?:\bwill\s+not\s+fit|\bnot\s+(?:fit|fits|for)|\bexcept|\bexcluding|\bexcludes)\s+[^.;,)]+?(?=\s+(?:durable made|superior craftsmanship|perfect fitment|package includes)\b|[.;,)]|$)/g;
  const exclusions = listed((text.match(exclusionPattern) || []).map(tidy));
  const positive = text.replace(exclusionPattern, ' ');
  const model = vehicleModels(positive);
  const make = listed((positive.match(makePattern) || []).map(v => makeAliases[v] || v)) || modelMakes[model] || '';
  const chassis = listed(positive.match(/\b(?:e\d{2}|f\d{2}|g\d{2}|w\d{3}|r\d{3}|mk\s?(?:iv|vi?|[4-8]))\b/g) || []);
  const body = listed((positive.match(/\b(?:sedan|coupe|hatchback|wagon|convertible|cabriolet|2[ -]?(?:door|dr)|3[ -]?(?:door|dr)|4[ -]?(?:door|dr))\b/g) || []).map(v => v.replace(/[ -]/g, '').replace(/dr$/, 'door').replace('cabriolet', 'convertible')));
  const trimText = positive.replace(/\b(?:gt500|sport|base|m[- ]?sport|f[- ]?sport)\s+(?:style|sty)\b/g, ' ');
  const trims = (trimText.match(/\b(?:m3|m[ -]?sport|m[ -]?tech|widebody|scat pack|srt8?|gt350r?|gt500|nismo|f[ -]?sport|xse|xle|hybrid|sport|base|ex-l|ex|lx|lxs|se|le|z51|z06|zl1)\b/g) || []).map(v => v.replace(/[ -]/g, ''));
  if (model === 'corolla' && /\b(?:corolla|models?)\s+l(?=\s*[&,/]\s*le\b)/.test(trimText)) trims.push('base');
  const trim = listed(trims);
  const intervals: string[] = [...text.matchAll(/\b((?:19|20)\d{2})\s*(?:-\s*)?(?:up|onwards|and newer|present)\b/g)].map(m => `${m[1]}+`);
  const ceiling = new Date().getUTCFullYear() + 4;
  for (const match of text.matchAll(/\b(\d{2}|(?:19|20)\d{2})\s*(?:-|to|through)\s*(\d{2}|(?:19|20)\d{2})\b/g)) {
    const a = expandYear(match[1]), b = expandYear(match[2]);
    // Short numerical dimensions (62-66 inches) are not automotive years.
    if (a >= 1950 && a <= b && b <= ceiling) intervals.push(`${a}-${b}`);
  }
  if (!intervals.length) for (const m of text.matchAll(/\b(?:19|20)\d{2}\b/g)) {
    if (Number(m[0]) <= ceiling) intervals.push(`${m[0]}-${m[0]}`);
  }
  const types: Array<[RegExp, string]> = [
    [/\b(?:(?:front|f) (?:bumper )?(?:lip|splitter)|front lip spoiler)\b/, 'front bumper lip'],
    [/\brear (?:bumper )?lip\b/, 'rear bumper lip'], [/\bside skirts?\b/, 'side skirt'],
    [/\b(?:roof spoiler|roof wing)\b/, 'roof spoiler'],
    [/\btrunk(?: lid)? (?:spoiler|wing)\b/, 'trunk spoiler'],
    [/\b(?:spoiler|rear wing)\b/, 'spoiler'], [/\bgrill(?:e)?\b/, 'grille'],
    [/\bdiffuser\b/, 'diffuser'], [/\b(?:window (?:deflectors?|visors?)|rain guards?)\b/, 'window deflector'],
    [/\broof rack\b/, 'roof rack'], [/\bmirror covers?\b/, 'mirror cover'],
    [/\bhood\b/, 'hood'], [/\bvalance\b/, 'valance'], [/\bfront bumper\b/, 'front bumper'],
  ];
  const colors: string[] = [];
  if (/\b(?:carbon (?:fiber|fibre)[ -]?(?:look|style|pattern|print)|(?:carbon|cf)[ -]look)\b/.test(text)) colors.push('carbon fiber look');
  for (const m of text.replace(/\bblue\s+hybrid\b/g, 'hybrid').matchAll(/\b(?:(gloss(?:y)?|matte|flat|satin)\s+)?(black|white|red|blue|silver|gr[ae]y)\b/g)) colors.push(`${m[1] || ''} ${m[2]}`.trim().replace('glossy', 'gloss').replace('flat', 'matte').replace('grey', 'gray'));
  if (/\b(?:dark\s+)?smok(?:e|ed)\b/.test(text)) colors.push(/\bdark\s+smok/.test(text) ? 'dark smoke' : 'smoke');
  if (/\bchrome\b/.test(text)) colors.push('chrome');
  const materials: string[] = [];
  if (/\b(?:polyurethane|urethane|pu)\b/.test(text)) materials.push('pu');
  if (/\b(?:polypropylene|pp)\b/.test(text)) materials.push('pp');
  if (/\babs(?: plastic)?\b/.test(text)) materials.push('abs');
  if (/\bfibergla(?:ss|s)\b/.test(text)) materials.push('fiberglass');
  if (/\balumin(?:um|ium)\b/.test(text)) materials.push('aluminum');
  if (/\b(?:real|genuine|100%|dry|wet)\s+carbon (?:fiber|fibre)\b/.test(text) || /(?:material|made (?:of|from))\s*:?\s*carbon (?:fiber|fibre)\b/.test(text)) materials.push('carbon fiber');
  if (!materials.length && /\bplastic\b/.test(text)) materials.push('plastic');
  const dims = [...text.matchAll(/\b\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?(?:\s*(?:x|×)\s*\d+(?:\.\d+)?)?\s*(?:inches|inch|in\b|cm|mm)/g)].map(m => m[0]);
  const qty = [...text.matchAll(/\b(?:set\s+of\s+(\d+)|(\d+)\s*(?:pieces?|pcs?|pack))\b/g)].map(m => m[1] || m[2]);
  return { text: tidy(input), make, model, partType: types.find(([rx]) => rx.test(text))?.[1] || '',
    color: listed(colors.filter(v => v !== 'black' || !colors.some(c => /^(?:gloss|matte|satin) black$/.test(c)))), material: listed(materials), fitmentRange: listed(intervals), chassis, body, trim, exclusions,
    universal: /\b(?:universal|most vehicles|all vehicles)\b/.test(text), dimensions: listed(dims), quantity: listed(qty) };
}

export function emptyEvidence(requestedUrl: string, status: PageEvidence['status'], reason: string): PageEvidence {
  return { status, requestedUrl, finalUrl: requestedUrl, fetchedAt: new Date().toISOString(), title: '', text: '', sources: [], images: [], variantStatus: 'unconfirmed', selectedVariant: '', price: '', currency: '', availability: '', reason };
}

export function parseProductPage(html: string, url: string): PageEvidence {
  const page = emptyEvidence(url, 'not_product', '未找到当前商品的标题或商品详情，需人工复核');
  const $ = load(html);
  const documentTitle = tidy($('title').text());
  page.title = documentTitle;
  if (/robot check|captcha|access denied|verify (?:you|that)|security challenge|just a moment|pardon our interruption/i.test(documentTitle) || $('form[action*="validateCaptcha"], #captchacharacters, #challenge-running').length) {
    page.status = 'blocked'; page.reason = '参考页面要求验证码或访问验证，未读取到商品资料'; return page;
  }
  const messages = tidy($('#msgPanel, .vi-end-lb, .d-item-condition, .x-item-condition-text, [data-testid="ux-message"], .vim-ds6-message').text());
  if (/listing (?:has |is |was )?ended|no longer available|item (?:has been |is )?sold|listing sold on/i.test(`${documentTitle} ${messages}`)) {
    page.status = 'unavailable'; page.reason = '参考 listing 已结束或不可用，不能作为当前比价依据'; return page;
  }
  const products: any[] = [];
  function collect(node: any) {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!node || typeof node !== 'object') return;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some(t => /^(?:https?:\/\/schema.org\/)?Product$/i.test(String(t)))) products.push(node);
    // Never collect recommendations in ItemList or arbitrary nested objects.
    if (node['@graph']) collect(node['@graph']);
  }
  $('script[type="application/ld+json"]').each((_i, el) => { try { collect(JSON.parse($(el).text())); } catch { /* malformed metadata is not evidence */ } });
  if (products.length > 1) {
    const currentId = new URL(url).pathname.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})|\/itm\/(?:[^/]+\/)?(\d+)/i);
    const id = currentId?.[1] || currentId?.[2];
    const matching = products.filter(p => id && [p.sku, p.productID, p.url, p['@id']].some(v => String(v || '').includes(id)));
    if (matching.length !== 1) { page.status = 'ambiguous'; page.reason = '页面含多个商品，无法确认参考链接对应商品'; return page; }
    products.splice(0, products.length, matching[0]);
  }
  const product = products[0];
  const title = tidy($('#productTitle, h1.x-item-title__mainTitle, h1[itemprop="name"]').first().text()) || tidy(product?.name);
  if (!title) return page;
  page.title = title;
  const location = new URL(url);
  const requestedAsin = /^(?:www\.)?amazon\.com$/i.test(location.hostname)
    ? location.pathname.match(/\/(?:dp|gp\/product)\/([a-z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase() : undefined;
  const pageAsin = requestedAsin ? tidy($('#ASIN').first().val()).toUpperCase() : '';
  if (pageAsin && pageAsin !== requestedAsin) {
    page.status = 'ambiguous'; page.reason = '参考链接与商品购买区的 ASIN 不一致';
    return page;
  }
  const fragments = [title];
  page.sources.push(product ? 'product JSON-LD' : 'product title DOM');
  if (product) {
    for (const value of [product.description, product.color, product.material, product.size, product.model, product.category]) {
      if (typeof value === 'string') fragments.push(tidy(load(value).text()));
    }
    if (Array.isArray(product.additionalProperty)) for (const prop of product.additionalProperty) fragments.push(`${tidy(prop.name)}: ${tidy(prop.value)}`);
    const imgs = Array.isArray(product.image) ? product.image : [product.image];
    page.images.push(...imgs.map(i => typeof i === 'string' ? i : i?.url).filter(Boolean));
    const offer = Array.isArray(product.offers) ? product.offers.length === 1 ? product.offers[0] : null : product.offers;
    page.price = tidy(offer?.price); page.currency = tidy(offer?.priceCurrency); page.availability = tidy(offer?.availability);
    if (/discontinued|outofstock/i.test(page.availability)) {
      page.status = 'unavailable'; page.reason = '参考商品已停售或缺货，当前价格需人工确认';
      page.price = ''; page.currency = '';
      return page;
    }
  }
  const selectors = [
    '#feature-bullets li', '#productDescription', '#productOverview_feature_div tr',
    '#productDetails_detailBullets_sections1 tr', '#productDetails_techSpec_section_1 tr', '#detailBullets_feature_div li',
    '.ux-labels-values', '#viTabs_0_is', '[itemprop="description"]',
  ];
  for (const selector of selectors) {
    const nodes = $(selector).clone();
    nodes.find('script, style, nav, aside, .a-carousel-container, [id*="recommend"], [id*="sponsored"]').remove();
    nodes.find('td, th, dt, dd, span').append(' ');
    const text = nodes.map((_i, el) => tidy($(el).text())).get().filter(Boolean).join('\n');
    if (text) { fragments.push(text); page.sources.push(selector); }
  }
  const selected: string[] = [];
  $('[id^="variation_"] .selection').each((_i, el) => { const text = tidy($(el).text()); if (text) selected.push(text); });
  const variantSelects = $('.x-msku select, .x-msku__select-box select, select[name*="variation"], select[name*="msku"]');
  let confirmedSelects = 0;
  variantSelects.each((_i, el) => {
    const option = $(el).find('option[selected]').first(); const text = tidy(option.text());
    if (text && !/select|choose|please|^-+$|^--/i.test(text)) { selected.push(text); confirmedSelects++; }
  });
  const amazonGroups = $('[id^="variation_"]').length;
  const inlineGroups = requestedAsin ? $('[id^="inline-twister-row-"]').toArray() : [];
  const inlineSelections = inlineGroups.map(element => {
    const group = $(element);
    const swatch = group.find('.inline-twister-swatch[data-initiallyselected="true"]');
    if (swatch.length !== 1 || tidy(swatch.attr('data-asin')).toUpperCase() !== requestedAsin ||
      swatch.attr('data-initiallyunavailable') === 'true') return '';
    return tidy(group.find('.inline-twister-dim-title-value, [id^="inline-twister-expanded-dimension-text-"]').first().text());
  });
  const hasVariants = !!(product?.hasVariant || product?.isVariantOf || product?.offers?.['@type'] === 'AggregateOffer' || (Array.isArray(product?.offers) && product.offers.length > 1) || inlineGroups.length || amazonGroups || variantSelects.length);
  const selectedAll = inlineGroups.length ? inlineSelections.every(Boolean) : amazonGroups > 0
    ? selected.length >= amazonGroups : variantSelects.length > 0 && confirmedSelects === variantSelects.length;
  page.variantStatus = hasVariants ? selectedAll ? 'selected' : 'unconfirmed' : 'single_product';
  page.selectedVariant = unique(inlineGroups.length ? inlineSelections : selected).join('; ');
  if (page.variantStatus === 'unconfirmed') {
    page.price = ''; page.currency = '';
  } else {
    if (page.price && page.currency) {
      page.priceKind = 'displayed'; page.priceSource = '商品结构化报价';
    }
    const displayed = amazonPurchasePrice($, url);
    if (displayed) {
      if (!page.price || !page.currency || (Number(page.price) === Number(displayed.price) && page.currency.toUpperCase() === displayed.currency)) {
        Object.assign(page, displayed);
      } else {
        page.price = ''; page.currency = ''; page.priceKind = undefined; page.priceSource = undefined;
      }
    }
  }
  if (page.variantStatus === 'selected' && page.selectedVariant) fragments.push(`Selected variant: ${page.selectedVariant}`);
  page.images.push(...$('#landingImage, #imgTagWrapperId img, .ux-image-carousel-item img').map((_i, el) => $(el).attr('src') || '').get());
  page.images = unique(page.images).filter(v => /^https?:\/\//i.test(v)).slice(0, 8);
  page.text = fragments.filter(Boolean).join('\n').slice(0, 100000);
  page.status = 'ok'; page.reason = '';
  return page;
}

function amazonPurchasePrice($: ReturnType<typeof load>, url: string): Pick<PageEvidence, 'price' | 'currency' | 'priceKind' | 'priceSource'> | undefined {
  if (!/^(?:www\.)?amazon\.com$/i.test(new URL(url).hostname)) return;
  const selectors = [
    '#priceblock_dealprice',
    '#corePriceDisplay_desktop_feature_div .priceToPay, #apex_desktop .priceToPay',
    '#corePrice_feature_div .a-price:not(.a-text-price)',
    '#price_inside_buybox, #priceblock_ourprice',
  ];
  for (const selector of selectors) {
    const found = new Set<string>();
    $(selector).each((_i, element) => {
      const node = $(element);
      if (node.closest('.a-text-price, [data-a-strike="true"], .basisPrice, del, s').length) return;
      const parseAmount = (amount: string) => {
        const match = tidy(amount).match(/^(?:USD\s*|US\s*\$|\$)\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})$/i);
        return match && Number(match[1].replace(/,/g, '')) > 0 ? match[1].replace(/,/g, '') : '';
      };
      const amounts = node.find('.a-offscreen').map((_j, child) => parseAmount($(child).text())).get().filter(Boolean);
      if (!amounts.length) {
        const symbol = tidy(node.find('.a-price-symbol').first().text());
        const whole = tidy(node.find('.a-price-whole').first().text()).replace(/\.$/, '');
        const fraction = tidy(node.find('.a-price-fraction').first().text());
        const fallback = parseAmount(node.text()) || parseAmount(symbol + whole + '.' + fraction);
        if (fallback) amounts.push(fallback);
      }
      amounts.forEach(amount => found.add(amount));
    });
    if (found.size > 1) return;
    if (found.size === 1) {
      const promo = selector === '#priceblock_dealprice' || $('#corePriceDisplay_desktop_feature_div .dealBadge, #apex_desktop .dealBadge').length > 0;
      return { price: [...found][0], currency: 'USD', priceKind: promo ? 'promotion' : 'displayed', priceSource: selector };
    }
  }
}

export function extractLocalSkuFeatures(sku: string, desc1: string, desc2: string): FeatureSet {
  const description = tidy([desc1, desc2].filter(Boolean).join(' '));
  const result = extractProductFeatures(description.replace(/\b(?:ty|le)(?=urethane\b)/gi, ''));
  result.text = description;
  result.sources = Object.fromEntries(['fitmentRange', 'make', 'model', 'color'].map(field => [field, result[field] ? 'Desc1 / Desc2' : '未提供']));
  const header = description.toLowerCase().replace(/[–—]/g, '-');
  const localHeader = header.match(leadYear);
  if (localHeader) {
    const afterYear = header.slice(localHeader[0].length).trim();
    const brand = afterYear.match(/^[a-z]+(?:-benz)?\b/)?.[0];
    const make = brand && (makeAliases[brand] || (brand.match(makePattern) ? brand : ''));
    if (make) {
      const fitmentText = afterYear.replace(/^[a-z]+(?:-benz)?\b/, make)
        .split(/\b(?:front|rear|side skirts?|trunk|roof|window|grille|diffuser|bumper)\b/)[0];
      const headerModel = extractProductFeatures(fitmentText).model;
      result.make = make;
      result.sources.make = 'Desc1 / Desc2 年份后品牌';
      if (headerModel) {
        result.model = headerModel;
        result.sources.model = 'Desc1 / Desc2 适配段';
      }
      if (!result.fitmentRange && localHeader[0] === localHeader[1]) {
        const year = expandYear(localHeader[1]);
        if (year >= 1950 && year <= new Date().getUTCFullYear() + 4) {
          result.fitmentRange = year + '-' + year;
          result.sources.fitmentRange = 'Desc1 / Desc2 开头年份';
        }
      }
    }
  }
  result.conflicts = [];
  const parts = sku.toUpperCase().split('-');
  const tail = parts.at(-1) || '';
  const suffixColors: Record<string, string> = {
    GBK: 'gloss black', MBK: 'matte black', MB: 'matte black', MBA: 'matte black',
    CFL: 'carbon fiber look', CF: 'carbon fiber', MCF: 'matte carbon fiber', CH: 'chrome',
    BK: 'black', WH: 'white', RED: 'red', BLUE: 'blue',
  };
  const color = suffixColors[tail];
  if (color) {
    if (!result.color || colorEquivalent(result.color, color)) {
      result.color = color; result.sources.color = `SKU 尾码 ${tail}`;
    } else {
      result.conflicts.push(`color: SKU 尾码 ${tail} 与 Desc1/Desc2 颜色不一致`);
    }
  }
  // An embedded model-year code such as HC01 does not specify an end year.
  // Only explicit ranges are used; SKU strings are never mined for arbitrary numbers.
  if (!result.fitmentRange) {
    const explicit = sku.match(/\b((?:19|20)\d{2})[-_]((?:19|20)\d{2})\b/);
    if (explicit) { result.fitmentRange = `${explicit[1]}-${explicit[2]}`; result.sources.fitmentRange = 'SKU 明确年份范围'; }
  }
  return result;
}

export function extractReferenceFeatures(page: PageEvidence): FeatureSet {
  if (page.status !== 'ok') return extractProductFeatures('');
  const result = extractProductFeatures(page.text);
  const title = extractProductFeatures(page.title);
  const selected = extractProductFeatures(page.selectedVariant);
  const colorCodes: Record<string, string> = { GBK: 'gloss black', MBK: 'matte black', CFL: 'carbon fiber look', MCF: 'matte carbon fiber' };
  const codes = unique((page.title.toUpperCase().match(/\b(?:GBK|MBK|CFL|MCF)\b/g) || []).map(code => colorCodes[code]));
  // The concrete product title/selected option takes precedence over generic
  // specification prose, which may mention compatible finishes or other variants.
  result.color = selected.color || (codes.length === 1 ? codes[0] : '') || title.color || result.color;
  result.make = title.make || result.make;
  result.model = title.model || result.model;
  result.partType = title.partType || result.partType;
  return result;
}

function colorEquivalent(left: string, right: string) {
  const normalize = (v: string) => tidy(v).toLowerCase().replace(/glossy/g, 'gloss').replace(/flat/g, 'matte').replace(/grey/g, 'gray');
  const a = normalize(left), b = normalize(right);
  if (a === b) return true;
  if ((a === 'black' && /^(?:gloss|matte|satin) black$/.test(b)) || (b === 'black' && /^(?:gloss|matte|satin) black$/.test(a))) return true;
  return false;
}

export function compareProductFeatures(ours: Partial<FeatureSet>, theirs: Partial<FeatureSet>, page?: PageEvidence) {
  const dimensions: DimensionCheck[] = [];
  const fitmentDetails: DimensionCheck[] = [];
  const field = (name: string, status: CheckStatus, internal: string, external: string, reason: string) => ({ field: name, status, internal, external, reason });
  const aYears = values(tidy(ours.fitmentRange)).map(canonicalYears);
  const bYears = values(tidy(theirs.fitmentRange)).map(canonicalYears);
  let yearStatus: CheckStatus = 'unknown';
  if (aYears.length && bYears.length && aYears.every(Boolean) && bYears.every(Boolean)) {
    yearStatus = aYears.length === bYears.length && aYears.every((a, i) => a![0] === bYears[i]![0] && a![1] === bYears[i]![1]) ? 'same' :
      aYears.some(a => bYears.some(b => a![0] <= b![1] && b![0] <= a![1])) ? 'partial' : 'different';
  }
  dimensions.push(field('fitmentRange', yearStatus, tidy(ours.fitmentRange), tidy(theirs.fitmentRange),
    yearStatus === 'same' ? '年份一致' : yearStatus === 'partial' ? '年份范围有重叠，按宽松规则接受' : yearStatus === 'different' ? '年份范围没有重叠' : '一方或双方缺少明确年份'));

  const aModels = values(tidy(ours.model)), bModels = values(tidy(theirs.model));
  const aChassis = values(tidy(ours.chassis)), bChassis = values(tidy(theirs.chassis));
  const brands = [ours.make, theirs.make].map(value => (tidy(value).match(makePattern) || []).map(v => makeAliases[v] || v));
  const differentBrand = brands[0].length > 0 && brands[1].length > 0 && !brands[0].some(v => brands[1].includes(v));
  let modelStatus: CheckStatus = 'unknown';
  if (aModels.length && bModels.length) modelStatus = aModels.some(v => bModels.includes(v)) ? (tidy(ours.model) === tidy(theirs.model) ? 'same' : 'partial') : 'different';
  else if (aChassis.length && bChassis.length) modelStatus = aChassis.some(v => bChassis.includes(v)) ? 'same' : 'different';
  for (const key of ['chassis', 'body', 'trim'] as const) {
    const a = values(tidy(ours[key])), b = values(tidy(theirs[key]));
    if (!a.length || !b.length) continue; // Optional model details do not block a match.
    // Generic 4-door wording is not a contradictory body style by itself.
    const aa = key === 'body' ? a.filter(v => !v.endsWith('door')) : a;
    const bb = key === 'body' ? b.filter(v => !v.endsWith('door')) : b;
    if (!aa.length || !bb.length) continue;
    const status: CheckStatus = aa.some(v => bb.includes(v)) ? aa.join('|') === bb.join('|') ? 'same' : 'partial' : 'different';
    fitmentDetails.push(field(key, status, tidy(ours[key]), tidy(theirs[key]), status === 'different' ? '明确的车型限定不同' : '车型限定存在交集'));
    if (status === 'different') modelStatus = 'different';
    else if (status === 'partial' && modelStatus === 'same') modelStatus = 'partial';
  }
  for (const [excluded, positive] of [[ours, theirs], [theirs, ours]]) {
    if (excluded.exclusions && positive.trim && values(positive.trim).some(v => new RegExp(`\\b${escape(v)}\\b`, 'i').test(excluded.exclusions!))) {
      modelStatus = 'different'; fitmentDetails.push(field('exclusions', 'different', tidy(ours.exclusions), tidy(theirs.exclusions), '车型被另一方明确排除'));
    }
  }
  if (differentBrand) {
    modelStatus = 'different';
    fitmentDetails.push(field('make', 'different', tidy(ours.make), tidy(theirs.make), '车辆品牌不同'));
  }
  const modelValue = (v: Partial<FeatureSet>) => [v.model, v.chassis, v.body, v.trim, v.exclusions].filter(Boolean).join('; ');
  dimensions.push(field('model', modelStatus, modelValue(ours), modelValue(theirs), modelStatus === 'same' ? '车型相符' : modelStatus === 'partial' ? '车型范围有交集，按宽松规则接受' : modelStatus === 'different' ? '明确的车型或车身/配置限定不同' : '一方或双方未识别出明确车型'));
  const sourceConflicts = ours.conflicts || [];
  const colorConflict = sourceConflicts.find(conflict => /^color:/i.test(conflict));
  const internalColor = tidy(ours.color), externalColor = tidy(theirs.color);
  const colorUnknown = colorConflict || unknown(internalColor) || unknown(externalColor) ||
    values(internalColor).length > 1 || values(externalColor).length > 1;
  const colorStatus: CheckStatus = colorUnknown ? 'unknown' : colorEquivalent(internalColor, externalColor) ? 'same' : 'different';
  const color = field('color', colorStatus, internalColor, externalColor, colorConflict ||
    (colorStatus === 'same' ? '字段相符' : colorStatus === 'different' ? `${internalColor} ≠ ${externalColor}` : '未明确指定或存在多个候选值'));
  dimensions.push(color);
  const fitment = dimensions.filter(d => d.field === 'fitmentRange' || d.field === 'model');
  const differences = fitment.filter(d => d.status === 'different');
  const missing = fitment.filter(d => d.status === 'unknown').map(d => d.field);
  const blockingConflicts = sourceConflicts.filter(conflict => !/^color:/i.test(conflict));
  const pageReady = !page || page.status === 'ok';
  const variantReady = !page || page.variantStatus !== 'unconfirmed';
  const knownParts = !!ours.partType && !!theirs.partType;
  const broadPartType = (part?: string) => part === 'trunk spoiler' ? 'spoiler' : part;
  const samePart = knownParts && broadPartType(ours.partType) === broadPartType(theirs.partType);
  const differentSpoilerPositions =
    (ours.partType === 'trunk spoiler' && theirs.partType === 'roof spoiler') ||
    (ours.partType === 'roof spoiler' && theirs.partType === 'trunk spoiler');
  if (differentSpoilerPositions) {
    const position = (part: string) => part === 'trunk spoiler' ? '后备箱盖尾翼' : '车顶尾翼';
    const conflict = field('partPosition', 'different', position(ours.partType!), position(theirs.partType!), '尾翼安装位置不同');
    fitmentDetails.push(conflict);
    differences.push(conflict);
  }
  if (!knownParts) missing.push('partType');
  const pending = !pageReady && page?.status !== 'blocked' && needsFitmentRecheck(page);
  const verdict = pending ? 'PENDING' : !pageReady || !variantReady || blockingConflicts.length ? 'REVIEW' :
    differences.length ? 'NOT FIT' : !missing.length && samePart ? 'FIT' : 'REVIEW';
  const mismatches = differences.map(d => `${d.field}: ${d.reason}`);
  const reasons = [...mismatches, ...blockingConflicts];
  if (!pageReady) reasons.unshift(page!.reason);
  if (pageReady && !variantReady) reasons.push('参考商品具体变体未确认');
  if (verdict === 'REVIEW' && pageReady && variantReady) {
    if (missing.length) reasons.push(`信息不足：${missing.map(d => ({ fitmentRange: '年份', model: '车型', partType: '产品类型' })[d]).join('、')}`);
    if (knownParts && !samePart) reasons.push(`产品类型需核实：我方 ${ours.partType}，参考 ${theirs.partType}`);
  }
  if (verdict === 'FIT') reasons.push('车辆适配相容，产品类型一致');
  if (pageReady && variantReady && color?.status === 'different') reasons.push(`颜色不同：我方 ${color.internal}，参考 ${color.external}`);
  if (verdict === 'FIT' && color?.status === 'unknown') reasons.push('颜色待定');
  fitment.filter(d => d.status === 'partial').forEach(d => reasons.push(d.reason));
  return { verdict, confidence: 'not_calibrated', dimensions, fitmentDetails, mismatches, reason: reasons.join('；'),
    evidenceCoverage: `${dimensions.filter(d => d.status !== 'unknown').length}/${dimensions.length}`, needsReview: verdict === 'REVIEW',
    missingFields: missing, version: FITMENT_VERSION };
}

function expandYear(value: string) {
  return value.length === 2 ? Number(value) + (Number(value) >= 80 ? 1900 : 2000) : Number(value);
}

function canonicalYears(value: string): [number, number] | null {
  const open = value.match(/^((?:19|20)\d{2})\+$/);
  if (open) return [Number(open[1]), Infinity];
  const match = value.match(/^(\d{2}|\d{4})-(\d{2}|\d{4})$/);
  if (!match) return null;
  return [expandYear(match[1]), expandYear(match[2])];
}
