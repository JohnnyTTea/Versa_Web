import { Controller, Get } from '@nestjs/common';
import { MonitorService } from './monitor.service';

@Controller('api/monitor')
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  @Get('summary')
  async summary() {
    return await this.monitor.getSummary();
  }
}
