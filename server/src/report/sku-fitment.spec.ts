import { extractProductFeatures as features, extractLocalSkuFeatures as local, extractReferenceFeatures, parseProductPage, compareProductFeatures as compare, emptyEvidence, needsFitmentRecheck } from './sku-fitment';
import { fetchProductEvidence } from './sku-fitment-fetch';
import { ReportService } from './report.service';
import { fitmentRemark } from './sku-fitment-remark';

const url = 'https://www.amazon.com/dp/B000000001';
const product = (text: string) => `<h1 id="productTitle">${text}</h1>`;
const ours = '2001-2005 Lexus IS300 front bumper lip AMS Style matte black material PU set of 3';

describe('SKU comparison evidence regression', () => {
  it('ignores navigation, recommendations, vehicle pickers and copyright years', () => {
    const html = `<nav>1996-2025 Honda BMW all vehicles ABS support</nav>${product(ours)}<div id="feature-bullets"><li>Polyurethane</li></div><aside>PP Chevrolet Camaro red</aside>`;
    const page = parseProductPage(html, url);
    expect(page.status).toBe('ok');
    expect(features(page.text)).toMatchObject({ make: 'lexus', model: 'is300', material: 'pu', fitmentRange: '2001-2005' });
    expect(page.text).not.toContain('1996-2025');
  });

  it('requires product-scoped content instead of treating a generic page as a product', () => {
    expect(parseProductPage('<title>Amazon</title><body>1996-2025 PP universal car accessories</body>', url).status).toBe('not_product');
  });

  it('does not infer PP from support or PU from bumper', () => {
    expect(features('support for front bumper').material).toBe('');
    expect(features('gloss black front lip')).not.toHaveProperty('style');
  });

  it('distinguishes carbon appearance from actual carbon fiber', () => {
    expect(features('carbon fiber look ABS plastic').material).toBe('abs');
    expect(features('carbon fiber look ABS plastic').color).toBe('carbon fiber look');
    expect(features('real carbon fiber matte black').material).toBe('carbon fiber');
    expect(features('gloss black').color).toBe('gloss black');
    expect(features('matte black').color).toBe('matte black');
  });

  it('does not mistake universal width measurements for year ranges', () => {
    expect(features('Universal fits front width 62-66 inches').fitmentRange).toBe('');
  });

  it('preserves partial year overlap and body variants', () => {
    const a = features('2005-2008 BMW E90 Sedan front lip black PU');
    const b = features('2006-2013 BMW E90 E92 Sedan Coupe front lip black PU');
    const result = compare(a, b);
    expect(result.dimensions.find(d => d.field === 'fitmentRange')?.status).toBe('partial');
    expect(result.verdict).toBe('FIT');
  });

  it('flags disjoint years, distinct models, and body differences', () => {
    expect(compare(features('2001-2003 Honda Civic front lip'), features('1999-2000 Honda Civic front lip')).verdict).toBe('NOT FIT');
    expect(compare(features('2022-2026 Honda Civic Hatchback spoiler'), features('2022-2026 Honda Civic Sedan spoiler')).verdict).toBe('NOT FIT');
    expect(compare(features(ours), features('1998-2001 Acura Integra front lip')).verdict).toBe('NOT FIT');
  });

  it('respects explicit M3 exclusions', () => {
    const result = compare(features('2008-2013 BMW E92 front lip except M3'), features('2008-2013 BMW E92 M3 front lip'));
    expect(result.verdict).toBe('NOT FIT');
    expect(result.fitmentDetails).toContainEqual(expect.objectContaining({ field: 'exclusions', status: 'different' }));
  });

  it('does not convert missing external facts or missing local metadata into FIT', () => {
    expect(compare(features(ours), features('')).verdict).toBe('REVIEW');
    const result = compare(features('black front lip'), features(ours));
    expect(result.dimensions.find(d => d.field === 'model')?.status).toBe('unknown');
    expect(result.verdict).toBe('REVIEW');
  });

  it('records explicit color differences in the comparison details', () => {
    const result = compare(features('matte black'), features('gloss black'));
    expect(result.dimensions.find(d => d.field === 'color')?.status).toBe('different');
  });

  it('matches compatible fitment and product type when explicit styles differ', () => {
    const a = features('2001-2005 Lexus IS300 front lip AMS Style');
    const b = features('2001-2005 Lexus IS300 front lip CS Style');
    expect(a).not.toHaveProperty('style');
    expect(b).not.toHaveProperty('style');
    const result = compare(a, b);
    expect(result.dimensions.map(d => d.field)).toEqual(['fitmentRange', 'model', 'color']);
    expect(result.verdict).toBe('FIT');
    expect(result.reason).not.toContain('款式');
  });

  it('does not invent a shape mismatch from rear lip versus diffuser wording', () => {
    const result = compare(features('2022-2026 Honda Civic rear lip'), features('2022-2026 Honda Civic rear diffuser'));
    expect(result.dimensions.map(d => d.field)).toEqual(['fitmentRange', 'model', 'color']);
    expect(result.verdict).toBe('REVIEW');
  });

  it('preserves open-ended years', () => {
    expect(features('2021-UP Hyundai Elantra front lip').fitmentRange).toBe('2021+');
    expect(compare(features('2021-UP Hyundai Elantra front lip'), features('2021-2026 Hyundai Elantra front lip')).dimensions.find(d => d.field === 'fitmentRange')?.status).toBe('partial');
  });

  it('uses the product type with vehicle fitment and records other attributes separately', () => {
    const a = { ...features(ours), material: 'pu', quantity: '1' };
    const b = { ...features(ours), material: 'abs', quantity: '3' };
    expect(compare(a, b).verdict).toBe('FIT');
    expect(compare(a, { ...b, partType: 'diffuser' }).verdict).toBe('REVIEW');
  });

  it('accepts overlapping years but rejects a known mismatch', () => {
    expect(compare(features(ours), features(ours.replace('2001-2005', '2003-2008'))).verdict).toBe('FIT');
    expect(compare(features(ours), features(ours.replace('2001-2005', '2010-2015'))).verdict).toBe('NOT FIT');
  });

  it('supplements descriptions using known SKU color codes', () => {
    const result = local('BLF-HA184IKV33P-GBK', '18-20 Honda Accord front lip', '');
    expect(result).toMatchObject({ color: 'gloss black', fitmentRange: '2018-2020', model: 'accord' });
    expect(result.sources?.color).toContain('GBK');
    expect(result.sources).not.toHaveProperty('style');
    expect(local('BLF-TCL204IK-CFL', '20-25 Toyota Corolla spoiler', '').color).toBe('carbon fiber look');
    expect(local('UNKNOWN-123-ZZZ', '', '').color).toBe('');
    expect(local('UNKNOWN-HC01-PU', '', '').fitmentRange).toBe('');
  });

  it('keeps a color-source conflict visible without blocking a fitment match', () => {
    const result = local('BLF-HA184IK-GBK', '2018-2020 Honda Accord red IKON Style', '');
    expect(result.conflicts).toHaveLength(1);
    const compared = compare({ ...result, partType: 'front bumper lip' }, features('2018-2020 Honda Accord front lip red IKON Style'));
    expect(compared.verdict).toBe('FIT');
    expect(compared.dimensions.find(d => d.field === 'color')).toMatchObject({ status: 'unknown' });
    expect(fitmentRemark(compared, null)).toContain('同款，颜色待定');
  });

  it('separates HTML spec labels from values', () => {
    const page = parseProductPage(`${product(ours)}<div class="ux-labels-values"><span>Material</span><span>ABS</span></div>`, url);
    expect(page.text).toContain('Material ABS');
  });

  it('does not misread the generic word Models as Tesla Model S', () => {
    expect(features('Fits all models').model).toBe('');
    expect(features('Tesla Model S').model).toBe('models');
    expect(features('Tesla Model3').model).toBe('model3');
  });

  it('uses the concrete title color rather than generic descriptive prose', () => {
    const page = parseProductPage(`${product('20-25 Tesla Model Y, CFL, IKON Style')}<div id="feature-bullets"><li>Black mounting brackets</li></div>`, url);
    expect(extractReferenceFeatures(page).color).toBe('carbon fiber look');
    expect(extractReferenceFeatures(page)).not.toHaveProperty('style');
    expect(features('Hyundai Elantra Blue Hybrid, Gloss Black').color).toBe('gloss black');
  });

  it('recognizes JSON-LD Product but ignores recommended ItemList products', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [
      { '@type': 'Product', name: ours, material: 'PU', offers: { price: '83.99', priceCurrency: 'USD' } },
      { '@type': 'ItemList', itemListElement: [{ '@type': 'Product', name: 'Chevrolet Camaro 1996-2025' }] },
    ] })}</script>`;
    const page = parseProductPage(html, url);
    expect(page.status).toBe('ok'); expect(page.price).toBe('83.99');
    expect(page.text).not.toContain('Chevrolet');
  });

  it('does not combine different Product entities into a fabricated match', () => {
    const html = `<script type="application/ld+json">${JSON.stringify([
      { '@type': 'Product', name: 'Honda Civic' }, { '@type': 'Product', name: 'Toyota Camry' },
    ])}</script>`;
    expect(parseProductPage(html, url).status).toBe('ambiguous');
  });

  it('recognizes captcha and ended listings', () => {
    expect(parseProductPage('<title>Robot Check</title>', url).status).toBe('blocked');
    expect(parseProductPage('<title>This listing has ended</title>', url).status).toBe('unavailable');
  });

  it('reads catalog years, brands and models and joins split descriptions', () => {
    expect(local('AST-MAZ614OEFM-A', '14-21 MAZD Mazda6 GH1 4D ABS Trunk #NA', 'OE - Unpainted Black')).toMatchObject({
      make: 'mazda', model: 'mazda6', fitmentRange: '2014-2021',
    });
    expect(local('', '05-08 BMW 3 E90 Front Lip', 'AP Style')).toMatchObject({ make: 'bmw', model: '3series' });
    expect(local('', '90-97 Mazda Miata Gv2 Front Lip', '')).toMatchObject({ make: 'mazda', model: 'miata' });
    expect(features('Audi Q3 trunk spoiler').model).toBe('q3');
    expect(features('Toyota Corolla Base Model 3 Piece Front Lip').model).toBe('corolla');
    expect(local('', '01-05 Lexus Is300 Front Bumper Lip AmsS', 'tyUrethane')).toMatchObject({ material: 'pu' });
  });

  it('accepts matching fitment and product type with separate color details', () => {
    const a = local('', '14-17 INFINITI Q50 REAR DIFFUSER', 'ABS,CF Look');
    const b = features('Rear Bumper Diffuser Lip for 2014-2017 Infiniti Q50, Gloss Black, ABS');
    const result = compare(a, b);
    expect(result.verdict).toBe('FIT');
    expect(result.reason).toContain('颜色不同');
    expect(compare({ ...a, material: '' }, b).verdict).toBe('FIT');
    expect(compare(features('2022-2026 Honda Civic Sedan spoiler MD Style, ABS'),
      features('2022-2026 Honda Civic Sedan spoiler JDM Style, ABS')).verdict).toBe('FIT');
  });

  it('extracts the Amazon purchase price in the same response and clears unconfirmed variant prices', () => {
    const pricing = '<div id="corePrice_feature_div"><span class="a-price a-text-price"><span class="a-offscreen">$99.99</span></span><span class="a-price"><span class="a-offscreen">$74.99</span></span></div>';
    expect(parseProductPage(product(ours) + pricing, url)).toMatchObject({ price: '74.99', currency: 'USD', priceKind: 'displayed' });
    expect(parseProductPage(product(ours) + '<span id="priceblock_dealprice">$59.99</span>' + pricing, url))
      .toMatchObject({ price: '59.99', priceKind: 'promotion' });
    expect(parseProductPage(product(ours) + '<div id="variation_color_name"></div>' + pricing, url))
      .toMatchObject({ price: '', variantStatus: 'unconfirmed' });
  });

  it('uses the requested Amazon inline variant and its purchase price', () => {
    const asin = 'B0CQBSD5L2';
    const otherAsin = 'B0CQC5QY8L';
    const link = 'https://www.amazon.com/dp/' + asin + '?th=1&psc=1';
    const html = product('Front Bumper Lip Spoiler for 15-23 Dodge Charger SRT, CFL, V2 Style') +
      '<input id="ASIN" value="' + asin + '">' +
      '<div id="inline-twister-row-color_name"><span class="inline-twister-dim-title-value">Black with Carbon Fiber Print</span>' +
      '<li class="inline-twister-swatch" data-initiallyselected="true" data-asin="' + asin + '">$87.99</li>' +
      '<li class="inline-twister-swatch" data-initiallyselected="false" data-asin="' + otherAsin + '">$90.99</li></div>' +
      '<div id="corePriceDisplay_desktop_feature_div"><span class="a-price priceToPay"><span class="a-offscreen">null</span>' +
      '<span class="a-price-symbol">$</span><span class="a-price-whole">87</span><span class="a-price-fraction">99</span></span></div>' +
      '<div id="installment-price">$14.67</div>';
    expect(parseProductPage(html, link)).toMatchObject({
      status: 'ok', variantStatus: 'selected', selectedVariant: 'Black with Carbon Fiber Print',
      price: '87.99', currency: 'USD', priceKind: 'displayed',
    });
    expect(parseProductPage(html.replace('data-asin="' + asin, 'data-asin="' + otherAsin), link))
      .toMatchObject({ variantStatus: 'unconfirmed', price: '' });
    expect(parseProductPage(html.replace('value="' + asin, 'value="' + otherAsin), link))
      .toMatchObject({ status: 'ambiguous', price: '' });
  });

  it('requires the concrete variant before asserting differences', () => {
    const page = parseProductPage(`${product(ours)}<div id="variation_color_name"><select><option>Select color</option></select></div>`, url);
    expect(page.variantStatus).toBe('unconfirmed');
    expect(compare(features(ours), features('2001-2005 Lexus IS300 front lip red PP'), page).verdict).toBe('REVIEW');
  });

  it('passes four matching fields without considering brand, images or material', () => {
    const result = compare(features(ours), features(ours));
    expect(result.verdict).toBe('FIT');
    expect(result.dimensions).toHaveLength(3);
    expect(result.evidenceCoverage).toBe('3/3');
    expect(result.confidence).toBe('not_calibrated');
  });
});

describe('reference fetch failures', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('retains HTTP status and HTML without comparing an error page', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('<title>Robot Check</title>', { status: 503, headers: { 'content-type': 'text/html' } }));
    const { page, html } = await fetchProductEvidence(url);
    expect(page).toMatchObject({ status: 'blocked', httpStatus: 503, requestedUrl: url });
    expect(html).toContain('Robot Check');
    expect(compare(features(ours), features(page.text), page).verdict).toBe('REVIEW');
  });

  it('records invalid links as unavailable, never FIT', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } }));
    expect((await fetchProductEvidence('https://www.ebay.com/itm/227406023062')).page.status).toBe('unavailable');
  });

  it('records network errors as failed evidence', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));
    expect((await fetchProductEvidence(url)).page.status).toBe('fetch_failed');
  });

  it('keeps the server cooldown for a rate-limited JSON response', async () => {
    const before = Date.now();
    global.fetch = jest.fn(async () => new Response('{"error":"slow down"}', {
      status: 429, headers: { 'content-type': 'application/json', 'retry-after': '180' },
    }));
    const { page } = await fetchProductEvidence(url);
    expect(page).toMatchObject({ status: 'rate_limited', httpStatus: 429 });
    expect(Date.parse(page.retryAt!)).toBeGreaterThanOrEqual(before + 180_000);
  });

  it('rejects unsupported URLs and redirects before contacting their targets', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }));
    expect((await fetchProductEvidence('http://127.0.0.1')).page.status).toBe('invalid_url');
    expect(global.fetch).not.toHaveBeenCalled();
    expect((await fetchProductEvidence(url)).page.status).toBe('fetch_failed');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not substitute Goods ID or human answers for SKU and target URL', async () => {
    const query = jest.fn();
    const service = new ReportService({ query } as any);
    (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
    const result = await service.analyzeRows([{ 'Goods ID': '610567364390980', '检查结果': '同款' }]);
    expect(result.results[0].verdict).toBe('INVALID');
    expect(result.results[0].sku).toBe('');
    expect(result.results[0].targetUrl).toBe('');
    expect(query).not.toHaveBeenCalled();
  });

  it('ignores human labels and reuses fetched evidence for repeated reference URLs', async () => {
    const service = new ReportService({ query: jest.fn().mockResolvedValue([{ Itemno: 'SKU1', Desc1: ours }]) } as any);
    (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
    global.fetch = jest.fn().mockImplementation(async () => new Response(product(ours), { headers: { 'content-type': 'text/html' } }));
    const result = await service.analyzeRows([{ SKU: 'SKU1', URL: url, '检查结果': '同款' }, { SKU: 'SKU1', URL: url, '检查结果': '不是同款' }]);
    expect(result.results[0].dimensions).toEqual(result.results[1].dimensions);
    expect(result.results[0].verdict).toEqual(result.results[1].verdict);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not use the local description when the reference is empty', async () => {
    const service = new ReportService({ query: jest.fn().mockResolvedValue([{ Itemno: 'SKU1', Desc1: ours, Desc2: '' }]) } as any);
    (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('test-evidence');
    global.fetch = jest.fn().mockResolvedValue(new Response('', { status: 200, headers: { 'content-type': 'text/html' } }));
    const result = await service.analyzeRows([{ SKU: 'SKU1', '参考链接': url, '检查结果': '同款' }]);
    expect(result.results[0].verdict).toBe('REVIEW');
    expect(result.results[0].external.text).toBe('');
    expect(result.results[0].page.status).toBe('not_product');
    expect(result.results[0].evidenceId).toBe('test-evidence');
  });
});


describe('fitment evidence persistence and job completion', () => {
  it('batches US Amazon ASINs, quotes the requested child, and keeps fitment decisions when pricing is throttled', async () => {
    const environment = jest.replaceProperty(process, 'env', { ...process.env,
      FITMENT_AMAZON_CLIENT_ID: 'test-client', FITMENT_AMAZON_CLIENT_SECRET: 'test-secret',
      FITMENT_AMAZON_SELLER_REFRESH_TOKEN: 'test-refresh',
    });
    const marketplaceId = 'ATVPDKIKX0DER';
    const child = 'B0CQBSD5L2', parent = 'B000000002', limited = 'B000000003', multiple = 'B000000004';
    const catalogItem = (asin: string, relationships = {}) => ({ asin,
      summaries: [{ marketplaceId, itemName: ours }],
      relationships: [{ marketplaceId, relationships: [{ type: 'VARIATION', ...relationships }] }],
    });
    const priceResult = (asin: string, statusCode: number, amounts: number[]) => ({ status: { statusCode }, body: { asin, marketplaceId,
      featuredBuyingOptions: [{ buyingOptionType: 'New', segmentedFeaturedOffers: amounts.map(amount => ({
        condition: 'New', listingPrice: { amount, currencyCode: 'USD' },
      })) }],
    } });
    const mockFetch = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'test-access', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ items: [catalogItem(parent, { childAsins: [child, limited] }),
        catalogItem(child, { parentAsins: [parent] }), catalogItem(limited, { parentAsins: [parent] }), catalogItem(multiple)] }))
      .mockResolvedValueOnce(Response.json({ responses: [priceResult(multiple, 200, [87.99, 90.99]),
        priceResult(limited, 429, []), priceResult(child, 200, [87.99])] }));
    const service = new ReportService({ query: jest.fn().mockResolvedValue([{ Itemno: 'SKU-1', Desc1: ours }]) } as any);
    (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
    try {
      const result = await service.analyzeRows([child, parent, limited, child, multiple].map((asin, index) => ({
        SKU: 'SKU-1', URL: `https://www.amazon.com/dp/${asin}?tracking=${index}`,
      })));
      const [quoted, parentRow, deferred, duplicate, conflicting] = result.results;
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(new URL(String(mockFetch.mock.calls[1][0])).searchParams.get('identifiers')).toBe([child, parent, limited, multiple].join(','));
      const body = JSON.parse(String(mockFetch.mock.calls[2][1]?.body));
      expect(body.requests.map((request: { asin: string }) => request.asin)).toEqual([child, limited, multiple]);
      expect(quoted).toMatchObject({ verdict: 'FIT', page: { variantStatus: 'selected' }, priceReview: { current: {
        amount: '87.99', currency: 'USD', kind: 'featured_offer', source: 'Amazon SP-API Featured Offer',
      } } });
      expect(quoted.priceReview.current.fetchedAt).toBe(quoted.page.priceFetchedAt);
      expect(duplicate.priceReview.current).toEqual(quoted.priceReview.current);
      expect(parentRow).toMatchObject({ verdict: 'REVIEW', page: { variantStatus: 'unconfirmed' }, priceReview: { current: null } });
      expect(deferred).toMatchObject({ verdict: 'FIT', priceReview: { current: null } });
      expect(needsFitmentRecheck(deferred.page)).toBe(true);
      expect(conflicting).toMatchObject({ verdict: 'FIT', priceReview: { current: null } });
    } finally {
      mockFetch.mockRestore();
      environment.restore();
    }
  });

  it('reports only the price from the current request even when an older snapshot has a quote', async () => {
    const fs = require('node:fs/promises');
    const path = require('node:path');
    const root = path.resolve(require('node:os').tmpdir());
    const directory = await fs.mkdtemp(path.join(root, 'versa-fitment-price-test-'));
    expect(path.resolve(directory).startsWith(root + path.sep)).toBe(true);
    const db = { query: jest.fn().mockResolvedValue([{ Itemno: 'SKU-1', Desc1: ours }]) };
    const service = new ReportService(db as any);
    (service as any).evidenceDir = directory;
    const priceHtml = (amount: string) => product(ours) + '<div id="priceblock_ourprice">$' + amount + '</div>';
    const oldPage = { ...parseProductPage(priceHtml('79.99'), url), fetchedAt: '2025-08-01T20:00:00.000Z' };
    const originalFetch = global.fetch;
    try {
      await (service as any).saveFitmentEvidence({ sku: 'SKU-1', targetUrl: url, page: oldPage }, priceHtml('79.99'));
      global.fetch = jest.fn(async () => new Response(priceHtml('87.99'), { headers: { 'content-type': 'text/html' } }));
      const tracked = url + '?th=1&psc=1&tag=example';
      const result = await service.analyzeRows([{ SKU: 'SKU-1', URL: tracked }, { SKU: 'SKU-1', URL: tracked }]);
      for (const row of result.results) {
        expect(row.priceReview).toMatchObject({
          current: { amount: '87.99', currency: 'USD', kind: 'displayed', source: 'Amazon 商品购买区', sourceUrl: tracked },
        });
        expect(row.priceReview.current.fetchedAt).toBe(row.page.fetchedAt);
        expect(row.priceReview).not.toHaveProperty('previous');
        expect(row.remark).toContain('参考页显示售价为 USD 87.99');
      }
      global.fetch = jest.fn(async () => new Response('<title>Robot Check</title>', { headers: { 'content-type': 'text/html' } }));
      const blocked = await service.analyzeRows([{ SKU: 'SKU-1', URL: url }]);
      expect(blocked.results[0].priceReview).toMatchObject({ current: null, price: '' });
      expect(blocked.results[0].remark).toContain('参考售价未核实');
      expect(blocked.results[0].remark).not.toContain('87.99');
    } finally {
      global.fetch = originalFetch;
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('writes both product values in a concrete difference note', () => {
    const comparison = compare(features('2001-2005 Honda Civic front lip OE Style'), features('2007-2011 Honda Civic front lip P Style'));
    expect(fitmentRemark(comparison, null)).toContain('不是同款，适配年份不同，我们的是 2001-2005，对方的是 2007-2011');
    const differentColor = compare(features('2001-2005 Honda Civic front lip OE Style Gloss Black'), features('2001-2005 Honda Civic front lip OE Style Carbon Fiber Print'));
    expect(fitmentRemark(differentColor, null)).toContain('同款不同色，我们的是 Gloss Black，对方的是 Carbon Fiber Look');
    expect(fitmentRemark(compare(features('2001-2005 Honda Civic front lip'), features('2001-2005 Honda Civic front lip P Style')), null))
      .toContain('同款，颜色待定');
  });

  it('reports the mounting position for the BMW trunk-versus-roof spoiler, independently of color', () => {
    const item = local('SP-BF30F803D', '12-18 BMW F80 F30 3D Style', 'Rear Trunk Spoiler PU');
    const roof = features('Rear Roof Spoiler for 12-18 BMW 3-Series F30, A Style, Painted Matte Black');
    const different = compare(item, roof);
    expect(different.verdict).toBe('NOT FIT');
    expect(fitmentRemark(different, null)).toContain('安装位置不同，我们的是 后备箱盖尾翼，对方的是 车顶尾翼');
    expect(fitmentRemark(different, null)).not.toContain('款式');

    const trunk = features('Rear Trunk Spoiler for 12-18 BMW 3-Series F30, Painted Matte Black');
    const same = compare(item, trunk);
    expect(same.verdict).toBe('FIT');
    expect(fitmentRemark(same, null)).toContain('同款，颜色待定');
  });

  it('retains an auditable raw snapshot and rejects path traversal', async () => {
    const fs = require('node:fs/promises');
    const path = require('node:path');
    const os = require('node:os');
    const root = path.resolve(os.tmpdir());
    const directory = await fs.mkdtemp(path.join(root, 'versa-fitment-test-'));
    expect(path.resolve(directory).startsWith(root + path.sep)).toBe(true);
    const service = new ReportService({} as any);
    (service as any).evidenceDir = directory;
    try {
      const id = await (service as any).saveFitmentEvidence({ sku: 'fixture', version: 'rules-v2-evidence' }, '<h1>fixture</h1>');
      const restored = JSON.parse((await service.getFitmentEvidence(id))!.toString('utf8'));
      expect(restored).toMatchObject({ sku: 'fixture', rawHtml: '<h1>fixture</h1>', version: 'rules-v2-evidence' });
      expect(restored.htmlSha256).toMatch(/^[0-9a-f]{64}$/);
      await expect(service.getFitmentEvidence('../../.env')).resolves.toBeNull();
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });

  it('finishes every input row and preserves input order when one row fails', async () => {
    const originalFetch = global.fetch;
    const service = new ReportService({ query: jest.fn(async (_schema, _sql, params) => {
      if (params[0] === 'bad') throw new Error('fixture DB error');
      return [{ Itemno: params[0], Desc1: ours }];
    }) } as any);
    (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
    global.fetch = jest.fn().mockImplementation(async () => new Response(product(ours), { headers: { 'content-type': 'text/html' } }));
    try {
      const job = await service.startAnalyzeJob([{ SKU: 'bad', URL: url }, { SKU: 'good', URL: url }], 'fixture');
      let result = await service.getAnalyzeJobProgress(job.jobId);
      for (let i = 0; i < 50 && result.status === 'running'; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
        result = await service.getAnalyzeJobProgress(job.jobId);
      }
      expect(result.status).toBe('done');
      expect(result.done).toBe(2);
      expect(result.results.map(row => row.sku)).toEqual(['bad', 'good']);
      expect(result.results[0].verdict).toBe('REVIEW');
      expect(result.results[0].reason).toContain('本条处理失败');
    } finally { global.fetch = originalFetch; }
  });

  it('stops requesting a restricted site and retains upload row numbers in the result', async () => {
    const originalFetch = global.fetch;
    const service = new ReportService({ query: jest.fn(async (_schema, _sql, params) =>
      [{ Itemno: params[0], Desc1: ours }]) } as any);
    (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
    global.fetch = jest.fn(async () => new Response('<title>Robot Check</title>', { headers: { 'content-type': 'text/html' } }));
    try {
      const url2 = 'https://www.amazon.com/dp/B000000002';
      const job = await service.startAnalyzeJob([
        { SKU: 'SKU-1', URL: url, sourceRow: 3 },
        { SKU: 'SKU-2', URL: url2, sourceRow: 6 },
        { SKU: 'SKU-3', URL: url, sourceRow: 9 },
      ], 'upload.xlsx');
      let result = await service.getAnalyzeJobProgress(job.jobId);
      for (let i = 0; i < 50 && result.status === 'running'; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
        result = await service.getAnalyzeJobProgress(job.jobId);
      }
      expect(result.status).toBe('done');
      expect(result.results.map(row => row.sourceRow)).toEqual([3, 6, 9]);
      expect(result.results.map(row => row.verdict)).toEqual(['REVIEW', 'PENDING', 'REVIEW']);
      expect(result.results[1].page).toMatchObject({ status: 'not_requested', fetchedAt: '' });
      expect(result.results[1].remark).toBe('待补查，站点请求已暂停，此链接尚未请求。');
      expect(result.results[0].remark).not.toContain('变体未确认');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('resumes only deferred rows after cooldown and preserves completed results', async () => {
    const originalFetch = global.fetch;
    const time = jest.spyOn(Date, 'now');
    const service = new ReportService({ query: jest.fn(async (_schema, _sql, params) =>
      [{ Itemno: params[0], Desc1: ours }]) } as any);
    (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
    const settle = async (id: string) => {
      let job = await service.getAnalyzeJobProgress(id);
      for (let i = 0; i < 70 && job.status === 'running'; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
        job = await service.getAnalyzeJobProgress(id);
      }
      expect(job.status).toBe('done');
      return job;
    };
    const fetched = jest.fn()
      .mockImplementationOnce(async () => new Response('<title>Robot Check</title>', { headers: { 'content-type': 'text/html' } }))
      .mockImplementation(async () => new Response(product(ours), { headers: { 'content-type': 'text/html' } }));
    global.fetch = fetched;
    try {
      const initial = await service.startAnalyzeJob([{ SKU: 'SKU-1', URL: url }, { SKU: 'SKU-2', URL: '' }], 'upload.xlsx');
      const previous = await settle(initial.jobId);
      expect(previous.results.map(row => row.verdict)).toEqual(['REVIEW', 'INVALID']);
      expect(await service.retryAnalyzeJob(initial.jobId)).toMatchObject({ ok: false, retryAt: previous.results[0].page.retryAt });
      time.mockReturnValue(Date.parse(previous.results[0].page.retryAt) + 1);
      const queued = await service.retryAnalyzeJob(initial.jobId);
      expect(queued).toMatchObject({ ok: true, done: 1, total: 2 });
      if (!('jobId' in queued) || !queued.jobId) throw Error('Resume task was not created.');
      const completed = await settle(queued.jobId);
      expect(completed.results[0].verdict).toBe('FIT');
      expect(completed.results[1]).toEqual(previous.results[1]);
      expect(fetched).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
      time.mockRestore();
    }
  });
});
