import { Body, Controller, Get, Post } from '@nestjs/common';
import { ModifyService } from './modify.service';

@Controller('api/modify')
export class ModifyController {
  constructor(private readonly modify: ModifyService) {}

  // POST /api/modify/other-charge
  @Post('other-charge')
  async otherCharge(
    @Body()
    body: {
      action?: string;
      start_date?: string;
      end_date?: string;
      dry_run?: boolean;
    },
  ) {
    return await this.modify.runOtherCharge({
      action: body?.action || '',
      start_date: body?.start_date || '',
      end_date: body?.end_date || '',
      dry_run: !!body?.dry_run,
    });
  }

  // GET /api/modify/ping
  @Get('ping')
  ping() {
    return { ok: true };
  }

  // GET /api/modify/other-charge
  @Get('other-charge')
  otherChargeGet() {
    return { ok: false, message: 'Use POST /api/modify/other-charge' };
  }
}
