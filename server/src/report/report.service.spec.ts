import { ReportService } from './report.service';

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
});
