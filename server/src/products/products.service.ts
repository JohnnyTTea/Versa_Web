import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

type OrderDir = 'ASC' | 'DESC';

const AIS_CUTOVER_DATE = '2026-01-01';

@Injectable()
export class ProductsService {
  constructor(private readonly db: MysqlService) {}
  // ---------- summary (sidebar.php) ----------
  async getSummary(itemId: string) {
    // 产品主数据
    const productRows = await this.db.query(
      'aisdata0',
      `SELECT * FROM item WHERE itemno = ? LIMIT 1`,
      [itemId],
    );
    const product = Array.isArray(productRows) ? productRows[0] : null;

    let message = '';
    if (!product) message = 'Error: Item ID does not exist !';

    // onhand 汇总
    const onhandRows = await this.db.query(
      'aisdata0',
      `
      SELECT
        SUM(CASE WHEN Whse = 1 THEN Onhand ELSE 0 END) AS onhand1,
        SUM(CASE WHEN Whse = 2 THEN Onhand ELSE 0 END) AS onhand2,
        SUM(CASE WHEN Whse = 3 THEN Onhand ELSE 0 END) AS onhand3
      FROM itemwhse
      WHERE Itemno = ?;
      `,
      [itemId],
    );
    const onhand = Array.isArray(onhandRows) ? onhandRows[0] : null;

    // eBay 最近成交价
    const ebayRows = await this.db.query(
      'aisdata0',
      `
      SELECT t.Trdate, t.Itemno, t.Price, t.Trorig1
      FROM (
        SELECT l.Trdate, l.Itemno, l.Price, v.Trorig1
        FROM aisdata1.sainvl AS l
        LEFT JOIN aisdata1.sainv AS v ON l.Trno = v.Trno
        WHERE l.Itemno = ?
          AND v.Trorig1='EBAY'
          AND l.Trdate >= ?
        UNION ALL
        SELECT l.Trdate, l.Itemno, l.Price, v.Trorig1
        FROM aisdata5.sainvl AS l
        LEFT JOIN aisdata5.sainv AS v ON l.Trno = v.Trno
        WHERE l.Itemno = ?
          AND v.Trorig1='EBAY'
          AND l.Trdate < ?
      ) AS t
      ORDER BY t.Trdate DESC
      LIMIT 1;
      `,
      [itemId, AIS_CUTOVER_DATE, itemId, AIS_CUTOVER_DATE],
    );
    const ebay = Array.isArray(ebayRows) ? ebayRows[0] : null;

    // AMZN 最近成交价
    const amznRows = await this.db.query(
      'aisdata0',
      `
      SELECT t.Trdate, t.Itemno, t.Price, t.Trorig1
      FROM (
        SELECT l.Trdate, l.Itemno, l.Price, v.Trorig1
        FROM aisdata1.sainvl AS l
        LEFT JOIN aisdata1.sainv AS v ON l.Trno = v.Trno
        WHERE l.Itemno = ?
          AND v.Trorig1='AMZN'
          AND l.Trdate >= ?
        UNION ALL
        SELECT l.Trdate, l.Itemno, l.Price, v.Trorig1
        FROM aisdata5.sainvl AS l
        LEFT JOIN aisdata5.sainv AS v ON l.Trno = v.Trno
        WHERE l.Itemno = ?
          AND v.Trorig1='AMZN'
          AND l.Trdate < ?
      ) AS t
      ORDER BY t.Trdate DESC
      LIMIT 1;
      `,
      [itemId, AIS_CUTOVER_DATE, itemId, AIS_CUTOVER_DATE],
    );
    const amzn = Array.isArray(amznRows) ? amznRows[0] : null;

    // 52 shipping
    const shippingRows = await this.db.query(
      'aisdatax',
      `SELECT Apirate,ItemsTotalCost, AddedDate FROM ilsorders WHERE Skus = ? LIMIT 1`,
      [itemId],
    );
    const shipping52 = Array.isArray(shippingRows) ? shippingRows[0] : null;

    return {
      ok: !!product,
      message,
      product: product || null,
      onhand: onhand || { onhand1: 0, onhand2: 0, onhand3: 0 },
      prices: {
        ebay: ebay || null,
        amzn: amzn || null,
        shipping52: shipping52 || null,
      },
    };
  }

