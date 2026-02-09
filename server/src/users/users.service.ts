import { BadRequestException, Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

type SortKey = 'id' | 'username' | 'created_time' | 'role_name' | 'is_active';

@Injectable()
export class UsersService {
  constructor(private readonly db: MysqlService) {}

  private sanitizeSort(sort?: string): SortKey {
    const allowed: SortKey[] = ['id', 'username', 'created_time', 'role_name', 'is_active'];
    if (!sort) return 'id';
    if (!allowed.includes(sort as SortKey)) return 'id';
    return sort as SortKey;
  }

  private sanitizeOrder(order?: string): 'ASC' | 'DESC' {
    return String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  }

  private toInt(v: any): number {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : NaN;
  }

  private toActive01(v: any): number {
    if (v === 1 || v === '1' || v === true || v === 'true') return 1;
    return 0;
  }

  // =========================
  // R: list
  // =========================
  async list(params: {
    page: number;
    limit: number;
    sort: string;
    order: string;
    q: string;
    isAdmin: boolean;
    exportCsv: boolean;
  }) {
    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limitRaw = Number.isFinite(params.limit) ? params.limit : 20;
    const limit = Math.max(1, Math.min(100, limitRaw));
    const offset = (page - 1) * limit;

    const sort = this.sanitizeSort(params.sort);
    const order = this.sanitizeOrder(params.order);

    // users/roles 所在库：data0
    const schema = 'data0' as const;

    // admin 才能看 password（敏感字段）
    const selectPassword = params.isAdmin ? ', u.password' : '';

    // WHERE 条件：用 ? 占位符（mysql2 最稳）
    const where: string[] = [];
    const values: any[] = [];

    if (params.q) {
      where.push('(u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)');
      const kw = `%${params.q}%`;
      values.push(kw, kw, kw);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const baseSql = `
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ${whereSql}
    `;

    // 1) count
    const countSql = `SELECT COUNT(*) AS cnt ${baseSql}`;
    const countRows = await this.db.query<{ cnt: number }>(schema, countSql, values);
    const total = Number(countRows[0]?.cnt || 0);

    // 2) list
    const listSql = `
      SELECT
        u.id,
        u.username,
        u.first_name,
        u.last_name
        ${selectPassword},
        u.created_time,
        u.role_id,
        u.is_active,
        r.role_name
      ${baseSql}
      ORDER BY ${sort} ${order}
      LIMIT ? OFFSET ?
    `;

    const listValues = [...values, limit, offset];
    const rows = await this.db.query<any>(schema, listSql, listValues);

    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      rows,
    };
  }

  // =========================
  // C: create
  // =========================
  async create(
    payload: {
      username: string;
      first_name?: string;
      last_name?: string;
      role_id: any;
      is_active?: any;
      password?: any;
    },
    opts: { isAdmin: boolean },
  ) {
    const schema = 'data0' as const;

    const username = (payload.username || '').toString().trim();
    const first_name = (payload.first_name || '').toString().trim();
    const last_name = (payload.last_name || '').toString().trim();

    const role_id = this.toInt(payload.role_id);
    if (!username) throw new BadRequestException('username is required');
    if (!Number.isFinite(role_id) || role_id <= 0) throw new BadRequestException('role_id is required');

    const is_active = this.toActive01(payload.is_active);

    // password：只有 admin 才允许写入
    const password = opts.isAdmin ? (payload.password || '').toString() : '';

    // username 唯一检查（避免重复）
    const exists = await this.db.query<any>(
      schema,
      `SELECT id FROM users WHERE username = ? LIMIT 1`,
      [username],
    );
    if (exists.length > 0) throw new BadRequestException('username already exists');

    // role 是否存在（避免脏数据）
    const roleExists = await this.db.query<any>(
      schema,
      `SELECT id FROM roles WHERE id = ? LIMIT 1`,
      [role_id],
    );
    if (roleExists.length === 0) throw new BadRequestException('role_id not found');

    const insertSql = `
      INSERT INTO users (username, first_name, last_name, password, role_id, is_active, created_time)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;
    const result: any = await this.db.query<any>(schema, insertSql, [
      username,
      first_name,
      last_name,
      password,
      role_id,
      is_active,
    ]);

    // 取回新行（返回给前端）
    const newId = result && typeof result.insertId !== 'undefined' ? Number(result.insertId) : 0;

    const selectPassword = opts.isAdmin ? ', u.password' : '';
    const rowSql = `
      SELECT
        u.id,
        u.username,
        u.first_name,
        u.last_name
        ${selectPassword},
        u.created_time,
        u.role_id,
        u.is_active,
        r.role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
      LIMIT 1
    `;
    const rows = await this.db.query<any>(schema, rowSql, [newId]);

    return { ok: true, row: rows[0] };
  }

  // =========================
  // U: update
  // =========================
  async update(
    id: number,
    payload: {
      first_name?: any;
      last_name?: any;
      role_id?: any;
      password?: any;
    },
    opts: { isAdmin: boolean },
  ) {
    const schema = 'data0' as const;

    const userId = this.toInt(id);
    if (!Number.isFinite(userId) || userId <= 0) throw new BadRequestException('invalid id');

    // 确认用户存在
    const exists = await this.db.query<any>(schema, `SELECT id FROM users WHERE id = ? LIMIT 1`, [userId]);
    if (exists.length === 0) throw new BadRequestException('user not found');

    const sets: string[] = [];
    const values: any[] = [];

    if (typeof payload.first_name !== 'undefined') {
      sets.push('first_name = ?');
      values.push((payload.first_name || '').toString().trim());
    }

    if (typeof payload.last_name !== 'undefined') {
      sets.push('last_name = ?');
      values.push((payload.last_name || '').toString().trim());
    }

    if (typeof payload.role_id !== 'undefined') {
      const role_id = this.toInt(payload.role_id);
      if (!Number.isFinite(role_id) || role_id <= 0) throw new BadRequestException('invalid role_id');

      const roleExists = await this.db.query<any>(
        schema,
        `SELECT id FROM roles WHERE id = ? LIMIT 1`,
        [role_id],
      );
      if (roleExists.length === 0) throw new BadRequestException('role_id not found');

      sets.push('role_id = ?');
      values.push(role_id);
    }

    // password：只有 admin 才允许改；并且允许空字符串（你想禁止空密码可在这里加规则）
    if (opts.isAdmin && typeof payload.password !== 'undefined') {
      sets.push('password = ?');
      values.push((payload.password || '').toString());
    }

    if (sets.length === 0) throw new BadRequestException('no fields to update');

    const sql = `UPDATE users SET ${sets.join(', ')} WHERE id = ?`;
    values.push(userId);

    await this.db.query<any>(schema, sql, values);

    const selectPassword = opts.isAdmin ? ', u.password' : '';
    const rowSql = `
      SELECT
        u.id,
        u.username,
        u.first_name,
        u.last_name
        ${selectPassword},
        u.created_time,
        u.role_id,
        u.is_active,
        r.role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
      LIMIT 1
    `;
    const rows = await this.db.query<any>(schema, rowSql, [userId]);

    return { ok: true, row: rows[0] };
  }

  // =========================
  // D(soft): set active
  // =========================
  async setActive(id: number, is_active: number) {
    const schema = 'data0' as const;

    const userId = this.toInt(id);
    if (!Number.isFinite(userId) || userId <= 0) throw new BadRequestException('invalid id');

    const active01 = this.toActive01(is_active);

    // 确认用户存在
    const exists = await this.db.query<any>(schema, `SELECT id FROM users WHERE id = ? LIMIT 1`, [userId]);
    if (exists.length === 0) throw new BadRequestException('user not found');

    await this.db.query<any>(schema, `UPDATE users SET is_active = ? WHERE id = ?`, [active01, userId]);
    return { ok: true };
  }
}
