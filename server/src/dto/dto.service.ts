import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import ExcelJS from 'exceljs';

type Table = { columns: string[]; data: Array<Array<string | number | null>> };

const DEFAULT_COLUMNS = [
  'Ordno',
  'Itemno',
  'Qty',
  'Category',
  'PickBin',
  'Stock',
  'Lno',
  'OrigOrder',
  'Date',
  'Alt1',
  'Alt2',
  'Alt3',
  'Adino',
  'State',
  'D1Bin',
  'D1',
  'D5Bin',
  'D5',
  'W/E',
  'AltBin',
];

const FULL_QUERY = `
SELECT
    saordl.Trno AS Ordno,
    saordl.Trdate AS Date,
    saordl.Lnno AS Lno,
    saordl.Itemno AS OrigOrder,
    Sitem1 AS Alt1,
    Sitem2 AS Alt2,
    Sitem3 AS Alt3,
    item1.Adino,
    saordl.Ordqty as Qty,
    saord.Sstate AS State,
    whse1.Bin AS D1Bin,
    whse1.Whse AS D1Whse,
    whse1.Onhand AS D1,
    whse2.Bin AS D5Bin,
    whse2.Onhand AS D5
FROM saordl
LEFT JOIN saord ON saordl.Trno = saord.Trno
LEFT JOIN (
    SELECT Sitem1,Sitem2,Sitem3,Itemno,Adino
    FROM aisdata0.item
) item1 on item1.Itemno=saordl.Itemno
LEFT JOIN(
  SELECT Itemno,Whse,Bin,Onhand
  FROM aisdata0.itemwhse
  WHERE
    Whse in('1','2')
    AND (Bin LIKE 'A%' OR Bin LIKE '0%')
    AND Onhand >0
  ORDER BY
    Itemno,
      CASE
        WHEN Bin LIKE 'A%' THEN 0
        WHEN Bin LIKE '0%' THEN 1
      END,
    Onhand
) whse1 on whse1.Itemno=saordl.Itemno
LEFT JOIN(
  SELECT Itemno,Bin,Onhand
  FROM aisdata5.itemwhse
  WHERE Whse ='1'
  AND Onhand >0
  ORDER BY
  Itemno,
  Onhand
) whse2 on whse2.Itemno=saordl.Itemno
WHERE saordl.Trno=?
AND saordl.Itemno not like 'CB%'
`;

const DTO_ITEM = `
SELECT Itemno, Cost
FROM item
WHERE Itemno=?
`;

const DDS_FORM = `
SELECT
Trno AS 'Sales Record Number',
Trorigno AS 'Order Number',
concat(Trorig2,'_',Trno) AS 'Buyer Username',
Company AS 'Buyer Name',
Email1 AS 'Buyer Email',
Addr1 AS 'Buyer Address 1',
Addr2 AS 'Buyer Address 2',
City AS 'Buyer City',
State AS 'Buyer State',
Zip AS 'Buyer Zip',
countrycode.Country AS 'Buyer Country',
Scompany AS 'Ship To Name',
Sphone1 AS 'Ship To Phone',
Saddr1 AS 'Ship To Address 1',
Saddr2 AS 'Ship To Address 2',
Scity AS 'Ship To City',
Sstate AS 'Ship To State',
Szip AS 'Ship To Zip',
countrycode.Country AS 'Ship To Country',
Trorigno AS 'Item Number'
FROM saord
LEFT JOIN countrycode
ON saord.Country=countrycode.Code
WHERE
Trno=?
`;

const AIS_ITEM_BIN = `
SELECT Bin,Onhand
FROM itemwhse
WHERE Itemno=?
AND Whse in('1','2')
AND (Bin LIKE 'A%' OR Bin LIKE '0%' OR Bin like '1%')
AND Onhand >0
ORDER BY
Itemno,
  CASE
    WHEN Bin LIKE 'A%' THEN 0
    WHEN (Bin LIKE '0%' or Bin Like '1%') THEN 1
    WHEN RIGHT(Bin, 2) IS NOT NULL THEN 2
  END,
Onhand
`;

const DTO_ITEM_BIN = `
SELECT Bin,Onhand
FROM itemwhse
WHERE Itemno=?
AND Whse ='1'
AND Onhand >0
ORDER BY
Itemno,
  CASE
    WHEN RIGHT(Bin, 2) IS NOT NULL THEN 2
  END,
Onhand
`;

