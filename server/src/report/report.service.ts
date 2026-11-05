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
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const start = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  private splitSourceRange(startDate: string, endDate: string) {
    const recentStart = startDate >= AIS_CUTOVER_DATE ? startDate : AIS_CUTOVER_DATE;
    const recentEnd = endDate > AIS_CUTOVER_DATE ? endDate : null;

    const historicalStart = startDate < AIS_CUTOVER_DATE ? startDate : null;
    const historicalEnd = endDate <= AIS_CUTOVER_DATE ? endDate : AIS_CUTOVER_DATE;

    const recent =
      recentEnd && recentStart < recentEnd
        ? { startDate: recentStart, endDate: recentEnd }
        : null;

    const historical =
      historicalStart && historicalStart < historicalEnd
        ? { startDate: historicalStart, endDate: historicalEnd }
        : null;

    return { recent, historical };
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

  private buildSkuSourceMetricsSql(schema: 'aisdata1' | 'aisdata5') {
    return `
      SELECT
        YEAR(monthly.Trdate) AS yy,
        MONTH(monthly.Trdate) AS mm,
        COALESCE(SUM(monthly.purchaseQty), 0) AS purchaseQty,
        COALESCE(SUM(monthly.purchaseAmt), 0) AS purchaseAmt,
        COALESCE(SUM(monthly.salesQty), 0) AS salesQty,
        COALESCE(SUM(monthly.salesAmt), 0) AS salesAmt,
        COALESCE(SUM(monthly.returnQty), 0) AS returnQty,
        COALESCE(SUM(monthly.ebayQty), 0) AS ebayQty,
        COALESCE(SUM(monthly.amznQty), 0) AS amznQty
      FROM (
        SELECT
          p.Trdate,
          p.Itemno,
          SUM(p.Ordqty) AS purchaseQty,
          SUM(p.Lnamt) AS purchaseAmt,
          0 AS salesQty,
          0 AS salesAmt,
          0 AS returnQty,
          0 AS ebayQty,
          0 AS amznQty
        FROM ${schema}.poinvl p
        WHERE p.Itemno = ? AND p.Trdate >= ? AND p.Trdate < ?
        GROUP BY p.Trdate

        UNION ALL

        SELECT
          s.Trdate,
          s.Itemno,
          0 AS purchaseQty,
          0 AS purchaseAmt,
          SUM(CASE WHEN s.Ordqty > 0 THEN 1 ELSE 0 END) AS salesQty,
          SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty * s.Price ELSE 0 END) AS salesAmt,
          0 AS returnQty,
          SUM(CASE WHEN v.Trorig1 = 'EBAY' AND s.Ordqty > 0 THEN 1 ELSE 0 END) AS ebayQty,
          SUM(CASE WHEN v.Trorig1 = 'AMZN' AND s.Ordqty > 0 THEN 1 ELSE 0 END) AS amznQty
        FROM ${schema}.sainvl s
        LEFT JOIN ${schema}.sainv v ON v.Trno = s.Trno
        WHERE s.Itemno = ? AND s.Trdate >= ? AND s.Trdate < ?
        GROUP BY s.Trdate

        UNION ALL

        SELECT
          m.Trdate,
          l.Itemno,
          0 AS purchaseQty,
          0 AS purchaseAmt,
          0 AS salesQty,
          0 AS salesAmt,
          COUNT(*) AS returnQty,
          0 AS ebayQty,
          0 AS amznQty
        FROM ${schema}.samemo m
        JOIN ${schema}.sainvl l ON m.Invno = l.Trno
        WHERE l.Itemno = ? AND m.Trdate >= ? AND m.Trdate < ?
        GROUP BY m.Trdate, l.Itemno
      ) AS monthly
      WHERE monthly.Itemno = ?
      GROUP BY yy, mm
      ORDER BY yy, mm
    `;
  }

  private async querySkuSourceMetrics(
    schema: 'aisdata1' | 'aisdata5',
    itemId: string,
    startDate: string,
    endDate: string,
  ) {
    const sql = this.buildSkuSourceMetricsSql(schema);

    const rows = await this.db.query<any>(
      schema,
      sql,
      [itemId, startDate, endDate, itemId, startDate, endDate, itemId, startDate, endDate, itemId],
    );

    return rows.map((r) => ({
      yy: Number(r.yy),
      mm: Number(r.mm),
      purchaseQty: Number(r.purchaseQty || 0),
      purchaseAmt: Number(r.purchaseAmt || 0),
      salesQty: Number(r.salesQty || 0),
      salesAmt: Number(r.salesAmt || 0),
      returnQty: Number(r.returnQty || 0),
      ebayQty: Number(r.ebayQty || 0),
      amznQty: Number(r.amznQty || 0),
    }));
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
    const { recent, historical } = this.splitSourceRange(startDate, endDate);

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

    const purchaseRangeQueries = [] as Promise<any[]>[];
    const salesRangeQueries = [] as Promise<any[]>[];
    const returnRangeQueries = [] as Promise<any[]>[];

    if (historical) {
      purchaseRangeQueries.push(
        this.db.query<any>(
          'aisdata5',
          `
          SELECT YEAR(Trdate) AS yy, MONTH(Trdate) AS mm, SUM(Tpieces) AS purchaseQty, SUM(Totamt) AS purchaseAmt
          FROM aisdata5.poinv
          WHERE Compno = ? AND Trdate >= ? AND Trdate < ?
          GROUP BY yy, mm
          `,
          [vendorId, historical.startDate, historical.endDate],
        ),
      );
      salesRangeQueries.push(
        this.db.query<any>(
          'aisdata5',
          `
          SELECT YEAR(s.Trdate) AS yy, MONTH(s.Trdate) AS mm,
                 SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty ELSE 0 END) AS salesQty,
                 SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty * s.Price ELSE 0 END) AS salesAmt
          FROM aisdata0.item i
          STRAIGHT_JOIN aisdata5.sainvl s ON s.Itemno = i.Itemno
          WHERE i.Vendno = ? AND s.Trdate >= ? AND s.Trdate < ?
          GROUP BY yy, mm
          `,
          [vendorId, historical.startDate, historical.endDate],
        ),
      );
      returnRangeQueries.push(
        this.db.query<any>(
          'aisdata5',
          `
          SELECT YEAR(m.Trdate) AS yy, MONTH(m.Trdate) AS mm, COUNT(*) AS returnQty
          FROM aisdata0.item i
          STRAIGHT_JOIN aisdata5.sainvl l ON l.Itemno = i.Itemno
          JOIN aisdata5.samemo m ON m.Invno = l.Trno
          WHERE i.Vendno = ? AND m.Trdate >= ? AND m.Trdate < ?
          GROUP BY yy, mm
          `,
          [vendorId, historical.startDate, historical.endDate],
        ),
      );
    }

    if (recent) {
      purchaseRangeQueries.push(
        this.db.query<any>(
          'aisdata1',
          `
          SELECT YEAR(Trdate) AS yy, MONTH(Trdate) AS mm, SUM(Tpieces) AS purchaseQty, SUM(Totamt) AS purchaseAmt
          FROM aisdata1.poinv
          WHERE Compno = ? AND Trdate >= ? AND Trdate < ?
          GROUP BY yy, mm
          `,
          [vendorId, recent.startDate, recent.endDate],
        ),
      );
      salesRangeQueries.push(
        this.db.query<any>(
          'aisdata1',
          `
          SELECT YEAR(s.Trdate) AS yy, MONTH(s.Trdate) AS mm,
                 SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty ELSE 0 END) AS salesQty,
                 SUM(CASE WHEN s.Ordqty > 0 THEN s.Ordqty * s.Price ELSE 0 END) AS salesAmt
          FROM aisdata0.item i
          STRAIGHT_JOIN aisdata1.sainvl s ON s.Itemno = i.Itemno
          WHERE i.Vendno = ? AND s.Trdate >= ? AND s.Trdate < ?
          GROUP BY yy, mm
          `,
          [vendorId, recent.startDate, recent.endDate],
        ),
      );
      returnRangeQueries.push(
        this.db.query<any>(
          'aisdata1',
          `
          SELECT YEAR(m.Trdate) AS yy, MONTH(m.Trdate) AS mm, COUNT(*) AS returnQty
          FROM aisdata0.item i
          STRAIGHT_JOIN aisdata1.sainvl l ON l.Itemno = i.Itemno
          JOIN aisdata1.samemo m ON m.Invno = l.Trno
          WHERE i.Vendno = ? AND m.Trdate >= ? AND m.Trdate < ?
          GROUP BY yy, mm
          `,
          [vendorId, recent.startDate, recent.endDate],
        ),
      );
    }

    const [purchaseRows, salesRows, returnRows] = await Promise.all([
      Promise.all(purchaseRangeQueries).then((rows) => rows.flat()),
      Promise.all(salesRangeQueries).then((rows) => rows.flat()),
      Promise.all(returnRangeQueries).then((rows) => rows.flat()),
    ]);

    return {
      ok: true,
      vendor,
      rows: this.mergeMetricRows(purchaseRows, salesRows, returnRows),
    };
  }

  async getDataReportSku(itemId: string) {
    const { startDate, endDate } = this.dataReportRange();
    const { recent, historical } = this.splitSourceRange(startDate, endDate);
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

    const metricsQueries = [] as Promise<any[]>[];

    if (historical) {
      metricsQueries.push(
        this.querySkuSourceMetrics('aisdata5', itemId, historical.startDate, historical.endDate),
      );
    }

    if (recent) {
      metricsQueries.push(
        this.querySkuSourceMetrics('aisdata1', itemId, recent.startDate, recent.endDate),
      );
    }

    const sourceRows = await Promise.all(metricsQueries).then((rows) => rows.flat());
    const rows = this.mergeMetricRows(
      sourceRows.map((r) => ({ yy: r.yy, mm: r.mm, purchaseQty: r.purchaseQty, purchaseAmt: r.purchaseAmt })),
      sourceRows.map((r) => ({ yy: r.yy, mm: r.mm, salesQty: r.salesQty, salesAmt: r.salesAmt })),
      sourceRows.map((r) => ({ yy: r.yy, mm: r.mm, returnQty: r.returnQty })),
      sourceRows.map((r) => ({ yy: r.yy, mm: r.mm, ebayQty: r.ebayQty, amznQty: r.amznQty })),
    );

    return {
      ok: true,
      item,
      rows,
      trend: rows
        .filter((r) => r.year === new Date().getFullYear())
        .map((r) => ({
          label: `${String(r.month).padStart(2, '0')}/${String(r.year).slice(-2)}`,
          ebay: r.ebayQty || 0,
          amzn: r.amznQty || 0,
          total: r.salesQty || 0,
        })),
    };
  }

  private extractNumericRange(value: string): string {
    const match = String(value || '').match(/(\d{2,4})\s*[-–]\s*(\d{2,4})/);
    if (!match) return '';
    return `${match[1]}-${match[2]}`;
  }

  private extractYearRange(text: string): string {
    const direct = this.extractNumericRange(text);
    if (direct) return direct;

    const yearMatch = String(text || '').match(/(19|20)\d{2}/g);
    if (yearMatch && yearMatch.length >= 2) {
      return `${yearMatch[0]}-${yearMatch[yearMatch.length - 1]}`;
    }
    return '';
  }

  private extractMakeModel(text: string) {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return { make: '', model: '', fitmentText: '' };

    const makePatterns = [
      'lexus',
      'bmw',
      'honda',
      'subaru',
      'toyota',
      'audi',
      'nissan',
      'ford',
      'mercedes',
      'volkswagen',
      'acura',
      'mazda',
      'tesla',
      'mini',
      'jaguar',
      'cadillac',
      'chrysler',
      'porsche',
      'hyundai',
      'kia',
      'mitsubishi',
      'volvo',
    ];

    const foundMake = makePatterns.find((m) => normalized.toLowerCase().includes(m));
    if (!foundMake) {
      return { make: '', model: '', fitmentText: normalized };
    }

    const remainder = normalized.slice(normalized.toLowerCase().indexOf(foundMake));
    const modelMatch = remainder.match(/([a-z0-9]+(?:\s+[a-z0-9]+)?)\s*(?:front|rear|side|lip|spoiler|grille|diffuser|skirt|splitter|bumper|hood|roof|pr|tr)/i);
    const candidate = modelMatch ? modelMatch[1].trim() : remainder.split(/\s+/).slice(0, 3).join(' ');
    const model = candidate
      .replace(/\b(front|rear|side|lip|spoiler|grille|diffuser|skirt|splitter|bumper|hood|roof|pr|tr)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      make: foundMake,
      model,
      fitmentText: normalized,
    };
  }

  private detectPartType(text: string) {
    const normalized = (text || '').toLowerCase();
    const patterns = [
      ['front bumper lip', 'front bumper lip'],
      ['front lip', 'front lip'],
      ['rear bumper lip', 'rear bumper lip'],
      ['side skirt', 'side skirt'],
      ['spoiler', 'spoiler'],
      ['splitter', 'splitter'],
      ['grille', 'grille'],
      ['diffuser', 'diffuser'],
      ['roof rack', 'roof rack'],
      ['hood', 'hood'],
      ['mirror cover', 'mirror cover'],
      ['valance', 'valance'],
    ];

    for (const [pattern, label] of patterns) {
      if (normalized.includes(pattern)) return label;
    }

    return 'generic accessory';
  }

  private detectStyle(text: string) {
    const normalized = (text || '').toLowerCase();
    const stylePatterns = [
      'ams',
      'cs',
      'tr',
      'type r',
      'type-r',
      'carbon',
      'ural',
      'sport',
      'style',
      'version',
      'lp',
      'm performance',
    ];

    const found = stylePatterns.find((p) => normalized.includes(p));
    return found ? found.toUpperCase() : 'standard';
  }

  private detectColor(text: string) {
    const normalized = (text || '').toLowerCase();
    if (normalized.includes('carbon')) return 'carbon fiber look';
    if (normalized.includes('black')) return 'black';
    if (normalized.includes('matte')) return 'matte';
    if (normalized.includes('gloss')) return 'gloss';
    if (normalized.includes('red')) return 'red';
    if (normalized.includes('silver')) return 'silver';
    if (normalized.includes('white')) return 'white';
    if (normalized.includes('gray')) return 'gray';
    if (normalized.includes('blue')) return 'blue';
    return 'not specified';
  }

  private detectMaterial(text: string) {
    const normalized = (text || '').toLowerCase();
    if (normalized.includes('urethane')) return 'urethane';
    if (normalized.includes('pp')) return 'PP';
    if (normalized.includes('pu')) return 'PU';
    if (normalized.includes('abs')) return 'ABS';
    if (normalized.includes('fiberglass')) return 'fiberglass';
    if (normalized.includes('carbon')) return 'carbon fiber';
    if (normalized.includes('plastic')) return 'plastic';
    if (normalized.includes('aluminum')) return 'aluminum';
    return 'not specified';
  }

  async getDataReportSkuFeatures(itemId: string) {
    const itemRows = await this.db.query<any>(
      'aisdata0',
      `
      SELECT
        Itemno,
        Desc1,
        Desc2,
        Type,
        Matrix,
        Vendno,
        Qtpack,
        Clength,
        Cwidth,
        Cheight,
        Ulength,
        Uwidth,
        Uheight,
        Price1,
        Price2,
        Price3,
        Price4,
        Price5
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
        extracted: null,
      };
    }

    const extracted = this.buildSkuFeatureObject(item);

    return {
      ok: true,
      item: {
        Itemno: item.Itemno,
        Desc1: item.Desc1,
        Desc2: item.Desc2,
        Vendno: item.Vendno,
      },
      extracted,
    };
  }

  private buildSkuFeatureObject(item: any) {
    const combined = `${item.Desc1 || ''} ${item.Desc2 || ''}`.trim();
    const fitment = this.extractYearRange(combined) || this.extractYearRange(item.Desc1 || '') || '';
    const makeModel = this.extractMakeModel(combined);

    return {
      itemno: item.Itemno,
      desc1: item.Desc1 || '',
      desc2: item.Desc2 || '',
      partType: this.detectPartType(combined),
      style: this.detectStyle(combined),
      fitmentRange: fitment,
      make: makeModel.make,
      model: makeModel.model,
      fitmentText: makeModel.fitmentText,
      color: this.detectColor(combined),
      material: this.detectMaterial(combined),
      dimensions: {
        carton: {
          length: item.Clength ?? null,
          width: item.Cwidth ?? null,
          height: item.Cheight ?? null,
        },
        unit: {
          length: item.Ulength ?? null,
          width: item.Uwidth ?? null,
          height: item.Uheight ?? null,
        },
      },
      qtyPerSet: item.Qtpack ?? null,
      pricing: {
        price1: item.Price1 ?? null,
        price2: item.Price2 ?? null,
        price3: item.Price3 ?? null,
        price4: item.Price4 ?? null,
        price5: item.Price5 ?? null,
      },
      vendor: item.Vendno ?? null,
      type: item.Type ?? null,
      matrix: item.Matrix ?? null,
      raw: {
        itemno: item.Itemno,
        desc1: item.Desc1 || '',
        desc2: item.Desc2 || '',
      },
    };
  }

  private stripHtml(text: string) {
    return String(text || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, ' and ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async fetchTargetPageText(targetUrl: string): Promise<string> {
    if (!targetUrl) return '';
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!response.ok) return '';
      const html = await response.text();
      return this.stripHtml(html);
    } catch {
      return '';
    }
  }

  private normalizeText(v: any) {
    return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private normalizeComparableValue(v: any) {
    const text = this.normalizeText(v);
    if (!text || text === 'not specified' || text === 'n/a' || text === 'na') return '';

    let normalized = text;
    const rangeMatch = normalized.match(/^(\d{1,4})\s*(?:-|to|–|~)\s*(\d{1,4})$/);
    if (rangeMatch) {
      const rawStart = rangeMatch[1];
      const rawEnd = rangeMatch[2];
      const start = Number(rawStart);
      const end = Number(rawEnd);
      const formatStart = rawStart.length === 2 ? (start >= 90 ? 1900 + start : 2000 + start) : start;
      const formatEnd = rawEnd.length === 2 ? (end >= 90 ? 1900 + end : 2000 + end) : end;
      normalized = `${formatStart}-${formatEnd}`;
    } else {
      normalized = text
        .replace(/[_-]/g, ' ')
        .replace(/\burethane\b/g, 'pu')
        .replace(/\bpolyurethane\b/g, 'pu')
        .replace(/\bpolypropylene\b/g, 'pp')
        .replace(/\bpp\b/g, 'pp')
        .replace(/\bpu\b/g, 'pu')
        .replace(/\bfront bumper lip\b/g, 'front bumper lip')
        .replace(/\brear bumper lip\b/g, 'rear bumper lip')
        .replace(/\bfront lip\b/g, 'front lip')
        .replace(/\brear lip\b/g, 'rear lip')
        .replace(/\bside skirt\b/g, 'side skirt')
        .replace(/\bspoiler\b/g, 'spoiler')
        .replace(/\bgrille\b/g, 'grille')
        .replace(/\bdiffuser\b/g, 'diffuser')
        .replace(/\bcarbon fiber\b/g, 'carbon')
        .replace(/\bcarbon fiber look\b/g, 'carbon')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return normalized;
  }

  private valuesAreEquivalent(a: any, b: any) {
    const av = this.normalizeComparableValue(a);
    const bv = this.normalizeComparableValue(b);
    if (!av || !bv) return true;
    if (av === bv || av.includes(bv) || bv.includes(av)) return true;
    return false;
  }

  private compareFeatureValues(a: any, b: any, key: string) {
    const av = this.normalizeComparableValue(a);
    const bv = this.normalizeComparableValue(b);
    if (!av && !bv) return { ok: true, reason: null };
    if (!av || !bv) return { ok: true, reason: null };
    if (this.valuesAreEquivalent(a, b)) return { ok: true, reason: null };
    return { ok: false, reason: `${key}: ${a} != ${b}` };
  }

  private normalizeKeyName(key: string) {
    return String(key ?? '')
      .normalize('NFKC')
      .replace(/\uFEFF/g, '')
      .replace(/[\s_\-]+/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .toLowerCase();
  }

  private keyMatches(rowKey: string, candidate: string) {
    return this.normalizeKeyName(rowKey) === this.normalizeKeyName(candidate);
  }

  private getRowValue(row: Record<string, any>, keys: string[]) {
    for (const key of keys) {
      for (const [rowKey, value] of Object.entries(row)) {
        if (this.keyMatches(rowKey, key) && value != null && String(value).trim() !== '') {
          return String(value).trim();
        }
      }
    }
    return '';
  }

  private extractSkuFromRow(row: Record<string, any>) {
    const candidate = this.getRowValue(row, [
      'SKU',
      'sku',
      'Itemno',
      'itemno',
      'Item No',
      'item_no',
      'Product SKU',
      'product_sku',
      'Part Number',
      'part_number',
      'Product Number',
      'Goods ID',
      'goodsid',
      'goods_id',
      'goods no',
      'goodsno',
      '货号',
      'Cpono',
      'cpono',
    ]);
    return candidate.replace(/^['"]|['"]$/g, '').trim();
  }

  private extractTargetUrlFromRow(row: Record<string, any>) {
    const candidateKeys = [
      'target_url',
      'targetUrl',
      'Target URL',
      'TargetUrl',
      'target_link',
      'targetLink',
      'product_url',
      'productUrl',
      'Product URL',
      'reference_url',
      'referenceUrl',
      'Reference URL',
      'target link',
      'Target Link',
      'URL',
      'url',
      'link',
      'Link',
      '参考链接',
      '参考URL',
      '参考地址',
      '链接',
      '网址',
      'URL地址',
      'pageurl',
      'productlink',
      'targeturl',
      '参考链接URL',
      '参考链接地址',
      '参考URL地址',
      'target url',
      'result',
      '检查结果',
      'check result',
    ];

    const direct = this.getRowValue(row, candidateKeys);
    if (direct) {
      const clean = direct.replace(/^['"]|['"]$/g, '').trim();
      if (clean) return /^https?:\/\//i.test(clean) ? clean : /^www\./i.test(clean) ? `https://${clean}` : clean;
    }

    for (const [key, value] of Object.entries(row)) {
      if (value == null || String(value).trim() === '') continue;
      const normalizedKey = this.normalizeKeyName(key);
      const normalizedValue = String(value).trim();
      const isLinkKey =
        normalizedKey.includes('url') ||
        normalizedKey.includes('link') ||
        normalizedKey.includes('链接') ||
        normalizedKey.includes('网址') ||
        normalizedKey.includes('参考链接') ||
        normalizedKey.includes('网页');
      if (isLinkKey) {
        return /^https?:\/\//i.test(normalizedValue) ? normalizedValue : /^www\./i.test(normalizedValue) ? `https://${normalizedValue}` : normalizedValue;
      }
    }

    return '';
  }

  private readonly analyzeJobs = new Map<string, {
    jobId: string;
    fileName: string;
    total: number;
    done: number;
    status: 'running' | 'done' | 'failed';
    results: any[];
    error?: string;
  }>();

  private async analyzeSingleRow(row: Record<string, any>, fileName?: string) {
    const sku = this.extractSkuFromRow(row);
    const targetUrl = this.extractTargetUrlFromRow(row);
    if (!sku) {
      return {
        sku: '',
        fileName,
        verdict: 'NOT FIT',
        confidence: 'low',
        mismatches: ['SKU column missing from uploaded file'],
        reason: 'SKU column missing from uploaded file',
      };
    }

    const existing = await this.getSkuByItemno(sku);
    if (!existing) {
      return {
        sku,
        fileName,
        verdict: 'NOT FIT',
        confidence: 'low',
        mismatches: ['SKU not found in local AIS database'],
        reason: 'SKU not found in local AIS database',
      };
    }

    const itemFeatures = this.buildSkuFeatureObject(existing);
    const externalText = targetUrl ? await this.fetchTargetPageText(targetUrl) : '';
    const externalFeatures = this.extractTextFeatures(externalText || `${existing.Desc1 || ''} ${existing.Desc2 || ''}`);
    const comparison = this.compareSkuFeatures(itemFeatures, externalFeatures, targetUrl);
    const mismatches = comparison.mismatches;
    const verdict = comparison.verdict;
    const confidence = verdict === 'FIT' ? 'medium' : verdict === 'REVIEW' ? 'medium' : verdict === 'INVALID' ? 'low' : 'high';

    return {
      sku,
      fileName,
      verdict,
      confidence,
      mismatches,
      reason: mismatches.length ? mismatches.join('; ') : 'No major mismatch found.',
      internal: itemFeatures,
      targetUrl,
    };
  }

  async analyzeRows(rows: Array<Record<string, any>>, fileName?: string) {
    const results = [] as any[];
    for (const row of rows) {
      results.push(await this.analyzeSingleRow(row, fileName));
    }
    return { ok: true, fileName, results };
  }

  async startAnalyzeJob(rows: Array<Record<string, any>>, fileName?: string) {
    const jobId = `analyze-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      jobId,
      fileName: fileName || 'uploaded-data',
      total: rows.length,
      done: 0,
      status: 'running' as const,
      results: [] as any[],
    };
    this.analyzeJobs.set(jobId, job);

    void this.runAnalyzeJob(jobId, rows, fileName);

    return {
      ok: true,
      jobId,
      status: 'running',
      total: rows.length,
      done: 0,
      fileName: job.fileName,
      results: [],
    };
  }

  async getAnalyzeJobProgress(jobId: string) {
    const job = this.analyzeJobs.get(jobId);
    if (!job) {
      return { ok: false, status: 'failed', message: 'Job not found', jobId, total: 0, done: 0, results: [] };
    }

    return {
      ok: true,
      jobId,
      fileName: job.fileName,
      status: job.status,
      total: job.total,
      done: job.done,
      results: job.results,
      error: job.error || undefined,
      message: job.status === 'failed' ? job.error || 'Analyze failed' : undefined,
    };
  }

  private async runAnalyzeJob(jobId: string, rows: Array<Record<string, any>>, fileName?: string) {
    const job = this.analyzeJobs.get(jobId);
    if (!job) return;

    try {
      const results = [] as any[];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        results.push(await this.analyzeSingleRow(row, fileName));

        const current = this.analyzeJobs.get(jobId);
        if (current) {
          current.done = index + 1;
          current.results = results.slice();
          current.status = current.done >= current.total ? 'done' : 'running';
        }
      }

      const finished = this.analyzeJobs.get(jobId);
      if (finished) {
        finished.done = finished.total;
        finished.results = results;
        finished.status = 'done';
      }
    } catch (error: any) {
      const current = this.analyzeJobs.get(jobId);
      if (current) {
        current.status = 'failed';
        current.error = error?.message || 'Analyze failed';
      }
    }
  }

  private async getSkuByItemno(sku: string) {
    const rows = await this.db.query<any>(
      'aisdata0',
      `
      SELECT *
      FROM aisdata0.item
      WHERE Itemno = ?
      LIMIT 1
      `,
      [sku],
    );
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  private extractTextFeatures(text: string) {
    const source = String(text || '').toLowerCase();
    return {
      fitmentRange: this.extractYearRange(source) || '',
      make: this.extractMakeModel(source).make,
      model: this.extractMakeModel(source).model,
      partType: this.detectPartType(source),
      style: this.detectStyle(source),
      color: this.detectColor(source),
      material: this.detectMaterial(source),
      text: source,
    };
  }

  private compareSkuFeatures(itemFeatures: any, externalFeatures: any, targetUrl: string) {
    const mismatches: string[] = [];
    const hardMismatches: string[] = [];
    const softMismatches: string[] = [];

    if (!targetUrl) {
      return {
        verdict: 'INVALID',
        mismatches: ['No target URL provided for fitment verification'],
        hardMismatches: ['No target URL provided for fitment verification'],
        softMismatches: [],
      };
    }

    const checks = [
      ['brand', itemFeatures.make, externalFeatures.make],
      ['model', itemFeatures.model, externalFeatures.model],
      ['part type', itemFeatures.partType, externalFeatures.partType],
      ['style', itemFeatures.style, externalFeatures.style],
      ['color', itemFeatures.color, externalFeatures.color],
      ['material', itemFeatures.material, externalFeatures.material],
    ] as const;

    for (const [key, itemValue, externalValue] of checks) {
      const itemText = this.normalizeComparableValue(itemValue);
      const externalText = this.normalizeComparableValue(externalValue);
      if (!itemText || !externalText) continue;
      const result = this.compareFeatureValues(itemValue, externalValue, key);
      if (!result.ok) {
        const reason = result.reason || `${key} mismatch`;
        if (['style', 'color', 'material', 'part type'].includes(key)) {
          softMismatches.push(reason);
        } else {
          hardMismatches.push(reason);
        }
      }
    }

    const itemFitRange = this.normalizeComparableValue(itemFeatures.fitmentRange || '');
    const externalFitRange = this.normalizeComparableValue(externalFeatures.fitmentRange || '');
    if (itemFitRange && externalFitRange) {
      const fitmentCheck = this.compareFeatureValues(itemFeatures.fitmentRange, externalFeatures.fitmentRange, 'fitment range');
      if (!fitmentCheck.ok) {
        const reason = fitmentCheck.reason || 'year/fitment range mismatch';
        hardMismatches.push(reason);
      }
    }

    if (hardMismatches.length) {
      mismatches.push(...hardMismatches, ...softMismatches);
      return {
        verdict: 'NOT FIT',
        mismatches,
        hardMismatches,
        softMismatches,
      };
    }

    if (softMismatches.length) {
      mismatches.push(...softMismatches);
      return {
        verdict: 'REVIEW',
        mismatches,
        hardMismatches,
        softMismatches,
      };
    }

    return {
      verdict: 'FIT',
      mismatches: [],
      hardMismatches: [],
      softMismatches: [],
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
