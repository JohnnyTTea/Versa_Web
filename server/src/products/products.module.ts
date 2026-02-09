import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [DbModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
