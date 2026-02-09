import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as mysql from 'mysql2/promise';

type SchemaName = 'aisdata0' | 'aisdata1' | 'aisdata3' | 'aisdata5' | 'aisdatax' | 'data0';

type PoolKey = 'AIS' |'TSHIPPER'| 'DATA';

@Injectable()
export class MysqlService implements OnModuleDestroy {
  private pools: Record<string, mysql.Pool> = {};

  /**
   * schema → 服务器映射
   * 等价于你 PHP 里的 connectDB('aisdata0')
   */
  private schemaMap: Record<SchemaName, PoolKey> = {
    aisdata0: 'AIS',
    aisdata1: 'AIS',
    aisdata3: 'AIS',
    aisdata5: 'AIS',
    aisdatax: 'TSHIPPER',
    data0: 'DATA',
  };

  private poolConfig: Record<PoolKey, mysql.PoolOptions> = {
    AIS: {
      host: process.env.AIS_DB_HOST!,
      port: Number(process.env.AIS_DB_PORT || 3306),
      user: process.env.AIS_DB_USER!,
      password: process.env.AIS_DB_PASS!,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
    },
    TSHIPPER: {
      host: process.env.TSHIPPER_DB_HOST!,
      port: Number(process.env.TSHIPPER_DB_HOST || 3306),
      user: process.env.AIS_DB_USER!,
      password: process.env.AIS_DB_PASS!,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
    },
    DATA: {
      host: process.env.DATA_DB_HOST!,
      port: Number(process.env.DATA_DB_PORT || 3308),
      user: process.env.DATA_DB_USER!,
      password: process.env.DATA_DB_PASS!,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
    },
  };

  private getPool(schema: SchemaName): mysql.Pool {
    const key = this.schemaMap[schema];
    if (!key) {
      throw new Error(`No DB mapping for schema: ${schema}`);
    }

    const poolId = `${key}_${schema}`;

    if (!this.pools[poolId]) {
      this.pools[poolId] = mysql.createPool({
        ...this.poolConfig[key],
        database: schema,
      });
    }

    return this.pools[poolId];
  }

  async query<T = any>(
    schema: SchemaName,
    sql: string,
    params?: any,
  ): Promise<T[]> {
    const pool = this.getPool(schema);
    const [rows] = await pool.query(sql, params);
    return rows as T[];
  }

  async execute(
    schema: SchemaName,
    sql: string,
    params?: any,
  ): Promise<{ affectedRows: number }> {
    const pool = this.getPool(schema);
    const [res]: any = await pool.execute(sql, params);
    return { affectedRows: Number(res?.affectedRows || 0) };
  }

  async onModuleDestroy() {
    for (const pool of Object.values(this.pools)) {
      await pool.end();
    }
  }
}
