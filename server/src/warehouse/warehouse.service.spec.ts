import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { MysqlService } from '../db/mysql.service';

describe('warehouse scan rules', () => {
  function setup() {
    const query = jest.fn(async (_schema: string, sql: string) => {
      if (sql.includes('SHOW COLUMNS')) return [{ Field: 'exists' }];
      if (sql.includes('SELECT COUNT')) return [{ cnt: 1 }];
      return [];
    });
    return { query, service: new WarehouseService({ query } as unknown as MysqlService) };
  }

  it.each([
    ['1Z586Y510334216632', 'UPS', 'GROUND'],
    ['8412345', 'EFW', 'Economy'],
    ['11000000000000000000', 'GLS US', 'CPS'],
    ['CJ00000000000', 'USPS', 'IPRIORITY'],
    ['CJ00000000000000000000', 'USPS', 'IPRIORITY'],
    ['HJ00000000000000000000', 'USPS', 'IPRIORITY'],
    ['LN00000000000000000000', 'USPS', 'IFIRSTCLASS'],
    ['LZ00000000000000000000', 'USPS', 'IFIRSTCLASS'],
    ['UA00000000000000000000', 'USPS', 'IPRIORITY'],
    ['390000000000', 'FEDEX', 'GROUND'],
    ['39000000000000', 'FEDEX', 'GROUND'],
    // Only prefix and length matter, with no restrictions on the remaining characters.
    ['84ABCDE', 'EFW', 'Economy'],
    ['84-!@#$', 'EFW', 'Economy'],
  ])('records %s using the supplied carrier and freight', async (tracking, shipvia, freight) => {
    const { query, service } = setup();
    await expect(service.recordScan({ user_id: 1, username: 'packer', tracking_number: tracking }))
      .resolves.toMatchObject({ ok: true, tracking_number: tracking, shipvia, freight });
    expect(query).toHaveBeenCalledWith('data0', expect.stringContaining('INSERT IGNORE'),
      [1, 'packer', tracking, shipvia, freight]);
  });

  it('normalizes case and all whitespace before matching and saving', async () => {
    const { query, service } = setup();
    await expect(service.recordScan({
      user_id: 1, username: 'packer', tracking_number: ' \t1z 586y51\u00a00334216632\r\n',
    })).resolves.toMatchObject({ tracking_number: '1Z586Y510334216632', shipvia: 'UPS' });
    expect(query).toHaveBeenCalledWith('data0', expect.stringContaining('INSERT IGNORE'),
      [1, 'packer', '1Z586Y510334216632', 'UPS', 'GROUND']);
  });

  it.each([
    ['9632001960207427750500879556180572', '879556180572'],
    [' \t9632 0019 602074277505\u00a000879556180572\r\n', '879556180572'],
    ['9632001960207427750539123456789012', '39123456789012'],
  ])('extracts and saves the FedEx tracking from barcode %s', async (barcode, tracking) => {
    const { query, service } = setup();
    const scan = await service.recordScan({ user_id: 1, username: 'packer', tracking_number: barcode });
    expect(scan).toMatchObject({ ok: true, tracking_number: tracking, shipvia: 'FEDEX', freight: 'GROUND' });
    await service.recordScan({ user_id: 1, username: 'packer', tracking_number: tracking });
    const inserts = query.mock.calls.filter((call) => call[1].includes('INSERT IGNORE'));
    expect(inserts).toHaveLength(2);
    // Both inputs use the same database uniqueness key and carrier classification.
    for (const call of inserts) {
      expect(call).toEqual(['data0', expect.stringContaining('INSERT IGNORE'),
        [1, 'packer', tracking, 'FEDEX', 'GROUND']]);
    }
  });

  it.each([
    '12586Y510334216632', // Old UPS prefix is no longer configured at this length.
    'HT00000000000000000000', // Replaced by HJ.
    '96320804000000000000879764057040', // Not a 34-digit FedEx barcode.
    '9632001960207427750500841234567890', // Extracted tracking is not in the FedEx rules.
    '9632001960207427750511879556180572', // Do not blindly take the last 12 digits.
    '9532001960207427750500879556180572', // Wrong barcode prefix.
    '96320019602074277505008795561805720', // Wrong barcode length.
    '9632001960207427750A00879556180572', // Not a numeric FedEx barcode.
    'EA00000000000000000000', // No extra carrier-prefix fallback.
    '84123456', // Correct prefix, wrong length.
    '1Z586Y510334216632-', // Punctuation is retained when measuring length.
  ])('rejects unmatched prefix or length without writing: %s', async (tracking) => {
    const { query, service } = setup();
    await expect(service.recordScan({ user_id: 1, username: 'packer', tracking_number: tracking }))
      .rejects.toThrow('Tracking prefix and length do not match the configured rules.');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only input without writing', async () => {
    const { query, service } = setup();
    await expect(service.recordScan({ user_id: 1, username: 'packer', tracking_number: ' \t\n' }))
      .rejects.toThrow('Tracking number is required');
    expect(query).not.toHaveBeenCalled();
  });
});

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
