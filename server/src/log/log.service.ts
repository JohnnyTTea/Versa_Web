import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

const TEMP_HIDDEN_LOG_USERS = ['johnny'];

@Injectable()
export class LogService {
  constructor(private readonly db: MysqlService) {}
  private extColsChecked = false;
  private extColsEnabled = false;

  private async hasExtendedColumns() {
    if (this.extColsChecked) return this.extColsEnabled;

    const rows = await this.db.query<{ col: string }>(
      'data0',
      `
      SELECT COLUMN_NAME AS col
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'data0'
        AND TABLE_NAME = 'user_activity_log'
        AND COLUMN_NAME IN ('module', 'action', 'target', 'meta_json')
      `,
    );
    const set = new Set((rows || []).map((r) => String(r.col || '').toLowerCase()));
    this.extColsEnabled =
      set.has('module') && set.has('action') && set.has('target') && set.has('meta_json');
    this.extColsChecked = true;
    return this.extColsEnabled;
  }

  async writeLog(username: string, ip: string, event: string) {
    // 写入 data0（你 PHP 也是 data0）
    await this.db.query(
      'data0',
      `INSERT INTO user_activity_log (username, ip_address, event, \`timestamp\`) VALUES (?, ?, ?, NOW())`,
      [username, ip, event],
    );
  }

  async writeEvent(params: {
    username: string;
    ip: string;
    event: string;
    module?: string;
    action?: string;
    target?: string;
    meta?: Record<string, any> | null;
  }) {
    const { username, ip, event, module, action, target, meta } = params;
    try {
      await this.db.query(
        'data0',
        `
        INSERT INTO user_activity_log
          (username, ip_address, event, module, action, target, meta_json, \`timestamp\`)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          username,
          ip,
          event,
          (module || '').slice(0, 80) || null,
          (action || '').slice(0, 120) || null,
          (target || '').slice(0, 255) || null,
          meta ? JSON.stringify(meta).slice(0, 2000) : null,
        ],
      );
      return;
    } catch {
      // Backward compatible with old schema.
      await this.writeLog(username, ip, event);
    }
  }

  async listLogs(params: {
    page: number;
    pageSize: number;
    username?: string;
    keyword?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(params.pageSize || 50)));
    const offset = (page - 1) * pageSize;

    const where: string[] = ['1=1'];
    const values: any[] = [];

    // Temporary hide-list for log viewer; remove this block to restore all users.
    if (TEMP_HIDDEN_LOG_USERS.length > 0) {
      const placeholders = TEMP_HIDDEN_LOG_USERS.map(() => '?').join(',');
      where.push(`LOWER(username) NOT IN (${placeholders})`);
      values.push(...TEMP_HIDDEN_LOG_USERS.map((u) => String(u || '').toLowerCase()));
    }

    if (params.username) {
      where.push('LOWER(username) = LOWER(?)');
      values.push(params.username);
    }
    const hasExt = await this.hasExtendedColumns();

    if (params.keyword) {
      if (hasExt) {
        where.push(
          '(LOWER(COALESCE(event, \'\')) LIKE ? OR LOWER(COALESCE(ip_address, \'\')) LIKE ? OR LOWER(COALESCE(username, \'\')) LIKE ? OR LOWER(COALESCE(module, \'\')) LIKE ? OR LOWER(COALESCE(action, \'\')) LIKE ? OR LOWER(COALESCE(target, \'\')) LIKE ? OR LOWER(COALESCE(meta_json, \'\')) LIKE ?)',
        );
        const q = `%${params.keyword.toLowerCase()}%`;
        values.push(q, q, q, q, q, q, q);
      } else {
        where.push(
          '(LOWER(COALESCE(event, \'\')) LIKE ? OR LOWER(COALESCE(ip_address, \'\')) LIKE ? OR LOWER(COALESCE(username, \'\')) LIKE ?)',
        );
        const q = `%${params.keyword.toLowerCase()}%`;
        values.push(q, q, q);
      }
    }
    if (params.startDate) {
      where.push('`timestamp` >= ?');
      values.push(`${params.startDate} 00:00:00`);
    }
    if (params.endDate) {
      where.push('`timestamp` < DATE_ADD(?, INTERVAL 1 DAY)');
      values.push(params.endDate);
    }

    const whereSql = where.join(' AND ');

    const totalRows = await this.db.query<{ total: number }>(
      'data0',
      `SELECT COUNT(*) AS total FROM user_activity_log WHERE ${whereSql}`,
      values,
    );
    const total = Number(totalRows?.[0]?.total || 0);

    const rows = hasExt
      ? await this.db.query<any>(
          'data0',
          `
          SELECT username, ip_address, event, module, action, target, meta_json, \`timestamp\`
          FROM user_activity_log
          WHERE ${whereSql}
          ORDER BY \`timestamp\` DESC
          LIMIT ? OFFSET ?
          `,
          [...values, pageSize, offset],
        )
      : await this.db.query<any>(
          'data0',
          `
          SELECT username, ip_address, event, \`timestamp\`
          FROM user_activity_log
          WHERE ${whereSql}
          ORDER BY \`timestamp\` DESC
          LIMIT ? OFFSET ?
          `,
          [...values, pageSize, offset],
        );

    return {
      ok: true,
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      rows,
    };
  }
}