const BOX_ID_QUERY = `
SELECT Sboxno FROM item
WHERE Itemno = ?
`;

const DDS_COLUMNS = [
  'Sales Record Number',
  'Order Number',
  'Buyer Username',
  'Buyer Name',
  'Buyer Email',
  'Buyer Note',
  'Buyer Address 1',
  'Buyer Address 2',
  'Buyer City',
  'Buyer State',
  'Buyer Zip',
  'Buyer Country',
  'Ship To Name',
  'Ship To Phone',
  'Ship To Address 1',
  'Ship To Address 2',
  'Ship To City',
  'Ship To State',
  'Ship To Zip',
  'Ship To Country',
  'Item Number',
  'Item Title',
  'Custom Label',
  'Sold Via Promoted Listings',
  'Quantity',
  'Sold For',
  'Shipping And Handling',
  'eBay Collect And Remit Tax Rate',
  'eBay Collect And Remit Tax Type',
  'Seller Collected Tax',
  'eBay Collected Tax',
  'Electronic Waste Recycling Fee',
  'Mattress Recycling Fee',
  'Battery Recycling Fee',
  'White Goods Disposal Tax',
  'Tire Recycling Fee',
  'Additional Fee',
  'Total Price',
  'eBay Collected Tax and Fees Included in Total',
  'Payment Method',
  'Sale Date',
  'Paid On Date',
  'Ship By Date',
  'Minimum Estimated Delivery Date',
  'Maximum Estimated Delivery Date',
  'Shipped On Date',
  'Feedback Left',
  'Feedback Received',
  'My Item Note',
  'PayPal Transaction ID',
  'Shipping Service',
  'Tracking Number',
  'Transaction ID',
  'Variation Details',
  'Global Shipping Program',
  'Global Shipping Reference ID',
  'Click And Collect',
  'Click And Collect Reference Number',
  'eBay Plus',
  'Authenticity Verification Program',
  'Authenticity Verification Status',
  'Authenticity Verification Outcome Reason',
  'Tax City',
  'Tax State',
  'Tax Zip',
  'Tax Country',
];

@Injectable()
export class DtoService {
  constructor(private readonly db: MysqlService) {}

  private baseDir = path.join(process.cwd(), 'tmp', 'dto');

  private async ensureDir() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private getEastStates(): Set<string> {
    const raw = process.env.DTO_EAST_STATES || '';
    const list = raw
      ? raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : [
          'CT', 'DE', 'FL', 'GA', 'ME', 'MD', 'MA', 'NH', 'NJ', 'NY', 'NC',
          'PA', 'RI', 'SC', 'VT', 'VA', 'WV', 'DC',
        ];
    return new Set(list);
  }

  private parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = line[i + 1];
          if (next === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') {
          out.push(cur);
          cur = '';
        } else cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  private parseCsv(buffer: Buffer): string[][] {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    return lines.filter((l) => l.trim().length > 0).map((l) => this.parseCsvLine(l));
  }

