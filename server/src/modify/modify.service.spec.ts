import ExcelJS from 'exceljs';
import { MysqlService, MysqlTransaction } from '../db/mysql.service';
import { ModifyService } from './modify.service';

async function makeWorkbook(rows: Array<[string, number]>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Orders');
  sheet.addRow(['order-id', 'item-tax']);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function makeDelimitedFile(rows: Array<[string, number]>, delimiter = '\t'): Buffer {
  const lines = [['order-id', 'item-tax'], ...rows].map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(delimiter));
  return Buffer.from(lines.join('\n'), 'utf8');
}

describe('ModifyService sales order tax updates', () => {
  const order = {
    Trno: 12345,
    Cpono: 'amazon-order-1',
    Taxamt1: 4,
    Totamt: 100,
  };

  it('previews aggregated tax, idempotent total, and unmatched order ids', async () => {
    const query = jest.fn().mockResolvedValue([{ ...order, Taxamt1: 0 }]);
    const withTransaction = jest.fn();
    const service = new ModifyService({
      query,
      withTransaction,
    } as unknown as MysqlService);
    const file = await makeWorkbook([
      ['amazon-order-1', 1.25],
      ['amazon-order-1', 2.5],
      ['missing-order', 0.75],
    ]);

    const result = await service.previewSalesOrderTax(file, 'IKON');

    expect(query).toHaveBeenCalledWith(
      'aisdata1',
      expect.stringContaining('FROM saord'),
      ['amazon-order-1', 'missing-order'],
    );
    expect(result.matched).toEqual([
      expect.objectContaining({
        order_id: 'amazon-order-1',
        source_rows: 2,
        tax_amount: 3.75,
        old_tax: 0,
        new_tax: 3.75,
        old_total: 100,
        new_total: 103.75,
      }),
    ]);
    expect(result.unmatched).toEqual([
      expect.objectContaining({
        order_id: 'missing-order',
        reason: 'AIS 中未找到对应 Cpono',
      }),
    ]);
  });

  it('supports TSV/TXT uploads with the same fixed headers', async () => {
    const query = jest.fn().mockResolvedValue([{ ...order, Taxamt1: 0 }]);
    const withTransaction = jest.fn();
    const service = new ModifyService({
      query,
      withTransaction,
    } as unknown as MysqlService);
    const file = makeDelimitedFile([
      ['amazon-order-1', 1.25],
      ['amazon-order-1', 2.5],
    ]);

    const result = await service.previewSalesOrderTax(file, 'IKON');

    expect(result.matched).toEqual([
      expect.objectContaining({
        order_id: 'amazon-order-1',
        source_rows: 2,
        tax_amount: 3.75,
        new_tax: 3.75,
      }),
    ]);
  });

  it('accepts common alternate header names used by exported files', async () => {
    const query = jest.fn().mockResolvedValue([{ ...order, Taxamt1: 0 }]);
    const withTransaction = jest.fn();
    const service = new ModifyService({ query, withTransaction } as unknown as MysqlService);
    const file = Buffer.from(['customer-id,tax', 'amazon-order-1,3.75'].join('\n'), 'utf8');

    const result = await service.previewSalesOrderTax(file, 'IKON');

    expect(result.matched).toEqual([
      expect.objectContaining({
        order_id: 'amazon-order-1',
        tax_amount: 3.75,
      }),
    ]);
  });

  it('skips any order whose Taxamt1 already exists in the database', async () => {
    const query = jest.fn().mockResolvedValue([{ ...order, Taxamt1: 12.5 }]);
    const withTransaction = jest.fn();
    const service = new ModifyService({
      query,
      withTransaction,
    } as unknown as MysqlService);
    const file = await makeWorkbook([['amazon-order-1', 3.75]]);

    const result = await service.previewSalesOrderTax(file, 'IKON');

    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([
      expect.objectContaining({
        order_id: 'amazon-order-1',
        reason: '数据库中已存在 Taxamt1，跳过修改',
      }),
    ]);
  });

  it('updates matched orders in a transaction after confirming the preview state', async () => {
    const transactionQuery = jest.fn().mockResolvedValue([{ ...order, Taxamt1: 0 }]);
    const transactionExecute = jest.fn().mockResolvedValue({ affectedRows: 1 });
    const transaction: MysqlTransaction = {
      query: transactionQuery,
      execute: transactionExecute,
    };
    const withTransaction = jest.fn(
      (_schema: string, callback: (tx: MysqlTransaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const db = {
      query: jest.fn().mockResolvedValue([{ ...order, Taxamt1: 0 }]),
      withTransaction,
    };
    const service = new ModifyService(db as unknown as MysqlService);
    const file = await makeWorkbook([['amazon-order-1', 3.75]]);
    const preview = await service.previewSalesOrderTax(file, 'MD');

    const result = await service.executeSalesOrderTax(
      file,
      'MD',
      preview.matched,
    );

    expect(withTransaction).toHaveBeenCalledWith(
      'aisdata3',
      expect.any(Function),
    );
    expect(transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      ['amazon-order-1'],
    );
    expect(transactionExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE saord SET Taxamt1 = ?, Totamt = ?'),
      [3.75, 103.75, 12345, 'amazon-order-1'],
    );
    expect(result.updated_orders).toBe(1);
    expect(result.updated).toBe(true);
  });

  it('rejects a write when the order changed after preview', async () => {
    const transactionQuery = jest
      .fn()
      .mockResolvedValue([{ ...order, Taxamt1: 5 }]);
    const transactionExecute = jest.fn();
    const transaction: MysqlTransaction = {
      query: transactionQuery,
      execute: transactionExecute,
    };
    const withTransaction = jest.fn(
      (_schema: string, callback: (tx: MysqlTransaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const db = {
      query: jest.fn().mockResolvedValue([{ ...order, Taxamt1: 0 }]),
      withTransaction,
    };
    const service = new ModifyService(db as unknown as MysqlService);
    const file = await makeWorkbook([['amazon-order-1', 3.75]]);
    const preview = await service.previewSalesOrderTax(file, 'IKON');

    await expect(
      service.executeSalesOrderTax(file, 'IKON', preview.matched),
    ).rejects.toThrow('订单匹配结果已变化');
    expect(transactionExecute).not.toHaveBeenCalled();
  });
});
