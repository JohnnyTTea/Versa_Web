import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

type OrderDir = 'ASC' | 'DESC';

const AIS_CUTOVER_DATE = '2026-01-01';

@Injectable()
export class ProductsService {
  constructor(private readonly db: MysqlService) {}

  private monthRange(n = 13) {
    const now = new Date();
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - (n - 1), 1));
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  // 过去 13 个月，不含当月（与 whse 报表窗口一致）
  private monthRangeExcludeCurrent(n = 13) {
    const now = new Date();
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - n, 1));
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  // ---------- summary (sidebar.php) ----------
  private async getSummaryBasicCore(itemId: string) {
    // 产品主数据（最高优先级）
    const productRows = await this.db.query(
      'aisdata0',
      `SELECT * FROM item WHERE itemno = ? LIMIT 1`,
      [itemId],
    );
    const product = Array.isArray(productRows) ? productRows[0] : null;

    let message = '';
    if (!product) message = 'Error: Item ID does not exist !';
    if (!product) {
      return {
        ok: false,
        message,
        product: null,
        onhand: { onhand1: 0, onhand2: 0, onhand3: 0 },
      };
    }

    const [onhandRows] = await Promise.all([
      this.db.query(
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
      ),
    ]);

    const onhand = Array.isArray(onhandRows) ? onhandRows[0] : null;

    return {
      ok: !!product,
      message,
      product: product || null,
      onhand: onhand || { onhand1: 0, onhand2: 0, onhand3: 0 },
    };
  }

  async getSummaryPrices(itemId: string) {
    const [ebayRows, amznRows, shippingRows] = await Promise.all([
      this.db.query(
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
      ),
      this.db.query(
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
      ),
      this.db.query(
        'aisdatax',
        `SELECT Apirate,ItemsTotalCost, AddedDate FROM ilsorders WHERE Skus = ? LIMIT 1`,
        [itemId],
      ),
    ]);

    const ebay = Array.isArray(ebayRows) ? ebayRows[0] : null;
    const amzn = Array.isArray(amznRows) ? amznRows[0] : null;
    const shipping52 = Array.isArray(shippingRows) ? shippingRows[0] : null;

    return {
      ok: true,
      prices: {
        ebay: ebay || null,
        amzn: amzn || null,
        shipping52: shipping52 || null,
      },
    };
  }

  private async getRmaWhseStats(itemId: string) {
    // Return(%)：沿用 RMA 算法（aisdata5，最近 13 个月）
    let totalSale = 0;
    let totalReturn = 0;
    try {
      const { startDate, endDate } = this.monthRange(13);
      const [saleCountRows, returnCountRows] = await Promise.all([
        this.db.query(
          'aisdata5',
          `
          SELECT COUNT(*) AS totalSale
          FROM sainvl
          WHERE Itemno = ?
            AND Trdate > ?
            AND Trdate < ?
          `,
          [itemId, startDate, endDate],
        ),
        this.db.query(
          'aisdata5',
          `
          SELECT
            COUNT(*) AS totalReturn
          FROM samemo m
          JOIN sainvl l ON m.Invno = l.Trno
          WHERE l.Itemno = ?
            AND m.Trdate > ?
            AND m.Trdate < ?
          `,
          [itemId, startDate, endDate],
        ),
      ]);

      totalSale = Number((Array.isArray(saleCountRows) ? saleCountRows[0]?.totalSale : 0) || 0);
      totalReturn = Number((Array.isArray(returnCountRows) ? returnCountRows[0]?.totalReturn : 0) || 0);
    } catch {
      totalSale = 0;
      totalReturn = 0;
    }

    // CA(%)/GA(%)：集合口径（West/East）+ Ordqty / All
    let caPct = 0;
    let gaPct = 0;
    try {
      const { startDate, endDate } = this.monthRangeExcludeCurrent(13);
      const whseRows = await this.db.query(
        'aisdata0',
        `
        SELECT
          SUM(
            CASE
              WHEN t.Sstate IN ('WA','OR','ID','CA','NV','UT','AZ','AK','HI','MT','WY','CO','NM','ND','SD','NE','KS','OK','TX')
                AND t.Ordqty > 0
              THEN t.Ordqty ELSE 0
            END
          ) AS caQty,
          SUM(
            CASE
              WHEN t.Sstate IN ('MN','IA','MO','WI','IL','MI','IN','OH','MA','VT','ME','NH','RI','CT','NJ','DE','NY','PA','MD','WV','KY','VA','AR','LA','MS','TN','AL','NC','SC','GA','FL')
                AND t.Ordqty > 0
              THEN t.Ordqty ELSE 0
            END
          ) AS gaQty,
          SUM(CASE WHEN t.Ordqty > 0 THEN t.Ordqty ELSE 0 END) AS allQty
        FROM (
          SELECT l.Ordqty, v.Sstate, l.Trdate
          FROM aisdata1.sainvl l
          JOIN aisdata1.sainv v ON v.Trno = l.Trno
          WHERE l.Itemno = ?
            AND l.Trdate >= ?
            AND l.Trdate < ?
            AND l.Trdate >= ?
          UNION ALL
          SELECT l.Ordqty, v.Sstate, l.Trdate
          FROM aisdata5.sainvl l
          JOIN aisdata5.sainv v ON v.Trno = l.Trno
          WHERE l.Itemno = ?
            AND l.Trdate >= ?
            AND l.Trdate < ?
            AND l.Trdate < ?
        ) t
        `,
        [
          itemId,
          startDate,
          endDate,
          AIS_CUTOVER_DATE,
          itemId,
          startDate,
          endDate,
          AIS_CUTOVER_DATE,
        ],
      );
      const caQty = Number((Array.isArray(whseRows) ? whseRows[0]?.caQty : 0) || 0);
      const gaQty = Number((Array.isArray(whseRows) ? whseRows[0]?.gaQty : 0) || 0);
      const allQty = Number((Array.isArray(whseRows) ? whseRows[0]?.allQty : 0) || 0);
      caPct = allQty > 0 ? (caQty * 100) / allQty : 0;
      gaPct = allQty > 0 ? (gaQty * 100) / allQty : 0;
    } catch {
      caPct = 0;
      gaPct = 0;
    }

    return {
      rma: {
        totalSale,
        totalReturn,
        returnPct: Number((totalSale > 0 ? (totalReturn * 100) / totalSale : 0).toFixed(2)),
        caPct: Number(caPct.toFixed(2)),
        gaPct: Number(gaPct.toFixed(2)),
      },
    };
  }

  // 兼容旧接口：仍返回完整数据
  async getSummary(itemId: string) {
    const core = await this.getSummaryBasicCore(itemId);
    if (!core.ok) {
      return {
        ...core,
        prices: { ebay: null, amzn: null, shipping52: null },
        rma: { totalSale: 0, totalReturn: 0, returnPct: 0, caPct: 0, gaPct: 0 },
      };
    }
    const [prices, metrics] = await Promise.all([
      this.getSummaryPrices(itemId),
      this.getRmaWhseStats(itemId),
    ]);
    return { ...core, ...prices, ...metrics };
  }

  // 新：快速摘要（给前端首屏）
  async getSummaryBasic(itemId: string) {
    return this.getSummaryBasicCore(itemId);
  }

  // 新：慢指标（RMA/CA/GA）
  async getSummaryMetrics(itemId: string) {
    const core = await this.getSummaryBasicCore(itemId);
    if (!core.ok) {
      return {
        ok: false,
        message: core.message || 'Missing item',
        rma: { totalSale: 0, totalReturn: 0, returnPct: 0, caPct: 0, gaPct: 0 },
      };
    }
    const metrics = await this.getRmaWhseStats(itemId);
    return { ok: true, ...metrics };
  }

  // ---------- index.php: on-order ----------
  async getOnOrder(itemId: string) {
    // 只取 aisdata1.poordl
    const orders = await this.db.query(
      'aisdata1',
      `
      SELECT d.*, p.Sstate
      FROM aisdata1.poordl d
      LEFT JOIN aisdata1.poord p ON d.Trno = p.Trno
      WHERE d.Itemno = ?
      ORDER BY d.Opodate DESC, d.Opono DESC
      `,
      [itemId],
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
