import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { MysqlService } from "../db/mysql.service";

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, MysqlService],
})
export class SettingsModule {}
