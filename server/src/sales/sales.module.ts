import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [DbModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
