import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [DbModule],
  controllers: [WarehouseController],
  providers: [WarehouseService],
})
export class WarehouseModule {}
