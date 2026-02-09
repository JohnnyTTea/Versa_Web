import { Controller, Get } from '@nestjs/common';
import { RolesService } from './roles.service';

@Controller('api/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async list() {
    return this.rolesService.list();
  }
}