  // ---------- index.php: on-order ----------
  async getOnOrder(itemId: string) {
    // PHP: FROM aisdata1.poordl d LEFT JOIN aisdata1.poord p ...
    const orders = await this.db.query(
      'aisdata0',
      `
      SELECT t.*
      FROM (
        SELECT d.*, p.Sstate
        FROM aisdata1.poordl d
        LEFT JOIN aisdata1.poord p ON d.Trno = p.Trno
        WHERE d.Itemno = ?
          AND p.Trdate >= ?
        UNION ALL
        SELECT d.*, p.Sstate
        FROM aisdata5.poordl d
        LEFT JOIN aisdata5.poord p ON d.Trno = p.Trno
        WHERE d.Itemno = ?
          AND p.Trdate < ?
      ) AS t
      `,
      [itemId, AIS_CUTOVER_DATE, itemId, AIS_CUTOVER_DATE],
    );

    // 你 PHP 里 transit 目前是空数组
    const transit: any[] = [];

    return {
      ok: true,
      orders: Array.isArray(orders) ? orders : [],
      transit,
    };
  }

  // ---------- cost.php: purchase history ----------
  async getPurchaseHistory(itemId: string) {
    const rows = await this.db.query(
      'aisdata0',
      `
      SELECT
        t.Trdate,
        t.Ordqty,
        t.Trum,
        t.Cost,
        t.Price,
        t.Lnamt,
        t.Company,
        t.Compno,
        t.Trno
      FROM (
        SELECT
          Trdate,
          Ordqty,
          Trum,
          ROUND(Cost,2) AS Cost,
          ROUND(Price,2) AS Price,
          Lnamt,
          Company,
          Compno,
          Trno
        FROM aisdata1.poinvl
        WHERE Itemno = ?
          AND Trdate >= ?
        UNION ALL
        SELECT
          Trdate,
          Ordqty,
          Trum,
          ROUND(Cost,2) AS Cost,
          ROUND(Price,2) AS Price,
          Lnamt,
          Company,
          Compno,
          Trno
        FROM aisdata5.poinvl
        WHERE Itemno = ?
          AND Trdate < ?
      ) AS t
      ORDER BY t.Trdate DESC;
      `,
      [itemId, AIS_CUTOVER_DATE, itemId, AIS_CUTOVER_DATE],
    );

    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  }

  // ---------- picture.php ----------
  async getPictures(itemId: string) {
    const productRows = await this.db.query(
      'aisdata0',
      `SELECT Picfile1, Picfile2 FROM item WHERE itemno = ? LIMIT 1`,
      [itemId],
    );
    const p = Array.isArray(productRows) ? productRows[0] : null;

    return {
      ok: true,
      picfile1: p?.Picfile1 || '',
      picfile2: p?.Picfile2 || '',
    };
  }

  // ---------- sales.php: list + paging + sorting ----------
  private normalizeSort(sort: string | undefined) {
    // 只允许这几个字段，防止 SQL 注入
    const allowed = new Set(['Price', 'Trdate', 'Shiqty']);
    if (sort && allowed.has(sort)) return sort;
    return 'Trdate';
  }

