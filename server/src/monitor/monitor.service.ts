import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

const AIS_CUTOVER_DATE = '2026-01-01';

type MonthWindow = {
  startDate: string;
  endDate: string;
  latestMonth: string;
  months: string[];
};

@Injectable()
export class MonitorService {
  constructor(private readonly db: MysqlService) {}

  private toDateString(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private monthWindow(monthsBack: number): MonthWindow {
    const now = new Date();
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - monthsBack, 1));
    const labels: string[] = [];
    const cur = new Date(start);

    while (cur < end) {
      labels.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`);
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }

    return {
      startDate: this.toDateString(start),
      endDate: this.toDateString(end),
      latestMonth: labels[labels.length - 1] || '',
      months: labels,
    };
  }

  private daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return this.toDateString(date);
  }

  private async getInventoryAlerts() {
    const { startDate, endDate } = this.monthWindow(3);
    const rows = await this.db.query<any>(
      'aisdata1',
      `
      SELECT
        i.Itemno,
        i.Desc1,
        i.Desc2,
        i.Vendno,
        COALESCE(i.Onhand, 0) AS onhand,
        COALESCE(i.Onord, 0) AS onOrder,
        COALESCE(i.Oncom, 0) AS onCome,
        COALESCE(s.salesQty, 0) AS threeMonthSales,
        ROUND(COALESCE(s.salesQty, 0) / 3, 2) AS avgMonthlySales,
        ROUND(COALESCE(i.Onhand, 0) + COALESCE(i.Onord, 0) + COALESCE(i.Oncom, 0), 2) AS supplyQty,
        ROUND((COALESCE(s.salesQty, 0) / 3) - (COALESCE(i.Onhand, 0) + COALESCE(i.Onord, 0) + COALESCE(i.Oncom, 0)), 2) AS shortageQty
      FROM aisdata0.item i
      JOIN (
        SELECT Itemno, SUM(salesQty) AS salesQty
        FROM (
          SELECT Itemno, SUM(CASE WHEN Ordqty > 0 THEN Ordqty ELSE 0 END) AS salesQty
          FROM aisdata1.sainvl
          WHERE Trdate >= ? AND Trdate < ? AND Trdate >= ?
          GROUP BY Itemno
          UNION ALL
          SELECT Itemno, SUM(CASE WHEN Ordqty > 0 THEN Ordqty ELSE 0 END) AS salesQty
          FROM aisdata5.sainvl
          WHERE Trdate >= ? AND Trdate < ? AND Trdate < ?
          GROUP BY Itemno
        ) u
        GROUP BY Itemno
      ) s ON s.Itemno = i.Itemno
      WHERE COALESCE(s.salesQty, 0) > 0
        AND (i.Inactiv IS NULL OR i.Inactiv <> 'Y')
        AND i.Vendno IS NOT NULL
        AND TRIM(i.Vendno) <> ''
        AND (COALESCE(s.salesQty, 0) / 3) > (COALESCE(i.Onhand, 0) + COALESCE(i.Onord, 0) + COALESCE(i.Oncom, 0))
      ORDER BY shortageQty DESC, avgMonthlySales DESC
      `,
      [startDate, endDate, AIS_CUTOVER_DATE, startDate, endDate, AIS_CUTOVER_DATE],
    );

    return Array.isArray(rows) ? rows : [];
  }

  private async getSalesAnomalies() {
    const window = this.monthWindow(13);
    const rows = await this.db.query<any>(
      'aisdata1',
      `
      SELECT monthKey, Itemno, SUM(salesQty) AS salesQty
      FROM (
        SELECT DATE_FORMAT(Trdate, '%Y-%m') AS monthKey, Itemno, SUM(CASE WHEN Ordqty > 0 THEN Ordqty ELSE 0 END) AS salesQty
        FROM aisdata1.sainvl
        WHERE Trdate >= ? AND Trdate < ? AND Trdate >= ?
        GROUP BY monthKey, Itemno
        UNION ALL
        SELECT DATE_FORMAT(Trdate, '%Y-%m') AS monthKey, Itemno, SUM(CASE WHEN Ordqty > 0 THEN Ordqty ELSE 0 END) AS salesQty
        FROM aisdata5.sainvl
        WHERE Trdate >= ? AND Trdate < ? AND Trdate < ?
        GROUP BY monthKey, Itemno
      ) s
      GROUP BY monthKey, Itemno
      `,
      [window.startDate, window.endDate, AIS_CUTOVER_DATE, window.startDate, window.endDate, AIS_CUTOVER_DATE],
    );

    const bySku = new Map<string, Record<string, number>>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const itemNo = String(row.Itemno || '');
      if (!itemNo) continue;
      const map = bySku.get(itemNo) || {};
      map[String(row.monthKey)] = Number(row.salesQty || 0);
      bySku.set(itemNo, map);
    }

    const latest = window.latestMonth;
    const previousMonths = window.months.filter((m) => m !== latest);
    const anomalies = Array.from(bySku.entries())
      .map(([itemNo, values]) => {
        const latestQty = Number(values[latest] || 0);
        const previous = previousMonths.map((m) => Number(values[m] || 0));
        const activeMonths = previous.filter((v) => v > 0).length;
        const baseline = previous.reduce((sum, v) => sum + v, 0) / Math.max(1, previous.length);
        const delta = latestQty - baseline;
        const ratio = baseline > 0 ? latestQty / baseline : latestQty > 0 ? 999 : 0;
        const type =
          baseline >= 3 && latestQty >= baseline * 2 && delta >= 5
            ? 'Raise'
            : baseline >= 5 && latestQty <= baseline * 0.35 && delta <= -5
              ? 'Drop'
              : '';

        return {
          itemNo,
          type,
          latestMonth: latest,
          latestQty,
          baseline: Number(baseline.toFixed(2)),
          delta: Number(delta.toFixed(2)),
          ratio: Number(ratio.toFixed(2)),
          activeMonths,
          score: Math.abs(delta) * Math.max(1, Math.abs(ratio - 1)),
        };
      })
      .filter((row) => row.type && row.activeMonths >= 3)
      .sort((a, b) => b.score - a.score);

    if (!anomalies.length) return [];
    const anomalyRows = anomalies.map(({ score, ...row }) => row);
    const descRows: any[] = [];

    for (let i = 0; i < anomalyRows.length; i += 500) {
      const chunk = anomalyRows.slice(i, i + 500);
      const rowsForChunk = await this.db.query<any>(
        'aisdata0',
        `
        SELECT Itemno, Desc1, Desc2, Vendno
        FROM aisdata0.item
        WHERE Itemno IN (${chunk.map(() => '?').join(',')})
        `,
        chunk.map((a) => a.itemNo),
      );

      if (Array.isArray(rowsForChunk)) descRows.push(...rowsForChunk);
    }
    const descMap = new Map((Array.isArray(descRows) ? descRows : []).map((r) => [String(r.Itemno), r]));

    return {
      total: anomalies.length,
      rows: anomalyRows.map((row) => ({
      ...row,
      desc1: descMap.get(row.itemNo)?.Desc1 || '',
      desc2: descMap.get(row.itemNo)?.Desc2 || '',
      vendor: descMap.get(row.itemNo)?.Vendno || '',
      })),
    };
  }

  private async getOrderExceptions() {
    const cutoffDate = this.daysAgo(3);
    const whereSql = `
      o.Trdate < ?
      AND (o.Stracno IS NULL OR TRIM(o.Stracno) = '')
      AND NOT EXISTS (
        SELECT 1
        FROM aisdata1.sainv v
        WHERE v.Ordno = o.Trno
        LIMIT 1
      )
    `;

    const [countRows, rows] = await Promise.all([
      this.db.query<any>(
        'aisdata1',
        `
        SELECT COUNT(*) AS total
        FROM aisdata1.saord o
        WHERE ${whereSql}
        `,
        [cutoffDate],
      ),
      this.db.query<any>(
        'aisdata1',
        `
        SELECT
          o.Trno,
          o.Trdate,
          o.Company,
          o.Cpono,
          o.Shipvia,
          o.Stracno,
          o.Totamt,
          DATEDIFF(CURDATE(), DATE(o.Trdate)) AS ageDays
        FROM aisdata1.saord o
        WHERE ${whereSql}
        ORDER BY o.Trdate ASC, o.Trno ASC
        `,
        [cutoffDate],
      ),
    ]);

    return {
      total: Number((Array.isArray(countRows) ? countRows[0]?.total : 0) || 0),
      rows: Array.isArray(rows) ? rows : [],
    };
  }

  async getSummary() {
    const [inventoryAlertsAll, salesAnomaliesResult, orderExceptionsResult] = await Promise.all([
      this.getInventoryAlerts(),
      this.getSalesAnomalies(),
      this.getOrderExceptions(),
    ]);
    const salesAnomalies = Array.isArray(salesAnomaliesResult)
      ? salesAnomaliesResult
      : salesAnomaliesResult.rows;
    const orderExceptions = orderExceptionsResult.rows;

    return {
      ok: true,
      updatedAt: new Date().toISOString(),
      summary: {
        inventory: inventoryAlertsAll.length,
        sales: Array.isArray(salesAnomaliesResult)
          ? salesAnomaliesResult.length
          : salesAnomalies.length,
        orders: orderExceptions.length,
      },
      inventoryAlerts: inventoryAlertsAll,
      salesAnomalies,
      orderExceptions,
    };
  }
}
