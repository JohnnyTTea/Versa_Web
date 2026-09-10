import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';

@Module({
  imports: [DbModule],
  controllers: [MonitorController],
  providers: [MonitorService],
})
export class MonitorModule {}
