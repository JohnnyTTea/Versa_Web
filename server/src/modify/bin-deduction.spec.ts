import { ModifyService } from './modify.service';
import { MysqlService, MysqlTransaction } from '../db/mysql.service';

function setup() {
  const ledger = new Set<string>();
  const stock = new Map([['A', 10], ['B', 20]]);
  let lockedQty: number | undefined;
  let duplicateInsert = false;
  let multiple = false;
  const query = jest.fn(async (_schema: string, sql: string, params: any[] = []) => {
    if (sql.includes('SELECT identity_hash')) return ledger.has(JSON.stringify(params)) ? [{}] : [];
    if (sql.includes('SELECT Itemno FROM item')) return [{ Itemno: params[0] }];
    if (sql.includes('SELECT Whse, Bin, Onhand')) {
      if (!stock.has(params[1])) return [];
      const rows = [{ Whse: '1', Bin: params[1], Onhand: stock.get(params[1]) }];
      if (multiple) rows.push({ Whse: '2', Bin: params[1], Onhand: 5 });
      return rows;
    }
    return [];
  });
  const execute = jest.fn();
  const transactionExecute = jest.fn();
  let failRestore = false;
  let failAfterFirst = false;
  let updates = 0;
  const withBinInventoryLock = jest.fn(async (schema: string, work: (tx: MysqlTransaction) => Promise<any>) => {
    transactionExecute.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.startsWith('INSERT')) {
        const key = JSON.stringify(params.slice(0, 2));
        if (duplicateInsert || ledger.has(key)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
        ledger.add(key);
      } else if (sql.startsWith('DELETE')) {
        ledger.delete(JSON.stringify(params));
      } else if (sql.startsWith('UPDATE itemwhse SET Onhand = Onhand -')) {
        if (failAfterFirst && updates++ === 1) throw new Error('write failed');
        stock.set(params[3], stock.get(params[3])! - params[0]);
      } else if (sql.startsWith('UPDATE itemwhse SET Onhand = ?')) {
        if (failRestore) throw new Error('connection lost');
        stock.set(params[3], params[0]);
      }
      return { affectedRows: 1 };
    });
    return work({
      query: (async (sql: string, params: any[]) => {
        const rows = await query(schema, sql, params);
        if (lockedQty !== undefined && sql.includes('SELECT Whse') && rows.length) (rows[0] as any).Onhand = lockedQty;
        return rows;
      }) as MysqlTransaction['query'],
      execute: transactionExecute,
    });
  });
  return {
    service: new ModifyService({ query, execute, withBinInventoryLock } as unknown as MysqlService),
    ledger, stock, transactionExecute,
    stale: (qty: number) => { lockedQty = qty; },
    race: () => { duplicateInsert = true; },
    failRestore: () => { failRestore = true; failAfterFirst = true; },
    failSecond: () => { failAfterFirst = true; },
    ambiguous: () => { multiple = true; },
  };
}
const file = (rows = 'SKU1,A,3') => Buffer.from(`SKU,Bin,Qty\n${rows}`);

