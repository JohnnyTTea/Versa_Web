import { ReportService } from './report.service';
import { compareProductFeatures } from './sku-fitment';

describe('ReportService.date-range optimization', () => {
  it('defaults to the last 12 months instead of 7 years', () => {
    const now = new Date();
    const service = new ReportService({} as any);
    const range = (service as any).dataReportRange();

    const expectedStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
    const expectedEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    expect(range.startDate).toBe(expectedStart.toISOString().slice(0, 10));
    expect(range.endDate).toBe(expectedEnd.toISOString().slice(0, 10));
  });

  it('splits the query by data source so recent data only hits aisdata1', () => {
    const service = new ReportService({} as any);
    const split = (service as any).splitSourceRange('2025-09-01', '2026-09-01');

    expect(split.recent).toEqual({ startDate: '2026-01-01', endDate: '2026-09-01' });
    expect(split.historical).toEqual({ startDate: '2025-09-01', endDate: '2026-01-01' });
  });

  it('avoids querying the modern source when the whole range is historical', () => {
    const service = new ReportService({} as any);
    const split = (service as any).splitSourceRange('2025-01-01', '2025-12-31');

    expect(split.recent).toBeNull();
    expect(split.historical).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' });
  });

  it('builds a single aggregated SKU query per source range with all monthly metrics', () => {
    const service = new ReportService({} as any);
    const sql = (service as any).buildSkuSourceMetricsSql('aisdata1');

    expect(sql).toContain('COALESCE(SUM(monthly.purchaseQty), 0) AS purchaseQty');
    expect(sql).toContain('COALESCE(SUM(monthly.salesQty), 0) AS salesQty');
    expect(sql).toContain('COALESCE(SUM(monthly.returnQty), 0) AS returnQty');
    expect(sql).toContain('COALESCE(SUM(monthly.ebayQty), 0) AS ebayQty');
    expect(sql).toContain('COALESCE(SUM(monthly.amznQty), 0) AS amznQty');
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('GROUP BY yy, mm');
  });

  it('extracts SKU and target URL from common uploaded column names and keeps a text-only matching page in REVIEW', async () => {
    const service = new ReportService({} as any);
    const db = { query: jest.fn().mockResolvedValue([{ Itemno: 'T-1001', Desc1: 'Toyota Camry Front Bumper Black', Desc2: '', Vendno: 'ACME' }]) };
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<h1 id="productTitle">2019-2021 Toyota Camry front bumper black</h1>',
    } as any);

    try {
      (service as any).db = db;
      (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
      const result = await service.analyzeRows([
        { 'Product SKU': 'T-1001', 'Target URL': 'https://www.amazon.com/dp/B000000001' },
      ], 'fixture.xlsx');

      expect(result.ok).toBe(true);
      expect(result.results[0].sku).toBe('T-1001');
      expect(result.results[0].verdict).toBe('REVIEW');
      expect(result.results[0].page.status).toBe('ok');
      expect(result.results[0].targetUrl).toBe('https://www.amazon.com/dp/B000000001');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reads target URLs from Chinese column names like 参考链接', async () => {
    const service = new ReportService({} as any);
    const db = { query: jest.fn().mockResolvedValue([{ Itemno: 'T-1001', Desc1: 'Toyota Camry Front Bumper Black', Desc2: '', Vendno: 'ACME' }]) };
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<h1 id="productTitle">2019-2021 Toyota Camry front bumper black</h1>',
    } as any);

    try {
      (service as any).db = db;
      (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
      const result = await service.analyzeRows([
        { SKU: 'T-1001', 参考链接: 'https://www.amazon.com/dp/B000000001' },
      ], 'fixture.xlsx');

      expect(result.results[0].targetUrl).toBe('https://www.amazon.com/dp/B000000001');
      expect(result.results[0].verdict).toBe('REVIEW');
      expect(result.results[0].page.status).toBe('ok');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reads target URLs from normalized headers with spacing and punctuation variations', async () => {
    const service = new ReportService({} as any);
    const db = { query: jest.fn().mockResolvedValue([{ Itemno: 'T-1001', Desc1: 'Toyota Camry Front Bumper Black', Desc2: '', Vendno: 'ACME' }]) };
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<h1 id="productTitle">2019-2021 Toyota Camry front bumper black</h1>',
    } as any);

    try {
      (service as any).db = db;
      (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
      const result = await service.analyzeRows([
        { ' Product SKU ': 'T-1001', 'Reference URL ': 'https://www.amazon.com/dp/B000000001' },
      ], 'fixture.xlsx');

      expect(result.results[0].sku).toBe('T-1001');
      expect(result.results[0].targetUrl).toBe('https://www.amazon.com/dp/B000000001');
      expect(result.results[0].verdict).toBe('REVIEW');
      expect(result.results[0].page.status).toBe('ok');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reads Goods ID and 参考链接 headers used in the real upload template', async () => {
    const service = new ReportService({} as any);
    const db = { query: jest.fn().mockResolvedValue([{ Itemno: 'T-1001', Desc1: 'Toyota Camry Front Bumper Black', Desc2: '', Vendno: 'ACME' }]) };
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<h1 id="productTitle">2019-2021 Toyota Camry front bumper black</h1>',
    } as any);

    try {
      (service as any).db = db;
      (service as any).saveFitmentEvidence = jest.fn().mockResolvedValue('fixture');
      const result = await service.analyzeRows([
        { SKU: 'T-1001', 'Goods ID': '610567364390980', '参考链接': 'https://www.amazon.com/dp/B000000001', '检查结果': 'PASS' },
      ], 'fixture.xlsx');

      expect(result.results[0].sku).toBe('T-1001');
      expect(result.results[0].targetUrl).toBe('https://www.amazon.com/dp/B000000001');
      expect(result.results[0].verdict).toBe('REVIEW');
      expect(result.results[0].page.status).toBe('ok');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('keeps missing metadata unknown while recognizing material aliases', () => {
    const service = new ReportService({} as any);

    expect(compareProductFeatures({ material: 'PP' }, { material: 'polypropylene' }).dimensions.some(d => d.field === 'material')).toBe(false);
    const fit = compareProductFeatures(
      { make: '', model: '', partType: 'front bumper lip', style: 'ams', color: 'black', material: 'urethane', fitmentRange: '01-05' },
      { make: 'lexus', model: 'is300', partType: 'front bumper lip', style: 'ams', color: 'black', material: 'pu', fitmentRange: '2001-2005' },
    );

    expect(fit.verdict).toBe('REVIEW');
    expect(fit.mismatches).toEqual([]);
  });

  it('identifies explicit style or material differences instead of treating them as a match', () => {
    const service = new ReportService({} as any);
    const review = compareProductFeatures(
      { make: 'lexus', model: 'is300', partType: 'front bumper lip', style: 'ams', color: 'black', material: 'pu', fitmentRange: '2001-2005' },
      { make: 'lexus', model: 'is300', partType: 'front bumper lip', style: 'cs', color: 'black', material: 'pp', fitmentRange: '2001-2005' },
    );

    expect(review.verdict).toBe('NOT FIT');
    expect(review.mismatches).toEqual(expect.arrayContaining(['style: ams ≠ cs']));
  });
});
