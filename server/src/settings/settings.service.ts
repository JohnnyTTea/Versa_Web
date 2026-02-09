import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

// 你把这里改成实际 users/roles 所在 schema：比如 "data0" / "aisdata0"
const SETTINGS_SCHEMA = 'data0' as any;

const MENUS = [
  'product',
  'sales',
  'purchase',
  'dto',
  'modify',
  'report',
  'inventory',
  'review',
  'settings',
] as const;

type MenuKey = (typeof MENUS)[number];

@Injectable()
export class SettingsService {
  constructor(private readonly db: MysqlService) {}

  private normalizePerm(perm: Record<string, any>) {
    const out: Record<MenuKey, number> = {
      product: 0,
      sales: 0,
      purchase: 0,
      dto: 0,
      modify: 0,
      report: 0,
      inventory: 0,
      review: 0,
      settings: 0,
    };
    for (const k of MENUS) {
      const v = perm?.[k];
      out[k] = v === true || v === 1 || v === '1' ? 1 : 0;
    }
    return out;
  }

  async getUsersAndRoles(opts: { superAdmin: boolean }) {
    const roles = await this.db.query<any>(
      SETTINGS_SCHEMA,
      `SELECT id, role_name FROM roles ORDER BY id ASC`,
      [],
    );

    const users = await this.db.query<any>(
      SETTINGS_SCHEMA,
      `
      SELECT
        u.id, u.username,
        ${opts.superAdmin ? 'u.password,' : 'NULL AS password,'}
        u.first_name, u.last_name, u.created_time,
        u.role_id, COALESCE(r.role_name, '') AS role_name,
        u.is_active
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.id ASC
      `,
      [],
    );

    // admin 永远不返回真实密码（与你 PHP 一致：显示 ********）
    if (opts.superAdmin) {
      for (const u of users) {
        if ((u.username || '').toLowerCase() === 'admin') u.password = '';
      }
    }

    return { roles, users };
  }

  async saveUser(args: {
    sessionUser: string;
    id: number;
    username: string;
    password: string;
    first_name: string;
    last_name: string;
    role_id: number;
  }) {
    const {
      sessionUser,
      id,
      username,
      password,
      first_name,
      last_name,
      role_id,
    } = args;

    if (!username || !password)
      return { ok: false, message: 'empty_username_or_password' };

    if (id > 0) {
      const rows = await this.db.query<any>(
        SETTINGS_SCHEMA,
        `SELECT id, username FROM users WHERE id = ? LIMIT 1`,
        [id],
      );
      const user = rows?.[0];
      if (!user) return { ok: false, message: 'user_not_found' };

      if ((user.username || '').toLowerCase() === 'admin') {
        return { ok: false, message: 'cannot_modify_admin' };
      }
      // PHP 只限制 delete/disable 自己；save 允许，所以这里不拦
    }

    // username 重复检查
    if (id > 0) {
      const c = await this.db.query<any>(
        SETTINGS_SCHEMA,
        `SELECT COUNT(*) AS cnt FROM users WHERE username = ? AND id <> ?`,
        [username, id],
      );
      if ((c?.[0]?.cnt || 0) > 0)
        return { ok: false, message: 'username_exists' };
    } else {
      const c = await this.db.query<any>(
        SETTINGS_SCHEMA,
        `SELECT COUNT(*) AS cnt FROM users WHERE username = ?`,
        [username],
      );
      if ((c?.[0]?.cnt || 0) > 0)
        return { ok: false, message: 'username_exists' };
    }

    if (id > 0) {
      await this.db.query<any>(
        SETTINGS_SCHEMA,
        `
        UPDATE users
        SET username = ?, password = ?, first_name = ?, last_name = ?, role_id = ?
        WHERE id = ?
        `,
        [username, password, first_name, last_name, role_id, id],
      );
      return { ok: true };
    }

    await this.db.query<any>(
      SETTINGS_SCHEMA,
      `
      INSERT INTO users (username, password, first_name, last_name, created_time, role_id, is_active)
      VALUES (?, ?, ?, ?, NOW(), ?, 1)
      `,
      [username, password, first_name, last_name, role_id],
    );
    return { ok: true };
  }

