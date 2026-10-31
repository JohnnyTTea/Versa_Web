import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { ProductsModule } from './products/products.module';
import { LogModule } from './log/log.module';
import { SettingsModule } from './settings/settings.module';
import { SalesModule } from './sales/sales.module';
import { DtoModule } from './dto/dto.module';
import { ModifyModule } from './modify/modify.module';
import { ReportModule } from './report/report.module';
import { PurchaseModule } from './purchase/purchase.module';
import { MonitorModule } from './monitor/monitor.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { DefaultPackerUsersSeed } from './seed/default-packer-users.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ProductsModule,
    SalesModule,
    DtoModule,
    ModifyModule,
    ReportModule,
    PurchaseModule,
    MonitorModule,
    UsersModule,
    RolesModule,
    LogModule,
    SettingsModule,
    WarehouseModule,
  ],
  providers: [DefaultPackerUsersSeed],
})
export class AppModule {}
