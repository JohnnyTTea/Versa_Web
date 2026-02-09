import { Injectable } from '@nestjs/common';
import { MysqlService } from '../db/mysql.service';

@Injectable()
export class LogService {
  constructor(private readonly db: MysqlService) {}

  async writeLog(username: string, ip: string, event: string) {
    // 写入 data0（你 PHP 也是 data0）
    await this.db.query(
      'data0',
      `INSERT INTO user_activity_log (username, ip_address, event, \`timestamp\`) VALUES (?, ?, ?, NOW())`,
      [username, ip, event],
    );
  }
}
