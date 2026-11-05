import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import * as crypto from 'crypto';
import ExcelJS from 'exceljs';
import { MysqlService, MysqlTransaction } from '../db/mysql.service';

const THRESHOLD = 0.05;

type DbKey = 'aisdata0' | 'aisdata1' | 'aisdata3';

type ChangeRow = {
  trno: number;
  trdate: string;
  old_othamt1: number;
  new_othamt1: number;
  subtotal_before: number;
  subtotal_after: number;
};

type DetailRow = {
  Trno: number;
  Cpono?: string;
  Trdate?: string;
  Itemno: string;
  Shiqty: number;
  UnitPrice: number;
  UnitAmount: number;
  Othamt1: number;
  Taxamt1?: number;
  Jouno?: string;
};

export type SalesOrderTaxPreviewRow = {
  order_id: string;
  source_rows: number;
  tax_amount: number;
  trno: number;
  old_tax: number;
  new_tax: number;
  old_total: number;
  new_total: number;
};

type UnmatchedSalesOrderTaxRow = {
  order_id: string;
  source_rows: number;
  tax_amount: number;
  reason: string;
};

type ParsedSalesOrderTaxRow = {
  order_id: string;
  source_rows: number;
  tax_cents: number;
};

type SalesOrderDbRow = {
  Trno: number | string;
  Cpono: string | null;
  Taxamt1: number | string | null;
  Totamt: number | string | null;
};

type SalesOrderTaxCompany = 'IKON' | 'MD';

type BinQtyPreviewRow = {
  itemno: string;
  bin: string;
  source_rows: number;
  qty: number;
  old_qty: number;
  new_qty: number;
  whse: string[];
};

type BinQtyUnmatchedRow = {
  itemno: string;
  bin: string;
  source_rows: number;
  qty: number;
  reason: string;
};

type ParsedBinQtyRow = {
  itemno: string;
  bin: string;
  qty: number;
  source_rows: number;
};

@Injectable()
export class ModifyService {
  constructor(private readonly db: MysqlService) {}

  private round2(v: number) {
    return Math.round(v * 100) / 100;
  }

  private binQtyIdentity(itemnos: string[], filename: string) {
    const name = String(filename || '').trim().split(/[\\/]/).pop() || '';
    if (!name) throw new BadRequestException('缺少上传文件名，请重新上传');
    const items = [...new Set(itemnos)].sort();
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const key = crypto.createHash('sha256').update(JSON.stringify([name, items])).digest('hex');
    return { name, day, key, items };
  }

  private async checkBinQtyFileReuse(schema: DbKey, identity: ReturnType<ModifyService['binQtyIdentity']>) {
    // A durable reservation blocks retries even if the process stops mid-deduction.
    await this.db.query(schema, `
      CREATE TABLE IF NOT EXISTS modify_bin_qty_daily_audit (
        business_date DATE NOT NULL,
        identity_hash CHAR(64) NOT NULL,
        filename TEXT NOT NULL,
        itemnos LONGTEXT NOT NULL,
        row_count INT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'processing',
        before_stock LONGTEXT NOT NULL,
        processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (business_date, identity_hash)
      ) ENGINE=MyISAM
    `);
    const rows = await this.db.query(schema,
      'SELECT identity_hash FROM modify_bin_qty_daily_audit WHERE business_date = ? AND identity_hash = ?',
      [identity.day, identity.key]);
    if (rows.length) throw new ConflictException('该文件名和完整 Itemno 集合今天已经扣过库存，不能重复扣除');
  }

  private toNumber(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private toIsoDate(s: string): string {
    const raw = (s || '').trim();
    if (!raw) return '';
    if (raw.includes('/')) {
      const parts = raw.split('/');
      if (parts.length === 3) {
        const m = Number(parts[0]);
        const d = Number(parts[1]);
        const y = Number(parts[2]);
        if (m && d && y) {
          const dt = new Date(Date.UTC(y, m - 1, d));
          if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
        }
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return '';
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  private normalizeHeaderKey(value: string): string {
    return String(value ?? '')
      .replace(/\uFEFF/g, '')
      .trim()
      .toLowerCase()
      .replace(/['"`]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
  }

  private findHeaderIndex(headers: Map<string, number>, candidates: string[]): number | undefined {
    for (const candidate of candidates) {
      const index = headers.get(this.normalizeHeaderKey(candidate));
      if (index !== undefined) return index;
    }
    return undefined;
  }

  private toMoneyCents(value: unknown, rowNumber: number): number {
    const text = this.cellText(value).trim().replace(/[$,]/g, '');
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
      throw new BadRequestException(`第 ${rowNumber} 行 item-tax 不是有效金额`);
    }
    const amount = Number(text);
    if (!Number.isFinite(amount)) {
      throw new BadRequestException(`第 ${rowNumber} 行 item-tax 不是有效金额`);
    }
    return Math.round(amount * 100);
  }

  private cellText(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (!value || typeof value !== 'object') return '';
    if ('result' in value) return this.cellText(value.result);
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part: unknown) => {
          if (
            part &&
            typeof part === 'object' &&
            'text' in part &&
            typeof part.text === 'string'
          ) {
            return part.text;
          }
          return '';
        })
        .join('');
    }
    return '';
  }

  private splitCsvLikeLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        cells.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current);
    return cells;
  }

