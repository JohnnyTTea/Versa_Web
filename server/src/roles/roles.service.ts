import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

@Injectable()
export class RolesService {
  constructor(private readonly mysql: MysqlService) {}

  async list() {
    // data0 库：roles
    const sql = `
      SELECT id, role_name
      FROM roles
      ORDER BY id ASC
    `;
    const rows = await this.mysql.query('data0', sql, []);
    return rows;
  }
}