  private toNumber(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private normalizeDate(v: any): string {
    if (!v) return '';
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return String(v);
  }

  private safeString(v: any): string {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  async buildTableFromCsv(buffer: Buffer): Promise<Table> {
    const rows = this.parseCsv(buffer);
    if (!rows.length) return { columns: DEFAULT_COLUMNS, data: [] };

    const header = rows[0].map((h) => String(h ?? '').trim());
    if ((header[0] || '').toLowerCase() !== 'ordno') {
      return { columns: DEFAULT_COLUMNS, data: [] };
    }

    const ordnos = Array.from(
      new Set(rows.slice(1).map((r) => String(r?.[0] ?? '').trim()).filter(Boolean)),
    );

    if (!ordnos.length) return { columns: DEFAULT_COLUMNS, data: [] };

    const eastStates = this.getEastStates();
    const mainRows: any[] = [];

    for (const ordno of ordnos) {
      const salesOrders = await this.db.query<any>('aisdata1', FULL_QUERY, [ordno]);
      if (!Array.isArray(salesOrders) || salesOrders.length === 0) continue;

      salesOrders.forEach((r: any) => {
        r['W/E'] = eastStates.has(String(r.State ?? '').toUpperCase()) ? 'East' : 'West';
      });

      const hasWest = salesOrders.some((r: any) => r['W/E'] === 'West');
      salesOrders.sort((a: any, b: any) => {
        const wa = this.toNumber(a.D1Whse);
        const wb = this.toNumber(b.D1Whse);
        return hasWest ? wa - wb : wb - wa;
      });

      const seenLno = new Set<string>();
      const dedup: any[] = [];
      for (const r of salesOrders) {
        const key = String(r.Lno ?? '');
        if (seenLno.has(key)) continue;
        seenLno.add(key);
        dedup.push(r);
      }

      dedup.sort((a: any, b: any) => this.toNumber(a.Lno) - this.toNumber(b.Lno));
      mainRows.push(...dedup);
    }

    // 初始化扩展列
    mainRows.forEach((r) => {
      r.AltBin = null;
      r.Category = '';
      r.PickBin = '';
      r.Stock = '';
      r.Itemno = '';
    });

    for (const r of mainRows) {
      const d1bin = r.D1Bin;
      const d5bin = r.D5Bin;
      const alt1 = r.Alt1 ?? '';
      const alt2 = r.Alt2 ?? '';

      if (d1bin != null && d1bin !== '') {
        if (String(d1bin)[0] !== 'A') r.Category = 'D1E';
        else r.Category = 'D1';
        r.PickBin = d1bin;
        r.Stock = r.D1;
        r.Itemno = r.OrigOrder;
      } else {
        if (alt1 !== alt2 && alt2 != null) {
          for (const altKey of ['Alt1', 'Alt2']) {
            const altVal = r[altKey];
            if (altVal === '') continue;

            const bin1 = await this.db.query<any>('aisdata0', AIS_ITEM_BIN, [altVal]);
            if (!bin1 || bin1.length === 0) {
              const bin5 = await this.db.query<any>('aisdata5', DTO_ITEM_BIN, [altVal]);
              if (!bin5 || bin5.length === 0) {
                if (d5bin != null && r.Category === '') {
                  r.Category = 'D5';
                  r.PickBin = d5bin;
                  r.Stock = r.D5;
                  r.Itemno = r.OrigOrder;
                } else {
                  if (r.Category === '') {
                    const boxID = await this.db.query<any>('aisdata0', BOX_ID_QUERY, [altVal]);
                    const boxValue = boxID && boxID[0] ? boxID[0].Sboxno : '';
                    r.Itemno = r.Adino;
                    if (boxValue === 'D44') r.Category = 'D5(PrintJob)';
                    else if (boxValue === '') r.Category = 'Check Size';
                    else r.Category = 'DDS';
                  }
                }
              } else {
                if (r.Category === '') {
                  r.AltBin = `${altKey},${bin5[0].Bin},5`;
                  r.Category = `D5${altKey}`;
                  r.PickBin = bin5[0].Bin;
                  r.Stock = bin5[0].Onhand;
                  r.Itemno = altVal;
                }
              }
            } else {
              if (r.AltBin == null) {
                r.AltBin = `${altKey},${bin1[0].Bin},1`;
                r.Category = String(bin1[0].Bin)[0] === 'A' ? `D1${altKey}` : `D1E${altKey}`;
                r.PickBin = bin1[0].Bin;
                r.Stock = bin1[0].Onhand;
                r.Itemno = altVal;
              }
            }
          }
        } else if (d5bin != null) {
          r.Category = 'D5';
          r.PickBin = d5bin;
          r.Stock = r.D5;
          r.Itemno = r.OrigOrder;
        } else {
          r.Itemno = r.Adino;
          r.Category = 'DDS';
        }
      }
    }

    // Alt2 后缀规则
    mainRows.forEach((r) => {
      if (String(r.Category || '').endsWith('Alt2')) r.Category = '';
    });

    mainRows.sort((a: any, b: any) => {
      const ca = String(a.Category ?? '');
      const cb = String(b.Category ?? '');
      if (ca !== cb) return ca.localeCompare(cb);
      return this.toNumber(a.Ordno) - this.toNumber(b.Ordno);
    });

    const data = mainRows.map((r) =>
      DEFAULT_COLUMNS.map((c) => {
        const v = r[c];
        if (v === undefined || v === null) return null;
        if (c === 'Date') return this.normalizeDate(v);
        return v;
      }),
    );

    return { columns: DEFAULT_COLUMNS, data };
  }

  private async createOpo(table: any[]) {
    const rows = table.map((r) => ({ ...r, Qty: this.toNumber(r.Qty) }));
    const table1 = rows.filter((r) => String(r.Category || '').includes('D5'));
    const dtoUSAInv: any[] = [];
    for (const r of table1) {
      const costRows = await this.db.query<any>('aisdata5', DTO_ITEM, [r.Itemno]);
      const cost = costRows && costRows[0] ? costRows[0].Cost : '';
      dtoUSAInv.push({
        'Item No.': r.Itemno,
        'Order Qty': r.Qty,
        'Whse No.': 'PC',
        'Unit Price': cost,
      });
    }

    const dtoUSAGrouped: any[] = [];
    const map = new Map<string, any>();
    dtoUSAInv.forEach((r) => {
      const key = String(r['Item No.']);
      if (!map.has(key)) {
        map.set(key, { ...r });
      } else {
        map.get(key)['Order Qty'] += this.toNumber(r['Order Qty']);
      }
    });
    map.forEach((v) => dtoUSAGrouped.push(v));

    const d1opo = dtoUSAGrouped.map((r) => ({
      'Item No.': r['Item No.'],
      'Order Qty': r['Order Qty'],
      'Unit Price': r['Unit Price'],
    }));

    const table2 = rows.filter((r) => String(r.Category || '').includes('DDS'));
    const ddsoPo: any[] = [];
    for (const r of table2) {
      const costRows = await this.db.query<any>('aisdata0', DTO_ITEM, [r.OrigOrder]);
      const cost = costRows && costRows[0] ? costRows[0].Cost : '';
      ddsoPo.push({
        'Item No.': r.OrigOrder,
        'Order Qty': r.Qty,
        'Unit Price': cost,
      });
    }
    const ddsGrouped: any[] = [];
    const map2 = new Map<string, any>();
    ddsoPo.forEach((r) => {
      const key = String(r['Item No.']);
      if (!map2.has(key)) map2.set(key, { ...r });
      else map2.get(key)['Order Qty'] += this.toNumber(r['Order Qty']);
    });
    map2.forEach((v) => ddsGrouped.push(v));

    const table3 = rows
      .filter((r) => String(r.Category || '').includes('DDS'))
      .map((r) => ({
        'Sales Record Number': r.Ordno,
        'Item Title': r.OrigOrder,
        'Custom Label': r.Itemno,
        Quantity: r.Qty,
        'Sale Date': new Date().toLocaleDateString('en-US'),
        'Shipping Service': 'DHL',
      }));

    const ddsRows: any[] = [];
    for (const r of table3) {
      const q = await this.db.query<any>('aisdata1', DDS_FORM, [r['Sales Record Number']]);
      if (Array.isArray(q) && q.length) ddsRows.push(...q);
    }

    const ddsMerged = ddsRows.map((r, idx) => {
      const base: any = {};
      DDS_COLUMNS.forEach((c) => (base[c] = r[c] ?? ''));
      const add = table3[idx];
      if (add) {
        Object.keys(add).forEach((k) => (base[k] = add[k]));
      }
      const phone = String(base['Ship To Phone'] || '');
      base['Ship To Phone'] = phone.replace(/^\+1\s*|\s*ext\.\s*\d*/gi, '');
      return base;
    });

    return { d1opo, dtoUSAGrouped, ddsGrouped, ddsMerged };
  }

  async saveAndBuildExcel(table: any[]) {
    await this.ensureDir();

    const { d1opo, dtoUSAGrouped, ddsGrouped, ddsMerged } = await this.createOpo(table);

    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `DTO_Orders_${pad(today.getMonth() + 1)}${pad(today.getDate())}${today.getFullYear()}.xlsx`;
    const filePath = path.join(this.baseDir, filename);

    const workbook = new ExcelJS.Workbook();
    const sheets: Array<{ name: string; rows: any[] }> = [
      { name: 'DTO Order Processing', rows: table },
      { name: 'D1 OPO DTO_USA', rows: d1opo },
      { name: 'D5 SO', rows: dtoUSAGrouped },
      { name: 'D1 OPO DTO(DDS)', rows: ddsGrouped },
      { name: 'DDS', rows: ddsMerged },
    ];

    sheets.forEach((s) => {
      const ws = workbook.addWorksheet(s.name.slice(0, 31));
      if (!s.rows || s.rows.length === 0) {
        ws.addRow(['No data']);
        return;
      }
      const header = Object.keys(s.rows[0]);
      ws.addRow(header);
      s.rows.forEach((r) => {
        ws.addRow(header.map((h) => r[h] ?? ''));
      });
    });

    await workbook.xlsx.writeFile(filePath);
    return { filename, filePath };
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