  private parseDelimitedTextFile(buffer: Buffer): ParsedSalesOrderTaxRow[] {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text
      .split(/\r\n|\n|\r/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 2) {
      throw new BadRequestException('文本文件为空或没有数据行');
    }

    const detectDelimiter = (sample: string): string => {
      const counts = {
        '\t': (sample.match(/\t/g) || []).length,
        ',': (sample.match(/,/g) || []).length,
        ';': (sample.match(/;/g) || []).length,
        '|': (sample.match(/\|/g) || []).length,
      };
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '\t';
    };

    const delimiter = detectDelimiter(lines[0]);
    const headers = this.splitCsvLikeLine(lines[0], delimiter).map((cell) => cell.trim());
    const indexByHeader = new Map<string, number>();
    headers.forEach((header, index) => {
      indexByHeader.set(this.normalizeHeaderKey(header), index);
    });

    const orderIdColumn = this.findHeaderIndex(indexByHeader, ['order-id', 'orderid', 'customer-id', 'cpono']);
    const itemTaxColumn = this.findHeaderIndex(indexByHeader, ['item-tax', 'item-tax-amount', 'tax', 'taxamt1', 'tax-amount']);
    if (orderIdColumn === undefined || itemTaxColumn === undefined) {
      throw new BadRequestException('文件必须包含 order-id / customer-id / cpono 和 item-tax / tax 列');
    }

    const byOrderId = new Map<string, ParsedSalesOrderTaxRow>();
    for (let index = 1; index < lines.length; index += 1) {
      const rowNumber = index + 1;
      const cells = this.splitCsvLikeLine(lines[index], delimiter);
      const orderValue = cells[orderIdColumn] ?? '';
      const taxValue = cells[itemTaxColumn] ?? '';

      if (!orderValue.trim() && !taxValue.trim()) continue;
      const orderId = orderValue.trim();
      if (!orderId) {
        throw new BadRequestException(`第 ${rowNumber} 行缺少订单号（order-id / customer-id / cpono）`);
      }
      if (!String(taxValue ?? '').trim()) {
        continue;
      }
      const taxCents = this.toMoneyCents(taxValue, rowNumber);
      const current = byOrderId.get(orderId);
      if (current) {
        current.source_rows += 1;
        current.tax_cents += taxCents;
      } else {
        byOrderId.set(orderId, { order_id: orderId, source_rows: 1, tax_cents: taxCents });
      }
    }

    if (byOrderId.size === 0) {
      throw new BadRequestException('文本文件中没有可处理的订单行');
    }
    return [...byOrderId.values()];
  }

  private async parseSalesOrderTaxFile(buffer: Buffer): Promise<ParsedSalesOrderTaxRow[]> {
    if (!buffer?.length) throw new BadRequestException('请上传 Excel/CSV/TXT 文件');

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet || worksheet.rowCount < 2) {
        throw new BadRequestException('工作表为空或没有数据行');
      }

      const headers = new Map<string, number>();
      worksheet.getRow(1).eachCell((cell, column) => {
        headers.set(this.normalizeHeaderKey(cell.text), column);
      });
      const orderIdColumn = this.findHeaderIndex(headers, ['order-id', 'orderid', 'customer-id', 'cpono']);
      const itemTaxColumn = this.findHeaderIndex(headers, ['item-tax', 'item-tax-amount', 'tax', 'taxamt1', 'tax-amount']);
      if (orderIdColumn === undefined || itemTaxColumn === undefined) {
        throw new BadRequestException('Excel 必须包含 order-id / customer-id / cpono 和 item-tax / tax 列');
      }

      const byOrderId = new Map<string, ParsedSalesOrderTaxRow>();
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const orderValue = row.getCell(orderIdColumn).value;
        const taxValue = row.getCell(itemTaxColumn).value;
        if (
          (orderValue === null ||
            orderValue === undefined ||
            orderValue === '') &&
          (taxValue === null || taxValue === undefined || taxValue === '')
        ) {
          continue;
        }

