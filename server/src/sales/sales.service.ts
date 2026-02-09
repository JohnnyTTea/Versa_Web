import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

const AIS_CUTOVER_DATE = '2026-01-01';

type SearchType = 'invoice' | 'order' | 'cpo' | 'shipping';

@Injectable()
export class SalesService {
  constructor(private readonly db: MysqlService) {}

  private toNumber(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private normalizeDateValue(v: any): number {
    if (!v) return 0;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.getTime();
    if (typeof v === 'string' && v.length >= 10) {
      const d2 = new Date(v.slice(0, 10));
      if (!Number.isNaN(d2.getTime())) return d2.getTime();
    }
    return 0;
  }

  async getOrder(orderId: string) {
    // 2026-01-01 及之后：aisdata1；之前：aisdata5
    const order1 = await this.db.query(
      'aisdata1',
      `SELECT * FROM saord WHERE Trno = ? AND Trdate >= ? LIMIT 1`,
      [orderId, AIS_CUTOVER_DATE],
    );
    let order = Array.isArray(order1) ? order1[0] : null;
    let schema: 'aisdata1' | 'aisdata5' | null = order ? 'aisdata1' : null;

    if (!order) {
      const order5 = await this.db.query(
        'aisdata5',
        `SELECT * FROM saord WHERE Trno = ? AND Trdate < ? LIMIT 1`,
        [orderId, AIS_CUTOVER_DATE],
      );
      order = Array.isArray(order5) ? order5[0] : null;
      schema = order ? 'aisdata5' : null;
    }

    if (!order || !schema) {
      return { ok: false, message: 'Error: Ord.No. does not exist !', order: null, lines: [], balance: 0 };
    }

    const lines = await this.db.query(
      schema,
      `SELECT * FROM saordl WHERE Trno = ? ORDER BY Lnno`,
      [orderId],
    );

    const total = this.toNumber(order?.Totamt);
    const discount = this.toNumber(order?.Disamt);
    const latefee = this.toNumber(order?.Latamt);
    const paid1 = this.toNumber(order?.Payamt1);
    const paid2 = this.toNumber(order?.Payamt2);
    const balance = total - discount - latefee - paid1 - paid2;

    return {
      ok: true,
      order,
      lines: Array.isArray(lines) ? lines : [],
      balance,
    };
  }

  async getInvoiceSearch(type: SearchType, keyword: string) {
    let rows: any[] = [];

    if (type === 'invoice') {
      const rows1 = await this.db.query(
        'aisdata1',
        `SELECT * FROM sainv WHERE Trno = ? AND Trdate >= ?`,
        [keyword, AIS_CUTOVER_DATE],
      );
      const rows5 = await this.db.query(
        'aisdata5',
        `SELECT * FROM sainv WHERE Trno = ? AND Trdate < ?`,
        [keyword, AIS_CUTOVER_DATE],
      );
      rows = [
        ...(Array.isArray(rows1) ? rows1.map((r) => ({ ...r, __schema: 'aisdata1' })) : []),
        ...(Array.isArray(rows5) ? rows5.map((r) => ({ ...r, __schema: 'aisdata5' })) : []),
      ];
    } else if (type === 'order') {
      const rows1 = await this.db.query(
        'aisdata1',
        `SELECT * FROM sainv WHERE Ordno = ? AND Trdate >= ?`,
        [keyword, AIS_CUTOVER_DATE],
      );
      const rows5 = await this.db.query(
        'aisdata5',
        `SELECT * FROM sainv WHERE Ordno = ? AND Trdate < ?`,
        [keyword, AIS_CUTOVER_DATE],
      );
      rows = [
        ...(Array.isArray(rows1) ? rows1.map((r) => ({ ...r, __schema: 'aisdata1' })) : []),
        ...(Array.isArray(rows5) ? rows5.map((r) => ({ ...r, __schema: 'aisdata5' })) : []),
      ];
    } else if (type === 'cpo') {
      const rows1 = await this.db.query(
        'aisdata1',
        `SELECT * FROM sainv WHERE Cpono = ? AND Trdate >= ?`,
        [keyword, AIS_CUTOVER_DATE],
      );
      const rows5 = await this.db.query(
        'aisdata5',
        `SELECT * FROM sainv WHERE Cpono = ? AND Trdate < ?`,
        [keyword, AIS_CUTOVER_DATE],
      );
      rows = [
        ...(Array.isArray(rows1) ? rows1.map((r) => ({ ...r, __schema: 'aisdata1' })) : []),
        ...(Array.isArray(rows5) ? rows5.map((r) => ({ ...r, __schema: 'aisdata5' })) : []),
      ];
    } else {
      const rows1 = await this.db.query(
        'aisdata1',
        `SELECT * FROM sainv WHERE Stracno = ? AND Trdate >= ?`,
        [keyword, AIS_CUTOVER_DATE],
      );
      const rows5 = await this.db.query(
        'aisdata5',
        `SELECT * FROM sainv WHERE Stracno = ? AND Trdate < ?`,
        [keyword, AIS_CUTOVER_DATE],
      );
      rows = [
        ...(Array.isArray(rows1) ? rows1.map((r) => ({ ...r, __schema: 'aisdata1' })) : []),
        ...(Array.isArray(rows5) ? rows5.map((r) => ({ ...r, __schema: 'aisdata5' })) : []),
      ];
    }

    if (!rows.length) {
      const message =
        type === 'invoice'
          ? 'Error: Inv.No. does not exist !'
          : 'Error: No invoice found by this search condition !';
      return { ok: false, message, head: null, lines: [], balance: 0, matchedInvoices: [] };
    }

    const sorted = [...rows].sort((a, b) => {
      const da = this.normalizeDateValue(a?.Trdate);
      const db = this.normalizeDateValue(b?.Trdate);
      if (db !== da) return db - da;
      const ta = Number(a?.Trno || 0);
      const tb = Number(b?.Trno || 0);
      if (tb !== ta) return tb - ta;
      return String(b?.Trno || '').localeCompare(String(a?.Trno || ''));
    });

    const matchedSet = new Set<string>();
    const matchedInvoices: string[] = [];
    for (const r of sorted) {
      const trno = r?.Trno ? String(r.Trno) : '';
      if (trno && !matchedSet.has(trno)) {
        matchedSet.add(trno);
        matchedInvoices.push(trno);
      }
    }

    const head = sorted[0];
    const schema = head?.__schema === 'aisdata5' ? 'aisdata5' : 'aisdata1';
    const lines = await this.db.query(
      schema,
      `SELECT * FROM sainvl WHERE Trno = ? ORDER BY Lnno`,
      [head?.Trno],
    );

    const total = this.toNumber(head?.Totamt);
    const discount = this.toNumber(head?.Disamt);
    const latefee = this.toNumber(head?.Latamt);
    const paid1 = this.toNumber(head?.Payamt1);
    const paid2 = this.toNumber(head?.Payamt2);
    const balance = total - discount - latefee - paid1 - paid2;

    return {
      ok: true,
      head,
      lines: Array.isArray(lines) ? lines : [],
      balance,
      matchedInvoices,
      message: matchedInvoices.length > 1
        ? `Found ${matchedInvoices.length} invoices. Showing the latest one. You can click the list below to switch.`
        : '',
    };
  }
}
