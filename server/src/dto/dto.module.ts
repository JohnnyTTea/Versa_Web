import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { DtoController } from './dto.controller';
import { DtoService } from './dto.service';

@Module({
  imports: [DbModule],
  controllers: [DtoController],
  providers: [DtoService],
})
export class DtoModule {}
