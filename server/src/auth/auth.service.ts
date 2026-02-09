import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

type Perms = Record<
  'product' | 'sales' | 'purchase' | 'dto' | 'modify' | 'report' | 'inventory' | 'review' | 'settings',
  boolean
>;

function buildPerms(roleRow: any): Perms {
  return {
    product: !!roleRow?.can_product,
    sales: !!roleRow?.can_sales,
    purchase: !!roleRow?.can_purchase,
    dto: !!roleRow?.can_dto,
    modify: !!roleRow?.can_modify,
    report: !!roleRow?.can_report,
    inventory: !!roleRow?.can_inventory,
    review: !!roleRow?.can_review,
    settings: !!roleRow?.can_settings,
  };
}

@Injectable()
export class AuthService {
  constructor(private readonly db: MysqlService) {}

  async validateLogin(schema: 'data0', username: string, password: string) {
    const userRows = await this.db.query(
      schema,
      `
      SELECT id, username, password, role_id, is_active
      FROM users
      WHERE LOWER(username) = LOWER(?)
      LIMIT 1
      `,
      [username],
    );

    const user = Array.isArray(userRows) ? userRows[0] : null;
    if (!user) return { ok: false as const, message: 'Unauthorized' };
    if (user.is_active === 0) return { ok: false as const, message: 'User is inactive' };

    // TODO: 以后换成 bcrypt compare
    if (String(user.password) !== password) {
      return { ok: false as const, message: 'Unauthorized' };
    }

    const roleRows = await this.db.query(
      schema,
      `
      SELECT r.id, r.role_name,
             r.can_product, r.can_sales, r.can_purchase, r.can_dto, r.can_modify,
             r.can_report, r.can_inventory, r.can_review, r.can_settings
      FROM roles r
      WHERE r.id = ?
      LIMIT 1
      `,
      [user.role_id],
    );

    const roleRow = Array.isArray(roleRows) ? roleRows[0] : null;

    return {
      ok: true as const,
      user: {
        id: user.id,
        username: user.username,
        role_id: user.role_id,
        role_name: roleRow?.role_name || '',
        perms: buildPerms(roleRow),
      },
    };
  }
}
