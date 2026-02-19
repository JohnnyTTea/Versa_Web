import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

@Injectable()
export class PurchaseService {
  constructor(private readonly db: MysqlService) {}

  async getOpoList(params: { q?: string }) {
    const q = (params.q || '').trim();

    const where: string[] = [];
    const args: any[] = [];
    if (q) {
      const like = `%${q}%`;
      where.push(`(p.Trno LIKE ? OR i.Contno LIKE ? OR p.Company LIKE ?)`);
      args.push(like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await this.db.query(
      'aisdata1',
      `
      SELECT
        p.Trno AS Opono,
        MAX(p.Opodate) AS Opodate,
        MAX(p.Empno) AS Empno,
        MAX(p.Compno) AS Compno,
        MAX(p.Company) AS Company,
        MAX(p.Addr1) AS Addr1,
        MAX(p.Addr2) AS Addr2,
        MAX(p.Country) AS Country,
        MAX(p.Contact) AS Contact,
        MAX(p.Scompany) AS Scompany,
        MAX(p.Sstate) AS Sstate,
        MAX(p.Shdate) AS Shdate,
        MAX(p.Eadate) AS Eadate,
        MAX(p.Cadate) AS Cadate,
        MAX(p.Shipvia) AS Shipvia,        
        SUM(l.Ordqty) AS Ordqty,
        MAX(p.Totamt) AS Totamt,
        MAX(p.Paytyp1) AS Paytyp1,
        MAX(p.Ename) AS Ename,
        MIN(i.Contno) AS Contno,
        GROUP_CONCAT(DISTINCT l.Itemno ORDER BY l.Itemno SEPARATOR ', ') AS Itemno

      FROM aisdata1.poord p
      LEFT JOIN aisdata1.poordi i ON p.Trno = i.Trno
      LEFT JOIN aisdata1.poordl l ON p.Trno = l.Trno
      ${whereSql}
      GROUP BY p.Trno
      ORDER BY Opodate DESC, Opono DESC
      `,
      args,
    );

    return {
      ok: true,
      rows: Array.isArray(rows) ? rows : [],
    };
  }

  async getRpoList(params: { q?: string }) {
    const q = (params.q || '').trim();

    const where: string[] = [];
    const args: any[] = [];
    if (q) {
      const like = `%${q}%`;
      where.push(
        `(p.Trno LIKE ? OR p.Opono LIKE ? OR p.Company LIKE ? OR p.Compno LIKE ? OR p.Contact LIKE ?)`
      );
      args.push(like, like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await this.db.query(
      'aisdata1',
      `
      SELECT
        p.Trno,
        p.Trdate,
        p.Trref,
        p.Opono,
        p.Opodate,
        p.Vtrno,
        p.Empno,
        p.Compno,
        p.Company,
        p.Addr1,
        p.Addr2,
        p.City,
        p.State,
        p.Country,
        p.Phone1,
        p.Email1,
        p.Contact,
        p.Scompany,
        p.Scity,
        p.Sstate,
        p.Ddate,
        p.Cpodate,
        p.Shdate,
        p.Eadate,
        p.Cadate,
        p.Shipvia,
        p.Freight,
        p.Totamt,
        p.Tlines,
        p.Tpieces,
        p.Tweight,
        p.Ename
      FROM aisdata1.poinv p
      ${whereSql}
      ORDER BY p.Trdate DESC, p.Trno DESC
      `,
      args,
    );

    return {
      ok: true,
      rows: Array.isArray(rows) ? rows : [],
    };
  }

  async getVendorList(params: { q?: string }) {
    const q = (params.q || '').trim();

    const where: string[] = [];
    const args: any[] = [];
    if (q) {
      const like = `%${q}%`;
      where.push(
        `(
          v.Compno LIKE ? OR
          v.Company LIKE ? OR
          v.Contact1 LIKE ? OR
          v.Contact2 LIKE ? OR
          v.Phone1 LIKE ? OR
          v.Phone2 LIKE ? OR
          v.Email1 LIKE ? OR
          v.Email2 LIKE ? OR
          v.City LIKE ? OR
          v.State LIKE ? OR
          v.Zip LIKE ? OR
          v.Country LIKE ? OR
          v.Accno LIKE ? OR
          v.Accno2 LIKE ?
        )`,
      );
      args.push(
        like,
        like,
        like,
        like,
        like,
        like,
        like,
        like,
        like,
        like,
        like,
        like,
        like,
        like,
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await this.db.query(
      'aisdata1',
      `
      SELECT
        v.Compno,
        v.Sdate,
        v.Company,
        v.Addr1,
        v.Addr2,
        v.City,
        v.State,
        v.Zip,
        v.Country,
        v.Contact1,
        v.Contact2,
        v.Phone1,
        v.Phone2,
        v.Email1,
        v.Email2,
        v.Accno,
        v.Accno2,
        v.Accpur
      FROM aisdata1.vendor v
      ${whereSql}
      ORDER BY v.Compno ASC
      `,
      args,
    );

    return {
      ok: true,
      rows: Array.isArray(rows) ? rows : [],
    };
  }

  async getOpoDetail(params: { opono?: string }) {
    const opono = (params.opono || '').trim();

    if (!opono) {
      return { ok: false, message: 'Missing opono', head: null, containers: [], lines: [] };
    }

    const rows = await this.db.query(
      'aisdata1',
      `
      SELECT
        p.Trno AS Opono,
        p.Opodate,
        p.Empno,
        p.Compno,
        p.Company,
        p.Addr1,
        p.Addr2,
        p.Country,
        p.Contact,
        p.Scompany,
        p.Sstate,
        p.Shdate,
        p.Eadate,
        p.Cadate,
        p.Shipvia,
        p.Totamt,
        p.Paytyp1,
        p.Ename
      FROM aisdata1.poord p
      WHERE p.Trno = ?
      LIMIT 1
      `,
      [opono],
    );

    const head = Array.isArray(rows) ? rows[0] : null;
    const trno = head?.Opono ? String(head.Opono) : '';

    if (!head || !trno) {
      return { ok: false, message: 'OPO not found', head: null, containers: [], lines: [] };
    }

    const containers = await this.db.query(
      'aisdata1',
      `
      SELECT Contno
      FROM aisdata1.poordi
      WHERE Trno = ?
      ORDER BY Contno
      `,
      [trno],
    );

    const lines = await this.db.query(
      'aisdata1',
      `
      SELECT
        Trno AS Opono,
        Compno,
        Itemno,
        Adino,
        Refno,
        Desc1,
        Ordqty,
        Price,
        Lnamt,
        Fob1,
        Cost
      FROM aisdata1.poordl
      WHERE Trno = ?
      ORDER BY Lnno
      `,
      [trno],
    );

    return {
      ok: true,
      head,
      containers: Array.isArray(containers) ? containers : [],
      lines: Array.isArray(lines) ? lines : [],
    };
  }

  async getRpoDetail(params: { trno?: string }) {
    const trno = (params.trno || '').trim();

    if (!trno) {
      return { ok: false, message: 'Missing trno', head: null, containers: [], lines: [] };
    }

    const headRows = await this.db.query(
      'aisdata1',
      `
      SELECT
        l.Trno,
        l.Trdate,
        l.Opono,
        l.Opodate,
        l.Shdate,
        l.Eadate,
        l.Compno,
        l.Company
      FROM aisdata1.poinvl l
      WHERE l.Trno = ?
      ORDER BY l.Lnno
      LIMIT 1
      `,
      [trno],
    );

    const head = Array.isArray(headRows) ? headRows[0] : null;
    if (!head) {
      return { ok: false, message: 'RPO not found', head: null, containers: [], lines: [] };
    }

    const containers = await this.db.query(
      'aisdata1',
      `
      SELECT Contno
      FROM aisdata1.poinvi
      WHERE Trno = ?
      ORDER BY Contno
      `,
      [trno],
    );

    const lines = await this.db.query(
      'aisdata1',
      `
      SELECT
        l.Trno,
        l.Trdate,
        l.Opono,
        l.Opodate,
        l.Shdate,
        l.Eadate,
        l.Compno,
        l.Company,
        l.Lnno,
        l.Itemno,
        l.Desc1,
        l.Desc2,
        l.Ordqty,
        l.Shiqty,
        l.Price,
        l.Lnamt,
        l.Fob1,
        l.Cost
      FROM aisdata1.poinvl l
      WHERE l.Trno = ?
      ORDER BY l.Lnno
      `,
      [trno],
    );

    return {
      ok: true,
      head,
      containers: Array.isArray(containers) ? containers : [],
      lines: Array.isArray(lines) ? lines : [],
    };
  }
}
