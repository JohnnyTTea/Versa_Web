import { Injectable, OnModuleInit } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

const PACKER_ROLE_NAME = 'packer';

const PACKER_USERS = [
  {
    username: 'Richardoa',
    password: 'ricardoa369',
    first_name: 'Ricardo',
    last_name: 'Aguirre',
  },
  {
    username: 'Carlog',
    password: 'carlog124',
    first_name: 'Carlo',
    last_name: 'Gonzalez',
  },
  {
    username: 'Tianav',
    password: 'taniav354',
    first_name: 'Tania',
    last_name: 'Valdovinos',
  },
  {
    username: 'Miguelm',
    password: 'miguelm751',
    first_name: 'Miguel',
    last_name: 'Montiel',
  },
  {
    username: 'Christopferc',
    password: 'christoperc152',
    first_name: 'Christopher',
    last_name: 'Chevry',
  },
] as const;

@Injectable()
export class DefaultPackerUsersSeed implements OnModuleInit {
  constructor(private readonly db: MysqlService) {}

  async onModuleInit() {
    try {
      await this.ensurePackerRole();
      await this.ensureUsers();
    } catch (error) {
      console.error('[packer-seed] failed to initialize packer users:', error);
    }
  }

  private async ensurePackerRole(): Promise<number> {
    const rows = await this.db.query<any>(
      'data0',
      `SELECT id FROM roles WHERE LOWER(role_name) = LOWER(?) LIMIT 1`,
      [PACKER_ROLE_NAME],
    );

    if (rows?.length) {
      await this.db.query(
        'data0',
        `UPDATE roles SET can_warehouse = 1 WHERE LOWER(role_name) = LOWER(?)`,
        [PACKER_ROLE_NAME],
      );
      return Number(rows[0].id);
    }

    await this.db.query(
      'data0',
      `INSERT INTO roles (role_name, description, created_time, can_warehouse)
       VALUES (?, ?, NOW(), 1)`,
      [PACKER_ROLE_NAME, 'Warehouse packer'],
    );

    const created = await this.db.query<any>(
      'data0',
      `SELECT id FROM roles WHERE LOWER(role_name) = LOWER(?) ORDER BY id DESC LIMIT 1`,
      [PACKER_ROLE_NAME],
    );

    return created?.[0] ? Number(created[0].id) : 0;
  }

  private async ensureUsers() {
    const roleId = await this.ensurePackerRole();
    if (!roleId) {
      return;
    }

    for (const user of PACKER_USERS) {
      const existing = await this.db.query<any>(
        'data0',
        `SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1`,
        [user.username],
      );

      if (existing?.length) {
        await this.db.query(
          'data0',
          `UPDATE users
           SET password = ?,
               first_name = ?,
               last_name = ?,
               role_id = ?,
               is_active = 1
           WHERE LOWER(username) = LOWER(?)`,
          [user.password, user.first_name, user.last_name, roleId, user.username],
        );
        continue;
      }

      await this.db.query(
        'data0',
        `INSERT INTO users (username, password, first_name, last_name, created_time, role_id, is_active)
         VALUES (?, ?, ?, ?, NOW(), ?, 1)`,
        [user.username, user.password, user.first_name, user.last_name, roleId],
      );
    }
  }
}
