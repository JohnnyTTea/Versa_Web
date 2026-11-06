import { load } from 'cheerio';

export const FITMENT_VERSION = 'rules-v2-evidence';
export type CheckStatus = 'same' | 'different' | 'partial' | 'unknown';
export type FeatureSet = {
  text: string; make: string; model: string; partType: string; style: string;
  color: string; material: string; fitmentRange: string; chassis: string;
  body: string; trim: string; exclusions: string; universal: boolean;
  dimensions: string; quantity: string;
};
export type DimensionCheck = { field: string; status: CheckStatus; internal: string; external: string; reason: string };
export type PageEvidence = {
  status: 'ok' | 'blocked' | 'unavailable' | 'not_product' | 'ambiguous' | 'fetch_failed' | 'invalid_url' | 'invalid_input';
  requestedUrl: string; finalUrl: string; fetchedAt: string; httpStatus?: number;
  title: string; text: string; sources: string[]; images: string[];
  variantStatus: 'unconfirmed' | 'single_product' | 'selected'; selectedVariant: string;
  price: string; currency: string; availability: string; reason: string;
};
const tidy = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
const listed = (values: string[]) => unique(values).join(' | ');
const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const values = (v: string) => v.split(' | ').filter(Boolean);
const unknown = (v: unknown) => !v || ['not specified', 'generic accessory', 'standard', 'n/a'].includes(String(v).toLowerCase());

