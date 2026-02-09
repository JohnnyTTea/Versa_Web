import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

const THRESHOLD = 0.05;

type DbKey = 'aisdata1' | 'aisdata3';

type ChangeRow = {
  trno: number;
  trdate: string;
  old_othamt1: number;
  new_othamt1: number;
  subtotal_before: number;
  subtotal_after: number;
};

type DetailRow = {
  Trno: number;
  Cpono?: string;
  Trdate?: string;
  Itemno: string;
  Shiqty: number;
  UnitPrice: number;
  UnitAmount: number;
  Othamt1: number;
  Taxamt1?: number;
  Jouno?: string;
};

@Injectable()
export class ModifyService {
  constructor(private readonly db: MysqlService) {}

  private round2(v: number) {
    return Math.round(v * 100) / 100;
  }

  private toNumber(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private toIsoDate(s: string): string {
    const raw = (s || '').trim();
    if (!raw) return '';
    if (raw.includes('/')) {
      const parts = raw.split('/');
      if (parts.length === 3) {
        const m = Number(parts[0]);
        const d = Number(parts[1]);
        const y = Number(parts[2]);
        if (m && d && y) {
          const dt = new Date(Date.UTC(y, m - 1, d));
          if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
        }
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return '';
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async runOtherCharge(params: {
    action: string;
    start_date: string;
    end_date: string;
    dry_run: boolean;
  }) {
    const action = (params.action || '').trim();
    if (!action.startsWith('Other Charge Remove')) {
      return { success: false, error: `不支持的操作：${action}` };
    }

    const start = this.toIsoDate(params.start_date);
    const end = this.toIsoDate(params.end_date);
    if (!start || !end) {
      return { success: false, error: '起止日期格式不正确（需要 YYYY-MM-DD）' };
    }

    const db: DbKey = action.includes('(MD)') ? 'aisdata3' : 'aisdata1';

    const sqlInv = `
      SELECT Trno, Cpono, Trdate, Othamt1, Taxamt1, Jouno
      FROM sainv
      WHERE Trdate BETWEEN ? AND ?
        AND ABS(Othamt1) >= ?
      ORDER BY Trdate DESC, Trno DESC
    `;

    const invRows = await this.db.query<any>(db, sqlInv, [start, end, THRESHOLD]);
    if (!Array.isArray(invRows) || invRows.length === 0) {
      return {
        success: true,
        dry_run: params.dry_run,
        db,
        affected_trno_count: 0,
        updated_rows: 0,
        changes: [],
        preview_file: null,
        notes: [`No invoices matched in [${start} ~ ${end}] with |Othamt1|>=${THRESHOLD}.`],
      };
    }

    const trnos = Array.from(new Set(invRows.map((r) => Number(r.Trno)).filter((n) => Number.isFinite(n))));
    const notes = [`Hit invoices: ${trnos.length}`];

    const detailRows: DetailRow[] = [];
    const chunks = this.chunk(trnos, 500);
    for (const chunk of chunks) {
      const placeholders = chunk.map(() => '?').join(',');
      const sqlDetail = `
        SELECT
          v.Trno, v.Cpono, v.Trdate,
          l.Itemno, l.Shiqty,
          l.Price  AS UnitPrice,
          l.Lnamt  AS UnitAmount,
          v.Othamt1, v.Taxamt1, v.Jouno
        FROM sainvl AS l
        JOIN sainv  AS v ON v.Trno = l.Trno
        WHERE v.Trno IN (${placeholders})
        ORDER BY v.Trdate DESC, v.Trno DESC
      `;
      const rows = await this.db.query<any>(db, sqlDetail, chunk);
      if (Array.isArray(rows) && rows.length) {
        rows.forEach((r: any) => {
          detailRows.push({
            Trno: Number(r.Trno),
            Cpono: r.Cpono ?? '',
            Trdate: r.Trdate ?? '',
            Itemno: String(r.Itemno ?? ''),
            Shiqty: this.toNumber(r.Shiqty),
            UnitPrice: this.toNumber(r.UnitPrice),
            UnitAmount: this.toNumber(r.UnitAmount),
            Othamt1: this.toNumber(r.Othamt1),
            Taxamt1: this.toNumber(r.Taxamt1),
            Jouno: r.Jouno ?? '',
          });
        });
      }
    }

    if (detailRows.length === 0) {
      return {
        success: true,
        dry_run: params.dry_run,
        db,
        affected_trno_count: 0,
        updated_rows: 0,
        changes: [],
        preview_file: null,
        notes: ['Detail join returned 0 rows.'],
      };
    }

    // 计算每张发票的 Total
    const totalByTrno = new Map<number, number>();
    detailRows.forEach((r) => {
      const cur = totalByTrno.get(r.Trno) || 0;
      totalByTrno.set(r.Trno, this.round2(cur + r.UnitAmount));
    });

    // 计算变更
    type CalcRow = DetailRow & {
      Total: number;
      Add: number;
      new_price: number;
      total_price: number;
      sub_total: number;
    };
    const calcRows: CalcRow[] = detailRows.map((r) => {
      const total = totalByTrno.get(r.Trno) || 0;
      const add =
        total === 0 || r.Shiqty === 0
          ? 0
          : this.round2((r.UnitAmount / total) * (r.Othamt1 / r.Shiqty));
      const new_price = this.round2(r.UnitPrice + add);
      const total_price = this.round2(new_price * r.Shiqty);
      const sub_total = this.round2(total + r.Othamt1);
      return { ...r, Total: total, Add: add, new_price, total_price, sub_total };
    });

    // 汇总 changes
    const changes: ChangeRow[] = [];
    const byTrno = new Map<number, CalcRow[]>();
    calcRows.forEach((r) => {
      const list = byTrno.get(r.Trno) || [];
      list.push(r);
      byTrno.set(r.Trno, list);
    });

    for (const [trno, rows] of byTrno.entries()) {
      const anyRow = rows[0];
      const oldOth = this.round2(anyRow.Othamt1);
      const total = this.round2(anyRow.Total);
      const trdate = rows
        .map((r) => r.Trdate)
        .filter(Boolean)
        .map((s) => {
          const d = new Date(String(s));
          return Number.isNaN(d.getTime()) ? 0 : d.getTime();
        })
        .reduce((a, b) => Math.max(a, b), 0);
      const trdateStr = trdate ? new Date(trdate).toISOString().slice(0, 10) : '';

      changes.push({
        trno,
        trdate: trdateStr,
        old_othamt1: oldOth,
        new_othamt1: 0.0,
        subtotal_before: this.round2(total + oldOth),
        subtotal_after: total,
      });
    }

    changes.sort((a, b) => {
      if (a.trdate !== b.trdate) return a.trdate < b.trdate ? 1 : -1;
      return b.trno - a.trno;
    });

    let updatedRows = 0;
    if (!params.dry_run) {
      const SQL_UPD_SAINVL = `
        UPDATE sainvl SET Price=?, Lnamt=?
        WHERE Trno=? AND Itemno=?
      `;
      const SQL_UPD_SAINV = `
        UPDATE sainv SET Othamt1=0, Subamt=?
        WHERE Trno=?
      `;
      const SQL_UPD_GL_3050 = `
        UPDATE gljoul SET Creamt=?
        WHERE Trno=? AND Accno='3050'
      `;
      const SQL_DEL_GL_3320 = `
        DELETE FROM gljoul
        WHERE Trno=? AND Accno='3320'
      `;

      for (const [trno, rows] of byTrno.entries()) {
        const subTotal = rows[0]?.sub_total ?? 0;
        for (const row of rows) {
          const res = await this.db.execute(db, SQL_UPD_SAINVL, [
            row.new_price,
            row.total_price,
            trno,
            row.Itemno,
          ]);
          updatedRows += Number(res?.affectedRows || 0);
        }
        await this.db.execute(db, SQL_UPD_SAINV, [subTotal, trno]);
        await this.db.execute(db, SQL_UPD_GL_3050, [subTotal, trno]);
        await this.db.execute(db, SQL_DEL_GL_3320, [trno]);
      }
    }

    return {
      success: true,
      dry_run: params.dry_run,
      db,
      affected_trno_count: changes.length,
      updated_rows: updatedRows,
      changes: changes.slice(0, 200),
      preview_file: null,
      notes,
    };
  }
}
