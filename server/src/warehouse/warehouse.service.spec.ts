import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { MysqlService } from '../db/mysql.service';

describe('warehouse log dates', () => {
  it('queries distinct calendar dates without timezone conversion', async () => {
    const query = jest.fn(async (_schema: string, sql: string) => {
      if (sql.includes('SHOW COLUMNS')) return [{ Field: 'exists' }];
      if (sql.includes('SELECT DISTINCT')) return [{ date: '2026-11-05' }, { date: '2026-10-31' }];
      return [];
    });
    const service = new WarehouseService({ query } as unknown as MysqlService);
    await expect(service.getLogDates()).resolves.toEqual({ ok: true, dates: ['2026-11-05', '2026-10-31'] });
    expect(query).toHaveBeenCalledWith('data0', expect.stringContaining("DATE_FORMAT(packed_date, '%Y-%m-%d')"), []);
    expect(query).toHaveBeenCalledWith('data0', expect.stringContaining('ORDER BY date DESC'), []);
  });

  it('returns an empty date list when there are no scans', async () => {
    const query = jest.fn(async (_schema: string, sql: string) => sql.includes('SHOW COLUMNS') ? [{}] : []);
    const service = new WarehouseService({ query } as unknown as MysqlService);
    await expect(service.getLogDates()).resolves.toEqual({ ok: true, dates: [] });
  });

  it('requires an authenticated warehouse user before listing dates', async () => {
    const getLogDates = jest.fn().mockResolvedValue({ ok: true, dates: ['2026-11-05'] });
    const controller = new WarehouseController({ getLogDates } as unknown as WarehouseService);
    await expect(controller.logDates({})).rejects.toThrow('Unauthorized');
    expect(getLogDates).not.toHaveBeenCalled();
    await expect(controller.logDates({ session: { user_id: 1, username: 'packer' } })).resolves.toEqual({ ok: true, dates: ['2026-11-05'] });
  });
});
