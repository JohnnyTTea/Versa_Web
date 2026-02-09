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
  | 'Ikon Item Bin'
  | 'ModernDepot Item Bin'
  | 'DTO Item Bin';

type ReportGroup = { name: string; states: string[] };

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
      SELECT samemo.*, sainvl.*
      FROM samemo
      JOIN sainvl ON samemo.Invno = sainvl.Trno
      WHERE samemo.Trdate > ? AND samemo.Trdate < ?
      ORDER BY samemo.Trdate DESC
    `;
    const SAINVL = `
      SELECT Itemno, COUNT(sainvl.Itemno) AS \`Total Sale\`
      FROM aisdata5.sainvl
      WHERE Trdate > ? AND Trdate < ?
      GROUP BY Itemno
      ORDER BY \`Total Sale\` DESC
    `;
    const SAMEMO = `
      SELECT sainvl.Itemno, COUNT(*) AS \`Total Return\`
      FROM aisdata5.samemo
      JOIN aisdata5.sainvl ON samemo.Invno = sainvl.Trno
      WHERE samemo.Trdate > ? AND samemo.Trdate < ?
      GROUP BY sainvl.Itemno
      ORDER BY \`Total Return\` DESC
    `;

    const rmaTable = await this.db.query<any>('aisdata5', RMA, [startDate, endDate]);
    const saleTable = await this.db.query<any>('aisdata5', SAINVL, [startDate, endDate]);
    const returnTable = await this.db.query<any>('aisdata5', SAMEMO, [startDate, endDate]);

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
    if (rmaTable.length) {
      ws1.addRow(Object.keys(rmaTable[0]));
      rmaTable.forEach((r: any) => ws1.addRow(Object.values(r)));
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

  async generate(report: ReportKey): Promise<{ file: string }> {
    switch (report) {
      case 'AIS SLS Report':
        return await this.salesReport();
      case 'Whse SSI Report':
        return await this.whseReport();
      case 'RMA Report':
        return await this.rmaReport();
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
