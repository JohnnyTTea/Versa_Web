import { load } from 'cheerio';

export const FITMENT_VERSION = 'rules-v3-four-fields';
export type CheckStatus = 'same' | 'different' | 'partial' | 'unknown';
export type FeatureSet = {
  text: string; make: string; model: string; partType: string; style: string;
  color: string; material: string; fitmentRange: string; chassis: string;
  body: string; trim: string; exclusions: string; universal: boolean;
  dimensions: string; quantity: string;
  sources?: Record<string, string>; conflicts?: string[];
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
  const model = listed((text.match(/\b(?:is\s?(?:250|300|350|500)|q\s?50|q\s?60|g\s?35|g\s?37|mdx|suburban|tahoe|yaris|camry|corolla|rav-?4|mr-?2|highlander|tacoma|grand highlander|civic|accord|cr-?v|hr-?v|ridgeline|pilot|integra|prelude|brz|fr-?s|wrx|impreza|lancer|genesis|elantra|ioniq\s?5|k5|charger|challenger|durango|mustang|explorer|camaro|corvette|silverado|sierra|jetta|golf|model(?:\s+[syx]|\s*3)|ct[45]|tx\s?(?:350|500h|550h)|350z|370z|x[156]|[1357][ -]series|sl-class|e-class|scion\s+(?:tc|xb)|toyota\s+86)\b/g) || []).map(v => v.replace(/[-\s]/g, '').replace(/^(?:scion|toyota)/, '')));
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
  const styleBefore = [...text.matchAll(/\b(ikon(?:\s+v\d+)?|oem?|factory|ams|ap|u1|cs|tr|type[ -]r|t-r|jdm(?:\s+mugen|\s+sir)?|mugen|rocker|gt500|gli|20ae|vr|gr|fm|ctr|rs|hpd|trd|lp|ik6|[acer]|v\d+)\s+(?:style|sty)\b/g)].map(m => m[1].replace(/type-r/, 'type r'));
  const styleAfter = [...text.matchAll(/\b(?:style|sty)\s*:?\s*(ikon(?:\s+v\d+)?|oem?|ams|cs|tr|type[ -]r|mugen|rocker|gt500|gr|fm|ctr|rs|hpd|trd|lp|ik6|m4)\b/g)].map(m => m[1]);
  const style = listed([...styleBefore, ...styleAfter]);
  const colors: string[] = [];
  if (/\b(?:carbon (?:fiber|fibre)[ -]?(?:look|style|pattern|print)|carbon[ -]look)\b/.test(text)) colors.push('carbon fiber look');
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
  return { text: tidy(input), make, model, partType: types.find(([rx]) => rx.test(text))?.[1] || '', style,
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

export function extractLocalSkuFeatures(sku: string, desc1: string, desc2: string): FeatureSet {
  const result = extractProductFeatures(`${desc1 || ''} ${desc2 || ''}`);
  result.sources = Object.fromEntries(['fitmentRange', 'model', 'color', 'style'].map(field => [field, result[field] ? 'Desc1 / Desc2' : '未提供']));
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
  const body = parts.length >= 2 ? parts[1] : '';
  const match = body.match(/(IK(?:V([1-9]))?|AMS|CS|TR|CTR|OE|OEM|HPD|TRD|RS|M4|GT500|GR|FM|GLI|20AE|IK6)(?:\d+P)?(?:LED)?$/);
  if (!result.style && match) {
    result.style = match[1] === 'IK' ? 'ikon' : match[2] ? `ikon v${match[2]}` : normalizeStyle(match[1]);
    result.sources.style = `SKU 款式代码 ${match[1]}`;
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
  result.style = selected.style || title.style || result.style;
  if (!result.style) {
    const named = page.title.match(/(?:^|[,;])\s*(type[ -]r|t-r|ikon(?:\s+v\d+)?|oem?|ams|cs|tr|hpd|trd|m4)\s*(?:[,;]|$)/i);
    if (named) result.style = normalizeStyle(named[1]);
  }
  return result;
}

function normalizeStyle(value: string) {
  return tidy(value).toLowerCase().replace(/\b(?:style|sty)\b/g, '').trim()
    .replace(/^(?:tr|type-r|t-r)$/, 'type r').replace(/^(?:oem|factory|oe factory)$/, 'oe')
    .replace(/^ik(?:on)?\s*v\s*(\d+)$/, 'ikon v$1').replace(/^ik$/, 'ikon');
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
  const modelValue = (v: Partial<FeatureSet>) => [v.model, v.chassis, v.body, v.trim, v.exclusions].filter(Boolean).join('; ');
  dimensions.push(field('model', modelStatus, modelValue(ours), modelValue(theirs), modelStatus === 'same' ? '车型相符' : modelStatus === 'partial' ? '车型范围有交集，按宽松规则接受' : modelStatus === 'different' ? '明确的车型或车身/配置限定不同' : '一方或双方未识别出明确车型'));
  for (const name of ['color', 'style'] as const) {
    const internal = tidy(ours[name]), external = tidy(theirs[name]);
    let status: CheckStatus = unknown(internal) || unknown(external) ? 'unknown' : 'different';
    if (status !== 'unknown') {
      if (values(internal).length > 1 || values(external).length > 1) status = 'unknown';
      else if (name === 'color' ? colorEquivalent(internal, external) : normalizeStyle(internal) === normalizeStyle(external)) status = 'same';
    }
    dimensions.push(field(name, status, internal, external, status === 'same' ? '字段相符' : status === 'different' ? `${internal} ≠ ${external}` : '未明确指定或存在多个候选值'));
  }
  const differences = dimensions.filter(d => d.status === 'different');
  const missing = dimensions.filter(d => d.status === 'unknown');
  const sourceConflicts = ours.conflicts || [];
  const pageReady = !page || page.status === 'ok';
  const variantReady = !page || page.variantStatus !== 'unconfirmed';
  const verdict = !pageReady || !variantReady || sourceConflicts.length ? 'REVIEW' : differences.length ? 'NOT FIT' : missing.length ? 'REVIEW' : 'FIT';
  const mismatches = differences.map(d => `${d.field}: ${d.reason}`);
  const reasons = [...mismatches, ...sourceConflicts];
  if (!pageReady) reasons.unshift(page!.reason);
  if (!variantReady) reasons.push('参考商品具体变体未确认');
  if (missing.length) reasons.push(`信息不足：${missing.map(d => ({ fitmentRange: '年份', model: '车型', color: '颜色', style: '款式' })[d.field]).join('、')}`);
  if (verdict === 'FIT') reasons.push('年份、车型、颜色、款式符合当前宽松规则');
  dimensions.filter(d => d.status === 'partial').forEach(d => reasons.push(d.reason));
  return { verdict, confidence: 'not_calibrated', dimensions, fitmentDetails, mismatches, reason: reasons.join('；'),
    evidenceCoverage: `${dimensions.filter(d => d.status !== 'unknown').length}/4`, needsReview: verdict === 'REVIEW',
    missingFields: missing.map(d => d.field), version: FITMENT_VERSION };
}

function canonicalYears(value: string): [number, number] | null {
  const open = value.match(/^((?:19|20)\d{2})\+$/);
  if (open) return [Number(open[1]), Infinity];
  const match = value.match(/^(\d{2}|\d{4})-(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = (v: string) => v.length === 2 ? Number(v) >= 80 ? Number(v) + 1900 : Number(v) + 2000 : Number(v);
  return [year(match[1]), year(match[2])];
}