  private normalizeOrder(order: string | undefined): OrderDir {
    return String(order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  }

  async getSalesHistory(params: {
    itemId: string;
    page: number;
    limit: number;
    sort?: string;
    order?: string;
  }) {
    const itemId = params.itemId;
    const limit = Math.min(Math.max(1, params.limit || 50), 200);
    const page = Math.max(1, params.page || 1);
    const offset = (page - 1) * limit;

    const sortBy = this.normalizeSort(params.sort);
    const orderDir = this.normalizeOrder(params.order);

    // 总记录数
    const countRows = await this.db.query(
      'aisdata0',
      `
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT s.Trdate
        FROM aisdata1.sainvl s
        LEFT JOIN aisdata1.sainv v ON s.Trno = v.Trno
        WHERE s.Itemno = ?
          AND s.Trdate >= ?
        UNION ALL
        SELECT s.Trdate
        FROM aisdata5.sainvl s
        LEFT JOIN aisdata5.sainv v ON s.Trno = v.Trno
        WHERE s.Itemno = ?
          AND s.Trdate < ?
      ) AS t
      `,
      [itemId, AIS_CUTOVER_DATE, itemId, AIS_CUTOVER_DATE],
    );
    const total = Number(
      (Array.isArray(countRows) ? countRows[0]?.cnt : 0) || 0,
    );
    const pages = Math.max(1, Math.ceil(total / limit));

    // 本页数据
    // 注意：ORDER BY 不能用 ? 占位符，所以必须 whitelist
    const rows = await this.db.query(
      'aisdata0',
      `
      SELECT
        t.Trdate,
        t.Price,
        t.Shiqty,
        t.Trum,
        t.Company,
        t.Trno,
        t.Ordno,
        t.Trorig1,
        t.Trorig2,
        t.Shipvia,
        t.Stracno
      FROM (
        SELECT
          s.Trdate,
          s.Price,
          s.Shiqty,
          s.Trum,
          s.Company,
          s.Trno,
          v.Ordno,
          v.Trorig1,
          v.Trorig2,
          v.Shipvia,
          v.Stracno
        FROM aisdata1.sainvl s
        LEFT JOIN aisdata1.sainv v ON s.Trno = v.Trno
        WHERE s.Itemno = ?
          AND s.Trdate >= ?
        UNION ALL
        SELECT
          s.Trdate,
          s.Price,
          s.Shiqty,
          s.Trum,
          s.Company,
          s.Trno,
          v.Ordno,
          v.Trorig1,
          v.Trorig2,
          v.Shipvia,
          v.Stracno
        FROM aisdata5.sainvl s
        LEFT JOIN aisdata5.sainv v ON s.Trno = v.Trno
        WHERE s.Itemno = ?
          AND s.Trdate < ?
      ) AS t
      ORDER BY ${sortBy} ${orderDir}
      LIMIT ? OFFSET ?
      `,
      [itemId, AIS_CUTOVER_DATE, itemId, AIS_CUTOVER_DATE, limit, offset],
    );

    return {
      ok: true,
      page,
      limit,
      total,
      pages,
      rows: Array.isArray(rows) ? rows : [],
      sort: sortBy,
      order: orderDir === 'ASC' ? 'asc' : 'desc',
    };
  }

  // ---------- sales.php: export CSV (A 方案) ----------
  async exportSalesCsv(itemId: string, sort?: string, order?: string) {
    const sortBy = this.normalizeSort(sort);
    const orderDir = this.normalizeOrder(order);

    const rows = await this.db.query(
      'aisdata0',
      `
      SELECT t.*
      FROM (
        SELECT s.*, v.Trorig1, v.Trorig2, v.Ordno, v.Shipvia, v.Stracno
        FROM aisdata1.sainvl s
        LEFT JOIN aisdata1.sainv v ON s.Trno = v.Trno
        WHERE s.Itemno = ?
          AND s.Trdate >= ?
        UNION ALL
        SELECT s.*, v.Trorig1, v.Trorig2, v.Ordno, v.Shipvia, v.Stracno
        FROM aisdata5.sainvl s
        LEFT JOIN aisdata5.sainv v ON s.Trno = v.Trno
        WHERE s.Itemno = ?
          AND s.Trdate < ?
      ) AS t
      ORDER BY ${sortBy} ${orderDir}
      `,
      [itemId, AIS_CUTOVER_DATE, itemId, AIS_CUTOVER_DATE],
    );

    const all = Array.isArray(rows) ? rows : [];

    // 生成 CSV（带 BOM，Excel 友好）
    const header = [
      '#',
      'Price',
      'Date',
      'Ship Qty',
      'UM',
      'Company Name',
      'Inv. No.',
      'Order. No.',
      'Origin1',
      'Origin2',
      'Shipping Carrier',
      'Tracking No.',
    ];

    const escapeCsv = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      // 包含引号/逗号/换行则加双引号并转义
      if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines: string[] = [];
    lines.push(header.map(escapeCsv).join(','));

    all.forEach((row: any, i: number) => {
      // PHP 里为了 Excel 保留前导 0 / 长数字，用 '="..."'
      const invText = `="${row.Trno ?? ''}"`;
      const orderText = `="${row.Ordno ?? ''}"`;
      const trackText = `="${row.Stracno ?? ''}"`;

      const dateText = row.Trdate ? String(row.Trdate).slice(0, 10) : '';

      const line = [
        i + 1,
        row.Price,
        dateText,
        row.Shiqty,
        row.Trum,
        row.Company,
        invText,
        orderText,
        row.Trorig1,
        row.Trorig2,
        row.Shipvia,
        trackText,
      ]
        .map(escapeCsv)
        .join(',');
      lines.push(line);
    });

    // BOM
    return '\uFEFF' + lines.join('\r\n');
  }

  // ---------- sales_12mo.php ----------
  async getSales12mo(itemId: string) {
    const rows = await this.db.query(
      'aisdata0', // 你 PHP 用 aisdata0 连接，但里面引用了 aisdata1 表；我们直接照抄
      `
      SELECT
        DATE_FORMAT(m.Trdate, '%b.%y')         AS \`Mo.Yr\`,
        COALESCE(p.\`Pur.Qty(pc)\`, 0)         AS \`Pur.Qty(pc)\`,
        COALESCE(ROUND(p.\`Pur.Amt\`, 2),0)    AS \`Pur.Amt\`,
        COALESCE(s.\`Sal.Qty(pc)\`, 0)         AS \`Sal.Qty(pc)\`,
        COALESCE(ROUND(s.\`Sal.Amt\`, 2), 0.00)  AS \`Sal.Amt\`,
        COALESCE(ROUND(s.\`Cost Amt\`, 2), 0.00) AS \`Cost Amt\`,
        COALESCE(ROUND(s.\`Gp $\`, 2), 0.00)     AS \`Gp $\`,
        CASE
          WHEN COALESCE(s.\`Sal.Amt\`, 0) = 0 THEN 0
          ELSE ROUND(s.\`Gp $\` / s.\`Sal.Amt\` * 100, 2)
        END AS \`Gp %\`
      FROM (
        SELECT LAST_DAY(CURDATE() - INTERVAL n MONTH) AS Trdate
        FROM (
          SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
          SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
          SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL
          SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11
        ) AS nums
      ) m
      LEFT JOIN (
        SELECT
          MonthKey,
          SUM(\`Pur.Qty(pc)\`) AS \`Pur.Qty(pc)\`,
          SUM(\`Pur.Amt\`) AS \`Pur.Amt\`
        FROM (
          SELECT
            DATE_FORMAT(Trdate, '%Y-%m') AS MonthKey,
            SUM(Ordqty)                  AS \`Pur.Qty(pc)\`,
            SUM(Lnamt)                   AS \`Pur.Amt\`
          FROM aisdata1.poinvl
          WHERE Itemno = ?
            AND Trdate >= ?
          GROUP BY DATE_FORMAT(Trdate, '%Y-%m')
          UNION ALL
          SELECT
            DATE_FORMAT(Trdate, '%Y-%m') AS MonthKey,
            SUM(Ordqty)                  AS \`Pur.Qty(pc)\`,
            SUM(Lnamt)                   AS \`Pur.Amt\`
          FROM aisdata5.poinvl
          WHERE Itemno = ?
            AND Trdate < ?
          GROUP BY DATE_FORMAT(Trdate, '%Y-%m')
        ) AS p_union
        GROUP BY MonthKey
      ) p ON DATE_FORMAT(m.Trdate, '%Y-%m') = p.MonthKey
      LEFT JOIN (
        SELECT
          MonthKey,
          SUM(\`Sal.Qty(pc)\`) AS \`Sal.Qty(pc)\`,
          SUM(\`Sal.Amt\`) AS \`Sal.Amt\`,
          SUM(\`Cost Amt\`) AS \`Cost Amt\`,
          SUM(\`Gp $\`) AS \`Gp $\`
        FROM (
          SELECT
            DATE_FORMAT(Trdate, '%Y-%m') AS MonthKey,
            SUM(Ordqty)                  AS \`Sal.Qty(pc)\`,
            SUM(Ordqty * Price)          AS \`Sal.Amt\`,
            SUM(Ordqty * Cost)           AS \`Cost Amt\`,
            SUM(Ordqty * (Price - Cost)) AS \`Gp $\`
          FROM aisdata1.sainvl
          WHERE Itemno = ?
            AND Trdate >= ?
          GROUP BY DATE_FORMAT(Trdate, '%Y-%m')
          UNION ALL
          SELECT
            DATE_FORMAT(Trdate, '%Y-%m') AS MonthKey,
            SUM(Ordqty)                  AS \`Sal.Qty(pc)\`,
            SUM(Ordqty * Price)          AS \`Sal.Amt\`,
            SUM(Ordqty * Cost)           AS \`Cost Amt\`,
            SUM(Ordqty * (Price - Cost)) AS \`Gp $\`
          FROM aisdata5.sainvl
          WHERE Itemno = ?
            AND Trdate < ?
          GROUP BY DATE_FORMAT(Trdate, '%Y-%m')
        ) AS s_union
        GROUP BY MonthKey
      ) s ON DATE_FORMAT(m.Trdate, '%Y-%m') = s.MonthKey
      ORDER BY m.Trdate DESC;
      `,
      [
        itemId,
        AIS_CUTOVER_DATE,
        itemId,
        AIS_CUTOVER_DATE,
        itemId,
        AIS_CUTOVER_DATE,
        itemId,
        AIS_CUTOVER_DATE,
      ],
    );

    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  }
}
