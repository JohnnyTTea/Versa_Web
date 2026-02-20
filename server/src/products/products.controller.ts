import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ProductsService } from './products.service';

@Controller('api/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // /api/products/summary?id=SKU
  @Get('summary')
  async summary(@Query('id') id?: string) {
    const itemId = (id || '').trim();
    if (!itemId) return { ok: false, message: 'Missing id' };
    return await this.products.getSummary(itemId);
  }

  // /api/products/summary-basic?id=SKU
  @Get('summary-basic')
  async summaryBasic(@Query('id') id?: string) {
    const itemId = (id || '').trim();
    if (!itemId) return { ok: false, message: 'Missing id' };
    return await this.products.getSummaryBasic(itemId);
  }

  // /api/products/summary-metrics?id=SKU
  @Get('summary-metrics')
  async summaryMetrics(@Query('id') id?: string) {
    const itemId = (id || '').trim();
    if (!itemId) {
      return {
        ok: false,
        message: 'Missing id',
        rma: { totalSale: 0, totalReturn: 0, returnPct: 0, caPct: 0, gaPct: 0 },
      };
    }
    return await this.products.getSummaryMetrics(itemId);
  }

  // /api/products/summary-prices?id=SKU
  @Get('summary-prices')
  async summaryPrices(@Query('id') id?: string) {
    const itemId = (id || '').trim();
    if (!itemId) {
      return {
        ok: false,
        message: 'Missing id',
        prices: { ebay: null, amzn: null, shipping52: null },
      };
    }
    return await this.products.getSummaryPrices(itemId);
  }

  // /api/products/on-order?id=SKU
  @Get('on-order')
  async onOrder(@Query('id') id?: string) {
    const itemId = (id || '').trim();
    if (!itemId) return { ok: false, message: 'Missing id', orders: [], transit: [] };
    return await this.products.getOnOrder(itemId);
  }

  // /api/products/purchase-history?id=SKU
  @Get('purchase-history')
  async purchaseHistory(@Query('id') id?: string) {
    const itemId = (id || '').trim();
    if (!itemId) return { ok: false, message: 'Missing id', rows: [] };
    return await this.products.getPurchaseHistory(itemId);
  }

  // /api/products/pictures?id=SKU
  @Get('pictures')
  async pictures(@Query('id') id?: string) {
    const itemId = (id || '').trim();
    if (!itemId) return { ok: false, message: 'Missing id', picfile1: '', picfile2: '' };
    return await this.products.getPictures(itemId);
  }

  // /api/products/sales-history?id=SKU&page=1&limit=50&sort=Trdate&order=desc
  @Get('sales-history')
  async salesHistory(
    @Query('id') id?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    const itemId = (id || '').trim();
    if (!itemId) {
      return { ok: false, message: 'Missing id', rows: [], page: 1, pages: 1, total: 0, limit: 50 };
    }

    return await this.products.getSalesHistory({
      itemId,
      page: Math.max(1, parseInt(page || '1', 10) || 1),
      limit: Math.max(1, parseInt(limit || '50', 10) || 50),
      sort,
      order,
    });
  }

  // A 方案：/api/products/sales-history/export?id=SKU&sort=Trdate&order=desc
  @Get('sales-history/export')
  async exportSalesHistory(
    @Query('id') id: string,
    @Query('sort') sort: string | undefined,
    @Query('order') order: string | undefined,
    @Res() res: Response,
  ) {
    const itemId = (id || '').trim();
    if (!itemId) {
      return res.status(400).send('Missing id');
    }

    const csv = await this.products.exportSalesCsv(itemId, sort, order);

    res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
    res.setHeader('Content-Disposition', `attachment; filename="sales_${itemId}.csv"`);
    return res.send(csv);
  }

  // /api/products/sales-12mo?id=SKU
  @Get('sales-12mo')
  async sales12(@Query('id') id?: string) {
    const itemId = (id || '').trim();
    if (!itemId) return { ok: false, message: 'Missing id', rows: [] };
    return await this.products.getSales12mo(itemId);
  }
}
