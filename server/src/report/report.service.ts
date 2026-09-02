import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import ExcelJS from 'exceljs';

const AIS_CUTOVER_DATE = '2026-01-01';

type ReportKey =
  | 'AIS SLS Report'
  | 'Whse SSI Report'
  | 'RMA Report'
  | 'AIS Sales Order Report'
  | 'Ikon Item Bin'
  | 'ModernDepot Item Bin'
  | 'DTO Item Bin';

type ReportGroup = { name: string; states: string[] };
type GenerateOptions = { startDate?: string; endDate?: string };
type DataMonthRow = {
  year: number;
  month: number;
  purchaseQty: number;
  purchaseAmt: number;
  salesQty: number;
  salesAmt: number;
  returnQty: number;
  ebayQty?: number;
  amznQty?: number;
};

@Injectable()
export class ReportService {
  constructor(private readonly db: MysqlService) {}

  private baseDir = path.join(process.cwd(), 'tmp', 'report');

  private async ensureDir() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private escapeCsv(v: any): string {
    const s = v == null ? '' : String(v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  private async saveCsv(filename: string, rows: any[], headers?: string[]) {
    await this.ensureDir();
    const filePath = path.join(this.baseDir, filename);
    const cols = headers && headers.length ? headers : Object.keys(rows?.[0] || {});
    const lines = [
      cols.map((h) => this.escapeCsv(h)).join(','),
      ...rows.map((r) => cols.map((h) => this.escapeCsv(r?.[h])).join(',')),
    ];
    const csv = '\uFEFF' + lines.join('\r\n');
    await fs.writeFile(filePath, csv, 'utf8');
    return { filename, filePath };
  }

  private formatCsvDate(v: any): any {
    if (!(v instanceof Date)) return v;

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }

  private formatRowDates<T extends Record<string, any>>(row: T): T {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, this.formatCsvDate(value)]),
    ) as T;
  }

  private monthRange(n = 13) {
    const now = new Date();
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)); // next month
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - (n - 1), 1));
    const months: string[] = [];
    const cur = new Date(start);
    while (cur < end) {
      months.push(
        `${cur.getUTCFullYear()}.${String(cur.getUTCMonth() + 1).padStart(2, '0')}`,
      );
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return { months, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }

  // Past N months, exclude current month (end at first day of current month)
  private monthRangeExcludeCurrent(n = 13) {
    const now = new Date();
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)); // first day of current month
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - n, 1));
    const months: string[] = [];
    const cur = new Date(start);
    while (cur < end) {
      months.push(
        `${cur.getUTCFullYear()}.${String(cur.getUTCMonth() + 1).padStart(2, '0')}`,
      );
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return { months, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }

  private dataReportRange() {
    const years = this.dataReportYears();
    const startYear = Math.min(...years);
    const endYear = Math.max(...years);
    return {
      startDate: `${startYear}-01-01`,
      endDate: `${endYear + 1}-01-01`,
    };
  }

  private dataReportYears() {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, idx) => currentYear - 6 + idx);
  }

  private monthKey(year: number, month: number) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private emptyDataMonthRows(): DataMonthRow[] {
    return this.dataReportYears().flatMap((year) =>
      Array.from({ length: 12 }, (_, i) => ({
        year,
        month: i + 1,
        purchaseQty: 0,
        purchaseAmt: 0,
        salesQty: 0,
        salesAmt: 0,
        returnQty: 0,
      })),
    );
  }

  private mergeMetricRows(
    purchaseRows: any[],
    salesRows: any[],
    returnRows: any[],
    trendRows?: any[],
  ) {
    const map = new Map(this.emptyDataMonthRows().map((r) => [this.monthKey(r.year, r.month), r]));

    for (const r of purchaseRows || []) {
      const key = this.monthKey(Number(r.yy), Number(r.mm));
      const row = map.get(key);
      if (!row) continue;
      row.purchaseQty = Number(r.purchaseQty || 0);
      row.purchaseAmt = Number(r.purchaseAmt || 0);
    }

    for (const r of salesRows || []) {
      const key = this.monthKey(Number(r.yy), Number(r.mm));
      const row = map.get(key);
      if (!row) continue;
      row.salesQty = Number(r.salesQty || 0);
      row.salesAmt = Number(r.salesAmt || 0);
    }

    for (const r of returnRows || []) {
      const key = this.monthKey(Number(r.yy), Number(r.mm));
      const row = map.get(key);
      if (!row) continue;
      row.returnQty = Number(r.returnQty || 0);
    }

    for (const r of trendRows || []) {
      const key = this.monthKey(Number(r.yy), Number(r.mm));
      const row = map.get(key);
      if (!row) continue;
      row.ebayQty = Number(r.ebayQty || 0);
      row.amznQty = Number(r.amznQty || 0);
    }

    return Array.from(map.values());
  }

  private parseDateRange(options?: GenerateOptions) {
    const startDate = String(options?.startDate || '').trim();
    const endDate = String(options?.endDate || '').trim();
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
      throw new Error('请选择有效的开始日期和结束日期。');
    }

    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('日期范围无效。');
    }

    const normalizedStart = start.toISOString().slice(0, 10);
    const normalizedEnd = end.toISOString().slice(0, 10);
    if (normalizedStart !== startDate || normalizedEnd !== endDate || start > end) {
      throw new Error('日期范围无效。');
    }

    const exclusiveEnd = new Date(end);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);

    return {
      startDate,
      endDate,
      exclusiveEndDate: exclusiveEnd.toISOString().slice(0, 10),
    };
  }

  private async getReportGroups(): Promise<ReportGroup[]> {
    const raw = process.env.REPORT_STATES_JSON || '';
    let source = raw;

    if (!source) {
      const candidates = [
        path.join(process.cwd(), 'server', 'src', 'report', 'report_states.json'),
        path.join(process.cwd(), 'src', 'report', 'report_states.json'),
        path.join(process.cwd(), 'dist', 'report', 'report_states.json'),
        path.join(__dirname, 'report_states.json'),
      ];

      for (const filePath of candidates) {
        try {
          source = await fs.readFile(filePath, 'utf8');
          if (source) break;
        } catch {
          // try next
        }
      }

      if (!source) return [];
    }

    try {
      const parsed = JSON.parse(source);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((g) => ({
          name: String(g?.name || '').trim(),
          states: Array.isArray(g?.states) ? g.states.map((s: any) => String(s).trim().toUpperCase()) : [],
        }))
        .filter((g) => g.name && g.states.length);
    } catch {
      return [];
    }
  }

  private buildStatesSql(states: string[]): string {
    const safe = states.filter((s) => /^[A-Z]{2}$/.test(s));
    if (!safe.length) return "('')";
    return `(${safe.map((s) => `'${s}'`).join(',')})`;
  }

  private async getInventory() {
    const sql = `
      SELECT
        Itemno,
        SUM(CASE WHEN Whse = '1' THEN Onhand ELSE 0 END) AS CA1,
        SUM(CASE WHEN Whse = '2' THEN Onhand ELSE 0 END) AS GA2,
        SUM(CASE WHEN Whse = '3' THEN Onhand ELSE 0 END) AS FBA
      FROM itemwhse
      GROUP BY Itemno;
    `;
    return await this.db.query<any>('aisdata0', sql);
  }

  private async salesReport(): Promise<{ file: string }> {
    const { months, startDate, endDate } = this.monthRangeExcludeCurrent(13);

    const monthCols = months
      .map(
        (m) =>
          `SUM(CASE WHEN DATE_FORMAT(s.Trdate, '%Y.%m') = '${m}' AND s.Ordqty > 0 THEN s.Ordqty ELSE 0 END) AS \`${m}\``,
      )
      .join(', ');

    const sql = `
      SELECT
        s.Itemno, item.Desc1, item.Desc2, item.Adino,
        ${monthCols},
        0 AS TotalSales,
        AVG(s.Price) AS \`Avg(SalePrice)\`,
        item.Vendno, item.Subd2, item.Bin, item.Onhand, item.Oncom, item.Onord,
        item.Price1, item.Price2, item.Price3, item.Price4, item.Price5
      FROM (
        SELECT l.* FROM aisdata1.sainvl l
        WHERE l.Trdate >= ? AND l.Trdate < ? AND l.Trdate >= ?
        UNION ALL
        SELECT l.* FROM aisdata5.sainvl l
        WHERE l.Trdate >= ? AND l.Trdate < ? AND l.Trdate < ?
      ) s
      LEFT JOIN aisdata0.item AS item ON s.Itemno = item.Itemno
      WHERE s.Trdate >= ? AND s.Trdate < ?
      GROUP BY s.Itemno
    `;

    const rows = await this.db.query<any>('aisdata1', sql, [
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
      startDate,
      endDate,
    ]);

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('No sales data.');
    }

    const inv = await this.getInventory();
    const invMap = new Map(inv.map((r: any) => [String(r.Itemno), r]));

    const data = rows.map((r: any) => {
      const totalSales = months.reduce((sum, m) => sum + Number(r[m] || 0), 0);
      const invRow = invMap.get(String(r.Itemno)) || {};
      return {
        ...r,
        TotalSales: totalSales,
        CA1: invRow.CA1 ?? null,
        GA2: invRow.GA2 ?? null,
        FBA: invRow.FBA ?? null,
      };
    });

    data.sort((a: any, b: any) => Number(b.TotalSales) - Number(a.TotalSales));

    const filename = `AIS_SLS_Report_${startDate}_to_${endDate}_${this.todayStamp()}.csv`;
    await this.saveCsv(filename, data);
    return { file: `/api/report/download?file=${encodeURIComponent(filename)}` };
  }

  private async whseReport(): Promise<{ file: string }> {
    const groups = await this.getReportGroups();
    if (!groups.length) {
      throw new Error('Missing REPORT_STATES_JSON configuration.');
    }

    const { startDate, endDate } = this.monthRangeExcludeCurrent(13);
    const groupCols = groups
      .map((g) => {
        const list = this.buildStatesSql(g.states);
        return `SUM(CASE WHEN s.Sstate IN ${list} THEN s.Ordqty ELSE 0 END) AS \`${g.name}\``;
      })
      .join(', ');

    const sql = `
      SELECT
        s.Itemno,
        item.Desc1, item.Desc2, item.Adino, item.Clength, item.Cwidth, item.Ulength, item.Uwidth,
        item.Uheight, item.Onhand, item.Oncom, item.Onord, item.Bin,
        ${groupCols},
        SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty ELSE 0 END) AS \`All\`
      FROM (
        SELECT l.Itemno, l.Ordqty, v.Sstate, l.Trdate
        FROM aisdata1.sainvl l
        JOIN aisdata1.sainv v ON v.Trno = l.Trno
        WHERE l.Trdate >= ? AND l.Trdate < ? AND l.Trdate >= ?
        UNION ALL
        SELECT l.Itemno, l.Ordqty, v.Sstate, l.Trdate
        FROM aisdata5.sainvl l
        JOIN aisdata5.sainv v ON v.Trno = l.Trno
        WHERE l.Trdate >= ? AND l.Trdate < ? AND l.Trdate < ?
      ) s
      LEFT JOIN aisdata0.item item ON s.Itemno = item.Itemno
      WHERE s.Trdate >= ? AND s.Trdate < ?
      GROUP BY s.Itemno
    `;

    const rows = await this.db.query<any>('aisdata1', sql, [
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
      startDate,
      endDate,
    ]);

    const inv = await this.getInventory();
    const invMap = new Map(inv.map((r: any) => [String(r.Itemno), r]));

    const data = rows.map((r: any) => {
      const all = Number(r.All || 0);
      const withPct: any = { ...r };
      for (const g of groups) {
        const v = Number(r[g.name] || 0);
        withPct[`${g.name}/All %`] = all ? `${((v / all) * 100).toFixed(2)}%` : 0;
      }
      const invRow = invMap.get(String(r.Itemno)) || {};
      withPct.CA1 = invRow.CA1 ?? null;
      withPct.GA2 = invRow.GA2 ?? null;
      withPct.FBA = invRow.FBA ?? null;
      return withPct;
    });

    data.sort((a: any, b: any) => Number(b.All || 0) - Number(a.All || 0));

    const filename = `Whse_SSI_Report_${startDate}-${endDate}_${this.todayStamp()}.csv`;
    await this.saveCsv(filename, data);
    return { file: `/api/report/download?file=${encodeURIComponent(filename)}` };
  }

  private async rmaReport(): Promise<{ file: string }> {
    const { startDate, endDate } = this.monthRange(13);

    const RMA = `
      SELECT m.Trdate AS __RmaTrdate, m.*, l.*
      FROM aisdata1.samemo m
      JOIN aisdata1.sainvl l ON m.Invno = l.Trno
      WHERE m.Trdate > ? AND m.Trdate < ? AND m.Trdate >= ?
      UNION ALL
      SELECT m.Trdate AS __RmaTrdate, m.*, l.*
      FROM aisdata5.samemo m
      JOIN aisdata5.sainvl l ON m.Invno = l.Trno
      WHERE m.Trdate > ? AND m.Trdate < ? AND m.Trdate < ?
      ORDER BY __RmaTrdate DESC
    `;
    const SAINVL = `
      SELECT Itemno, SUM(TotalSale) AS \`Total Sale\`
      FROM (
        SELECT Itemno, COUNT(Itemno) AS TotalSale
        FROM aisdata1.sainvl
        WHERE Trdate > ? AND Trdate < ? AND Trdate >= ?
        GROUP BY Itemno
        UNION ALL
        SELECT Itemno, COUNT(Itemno) AS TotalSale
        FROM aisdata5.sainvl
        WHERE Trdate > ? AND Trdate < ? AND Trdate < ?
        GROUP BY Itemno
      ) t
      GROUP BY Itemno
      ORDER BY \`Total Sale\` DESC
    `;
    const SAMEMO = `
      SELECT Itemno, SUM(TotalReturn) AS \`Total Return\`
      FROM (
        SELECT l.Itemno, COUNT(*) AS TotalReturn
        FROM aisdata1.samemo m
        JOIN aisdata1.sainvl l ON m.Invno = l.Trno
        WHERE m.Trdate > ? AND m.Trdate < ? AND m.Trdate >= ?
        GROUP BY l.Itemno
        UNION ALL
        SELECT l.Itemno, COUNT(*) AS TotalReturn
        FROM aisdata5.samemo m
        JOIN aisdata5.sainvl l ON m.Invno = l.Trno
        WHERE m.Trdate > ? AND m.Trdate < ? AND m.Trdate < ?
        GROUP BY l.Itemno
      ) t
      GROUP BY Itemno
      ORDER BY \`Total Return\` DESC
    `;

    const splitParams = [
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
    ];
    const rmaTable = await this.db.query<any>('aisdata0', RMA, splitParams);
    const saleTable = await this.db.query<any>('aisdata0', SAINVL, splitParams);
    const returnTable = await this.db.query<any>('aisdata0', SAMEMO, splitParams);
    const rmaExportRows = rmaTable.map((r: any) => {
      const { __RmaTrdate, ...row } = r;
      return row;
    });

    const saleMap = new Map(saleTable.map((r: any) => [String(r.Itemno), Number(r['Total Sale'] || 0)]));
    const returnMap = new Map(returnTable.map((r: any) => [String(r.Itemno), Number(r['Total Return'] || 0)]));

    const rateRows = Array.from(new Set([...saleMap.keys(), ...returnMap.keys()])).map((k) => {
      const totalSale = saleMap.get(k) || 0;
      const totalReturn = returnMap.get(k) || 0;
      const pct = totalSale > 0 ? (totalReturn * 100.0) / totalSale : 0;
      return {
        Itemno: k,
        'Total Sale': totalSale,
        'Total Return': totalReturn,
        Percentage: pct,
      };
    });

    rateRows.sort((a, b) => {
      if (b.Percentage !== a.Percentage) return b.Percentage - a.Percentage;
      return b['Total Sale'] - a['Total Sale'];
    });

    // write return rate csv with %
    const rrCsvName = `Return_Rate_${startDate}-${endDate}_${this.todayStamp()}.csv`;
    const rrCsvRows = rateRows.map((r) => ({
      ...r,
      Percentage: `${r.Percentage.toFixed(2)}%`,
    }));
    await this.saveCsv(rrCsvName, rrCsvRows, ['Itemno', 'Total Sale', 'Total Return', 'Percentage']);

    // write xlsx
    await this.ensureDir();
    const xlsxName = `RMA_Report_${startDate}-${endDate}_${this.todayStamp()}.xlsx`;
    const filePath = path.join(this.baseDir, xlsxName);
    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('Returned Products');
    if (rmaExportRows.length) {
      ws1.addRow(Object.keys(rmaExportRows[0]));
      rmaExportRows.forEach((r: any) => ws1.addRow(Object.values(r)));
    } else {
      ws1.addRow(['No data']);
    }
    const ws2 = wb.addWorksheet('Return Rate');
    if (rateRows.length) {
      ws2.addRow(['Itemno', 'Total Sale', 'Total Return', 'Percentage']);
      rateRows.forEach((r) =>
        ws2.addRow([r.Itemno, r['Total Sale'], r['Total Return'], `${r.Percentage.toFixed(2)}%`]),
      );
    } else {
      ws2.addRow(['No data']);
    }
    await wb.xlsx.writeFile(filePath);
    return { file: `/api/report/download?file=${encodeURIComponent(xlsxName)}` };
  }

  private async salesOrderReport(options?: GenerateOptions): Promise<{ file: string }> {
    const { startDate, endDate, exclusiveEndDate } = this.parseDateRange(options);
    const lineCols = Array.from({ length: 9 }, (_, i) => `r.Line${i + 1} AS Line${i + 1}`).join(', ');
    const headers = [
      'Line1',
      'Line2',
      'Line3',
      'Line4',
      'Line5',
      'Line6',
      'Line7',
      'Line8',
      'Line9',
    ];

    const sql = `
      SELECT
        o.*,
        ${lineCols}
      FROM aisdata1.saord o
      LEFT JOIN aisdata1.saordr r ON r.Trno = o.Trno
      WHERE o.Trdate >= ? AND o.Trdate < ?
      ORDER BY o.Trdate, o.Trno
    `;

    const rows = await this.db.query<any>('aisdata1', sql, [startDate, exclusiveEndDate]);
    const data = rows.map((row) => this.formatRowDates(row));

    const filename = `AIS_Sales_Order_Report_${startDate}_to_${endDate}_${this.todayStamp()}.csv`;
    await this.saveCsv(filename, data, data.length ? undefined : headers);
    return { file: `/api/report/download?file=${encodeURIComponent(filename)}` };
  }

  async getDataReportVendor(vendorId: string) {
    const { startDate, endDate } = this.dataReportRange();
    const vendorRows = await this.db.query<any>(
      'aisdata1',
      `
      SELECT Compno, Company
      FROM aisdata1.vendor
      WHERE Compno = ?
      LIMIT 1
      `,
      [vendorId],
    );
    const vendor = Array.isArray(vendorRows) ? vendorRows[0] : null;

    if (!vendor) {
      return {
        ok: false,
        message: 'Vendor not found',
        vendor: null,
        rows: this.emptyDataMonthRows(),
      };
    }

    const splitParams = [
      vendorId,
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
      vendorId,
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
    ];

    const [purchaseRows, salesRows, returnRows] = await Promise.all([
      this.db.query<any>(
        'aisdata1',
        `
        SELECT yy, mm, SUM(purchaseQty) AS purchaseQty, SUM(purchaseAmt) AS purchaseAmt
        FROM (
          SELECT YEAR(Trdate) AS yy, MONTH(Trdate) AS mm, SUM(Tpieces) AS purchaseQty, SUM(Totamt) AS purchaseAmt
          FROM aisdata1.poinv
          WHERE Compno = ? AND Trdate >= ? AND Trdate < ? AND Trdate >= ?
          GROUP BY yy, mm
          UNION ALL
          SELECT YEAR(Trdate) AS yy, MONTH(Trdate) AS mm, SUM(Tpieces) AS purchaseQty, SUM(Totamt) AS purchaseAmt
          FROM aisdata5.poinv
          WHERE Compno = ? AND Trdate >= ? AND Trdate < ? AND Trdate < ?
          GROUP BY yy, mm
        ) p
        GROUP BY yy, mm
        `,
        splitParams,
      ),
      this.db.query<any>(
        'aisdata1',
        `
        SELECT yy, mm, SUM(salesQty) AS salesQty, SUM(salesAmt) AS salesAmt
        FROM (
          SELECT
            YEAR(s.Trdate) AS yy,
            MONTH(s.Trdate) AS mm,
            SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty ELSE 0 END) AS salesQty,
            SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty * s.Price ELSE 0 END) AS salesAmt
          FROM aisdata0.item i
          STRAIGHT_JOIN aisdata1.sainvl s ON s.Itemno = i.Itemno
          WHERE i.Vendno = ? AND s.Trdate >= ? AND s.Trdate < ? AND s.Trdate >= ?
          GROUP BY yy, mm
          UNION ALL
          SELECT
            YEAR(s.Trdate) AS yy,
            MONTH(s.Trdate) AS mm,
            SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty ELSE 0 END) AS salesQty,
            SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty * s.Price ELSE 0 END) AS salesAmt
          FROM aisdata0.item i
          STRAIGHT_JOIN aisdata5.sainvl s ON s.Itemno = i.Itemno
          WHERE i.Vendno = ? AND s.Trdate >= ? AND s.Trdate < ? AND s.Trdate < ?
          GROUP BY yy, mm
        ) s
        GROUP BY yy, mm
        `,
        splitParams,
      ),
      this.db.query<any>(
        'aisdata1',
        `
        SELECT yy, mm, SUM(returnQty) AS returnQty
        FROM (
          SELECT YEAR(m.Trdate) AS yy, MONTH(m.Trdate) AS mm, COUNT(*) AS returnQty
          FROM aisdata0.item i
          STRAIGHT_JOIN aisdata1.sainvl l ON l.Itemno = i.Itemno
          JOIN aisdata1.samemo m ON m.Invno = l.Trno
          WHERE i.Vendno = ? AND m.Trdate >= ? AND m.Trdate < ? AND m.Trdate >= ?
          GROUP BY yy, mm
          UNION ALL
          SELECT YEAR(m.Trdate) AS yy, MONTH(m.Trdate) AS mm, COUNT(*) AS returnQty
          FROM aisdata0.item i
          STRAIGHT_JOIN aisdata5.sainvl l ON l.Itemno = i.Itemno
          JOIN aisdata5.samemo m ON m.Invno = l.Trno
          WHERE i.Vendno = ? AND m.Trdate >= ? AND m.Trdate < ? AND m.Trdate < ?
          GROUP BY yy, mm
        ) r
        GROUP BY yy, mm
        `,
        splitParams,
      ),
    ]);

    return {
      ok: true,
      vendor,
      rows: this.mergeMetricRows(purchaseRows, salesRows, returnRows),
    };
  }

  async getDataReportSku(itemId: string) {
    const { startDate, endDate } = this.dataReportRange();
    const itemRows = await this.db.query<any>(
      'aisdata0',
      `
      SELECT Itemno, Desc1, Desc2, Vendno
      FROM aisdata0.item
      WHERE Itemno = ?
      LIMIT 1
      `,
      [itemId],
    );
    const item = Array.isArray(itemRows) ? itemRows[0] : null;

    if (!item) {
      return {
        ok: false,
        message: 'SKU not found',
        item: null,
        rows: this.emptyDataMonthRows(),
        trend: [],
      };
    }

    const splitParams = [
      itemId,
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
      itemId,
      startDate,
      endDate,
      AIS_CUTOVER_DATE,
    ];

    const [purchaseRows, salesRows, returnRows, trendRows] = await Promise.all([
      this.db.query<any>(
        'aisdata1',
        `
        SELECT yy, mm, SUM(purchaseQty) AS purchaseQty, SUM(purchaseAmt) AS purchaseAmt
        FROM (
          SELECT YEAR(Trdate) AS yy, MONTH(Trdate) AS mm, SUM(Ordqty) AS purchaseQty, SUM(Lnamt) AS purchaseAmt
          FROM aisdata1.poinvl
          WHERE Itemno = ? AND Trdate >= ? AND Trdate < ? AND Trdate >= ?
          GROUP BY yy, mm
          UNION ALL
          SELECT YEAR(Trdate) AS yy, MONTH(Trdate) AS mm, SUM(Ordqty) AS purchaseQty, SUM(Lnamt) AS purchaseAmt
          FROM aisdata5.poinvl
          WHERE Itemno = ? AND Trdate >= ? AND Trdate < ? AND Trdate < ?
          GROUP BY yy, mm
        ) p
        GROUP BY yy, mm
        `,
        splitParams,
      ),
      this.db.query<any>(
        'aisdata1',
        `
        SELECT yy, mm, SUM(salesQty) AS salesQty, SUM(salesAmt) AS salesAmt
        FROM (
          SELECT
            YEAR(Trdate) AS yy,
            MONTH(Trdate) AS mm,
            SUM(CASE WHEN Ordqty > 0 THEN 1 ELSE 0 END) AS salesQty,
            SUM(CASE WHEN Ordqty > 0 THEN Ordqty * Price ELSE 0 END) AS salesAmt
          FROM aisdata1.sainvl
          WHERE Itemno = ? AND Trdate >= ? AND Trdate < ? AND Trdate >= ?
          GROUP BY yy, mm
          UNION ALL
          SELECT
            YEAR(Trdate) AS yy,
            MONTH(Trdate) AS mm,
            SUM(CASE WHEN Ordqty > 0 THEN 1 ELSE 0 END) AS salesQty,
            SUM(CASE WHEN Ordqty > 0 THEN Ordqty * Price ELSE 0 END) AS salesAmt
          FROM aisdata5.sainvl
          WHERE Itemno = ? AND Trdate >= ? AND Trdate < ? AND Trdate < ?
          GROUP BY yy, mm
        ) s
        GROUP BY yy, mm
        `,
        splitParams,
      ),
      this.db.query<any>(
        'aisdata1',
        `
        SELECT yy, mm, SUM(returnQty) AS returnQty
        FROM (
          SELECT YEAR(m.Trdate) AS yy, MONTH(m.Trdate) AS mm, COUNT(*) AS returnQty
          FROM aisdata1.samemo m
          JOIN aisdata1.sainvl l ON m.Invno = l.Trno
          WHERE l.Itemno = ? AND m.Trdate >= ? AND m.Trdate < ? AND m.Trdate >= ?
          GROUP BY yy, mm
          UNION ALL
          SELECT YEAR(m.Trdate) AS yy, MONTH(m.Trdate) AS mm, COUNT(*) AS returnQty
          FROM aisdata5.samemo m
          JOIN aisdata5.sainvl l ON m.Invno = l.Trno
          WHERE l.Itemno = ? AND m.Trdate >= ? AND m.Trdate < ? AND m.Trdate < ?
          GROUP BY yy, mm
        ) r
        GROUP BY yy, mm
        `,
        splitParams,
      ),
      this.db.query<any>(
        'aisdata1',
        `
        SELECT yy, mm, SUM(ebayQty) AS ebayQty, SUM(amznQty) AS amznQty
        FROM (
          SELECT
            YEAR(s.Trdate) AS yy,
            MONTH(s.Trdate) AS mm,
            SUM(CASE WHEN v.Trorig1 = 'EBAY' AND s.Ordqty > 0 THEN 1 ELSE 0 END) AS ebayQty,
            SUM(CASE WHEN v.Trorig1 = 'AMZN' AND s.Ordqty > 0 THEN 1 ELSE 0 END) AS amznQty
          FROM aisdata1.sainvl s
          LEFT JOIN aisdata1.sainv v ON v.Trno = s.Trno
          WHERE s.Itemno = ? AND s.Trdate >= ? AND s.Trdate < ? AND s.Trdate >= ?
          GROUP BY yy, mm
          UNION ALL
          SELECT
            YEAR(s.Trdate) AS yy,
            MONTH(s.Trdate) AS mm,
            SUM(CASE WHEN v.Trorig1 = 'EBAY' AND s.Ordqty > 0 THEN 1 ELSE 0 END) AS ebayQty,
            SUM(CASE WHEN v.Trorig1 = 'AMZN' AND s.Ordqty > 0 THEN 1 ELSE 0 END) AS amznQty
          FROM aisdata5.sainvl s
          LEFT JOIN aisdata5.sainv v ON v.Trno = s.Trno
          WHERE s.Itemno = ? AND s.Trdate >= ? AND s.Trdate < ? AND s.Trdate < ?
          GROUP BY yy, mm
        ) t
        GROUP BY yy, mm
        `,
        splitParams,
      ),
    ]);

    const rows = this.mergeMetricRows(purchaseRows, salesRows, returnRows, trendRows);

    return {
      ok: true,
      item,
      rows,
      trend: rows
        .filter((r) => r.year === 2026)
        .map((r) => ({
          label: `${String(r.month).padStart(2, '0')}/${String(r.year).slice(-2)}`,
          ebay: r.ebayQty || 0,
          amzn: r.amznQty || 0,
          total: r.salesQty || 0,
        })),
    };
  }

  private async ikonBin(): Promise<{ file: string }> {
    const sql = `
      SELECT *
      FROM itemwhse
      ORDER BY
      Itemno,
      CASE
        WHEN Bin LIKE 'A%' THEN 0
        WHEN (Bin LIKE '0%' or Bin Like '1%') THEN 1
      END,
      Onhand
    `;
    const rows = await this.db.query<any>('aisdata0', sql);
    const filename = `IKON_Item_Bin_${this.todayStamp()}.csv`;
    await this.saveCsv(filename, rows);
    return { file: `/api/report/download?file=${encodeURIComponent(filename)}` };
  }

  private async dtoBin(): Promise<{ file: string }> {
    const sql = `
      SELECT *
      FROM itemwhse
      ORDER BY
      Itemno,
      Onhand
    `;
    const rows = await this.db.query<any>('aisdata5', sql);
    const filename = `DTO_Item_Bin_${this.todayStamp()}.csv`;
    await this.saveCsv(filename, rows);
    return { file: `/api/report/download?file=${encodeURIComponent(filename)}` };
  }

  private async mdBin(): Promise<{ file: string }> {
    const sql = `
      SELECT *
      FROM itemwhse
      ORDER BY
      Itemno,
      Onhand
    `;
    const rows = await this.db.query<any>('aisdata3', sql);
    const filename = `MD_Item_Bin_${this.todayStamp()}.csv`;
    await this.saveCsv(filename, rows);
    return { file: `/api/report/download?file=${encodeURIComponent(filename)}` };
  }

  private todayStamp() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }

  async generate(report: ReportKey, options?: GenerateOptions): Promise<{ file: string }> {
    switch (report) {
      case 'AIS SLS Report':
        return await this.salesReport();
      case 'Whse SSI Report':
        return await this.whseReport();
      case 'RMA Report':
        return await this.rmaReport();
      case 'AIS Sales Order Report':
        return await this.salesOrderReport(options);
      case 'Ikon Item Bin':
        return await this.ikonBin();
      case 'ModernDepot Item Bin':
        return await this.mdBin();
      case 'DTO Item Bin':
        return await this.dtoBin();
      default:
        throw new Error('Unknown report type');
    }
  }

  async getFilePath(filename: string): Promise<string | null> {
    const safe = path.basename(filename || '');
    if (!safe) return null;
    const filePath = path.join(this.baseDir, safe);
    try {
      await fs.stat(filePath);
      return filePath;
    } catch {
      return null;
    }
  }
}
