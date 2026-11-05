import { BadRequestException, Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

@Injectable()
export class WarehouseService {
  constructor(private readonly db: MysqlService) {}

  private readonly trackingPolicy: Array<{ prefix: string; len: number; shipvia: string; freight: string }> = [
    { prefix: '01', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '02', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '03', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '04', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '05', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '06', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '07', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '08', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '09', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '10', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '12', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: '12', len: 18, shipvia: 'UPS', freight: 'GROUND' },
    { prefix: '27', len: 12, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '28', len: 12, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '37', len: 9, shipvia: 'Pilot freight', freight: 'Economy' },
    { prefix: '38', len: 12, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '39', len: 12, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '39', len: 14, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '40', len: 9, shipvia: 'Pilot freight', freight: 'Economy' },
    { prefix: '42', len: 22, shipvia: 'USPS', freight: 'PRIORITY' },
    { prefix: '54', len: 12, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '56', len: 12, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '78', len: 12, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '80', len: 9, shipvia: 'Pilot freight', freight: 'Economy' },
    { prefix: '84', len: 7, shipvia: 'EFW', freight: 'Economy' },
    { prefix: '87', len: 12, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '88', len: 12, shipvia: 'FEDEX', freight: 'GROUND' },
    { prefix: '92', len: 22, shipvia: 'USPS', freight: 'PRIORITY' },
    { prefix: '93', len: 22, shipvia: 'AMZSHIPPING', freight: 'STANDARDDELIVERY' },
    { prefix: '94', len: 22, shipvia: 'USPS', freight: 'PRIORITY' },
    { prefix: 'CJ', len: 13, shipvia: 'USPS', freight: 'PRIORITY' },
    { prefix: 'CJ', len: 22, shipvia: 'USPS', freight: 'PRIORITY' },
    { prefix: 'D1', len: 15, shipvia: 'OnTrac', freight: 'Ground' },
    { prefix: 'GL', len: 19, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: 'GL', len: 20, shipvia: 'GLS US', freight: 'CPS' },
    { prefix: 'GP', len: 18, shipvia: 'GlobalPost', freight: 'StandardIntl' },
    { prefix: 'HT', len: 22, shipvia: 'USPS', freight: 'PRIORITY' },
    { prefix: 'LN', len: 22, shipvia: 'USPS', freight: 'PRIORITY' },
    { prefix: 'LZ', len: 22, shipvia: 'USPS', freight: 'PRIORITY' },
    { prefix: 'TB', len: 15, shipvia: 'AMZSHIPPING', freight: 'STANDARDDELIVERY' },
    { prefix: 'UA', len: 22, shipvia: 'USPS', freight: 'PRIORITY' },
  ];

  private normalizeTrackingNumber(input?: string) {
    return String(input ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  }

  private getTrackingClassification(input?: string) {
    const value = this.normalizeTrackingNumber(input);
    if (!value) return null;

    const compact = value.replace(/[^A-Z0-9]/g, '');
    if (!compact || compact.length < 7) return null;

    const prefix2 = compact.slice(0, 2).toUpperCase();
    const len = compact.length;
    const match = this.trackingPolicy.find((rule) => rule.prefix === prefix2 && rule.len === len);
    if (!match) return null;

    return {
      shipvia: match.shipvia,
      freight: match.freight,
      tracking_number: value,
    };
  }

  private isTrackingNumber(input?: string) {
    const value = this.normalizeTrackingNumber(input);
    if (!value) return false;
    if (value.length < 8 || value.length > 35) return false;
    if (!/^[A-Z0-9][A-Z0-9 -]*$/.test(value)) return false;

    const compact = value.replace(/[^A-Z0-9]/g, '');
    if (compact.length < 8) return false;

    const classification = this.getTrackingClassification(value);
    if (classification) return true;

    const knownPrefixes = ['1Z', '94', 'EA', 'LX', 'LS', 'SF', 'CP', 'CC', 'JD', 'RT', 'CA', 'US', 'UP', 'T'];
    const hasKnownCarrierPrefix = knownPrefixes.some((prefix) => value.startsWith(prefix));
    const hasSeparator = /[-\s]/.test(value);
    const pureNumeric = /^\d+$/.test(compact);
    const numericFedexLike = pureNumeric && (compact.length === 10 || compact.length === 12 || compact.length === 14);
    const longEnough = compact.length >= 12;

    return hasKnownCarrierPrefix || hasSeparator || longEnough || numericFedexLike;
  }

  private async ensurePackerTable() {
    await this.db.query(
      'data0',
      `
      CREATE TABLE IF NOT EXISTS warehouse_packer_scan (
        id BIGINT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        username VARCHAR(100) NOT NULL,
        tracking_number VARCHAR(255) NOT NULL,
        shipvia VARCHAR(50) NULL,
        freight VARCHAR(50) NULL,
        packed_date DATE NOT NULL,
        packed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_user_tracking_day (user_id, packed_date, tracking_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `,
      [],
    );

    const shipviaCols = await this.db.query('data0', "SHOW COLUMNS FROM warehouse_packer_scan LIKE 'shipvia'", []);
    if (!Array.isArray(shipviaCols) || shipviaCols.length === 0) {
      await this.db.query('data0', "ALTER TABLE warehouse_packer_scan ADD COLUMN shipvia VARCHAR(50) NULL AFTER tracking_number", []);
    }

    const freightCols = await this.db.query('data0', "SHOW COLUMNS FROM warehouse_packer_scan LIKE 'freight'", []);
    if (!Array.isArray(freightCols) || freightCols.length === 0) {
      await this.db.query('data0', "ALTER TABLE warehouse_packer_scan ADD COLUMN freight VARCHAR(50) NULL AFTER shipvia", []);
    }
  }

  async recordScan(args: { user_id?: number; username?: string; tracking_number?: string }) {
    const userId = Number(args.user_id || 0);
    const username = String(args.username || '').trim();
    const trackingNumber = this.normalizeTrackingNumber(args.tracking_number);

    if (!userId || !username) {
      throw new BadRequestException('User is required');
    }

    if (!trackingNumber) {
      throw new BadRequestException('Tracking number is required');
    }

    const classification = this.getTrackingClassification(trackingNumber);
    if (!classification || !this.isTrackingNumber(trackingNumber)) {
      throw new BadRequestException('Only tracking numbers are allowed. Please scan a valid tracking number.');
    }

    await this.ensurePackerTable();

    await this.db.query(
      'data0',
      `
      INSERT IGNORE INTO warehouse_packer_scan (user_id, username, tracking_number, shipvia, freight, packed_date, packed_at)
      VALUES (?, ?, ?, ?, ?, CURDATE(), NOW())
      `,
      [userId, username, trackingNumber, classification.shipvia, classification.freight],
    );

    const countRows = await this.db.query(
      'data0',
      `
      SELECT COUNT(*) AS cnt
      FROM warehouse_packer_scan
      WHERE user_id = ? AND packed_date = CURDATE()
      `,
      [userId],
    );

    const recentRows = await this.db.query(
      'data0',
      `
      SELECT tracking_number, shipvia, freight, packed_at
      FROM warehouse_packer_scan
      WHERE user_id = ? AND packed_date = CURDATE()
      ORDER BY packed_at DESC, id DESC
      LIMIT 20
      `,
      [userId],
    );

    return {
      ok: true,
      count: Number(countRows?.[0]?.cnt || 0),
      tracking_number: trackingNumber,
      shipvia: classification.shipvia,
      freight: classification.freight,
      recent: recentRows || [],
    };
  }

  async getTodaySummaryForUser(user_id: number) {
    await this.ensurePackerTable();
    const countRows = await this.db.query(
      'data0',
      `
      SELECT COUNT(*) AS cnt, MAX(packed_at) AS last_packed_time
      FROM warehouse_packer_scan
      WHERE user_id = ? AND packed_date = CURDATE()
      `,
      [user_id],
    );

    const recentRows = await this.db.query(
      'data0',
      `
      SELECT tracking_number, shipvia, freight, packed_at
      FROM warehouse_packer_scan
      WHERE user_id = ? AND packed_date = CURDATE()
      ORDER BY packed_at DESC, id DESC
      LIMIT 20
      `,
      [user_id],
    );

    return {
      ok: true,
      count: Number(countRows?.[0]?.cnt || 0),
      last_packed_time: countRows?.[0]?.last_packed_time || null,
      recent: recentRows || [],
    };
  }

  async getLogDates() {
    await this.ensurePackerTable();
    const rows = await this.db.query<{ date: string }>(
      'data0',
      `SELECT DISTINCT DATE_FORMAT(packed_date, '%Y-%m-%d') AS date
       FROM warehouse_packer_scan
       ORDER BY date DESC`,
      [],
    );
    return { ok: true, dates: rows.map((row) => row.date) };
  }

  async getLogsByDate(date?: string, username?: string) {
    await this.ensurePackerTable();
    const targetDate = (date || new Date().toISOString().slice(0, 10)).trim();
    const filterUsername = (username || '').trim();

    const sql = `
      SELECT user_id, username, tracking_number, shipvia, freight, packed_date, packed_at
      FROM warehouse_packer_scan
      WHERE packed_date = ?
      ${filterUsername ? 'AND username = ? ' : ''}
      ORDER BY packed_at DESC, id DESC
    `;

    const params: any[] = [targetDate];
    if (filterUsername) params.push(filterUsername);

    const rows = await this.db.query('data0', sql, params);

    const summarySql = `
      SELECT username, COUNT(*) AS scan_count, MAX(packed_at) AS last_packed_at
      FROM warehouse_packer_scan
      WHERE packed_date = ?
      ${filterUsername ? 'AND username = ? ' : ''}
      GROUP BY username
      ORDER BY scan_count DESC, last_packed_at DESC
    `;
    const summaryParams: any[] = [targetDate];
    if (filterUsername) summaryParams.push(filterUsername);

    const summaryRows = await this.db.query('data0', summarySql, summaryParams);

    return {
      ok: true,
      date: targetDate,
      username: filterUsername || null,
      total: Array.isArray(rows) ? rows.length : 0,
      summary: Array.isArray(summaryRows) ? summaryRows : [],
      records: Array.isArray(rows) ? rows : [],
    };
  }
}
