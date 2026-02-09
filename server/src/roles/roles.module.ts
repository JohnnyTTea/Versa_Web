import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { MysqlService } from '../db/mysql.service';

@Module({
  controllers: [RolesController],
  providers: [RolesService, MysqlService],
})
export class RolesModule {}