export function extractProductFeatures(input: string): FeatureSet {
  const text = tidy(input).toLowerCase().replace(/[–—]/g, '-').replace(/\btesl\b/g, 'tesla').replace(/\bdodg\b/g, 'dodge');
  const makes: Record<string, string> = { chevy: 'chevrolet', 'mercedes-benz': 'mercedes', vw: 'volkswagen' };
  const make = listed((text.match(/\b(?:lexus|bmw|honda|subaru|toyota|audi|nissan|ford|mercedes(?:-benz)?|volkswagen|vw|acura|mazda|tesla|mini|jaguar|cadillac|chrysler|porsche|hyundai|kia|mitsubishi|volvo|chevrolet|chevy|gmc|dodge|infiniti|scion)\b/g) || []).map(v => makes[v] || v));
  const model = listed((text.match(/\b(?:is\s?(?:250|300|350|500)|q\s?50|q\s?60|g\s?35|g\s?37|mdx|suburban|tahoe|camry|corolla|rav-?4|mr-?2|highlander|tacoma|grand highlander|civic|accord|cr-?v|hr-?v|ridgeline|pilot|integra|prelude|brz|fr-?s|wrx|impreza|lancer|genesis|elantra|ioniq\s?5|k5|charger|challenger|durango|mustang|explorer|camaro|corvette|silverado|sierra|jetta|golf|model\s?[3syx]|ct[45]|tx\s?(?:350|500h|550h)|350z|370z|x[156]|[1357][ -]series|sl-class|e-class|scion\s+(?:tc|xb)|toyota\s+86)\b/g) || []).map(v => v.replace(/[-\s]/g, '').replace(/^(?:scion|toyota)/, '')));
  const exclusions = listed((text.match(/(?:not\s+(?:fit|fits|for)|except|excluding|excludes|will not fit)\s+[^.;,]+/g) || []).map(tidy));
  const positive = text.replace(/(?:not\s+(?:fit|fits|for)|except|excluding|excludes|will not fit)\s+[^.;,]+/g, ' ');
  const chassis = listed(positive.match(/\b(?:e\d{2}|f\d{2}|g\d{2}|w\d{3}|r\d{3}|mk\s?(?:iv|vi?|[4-8]))\b/g) || []);
  const body = listed((positive.match(/\b(?:sedan|coupe|hatchback|wagon|convertible|cabriolet|2[ -]?(?:door|dr)|3[ -]?(?:door|dr)|4[ -]?(?:door|dr))\b/g) || []).map(v => v.replace(/[ -]/g, '').replace(/dr$/, 'door').replace('cabriolet', 'convertible')));
  const trim = listed((positive.match(/\b(?:m3|m[ -]?sport|m[ -]?tech|widebody|scat pack|srt8?|gt350r?|gt500|nismo|f[ -]?sport|xse|xle|hybrid|sport|base|ex-l|ex|lx|lxs|se|le|z51|z06|zl1)\b/g) || []).map(v => v.replace(/[ -]/g, '')));
  const intervals: string[] = [...text.matchAll(/\b((?:19|20)\d{2})\s*(?:-\s*)?(?:up|onwards|and newer|present)\b/g)].map(m => `${m[1]}+`);
  const ceiling = new Date().getUTCFullYear() + 4;
  const year = (v: string) => v.length === 2 ? Number(v) >= 80 ? 1900 + Number(v) : 2000 + Number(v) : Number(v);
  for (const match of text.matchAll(/\b(\d{2}|(?:19|20)\d{2})\s*(?:-|to|through)\s*(\d{2}|(?:19|20)\d{2})\b/g)) {
    const a = year(match[1]), b = year(match[2]);
    // Short numerical dimensions (62-66 inches) are not automotive years.
    if (a >= 1950 && a <= b && b <= ceiling) intervals.push(`${a}-${b}`);
  }
  if (!intervals.length) for (const m of text.matchAll(/\b(?:19|20)\d{2}\b/g)) {
    if (Number(m[0]) <= ceiling) intervals.push(`${m[0]}-${m[0]}`);
  }
  const types: Array<[RegExp, string]> = [
    [/\b(?:front (?:bumper )?(?:lip|splitter)|front lip spoiler)\b/, 'front bumper lip'],
    [/\brear (?:bumper )?lip\b/, 'rear bumper lip'], [/\bside skirts?\b/, 'side skirt'],
    [/\b(?:spoiler|trunk wing|rear wing)\b/, 'spoiler'], [/\bgrill(?:e)?\b/, 'grille'],
    [/\bdiffuser\b/, 'diffuser'], [/\b(?:window (?:deflectors?|visors?)|rain guards?)\b/, 'window deflector'],
    [/\broof rack\b/, 'roof rack'], [/\bmirror covers?\b/, 'mirror cover'],
    [/\bhood\b/, 'hood'], [/\bvalance\b/, 'valance'], [/\bfront bumper\b/, 'front bumper'],
  ];
  const style = listed([...text.matchAll(/\b(ikon(?:\s+v\d+)?|oem?|factory|ams|ap|u1|cs|tr|type[ -]r|jdm(?:\s+mugen|\s+sir)?|mugen|rocker|gt500|gli|20ae|vr|gr|fm|ctr|rs|hpd|trd|lp|ik6|[acer]|v\d+)\s+(?:style|sty)\b/g)].map(m => m[1].replace(/type-r/, 'type r')));
  const colors: string[] = [];
  if (/\b(?:carbon (?:fiber|fibre)[ -]?(?:look|style|pattern|print)|carbon[ -]look)\b/.test(text)) colors.push('carbon fiber look');
  for (const m of text.matchAll(/\b(?:(gloss(?:y)?|matte|flat|satin)\s+)?(black|white|red|blue|silver|gr[ae]y)\b/g)) colors.push(`${m[1] || ''} ${m[2]}`.trim().replace('glossy', 'gloss').replace('flat', 'matte').replace('grey', 'gray'));
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
  return { text: tidy(input), make, model, partType: types.find(([rx]) => rx.test(text))?.[1] || '', style,
    color: listed(colors), material: listed(materials), fitmentRange: listed(intervals), chassis, body, trim, exclusions,
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
    if (/discontinued|outofstock/i.test(page.availability)) { page.status = 'unavailable'; page.reason = '参考商品已停售或缺货，当前价格需人工确认'; return page; }
  }
  const selectors = [
    '#feature-bullets li', '#productDescription', '#productOverview_feature_div tr',
    '#productDetails_detailBullets_sections1 tr', '#productDetails_techSpec_section_1 tr', '#detailBullets_feature_div li',
    '.ux-labels-values', '#viTabs_0_is', '[itemprop="description"]',
  ];
  for (const selector of selectors) {
    const nodes = $(selector).clone();
    nodes.find('script, style, nav, aside, .a-carousel-container, [id*="recommend"], [id*="sponsored"]').remove();
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
  const hasVariants = !!(product?.hasVariant || product?.isVariantOf || product?.offers?.['@type'] === 'AggregateOffer' || (Array.isArray(product?.offers) && product.offers.length > 1) || amazonGroups || variantSelects.length);
  const selectedAll = amazonGroups > 0 ? selected.length >= amazonGroups : variantSelects.length > 0 && confirmedSelects === variantSelects.length;
  page.variantStatus = hasVariants ? selectedAll ? 'selected' : 'unconfirmed' : 'single_product';
  page.selectedVariant = selected.join('; ');
  if (selected.length) fragments.push(`Selected variant: ${page.selectedVariant}`);
  page.images.push(...$('#landingImage, #imgTagWrapperId img, .ux-image-carousel-item img').map((_i, el) => $(el).attr('src') || '').get());
  page.images = unique(page.images).filter(v => /^https?:\/\//i.test(v)).slice(0, 8);
  page.text = fragments.filter(Boolean).join('\n').slice(0, 100000);
  page.status = 'ok'; page.reason = '';
  return page;
}

function canonical(value: unknown, field: string) {
  const s = tidy(value).toLowerCase();
  if (unknown(s)) return '';
  if (field === 'material') return s.replace(/\b(?:polyurethane|urethane)\b/g, 'pu').replace(/\bpolypropylene\b/g, 'pp').replace(/\babs plastic\b/g, 'abs');
  if (field === 'partType') return s.replace('front lip', 'front bumper lip');
  return s;
}

export function compareProductFeatures(ours: Partial<FeatureSet>, theirs: Partial<FeatureSet>, page?: PageEvidence) {
  const dimensions: DimensionCheck[] = [];
  for (const field of ['make', 'model', 'partType', 'style', 'color', 'material', 'dimensions', 'quantity'] as const) {
    const internal = tidy(ours[field]), external = tidy(theirs[field]);
    const a = canonical(internal, field), b = canonical(external, field);
    let status: CheckStatus = !a || !b ? 'unknown' : a === b ? 'same' : 'different';
    let reason = status === 'unknown' ? '一方或双方缺少明确资料' : status === 'same' ? '已提取字段一致' : `${internal} ≠ ${external}`;
    if (values(a).length > 1 || values(b).length > 1) { status = 'unknown'; reason = '识别到多个候选值，需确认具体车型或变体'; }
    if (status === 'different' && field === 'partType' && [a, b].every(v => ['rear bumper lip', 'diffuser', 'valance'].includes(v))) {
      status = 'unknown'; reason = '后唇、扩散器等名称可能指同类部件，需核对实际结构';
    }
    // A generic black or plastic value is not proof of a different finish/material.
    if (status === 'different' && ((field === 'color' && /black/.test(a) && /black/.test(b) && (a === 'black' || b === 'black')) ||
        (field === 'material' && (a === 'plastic' || b === 'plastic')) || field === 'dimensions')) {
      status = 'unknown'; reason = field === 'dimensions' ? '尺寸需确认单位、测量对象及产品/包装区别' : '资料精度不同，不能直接认定一致或不同';
    }
    dimensions.push({ field, status, internal, external, reason });
  }
  const fitChecks: DimensionCheck[] = [];
  const addFit = (field: string, status: CheckStatus, reason: string) => fitChecks.push({ field, status, internal: tidy(ours[field]), external: tidy(theirs[field]), reason });
  if (ours.universal || theirs.universal) addFit('universal', 'partial', '通用型与具体车型的适配关系需人工确认');
  const aRanges = values(tidy(ours.fitmentRange)).map(v => canonicalYears(v));
  const bRanges = values(tidy(theirs.fitmentRange)).map(v => canonicalYears(v));
  if (!aRanges.length || !bRanges.length || aRanges.some(v => !v) || bRanges.some(v => !v)) addFit('fitmentRange', 'unknown', '一方或双方缺少有效适配年份');
  else if (aRanges.length === bRanges.length && aRanges.every((a, i) => a![0] === bRanges[i]![0] && a![1] === bRanges[i]![1])) addFit('fitmentRange', 'same', '年份范围一致');
  else {
    const overlap = aRanges.some(a => bRanges.some(b => a![0] <= b![1] && b![0] <= a![1]));
    addFit('fitmentRange', overlap ? 'partial' : 'different', overlap ? '年份范围部分重叠，不能当作完全一致或明确不兼容' : '年份范围没有重叠');
  }
  for (const field of ['chassis', 'body', 'trim', 'exclusions'] as const) {
    const a = tidy(ours[field]), b = tidy(theirs[field]);
    if (!a && !b) continue;
    if (!a || !b) addFit(field, 'unknown', '车身、配置或排除项在一方资料中缺失');
    else if (a === b) addFit(field, 'same', '适配限定一致');
    else if (field === 'exclusions') addFit(field, 'partial', '排除项不同，需逐项核对');
    else {
      const overlaps = values(a).some(v => values(b).includes(v));
      addFit(field, overlaps ? 'partial' : 'different', overlaps ? '适配限定部分重叠' : '适配限定不同');
    }
  }
  // Explicit exclusion versus an affirmative restriction is a definite conflict.
  for (const [excluded, positive] of [[ours, theirs], [theirs, ours]]) {
    if (excluded.exclusions && positive.trim && values(positive.trim).some(v => new RegExp(`\\b${escape(v)}\\b`, 'i').test(excluded.exclusions!))) {
      addFit('exclusions', 'different', '参考或我方要求的配置被另一方明确排除');
    }
  }
  const identity = dimensions.filter(c => ['make', 'model'].includes(c.field));
  const fitStatus: CheckStatus = [...identity, ...fitChecks].some(c => c.status === 'different') ? 'different' :
    [...identity, ...fitChecks].some(c => c.status === 'partial') ? 'partial' :
    [...identity, ...fitChecks].some(c => c.status === 'unknown') ? 'unknown' : 'same';
  dimensions.push({ field: 'fitment', status: fitStatus, internal: [ours.make, ours.model, ours.fitmentRange, ours.chassis, ours.body, ours.trim, ours.exclusions].filter(Boolean).join('; '), external: [theirs.make, theirs.model, theirs.fitmentRange, theirs.chassis, theirs.body, theirs.trim, theirs.exclusions].filter(Boolean).join('; '), reason: fitChecks.filter(c => c.status !== 'same').map(c => c.reason).join('；') || '已提取的适配条件一致' });
  dimensions.push({ field: 'visual', status: 'unknown', internal: '', external: '', reason: '尚未进行图片造型比对，需人工确认结构、孔位和外观' });
  const variantConfirmed = page ? page.variantStatus !== 'unconfirmed' : true;
  const differences = dimensions.filter(c => c.status === 'different');
  const missing = dimensions.filter(c => c.status === 'unknown' || c.status === 'partial');
  // Different style names alone do not prove different physical shapes.
  const decisiveDifferences = differences.filter(c => c.field !== 'style');
  const verdict = decisiveDifferences.length && variantConfirmed && (!page || page.status === 'ok') ? 'NOT FIT' : 'REVIEW';
  const mismatches = differences.map(c => `${c.field}: ${c.reason}`);
  const reasons = [...mismatches];
  if (differences.some(c => c.field === 'style')) reasons.push('款式名称有差异，需结合图片确认实际造型');
  if (page && page.status !== 'ok') reasons.unshift(page.reason);
  if (!variantConfirmed) reasons.push('参考商品的具体变体未确认，差异仅供人工复核');
  if (fitStatus === 'partial') reasons.push('适配范围部分重叠');
  if (!mismatches.length) reasons.push('未发现已证实差异，但信息不足，不能确认同款');
  return { verdict, confidence: 'not_calibrated', dimensions, fitmentDetails: fitChecks, mismatches,
    reason: reasons.join('；'), evidenceCoverage: `${dimensions.filter(c => c.status === 'same' || c.status === 'different').length}/${dimensions.length}`,
    needsReview: verdict === 'REVIEW', missingFields: missing.map(c => c.field), version: FITMENT_VERSION };
}

function canonicalYears(value: string): [number, number] | null {
  const open = value.match(/^((?:19|20)\d{2})\+$/);
  if (open) return [Number(open[1]), Infinity];
  const match = value.match(/^(\d{2}|\d{4})-(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = (v: string) => v.length === 2 ? Number(v) >= 80 ? Number(v) + 1900 : Number(v) + 2000 : Number(v);
  return [year(match[1]), year(match[2])];
}
