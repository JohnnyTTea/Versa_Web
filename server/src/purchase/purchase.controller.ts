import { Controller, Get, Query } from '@nestjs/common';
import { PurchaseService } from './purchase.service';

@Controller('api/purchase')
export class PurchaseController {
  constructor(private readonly purchase: PurchaseService) {}

  // /api/purchase/opo?q=keyword
  @Get('opo')
  async opoList(
    @Query('q') q?: string,
  ) {
    return await this.purchase.getOpoList({
      q: (q || '').trim(),
    });
  }

  // /api/purchase/rpo?q=keyword
  @Get('rpo')
  async rpoList(
    @Query('q') q?: string,
  ) {
    return await this.purchase.getRpoList({
      q: (q || '').trim(),
    });
  }

  // /api/purchase/vendor?q=keyword
  @Get('vendor')
  async vendorList(
    @Query('q') q?: string,
  ) {
    return await this.purchase.getVendorList({
      q: (q || '').trim(),
    });
  }

  // /api/purchase/opo/detail?opono=123
  @Get('opo/detail')
  async opoDetail(
    @Query('opono') opono?: string,
  ) {
    const o = (opono || '').trim();
    if (!o) {
      return { ok: false, message: 'Missing opono', head: null, containers: [], lines: [] };
    }
    return await this.purchase.getOpoDetail({ opono: o });
  }

  // /api/purchase/rpo/detail?trno=123
  @Get('rpo/detail')
  async rpoDetail(
    @Query('trno') trno?: string,
  ) {
    const t = (trno || '').trim();
    if (!t) {
      return { ok: false, message: 'Missing trno', head: null, containers: [], lines: [] };
    }
    return await this.purchase.getRpoDetail({ trno: t });
  }
}
