import { Controller, Get, Query } from '@nestjs/common';
import { SalesService } from './sales.service';

@Controller('api/sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  // /api/sales/order?id=123
  @Get('order')
  async order(@Query('id') id?: string) {
    const orderId = (id || '').trim();
    if (!orderId) {
      return { ok: false, message: 'Missing id', order: null, lines: [], balance: 0 };
    }
    if (!/^\d+$/.test(orderId)) {
      return { ok: false, message: ' Error: Please Enter the Numbers Only!', order: null, lines: [], balance: 0 };
    }

    return await this.sales.getOrder(orderId);
  }

  // /api/sales/invoice?type=invoice|order|cpo|shipping&id=xxx
  @Get('invoice')
  async invoice(@Query('type') type?: string, @Query('id') id?: string) {
    const keyword = (id || '').trim();
    let t = (type || 'invoice').trim().toLowerCase();
    if (t !== 'invoice' && t !== 'order' && t !== 'cpo' && t !== 'shipping') {
      t = 'invoice';
    }

    if (!keyword) {
      return { ok: false, message: 'Missing id', head: null, lines: [], balance: 0, matchedInvoices: [] };
    }

    if (t === 'invoice' && !/^\d+$/.test(keyword)) {
      return {
        ok: false,
        message: ' Error: Please Enter the Numbers Only!',
        head: null,
        lines: [],
        balance: 0,
        matchedInvoices: [],
      };
    }

    return await this.sales.getInvoiceSearch(t as any, keyword);
  }
}
