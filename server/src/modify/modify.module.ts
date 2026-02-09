import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { ModifyController } from './modify.controller';
import { ModifyService } from './modify.service';

@Module({
  imports: [DbModule],
  controllers: [ModifyController],
  providers: [ModifyService],
})
export class ModifyModule {}
