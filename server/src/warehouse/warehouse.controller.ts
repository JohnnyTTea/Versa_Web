import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { WarehouseService } from './warehouse.service';

type SessionRequest = Request & {
  session?: {
    user_id?: number;
    username?: string;
    role_name?: string;
  };
};

@Controller('api/warehouse')
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  private requireWarehouseUser(req: SessionRequest) {
    const userId = Number(req.session?.user_id || 0);
    const username = (req.session?.username || '').trim();
    if (!userId || !username) {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  @Public()
  @Get('health')
  health() {
    return { ok: true, mode: 'warehouse' };
  }

  @Post('scan')
  async scan(@Req() req: SessionRequest, @Body() body: { tracking_number?: string }) {
    this.requireWarehouseUser(req);
    const userId = Number(req.session?.user_id || 0);
    const username = (req.session?.username || '').trim();
    return this.warehouse.recordScan({
      user_id: userId,
      username,
      tracking_number: body?.tracking_number,
    });
  }

  @Get('today')
  async today(@Req() req: SessionRequest) {
    this.requireWarehouseUser(req);
    return this.warehouse.getTodaySummaryForUser(Number(req.session?.user_id || 0));
  }
}