describe('bin deduction safeguards', () => {
  it('allows repeated previews without reserving the file or changing stock', async () => {
    const f = setup();
    const first = await f.service.previewBinQty(file(), 'IKON', 'inventory.csv');
    const second = await f.service.previewBinQty(file(), 'IKON', 'inventory.csv');
    expect(second).toEqual(first);
    expect(f.ledger.size).toBe(0);
    expect(f.stock.get('A')).toBe(10);
    expect(f.transactionExecute).not.toHaveBeenCalled();
    await expect(f.service.executeBinQty(file(), 'IKON', second.matched, 'inventory.csv')).resolves.toHaveProperty('updated', true);
  });

  it('allows repeated previews of insufficient inventory without reserving or deducting', async () => {
    const f = setup();
    const original = file('SKU1,A,11');
    const first = await f.service.previewBinQty(original, 'IKON', 'inventory.csv');
    const second = await f.service.previewBinQty(original, 'IKON', 'inventory.csv');
    expect(second).toEqual(first);
    expect(second.unmatched[0].reason).toContain('库存不足');
    expect(f.ledger.size).toBe(0);
    expect(f.stock.get('A')).toBe(10);
  });

  it('deducts only the requested bin and blocks replay with changed quantities, bins and row order', async () => {
    const f = setup();
    const original = file('SKU1,A,3\nSKU2,B,4');
    const preview = await f.service.previewBinQty(original, 'IKON', 'inventory.csv');
    await f.service.executeBinQty(original, 'IKON', preview.matched, 'inventory.csv');
    expect(f.stock.get('A')).toBe(7);
    expect(f.stock.get('B')).toBe(16);
    await expect(f.service.previewBinQty(file('SKU2,X,1\nSKU1,A,1\nSKU1,A,1'), 'IKON', 'inventory.csv')).rejects.toThrow('今天已经扣过');
    const updates = f.transactionExecute.mock.calls.filter(([sql]) => sql.startsWith('UPDATE itemwhse'));
    expect(updates).toHaveLength(2);
    expect(updates.every(([sql]) => sql.startsWith('UPDATE itemwhse SET Onhand = Onhand -'))).toBe(true);
  });

  it('uses all items, including rows without a bin, and ignores repeated items', async () => {
    const f = setup();
    const original = file('SKU1,A,3\nSKU2,,');
    const preview = await f.service.previewBinQty(original, 'IKON', 'inventory.csv');
    await f.service.executeBinQty(original, 'IKON', preview.matched, 'inventory.csv');
    await expect(f.service.previewBinQty(file('SKU2,,\nSKU1,A,1\nSKU1,A,1'), 'IKON', 'inventory.csv')).rejects.toThrow('今天已经扣过');
    await expect(f.service.previewBinQty(file(), 'IKON', 'inventory.csv')).resolves.toHaveProperty('success', true);
    await expect(f.service.previewBinQty(original, 'IKON', 'other.csv')).resolves.toHaveProperty('success', true);
  });

  it('allows the same identity on the next server date', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 5, 12));
    try {
      const f = setup();
      const preview = await f.service.previewBinQty(file(), 'IKON', 'inventory.csv');
      await f.service.executeBinQty(file(), 'IKON', preview.matched, 'inventory.csv');
      await expect(f.service.previewBinQty(file(), 'IKON', 'inventory.csv')).rejects.toThrow('今天已经扣过');
      jest.setSystemTime(new Date(2026, 10, 6, 12));
      await expect(f.service.previewBinQty(file(), 'IKON', 'inventory.csv')).resolves.toHaveProperty('success', true);
    } finally { jest.useRealTimers(); }
  });

  it('rejects a racing duplicate before updating any inventory', async () => {
    const f = setup();
    const preview = await f.service.previewBinQty(file(), 'IKON', 'inventory.csv');
    f.race();
    await expect(f.service.executeBinQty(file(), 'IKON', preview.matched, 'inventory.csv')).rejects.toThrow('今天已经扣过');
    expect(f.stock.get('A')).toBe(10);
    expect(f.transactionExecute.mock.calls.some(([sql]) => sql.startsWith('UPDATE itemwhse'))).toBe(false);
  });

  it('rejects stock changes under lock and rolls back the reservation so a retry works', async () => {
    const f = setup();
    const preview = await f.service.previewBinQty(file(), 'IKON', 'inventory.csv');
    f.stale(9);
    await expect(f.service.executeBinQty(file(), 'IKON', preview.matched, 'inventory.csv')).rejects.toThrow('自预览后发生变化');
    expect(f.stock.get('A')).toBe(10);
    expect(f.ledger.size).toBe(0);
    f.stale(10);
    await f.service.executeBinQty(file(), 'IKON', preview.matched, 'inventory.csv');
    expect(f.stock.get('A')).toBe(7);
  });

  it('restores already deducted MyISAM rows and removes the reservation after a write failure', async () => {
    const f = setup();
    const original = file('SKU1,A,3\nSKU2,B,4');
    const preview = await f.service.previewBinQty(original, 'IKON', 'inventory.csv');
    f.failSecond();
    await expect(f.service.executeBinQty(original, 'IKON', preview.matched, 'inventory.csv')).rejects.toThrow('write failed');
    expect(f.stock.get('A')).toBe(10);
    expect(f.stock.get('B')).toBe(20);
    expect(f.ledger.size).toBe(0);
    await expect(f.service.executeBinQty(original, 'IKON', preview.matched, 'inventory.csv')).resolves.toHaveProperty('updated', true);
  });

  it('retains the durable reservation if inventory cannot be restored', async () => {
    const f = setup();
    const original = file('SKU1,A,3\nSKU2,B,4');
    const preview = await f.service.previewBinQty(original, 'IKON', 'inventory.csv');
    f.failRestore();
    await expect(f.service.executeBinQty(original, 'IKON', preview.matched, 'inventory.csv')).rejects.toThrow('请人工核对');
    expect(f.ledger.size).toBe(1);
    await expect(f.service.previewBinQty(original, 'IKON', 'inventory.csv')).rejects.toThrow('今天已经扣过');
  });

  it('updates valid bins while skipping insufficient and unmatched bins', async () => {
    const f = setup();
    const original = file('SKU1,A,3\nSKU2,B,21\nSKU3,MISSING,4');
    const preview = await f.service.previewBinQty(original, 'IKON', 'inventory.csv');
    expect(preview.matched).toHaveLength(1);
    expect(preview.unmatched).toHaveLength(2);
    expect(preview.unmatched[0].reason).toContain('库存不足');
    const result = await f.service.executeBinQty(original, 'IKON', preview.matched, 'inventory.csv');
    expect(result.updated).toBe(true);
    expect(result.matched).toHaveLength(1);
    expect(result.unmatched).toHaveLength(2);
    expect(f.stock.get('A')).toBe(7);
    expect(f.stock.get('B')).toBe(20);
    const updates = f.transactionExecute.mock.calls.filter(([sql]) => sql.startsWith('UPDATE itemwhse'));
    expect(updates).toHaveLength(1);
    await expect(f.service.executeBinQty(original, 'IKON', preview.matched, 'inventory.csv')).rejects.toThrow('今天已经扣过');
  });

  it('rejects negative quantities, insufficient stock, and multiple warehouses', async () => {
    const f = setup();
    await expect(f.service.previewBinQty(file('SKU1,A,-1'), 'IKON', 'inventory.csv')).rejects.toThrow('非负');
    const shortage = await f.service.previewBinQty(file('SKU1,A,11'), 'IKON', 'inventory.csv');
    expect(shortage.unmatched[0].reason).toContain('库存不足');
    await expect(f.service.executeBinQty(file('SKU1,A,11'), 'IKON', [], 'inventory.csv')).rejects.toThrow('没有可扣除库存');
    f.ambiguous();
    const ambiguous = await f.service.previewBinQty(file(), 'IKON', 'inventory.csv');
    expect(ambiguous.unmatched[0].reason).toContain('多个仓库');
  });
});
