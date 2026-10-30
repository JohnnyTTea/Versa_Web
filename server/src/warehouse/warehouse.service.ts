import { BadRequestException, Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

@Injectable()
export class WarehouseService {
  constructor(private readonly db: MysqlService) {}

  private async ensurePackerTable() {
    await this.db.query(
      'data0',
      `
      CREATE TABLE IF NOT EXISTS warehouse_packer_scan (
        id BIGINT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        username VARCHAR(100) NOT NULL,
        tracking_number VARCHAR(255) NOT NULL,
        packed_date DATE NOT NULL,
        packed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_user_tracking_day (user_id, packed_date, tracking_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `,
      [],
    );
  }

  async recordScan(args: { user_id?: number; username?: string; tracking_number?: string }) {
    const userId = Number(args.user_id || 0);
    const username = String(args.username || '').trim();
    const trackingNumber = String(args.tracking_number || '').trim();

    if (!userId || !username) {
      throw new BadRequestException('User is required');
    }

    if (!trackingNumber) {
      throw new BadRequestException('Tracking number is required');
    }

    await this.ensurePackerTable();

    await this.db.query(
      'data0',
      `
      INSERT IGNORE INTO warehouse_packer_scan (user_id, username, tracking_number, packed_date, packed_at)
      VALUES (?, ?, ?, CURDATE(), NOW())
      `,
      [userId, username, trackingNumber],
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
      SELECT tracking_number, packed_at
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
      SELECT tracking_number, packed_at
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
}
