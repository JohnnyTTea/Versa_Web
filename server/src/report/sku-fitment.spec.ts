import { extractProductFeatures as features, parseProductPage, compareProductFeatures as compare, emptyEvidence } from './sku-fitment';
import { fetchProductEvidence } from './sku-fitment-fetch';
import { ReportService } from './report.service';

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
    expect(features('gloss black front lip').style).toBe('');
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
    expect(result.dimensions.find(d => d.field === 'fitment')?.status).toBe('partial');
    expect(result.verdict).toBe('REVIEW');
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

  it('separates named style, finish, material, and package quantity differences', () => {
    for (const [a, b, field] of [
      ['IKON V2 Style', 'IKON V3 Style', 'style'], ['matte black', 'gloss black', 'color'],
      ['PU Polyurethane', 'PP Polypropylene', 'material'], ['set of 3', 'set of 1', 'quantity'],
    ]) {
      const result = compare(features(a), features(b));
      expect(result.dimensions.find(d => d.field === field)?.status).toBe('different');
    }
  });

  it('does not infer physically different shapes from style names alone', () => {
    const result = compare(features('2001-2005 Lexus IS300 front lip AMS Style'), features('2001-2005 Lexus IS300 front lip CS Style'));
    expect(result.dimensions.find(d => d.field === 'style')?.status).toBe('different');
    expect(result.verdict).toBe('REVIEW');
    expect(result.reason).toContain('结合图片');
  });

  it('does not invent a shape mismatch from rear lip versus diffuser wording', () => {
    const result = compare(features('2022-2026 Honda Civic rear lip'), features('2022-2026 Honda Civic rear diffuser'));
    expect(result.dimensions.find(d => d.field === 'partType')?.status).toBe('unknown');
    expect(result.verdict).toBe('REVIEW');
  });

  it('preserves open-ended years and named style abbreviations', () => {
    expect(features('2021-UP Hyundai Elantra front lip').fitmentRange).toBe('2021+');
    expect(features('IKON V3 Sty gloss black').style).toBe('ikon v3');
    expect(compare(features('2021-UP Hyundai Elantra front lip'), features('2021-2026 Hyundai Elantra front lip')).dimensions.find(d => d.field === 'fitment')?.status).toBe('partial');
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

  it('requires the concrete variant before asserting differences', () => {
    const page = parseProductPage(`${product(ours)}<div id="variation_color_name"><select><option>Select color</option></select></div>`, url);
    expect(page.variantStatus).toBe('unconfirmed');
    expect(compare(features(ours), features('2001-2005 Lexus IS300 front lip red PP'), page).verdict).toBe('REVIEW');
  });

  it('never claims that matching text proves identical physical shape', () => {
    const result = compare(features(ours), features(ours));
    expect(result.verdict).toBe('REVIEW');
    expect(result.dimensions.find(d => d.field === 'visual')?.status).toBe('unknown');
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
});
