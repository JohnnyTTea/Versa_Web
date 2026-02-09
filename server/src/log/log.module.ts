import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { LogController } from './log.controller';
import { LogService } from './log.service';

@Module({
  imports: [DbModule],
  controllers: [LogController],
  providers: [LogService],
})
export class LogModule {}