  async setUserStatus(args: {
    sessionUser: string;
    id: number;
    action: 'enable' | 'disable';
  }) {
    const { sessionUser, id, action } = args;
    if (id <= 0) return { ok: false, message: 'invalid_id' };

    const rows = await this.db.query<any>(
      SETTINGS_SCHEMA,
      `SELECT id, username FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    const user = rows?.[0];
    if (!user) return { ok: false, message: 'user_not_found' };

    const uname = (user.username || '').trim();

    if (uname.toLowerCase() === 'admin') {
      if (action === 'disable')
        return { ok: false, message: 'cannot_modify_admin' };
      return { ok: true };
    }

    // 不能禁用自己
    if (uname === sessionUser && action === 'disable') {
      return { ok: false, message: 'cannot_modify_self' };
    }

    await this.db.query<any>(
      SETTINGS_SCHEMA,
      `UPDATE users SET is_active = ? WHERE id = ?`,
      [action === 'enable' ? 1 : 0, id],
    );

    return { ok: true };
  }

  async deleteUser(args: { sessionUser: string; id: number }) {
    const { sessionUser, id } = args;
    if (id <= 0) return { ok: false, message: 'invalid_id' };

    const rows = await this.db.query<any>(
      SETTINGS_SCHEMA,
      `SELECT id, username FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    const user = rows?.[0];
    if (!user) return { ok: false, message: 'user_not_found' };

    const uname = (user.username || '').trim();

    if (uname.toLowerCase() === 'admin')
      return { ok: false, message: 'cannot_modify_admin' };
    if (uname === sessionUser)
      return { ok: false, message: 'cannot_modify_self' };

    await this.db.query<any>(
      SETTINGS_SCHEMA,
      `DELETE FROM users WHERE id = ?`,
      [id],
    );
    return { ok: true };
  }

  async getRoles() {
    const roles = await this.db.query<any>(
      SETTINGS_SCHEMA,
      `
      SELECT
        id, role_name, description,
        can_product, can_sales, can_purchase, can_dto,
        can_modify, can_report, can_inventory, can_review, can_settings
      FROM roles
      ORDER BY id ASC
      `,
      [],
    );
    return { roles };
  }

  async saveRole(args: {
    id: number;
    role_name: string;
    description: string;
    perm: Record<string, any>;
  }) {
    const { id, role_name, description, perm } = args;
    if (!role_name) return { ok: false, message: 'empty_name' };

    if (id > 0) {
      const r = await this.db.query<any>(
        SETTINGS_SCHEMA,
        `SELECT id, role_name FROM roles WHERE id = ? LIMIT 1`,
        [id],
      );
      const role = r?.[0];
      if (!role) return { ok: false, message: 'role_not_found' };
      if ((role.role_name || '').toLowerCase() === 'admin') {
        return { ok: false, message: 'cannot_modify_admin_role' };
      }
    }

    const p = this.normalizePerm(perm);

    if (id > 0) {
      await this.db.query<any>(
        SETTINGS_SCHEMA,
        `
        UPDATE roles SET
          role_name = ?, description = ?,
          can_product = ?, can_sales = ?, can_purchase = ?, can_dto = ?,
          can_modify = ?, can_report = ?, can_inventory = ?, can_review = ?, can_settings = ?
        WHERE id = ?
        `,
        [
          role_name,
          description,
          p.product,
          p.sales,
          p.purchase,
          p.dto,
          p.modify,
          p.report,
          p.inventory,
          p.review,
          p.settings,
          id,
        ],
      );
      return { ok: true };
    }

    await this.db.query<any>(
      SETTINGS_SCHEMA,
      `
      INSERT INTO roles (
        role_name, description, created_time,
        can_product, can_sales, can_purchase, can_dto,
        can_modify, can_report, can_inventory, can_review, can_settings
      ) VALUES (
        ?, ?, NOW(),
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
      `,
      [
        role_name,
        description,
        p.product,
        p.sales,
        p.purchase,
        p.dto,
        p.modify,
        p.report,
        p.inventory,
        p.review,
        p.settings,
      ],
    );
    return { ok: true };
  }

  async deleteRole(args: { id: number }) {
    const { id } = args;
    if (id <= 0) return { ok: false, message: 'invalid_id' };

    const r = await this.db.query<any>(
      SETTINGS_SCHEMA,
      `SELECT id, role_name FROM roles WHERE id = ? LIMIT 1`,
      [id],
    );
    const role = r?.[0];
    if (!role) return { ok: false, message: 'role_not_found' };

    if ((role.role_name || '').toLowerCase() === 'admin') {
      return { ok: false, message: 'cannot_modify_admin_role' };
    }

    try {
      await this.db.query<any>(
        SETTINGS_SCHEMA,
        `DELETE FROM roles WHERE id = ?`,
        [id],
      );
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: 'role_in_use_or_delete_failed' };
    }
  }
}