        const orderId = this.cellText(orderValue).trim();
        if (!orderId) {
          throw new BadRequestException(`第 ${rowNumber} 行缺少订单号（order-id / customer-id / cpono）`);
        }
        const normalizedTax = String(taxValue ?? '').trim();
        if (!normalizedTax) {
          continue;
        }
        const taxCents = this.toMoneyCents(taxValue, rowNumber);
        const current = byOrderId.get(orderId);
        if (current) {
          current.source_rows += 1;
          current.tax_cents += taxCents;
        } else {
          byOrderId.set(orderId, { order_id: orderId, source_rows: 1, tax_cents: taxCents });
        }
      }

      if (byOrderId.size === 0) throw new BadRequestException('Excel 中没有可处理的订单行');
      return [...byOrderId.values()];
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      return this.parseDelimitedTextFile(buffer);
    }
  }

  private findBinQtyPairs(headers: string[]): { skuIndex?: number; pairs: Array<{ binIndex: number; qtyIndex: number }> } {
    const skuCandidates = ['sku', 'skus', 'itemno', 'item', 'itemid', 'item-id', 'product-sku'];
    const skuIndex = headers.findIndex((header) =>
      skuCandidates.includes(this.normalizeHeaderKey(header)),
    );

    const binMatchBySuffix = new Map<string, number>();
    const qtyMatchBySuffix = new Map<string, number>();
    headers.forEach((header, index) => {
      const normalized = this.normalizeHeaderKey(header);
      const binMatch = normalized.match(/^(?:bin|location|slot|warehouse|whse)(?:-?(\d+))?$/);
      if (binMatch) {
        binMatchBySuffix.set(binMatch[1] ?? '0', index);
      }
      const qtyMatch = normalized.match(/^(?:qty|quantity|onhand|stock)(?:-?(\d+))?$/);
      if (qtyMatch) {
        qtyMatchBySuffix.set(qtyMatch[1] ?? '0', index);
      }
    });

    const pairs: Array<{ binIndex: number; qtyIndex: number }> = [];
    const keys = new Set([...binMatchBySuffix.keys(), ...qtyMatchBySuffix.keys()]);
    for (const key of keys) {
      const binIndex = binMatchBySuffix.get(key);
      const qtyIndex = qtyMatchBySuffix.get(key);
      if (binIndex !== undefined && qtyIndex !== undefined) {
        pairs.push({ binIndex, qtyIndex });
      }
    }

    return { skuIndex: skuIndex >= 0 ? skuIndex : undefined, pairs };
  }

  private parseBinQtyRowsFromWorksheet(worksheet: ExcelJS.Worksheet): { rows: ParsedBinQtyRow[]; itemnos: string[] } {
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell) => {
      headers.push(this.cellText(cell.value));
    });
    const { skuIndex, pairs } = this.findBinQtyPairs(headers);
    if (skuIndex === undefined || pairs.length === 0) {
      throw new BadRequestException('Excel 必须包含 SKU 列和至少一组 Bin / Qty 列');
    }

    const byItemBin = new Map<string, ParsedBinQtyRow>();
    const itemnos: string[] = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const itemno = this.cellText(row.getCell(skuIndex + 1).value).trim();
      if (!itemno) continue;
      itemnos.push(itemno);

      for (const pair of pairs) {
        const binValue = this.cellText(row.getCell(pair.binIndex + 1).value).trim();
        const qtyText = this.cellText(row.getCell(pair.qtyIndex + 1).value).trim();
        if (!binValue || !qtyText) continue;

        const qty = Number(qtyText);
        if (!Number.isFinite(qty) || qty < 0) {
          throw new BadRequestException(`第 ${rowNumber} 行 Bin ${binValue} 的 Qty 必须为非负有限数字`);
        }

        const key = JSON.stringify([itemno, binValue]);
        const current = byItemBin.get(key);
        if (current) {
          current.qty += qty;
          if (!Number.isFinite(current.qty)) throw new BadRequestException('同一 SKU / Bin 的合计 Qty 超出有效范围');
          current.source_rows += 1;
        } else {
          byItemBin.set(key, { itemno, bin: binValue, qty, source_rows: 1 });
        }
      }
    }

    if (byItemBin.size === 0) {
      throw new BadRequestException('Excel 中没有可处理的 SKU / Bin / Qty 记录');
    }

    return { rows: [...byItemBin.values()], itemnos };
  }

  private parseBinQtyRowsFromDelimitedText(buffer: Buffer): { rows: ParsedBinQtyRow[]; itemnos: string[] } {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text
      .split(/\r\n|\n|\r/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 2) {
      throw new BadRequestException('文本文件为空或没有数据行');
    }

    const detectDelimiter = (sample: string): string => {
      const counts = {
        '\t': (sample.match(/\t/g) || []).length,
        ',': (sample.match(/,/g) || []).length,
        ';': (sample.match(/;/g) || []).length,
        '|': (sample.match(/\|/g) || []).length,
      };
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '\t';
    };

    const delimiter = detectDelimiter(lines[0]);
    const headers = this.splitCsvLikeLine(lines[0], delimiter).map((cell) => cell.trim());
    const { skuIndex, pairs } = this.findBinQtyPairs(headers);
    if (skuIndex === undefined || pairs.length === 0) {
      throw new BadRequestException('文本文件必须包含 SKU 列和至少一组 Bin / Qty 列');
    }

    const byItemBin = new Map<string, ParsedBinQtyRow>();
    const itemnos: string[] = [];
    for (let index = 1; index < lines.length; index += 1) {
      const rowNumber = index + 1;
      const cells = this.splitCsvLikeLine(lines[index], delimiter);
      const itemno = (cells[skuIndex] ?? '').trim();
      if (!itemno) continue;
      itemnos.push(itemno);
      for (const pair of pairs) {
        const binValue = (cells[pair.binIndex] ?? '').trim();
        const qtyValue = (cells[pair.qtyIndex] ?? '').trim();
        if (!binValue || !qtyValue) continue;
        const qty = Number(qtyValue);
        if (!Number.isFinite(qty) || qty < 0) {
          throw new BadRequestException(`第 ${rowNumber} 行 Bin ${binValue} 的 Qty 必须为非负有限数字`);
        }
        const key = JSON.stringify([itemno, binValue]);
        const current = byItemBin.get(key);
        if (current) {
          current.qty += qty;
          if (!Number.isFinite(current.qty)) throw new BadRequestException('同一 SKU / Bin 的合计 Qty 超出有效范围');
          current.source_rows += 1;
        } else {
          byItemBin.set(key, { itemno, bin: binValue, qty, source_rows: 1 });
        }
      }
    }

    if (byItemBin.size === 0) {
      throw new BadRequestException('文本文件中没有可处理的 SKU / Bin / Qty 记录');
    }
    return { rows: [...byItemBin.values()], itemnos };
  }

  private async parseBinQtyFile(buffer: Buffer): Promise<{ rows: ParsedBinQtyRow[]; itemnos: string[] }> {
    if (!buffer?.length) {
      throw new BadRequestException('请上传 Excel/CSV/TXT 文件');
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet || worksheet.rowCount < 2) {
        throw new BadRequestException('工作表为空或没有数据行');
      }
      return this.parseBinQtyRowsFromWorksheet(worksheet);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      return this.parseBinQtyRowsFromDelimitedText(buffer);
    }
  }

  private normalizeCompany(company: string): SalesOrderTaxCompany {
    const normalized = String(company || '').trim().toUpperCase();
    if (normalized !== 'IKON' && normalized !== 'MD') {
      throw new BadRequestException('company 必须是 IKON 或 MD');
    }
    return normalized;
  }

  private async lookupSalesOrders(
    schema: DbKey,
    orderIds: string[],
    transaction?: MysqlTransaction,
  ): Promise<SalesOrderDbRow[]> {
    const result: SalesOrderDbRow[] = [];
    for (const chunk of this.chunk(orderIds, 500)) {
      const placeholders = chunk.map(() => '?').join(',');
      const sql = `
        SELECT Trno, Cpono, Taxamt1, Totamt
        FROM saord
        WHERE Cpono IN (${placeholders})
        ${transaction ? 'FOR UPDATE' : ''}
      `;
      const rows = transaction
        ? await transaction.query<SalesOrderDbRow>(sql, chunk)
        : await this.db.query<SalesOrderDbRow>(schema, sql, chunk);
      result.push(...rows);
    }
    return result;
  }

  private isSalesOrderTaxPreviewRow(value: unknown): value is SalesOrderTaxPreviewRow {
    if (!value || typeof value !== 'object') return false;
    const row = value as Partial<SalesOrderTaxPreviewRow>;
    return (
      typeof row.order_id === 'string' &&
      Number.isFinite(row.trno) &&
      Number.isFinite(row.source_rows) &&
      Number.isFinite(row.tax_amount) &&
      Number.isFinite(row.old_tax) &&
      Number.isFinite(row.new_tax) &&
      Number.isFinite(row.old_total) &&
      Number.isFinite(row.new_total)
    );
  }

  private buildSalesOrderTaxResult(
    parsedRows: ParsedSalesOrderTaxRow[],
    orderRows: SalesOrderDbRow[],
    updated: boolean,
  ) {
    const ordersByCpono = new Map<string, SalesOrderDbRow[]>();
    for (const order of orderRows) {
      const key = String(order.Cpono ?? '').trim();
      const rows = ordersByCpono.get(key) ?? [];
      rows.push(order);
      ordersByCpono.set(key, rows);
    }

    const matched: SalesOrderTaxPreviewRow[] = [];
    const unmatched: UnmatchedSalesOrderTaxRow[] = [];
    for (const input of parsedRows) {
      const orders = ordersByCpono.get(input.order_id) ?? [];
      const taxAmount = input.tax_cents / 100;
      if (orders.length === 0) {
        unmatched.push({
          order_id: input.order_id,
          source_rows: input.source_rows,
          tax_amount: taxAmount,
          reason: 'AIS 中未找到对应 Cpono',
        });
        continue;
      }
      if (orders.length > 1) {
        unmatched.push({
          order_id: input.order_id,
          source_rows: input.source_rows,
          tax_amount: taxAmount,
          reason: `Cpono 匹配到 ${orders.length} 张订单`,
        });
        continue;
      }

      const order = orders[0];
      const oldTax = this.round2(this.toNumber(order.Taxamt1));
      const oldTotal = this.round2(this.toNumber(order.Totamt));

      if (Math.abs(oldTax) > 0.000001) {
        unmatched.push({
          order_id: input.order_id,
          source_rows: input.source_rows,
          tax_amount: taxAmount,
          reason: '数据库中已存在 Taxamt1，跳过修改',
        });
        continue;
      }

      matched.push({
        order_id: input.order_id,
        source_rows: input.source_rows,
        tax_amount: taxAmount,
        trno: Number(order.Trno),
        old_tax: oldTax,
        new_tax: taxAmount,
        old_total: oldTotal,
        new_total: this.round2(oldTotal - oldTax + taxAmount),
      });
    }
    return {
      success: true as const,
      updated,
      affected_orders: matched.length,
      updated_orders: updated ? matched.length : 0,
      matched,
      unmatched,
    };
  }

  async previewSalesOrderTax(buffer: Buffer, company: string) {
    const parsedRows = await this.parseSalesOrderTaxFile(buffer);
    const normalizedCompany = this.normalizeCompany(company);
    const schema: DbKey = normalizedCompany === 'MD' ? 'aisdata3' : 'aisdata1';
    const orders = await this.lookupSalesOrders(
      schema,
      parsedRows.map((row) => row.order_id),
    );
    return { ...this.buildSalesOrderTaxResult(parsedRows, orders, false), company: normalizedCompany, schema };
  }

  async executeSalesOrderTax(
    buffer: Buffer,
    company: string,
    expectedRows: unknown,
  ) {
    const parsedRows = await this.parseSalesOrderTaxFile(buffer);
    const normalizedCompany = this.normalizeCompany(company);
    if (!Array.isArray(expectedRows) || !expectedRows.every((row) => this.isSalesOrderTaxPreviewRow(row))) {
      throw new BadRequestException('缺少预览结果，请先预览后再执行');
    }
    const schema: DbKey = normalizedCompany === 'MD' ? 'aisdata3' : 'aisdata1';

    return this.db.withTransaction(schema, async (transaction) => {
      const orders = await this.lookupSalesOrders(
        schema,
        parsedRows.map((row) => row.order_id),
        transaction,
      );
      const result = this.buildSalesOrderTaxResult(parsedRows, orders, true);
      const expected = new Map(expectedRows.map((row) => [row.order_id, row]));
      if (expected.size !== expectedRows.length || expected.size !== result.matched.length) {
        throw new ConflictException('订单匹配结果已变化，请重新预览后再执行');
      }
      for (const row of result.matched) {
        const preview = expected.get(row.order_id);
        if (
          !preview ||
          Number(preview.trno) !== row.trno ||
          this.round2(Number(preview.old_tax)) !== row.old_tax ||
          this.round2(Number(preview.old_total)) !== row.old_total ||
          this.round2(Number(preview.new_tax)) !== row.new_tax ||
          this.round2(Number(preview.new_total)) !== row.new_total
        ) {
          throw new ConflictException(`订单 ${row.order_id} 自预览后发生变化，请重新预览`);
        }
      }

      for (const row of result.matched) {
        await transaction.execute(
          `UPDATE saord SET Taxamt1 = ?, Totamt = ? WHERE Trno = ? AND Cpono = ?`,
          [row.new_tax, row.new_total, row.trno, row.order_id],
        );
      }
      return { ...result, company: normalizedCompany, schema };
    });
  }

  async previewBinQty(buffer: Buffer, company: string, filename: string) {
    const { rows: parsedRows, itemnos } = await this.parseBinQtyFile(buffer);
    const normalizedCompany = this.normalizeCompany(company);
    const schema: DbKey = normalizedCompany === 'MD' ? 'aisdata3' : 'aisdata0';
    const identity = this.binQtyIdentity(itemnos, filename);
    await this.checkBinQtyFileReuse(schema, identity);
    const matched: BinQtyPreviewRow[] = [];
    const unmatched: BinQtyUnmatchedRow[] = [];

    for (const row of parsedRows) {
      const exists = await this.db.query<{ Itemno: string }>(
        schema,
        'SELECT Itemno FROM item WHERE Itemno = ? LIMIT 1',
        [row.itemno],
      );
      if (!Array.isArray(exists) || exists.length === 0) {
        unmatched.push({
          itemno: row.itemno,
          bin: row.bin,
          source_rows: row.source_rows,
          qty: row.qty,
          reason: 'Itemno 不存在于 AIS item 表',
        });
        continue;
      }

      const stockRows = await this.db.query<{ Whse: string; Bin: string; Onhand: number }>(
        schema,
        'SELECT Whse, Bin, Onhand FROM itemwhse WHERE Itemno = ? AND Bin = ? ORDER BY Whse',
        [row.itemno, row.bin],
      );
      if (!Array.isArray(stockRows) || stockRows.length === 0) {
        unmatched.push({
          itemno: row.itemno,
          bin: row.bin,
          source_rows: row.source_rows,
          qty: row.qty,
          reason: 'Itemno 与 Bin 没有匹配到 itemwhse 记录',
        });
        continue;
      }

      if (stockRows.length !== 1) {
        const reason = `Bin ${row.itemno}/${row.bin} 匹配多个仓库，无法确定扣除目标`;
        unmatched.push({ ...row, reason });
        continue;
      }
      const oldQty = this.toNumber(stockRows[0].Onhand);
      if (oldQty < row.qty) {
        const reason = `Bin ${row.itemno}/${row.bin} 库存不足：现有 ${oldQty}，需扣除 ${row.qty}`;
        unmatched.push({ ...row, reason });
        continue;
      }
      const whseList = stockRows.map((item) => String(item.Whse ?? ''));
      matched.push({
        itemno: row.itemno,
        bin: row.bin,
        source_rows: row.source_rows,
        qty: row.qty,
        old_qty: oldQty,
        new_qty: oldQty - row.qty,
        whse: whseList,
      });
    }

    return {
      success: true as const,
      updated: false,
      affected_rows: matched.length,
      matched,
      unmatched,
      company: normalizedCompany,
      schema,
    };
  }

  async executeBinQty(buffer: Buffer, company: string, expectedRows: unknown, filename: string) {
    const { rows: parsedRows, itemnos } = await this.parseBinQtyFile(buffer);
    const normalizedCompany = this.normalizeCompany(company);
    const schema: DbKey = normalizedCompany === 'MD' ? 'aisdata3' : 'aisdata0';
    const identity = this.binQtyIdentity(itemnos, filename);

    if (!Array.isArray(expectedRows) || !expectedRows.every((row) => row && typeof row === 'object' && 'itemno' in row && 'bin' in row)) {
      throw new BadRequestException('缺少预览结果，请先预览后再执行');
    }

    const preview = await this.previewBinQty(buffer, company, filename);
    if (!preview.matched.length) throw new BadRequestException('没有可扣除库存的匹配记录');
    const expected = new Map<string, BinQtyPreviewRow>();
    for (const row of expectedRows as BinQtyPreviewRow[]) {
      expected.set(JSON.stringify([row.itemno, row.bin]), row);
    }
    if (expected.size !== expectedRows.length || expected.size !== preview.matched.length) {
      throw new ConflictException('Bin 匹配结果已变化，请重新预览后再执行');
    }
    return this.db.withBinInventoryLock(schema, async (connection) => {
      const duplicate = await connection.query(
        'SELECT identity_hash FROM modify_bin_qty_daily_audit WHERE business_date = ? AND identity_hash = ?',
        [identity.day, identity.key]);
      if (duplicate.length) {
        throw new ConflictException('该文件名和完整 Itemno 集合今天已经扣过库存或正在处理中，不能重复扣除');
      }
      const targets: Array<{ itemno: string; bin: string; whse: string; old_qty: number; qty: number }> = [];
      for (const row of preview.matched) {
        const expectedRow = expected.get(JSON.stringify([row.itemno, row.bin]));
        const stockRows = await connection.query<{ Whse: string; Bin: string; Onhand: number }>(
          'SELECT Whse, Bin, Onhand FROM itemwhse WHERE Itemno = ? AND Bin = ? ORDER BY Whse',
          [row.itemno, row.bin]);
        if (!expectedRow || stockRows.length !== 1 ||
            String(stockRows[0].Whse ?? '') !== expectedRow.whse?.[0] ||
            this.toNumber(stockRows[0].Onhand) !== Number(expectedRow.old_qty) ||
            row.old_qty !== Number(expectedRow.old_qty) || row.new_qty !== Number(expectedRow.new_qty)) {
          throw new ConflictException(`Bin ${row.itemno}/${row.bin} 自预览后发生变化，请重新预览`);
        }
        const oldQty = this.toNumber(stockRows[0].Onhand);
        if (oldQty < row.qty) throw new ConflictException(`Bin ${row.itemno}/${row.bin} 库存不足`);
        targets.push({ itemno: row.itemno, bin: row.bin, whse: String(stockRows[0].Whse ?? ''), old_qty: oldQty, qty: row.qty });
      }
      try {
        await connection.execute(
          'INSERT INTO modify_bin_qty_daily_audit (business_date, identity_hash, filename, itemnos, row_count, before_stock) VALUES (?, ?, ?, ?, ?, ?)',
          [identity.day, identity.key, identity.name, JSON.stringify(identity.items), parsedRows.length, JSON.stringify(targets)]);
      } catch (error) {
        if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
          throw new ConflictException('该文件名和完整 Itemno 集合今天已经扣过库存，不能重复扣除');
        }
        throw error;
      }
      const attempted: typeof targets = [];
      try {
        for (const target of targets) {
          attempted.push(target);
          const update = await connection.execute(
            'UPDATE itemwhse SET Onhand = Onhand - ? WHERE Itemno = ? AND Whse = ? AND Bin = ? AND Onhand >= ?',
            [target.qty, target.itemno, target.whse, target.bin, target.qty]);
          if (target.qty > 0 && update.affectedRows !== 1) throw new ConflictException(`Bin ${target.itemno}/${target.bin} 扣除失败`);
        }
        await connection.execute(
          "UPDATE modify_bin_qty_daily_audit SET status = 'completed' WHERE business_date = ? AND identity_hash = ?",
          [identity.day, identity.key]);
      } catch (error) {
        // MyISAM has no rollback. Restore while holding the WRITE lock. If the
        // connection/process dies, leave the durable reservation for manual review.
        try {
          for (const target of attempted) {
            await connection.execute('UPDATE itemwhse SET Onhand = ? WHERE Itemno = ? AND Whse = ? AND Bin = ?',
              [target.old_qty, target.itemno, target.whse, target.bin]);
          }
          await connection.execute('DELETE FROM modify_bin_qty_daily_audit WHERE business_date = ? AND identity_hash = ?',
            [identity.day, identity.key]);
        } catch {
          throw new ConflictException('库存扣除异常，防重记录已保留。请人工核对后处理，不能重复提交');
        }
        throw error;
      }
      return {
        success: true as const,
        updated: true,
        affected_rows: preview.matched.length,
        matched: preview.matched,
        unmatched: preview.unmatched,
        company: normalizedCompany,
        schema,
      };
    });
  }

  async runOtherCharge(params: {
    action: string;
    start_date: string;
    end_date: string;
    dry_run: boolean;
  }) {
    const action = (params.action || '').trim();
    if (!action.startsWith('Other Charge Remove')) {
      return { success: false, error: `不支持的操作：${action}` };
    }

    const start = this.toIsoDate(params.start_date);
    const end = this.toIsoDate(params.end_date);
    if (!start || !end) {
      return { success: false, error: '起止日期格式不正确（需要 YYYY-MM-DD）' };
    }

    const db: DbKey = action.includes('(MD)') ? 'aisdata3' : 'aisdata1';

    const sqlInv = `
      SELECT Trno, Cpono, Trdate, Othamt1, Taxamt1, Jouno
      FROM sainv
      WHERE Trdate BETWEEN ? AND ?
        AND ABS(Othamt1) >= ?
      ORDER BY Trdate DESC, Trno DESC
    `;

    const invRows = await this.db.query<any>(db, sqlInv, [start, end, THRESHOLD]);
    if (!Array.isArray(invRows) || invRows.length === 0) {
      return {
        success: true,
        dry_run: params.dry_run,
        db,
        affected_trno_count: 0,
        updated_rows: 0,
        changes: [],
        preview_file: null,
        notes: [`No invoices matched in [${start} ~ ${end}] with |Othamt1|>=${THRESHOLD}.`],
      };
    }

    const trnos = Array.from(new Set(invRows.map((r) => Number(r.Trno)).filter((n) => Number.isFinite(n))));
    const notes = [`Hit invoices: ${trnos.length}`];

    const detailRows: DetailRow[] = [];
    const chunks = this.chunk(trnos, 500);
    for (const chunk of chunks) {
      const placeholders = chunk.map(() => '?').join(',');
      const sqlDetail = `
        SELECT
          v.Trno, v.Cpono, v.Trdate,
          l.Itemno, l.Shiqty,
          l.Price  AS UnitPrice,
          l.Lnamt  AS UnitAmount,
          v.Othamt1, v.Taxamt1, v.Jouno
        FROM sainvl AS l
        JOIN sainv  AS v ON v.Trno = l.Trno
        WHERE v.Trno IN (${placeholders})
        ORDER BY v.Trdate DESC, v.Trno DESC
      `;
      const rows = await this.db.query<any>(db, sqlDetail, chunk);
      if (Array.isArray(rows) && rows.length) {
        rows.forEach((r: any) => {
          detailRows.push({
            Trno: Number(r.Trno),
            Cpono: r.Cpono ?? '',
            Trdate: r.Trdate ?? '',
            Itemno: String(r.Itemno ?? ''),
            Shiqty: this.toNumber(r.Shiqty),
            UnitPrice: this.toNumber(r.UnitPrice),
            UnitAmount: this.toNumber(r.UnitAmount),
            Othamt1: this.toNumber(r.Othamt1),
            Taxamt1: this.toNumber(r.Taxamt1),
            Jouno: r.Jouno ?? '',
          });
        });
      }
    }

    if (detailRows.length === 0) {
      return {
        success: true,
        dry_run: params.dry_run,
        db,
        affected_trno_count: 0,
        updated_rows: 0,
        changes: [],
        preview_file: null,
        notes: ['Detail join returned 0 rows.'],
      };
    }

    // 计算每张发票的 Total
    const totalByTrno = new Map<number, number>();
    detailRows.forEach((r) => {
      const cur = totalByTrno.get(r.Trno) || 0;
      totalByTrno.set(r.Trno, this.round2(cur + r.UnitAmount));
    });

    // 计算变更
    type CalcRow = DetailRow & {
      Total: number;
      Add: number;
      new_price: number;
      total_price: number;
      sub_total: number;
    };
    const calcRows: CalcRow[] = detailRows.map((r) => {
      const total = totalByTrno.get(r.Trno) || 0;
      const add =
        total === 0 || r.Shiqty === 0
          ? 0
          : this.round2((r.UnitAmount / total) * (r.Othamt1 / r.Shiqty));
      const new_price = this.round2(r.UnitPrice + add);
      const total_price = this.round2(new_price * r.Shiqty);
      const sub_total = this.round2(total + r.Othamt1);
      return { ...r, Total: total, Add: add, new_price, total_price, sub_total };
    });

    // 汇总 changes
    const changes: ChangeRow[] = [];
    const byTrno = new Map<number, CalcRow[]>();
    calcRows.forEach((r) => {
      const list = byTrno.get(r.Trno) || [];
      list.push(r);
      byTrno.set(r.Trno, list);
    });

    for (const [trno, rows] of byTrno.entries()) {
      const anyRow = rows[0];
      const oldOth = this.round2(anyRow.Othamt1);
      const total = this.round2(anyRow.Total);
      const trdate = rows
        .map((r) => r.Trdate)
        .filter(Boolean)
        .map((s) => {
          const d = new Date(String(s));
          return Number.isNaN(d.getTime()) ? 0 : d.getTime();
        })
        .reduce((a, b) => Math.max(a, b), 0);
      const trdateStr = trdate ? new Date(trdate).toISOString().slice(0, 10) : '';

      changes.push({
        trno,
        trdate: trdateStr,
        old_othamt1: oldOth,
        new_othamt1: 0.0,
        subtotal_before: this.round2(total + oldOth),
        subtotal_after: total,
      });
    }

    changes.sort((a, b) => {
      if (a.trdate !== b.trdate) return a.trdate < b.trdate ? 1 : -1;
      return b.trno - a.trno;
    });

    let updatedRows = 0;
    if (!params.dry_run) {
      const SQL_UPD_SAINVL = `
        UPDATE sainvl SET Price=?, Lnamt=?
        WHERE Trno=? AND Itemno=?
      `;
      const SQL_UPD_SAINV = `
        UPDATE sainv SET Othamt1=0, Subamt=?
        WHERE Trno=?
      `;
      const SQL_UPD_GL_3050 = `
        UPDATE gljoul SET Creamt=?
        WHERE Trno=? AND Accno='3050'
      `;
      const SQL_DEL_GL_3320 = `
        DELETE FROM gljoul
        WHERE Trno=? AND Accno='3320'
      `;

      for (const [trno, rows] of byTrno.entries()) {
        const subTotal = rows[0]?.sub_total ?? 0;
        for (const row of rows) {
          const res = await this.db.execute(db, SQL_UPD_SAINVL, [
            row.new_price,
            row.total_price,
            trno,
            row.Itemno,
          ]);
          updatedRows += Number(res?.affectedRows || 0);
        }
        await this.db.execute(db, SQL_UPD_SAINV, [subTotal, trno]);
        await this.db.execute(db, SQL_UPD_GL_3050, [subTotal, trno]);
        await this.db.execute(db, SQL_DEL_GL_3320, [trno]);
      }
    }

    return {
      success: true,
      dry_run: params.dry_run,
      db,
      affected_trno_count: changes.length,
      updated_rows: updatedRows,
      changes: changes.slice(0, 200),
      preview_file: null,
      notes,
    };
  }
}
