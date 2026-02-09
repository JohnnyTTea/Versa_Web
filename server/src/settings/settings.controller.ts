import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SettingsService } from './settings.service';

type SessionRequest = Request & {
  session?: {
    username?: string;
    role_name?: string;
  };
};

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  private requireLogin(req: SessionRequest) {
    const username = (req.session?.username || '').trim();
    if (!username) throw new UnauthorizedException('Unauthorized');
  }

  private isSuperAdmin(req: SessionRequest) {
    const username = (req.session?.username || '').trim();
    const role = (req.session?.role_name || '').trim();
    if (username === 'admin') return true;
    if (role && role.toLowerCase() === 'admin') return true;
    return false;
  }

  // ===== Users =====

  @Get('users')
  async getUsers(@Req() req: SessionRequest) {
    this.requireLogin(req);
    const superAdmin = this.isSuperAdmin(req);
    return this.svc.getUsersAndRoles({ superAdmin });
  }

  @Post('users/save')
  async saveUser(
    @Req() req: SessionRequest,
    @Body()
    body: {
      id?: number;
      username?: string;
      password?: string;
      first_name?: string;
      last_name?: string;
      role_id?: number;
    },
  ) {
    this.requireLogin(req);
    if (!this.isSuperAdmin(req)) return { ok: false, message: 'no_permission' };

    const sessionUser = req.session?.username || '';
    return this.svc.saveUser({
      sessionUser,
      id: Number(body.id || 0),
      username: (body.username || '').trim(),
      password: (body.password || '').trim(),
      first_name: (body.first_name || '').trim(),
      last_name: (body.last_name || '').trim(),
      role_id: Number(body.role_id || 0),
    });
  }

  @Post('users/status')
  async userStatus(
    @Req() req: SessionRequest,
    @Body() body: { id?: number; action?: 'enable' | 'disable' },
  ) {
    this.requireLogin(req);
    if (!this.isSuperAdmin(req)) return { ok: false, message: 'no_permission' };

    const sessionUser = req.session?.username || '';
    return this.svc.setUserStatus({
      sessionUser,
      id: Number(body.id || 0),
      action: body.action === 'disable' ? 'disable' : 'enable',
    });
  }

  @Post('users/delete')
  async deleteUser(@Req() req: SessionRequest, @Body() body: { id?: number }) {
    this.requireLogin(req);
    if (!this.isSuperAdmin(req)) return { ok: false, message: 'no_permission' };

    const sessionUser = req.session?.username || '';
    return this.svc.deleteUser({
      sessionUser,
      id: Number(body.id || 0),
    });
  }

  // ===== Roles =====

  @Get('roles')
  async getRoles(@Req() req: SessionRequest) {
    this.requireLogin(req);
    return this.svc.getRoles();
  }

  @Post('roles/save')
  async saveRole(
    @Req() req: SessionRequest,
    @Body()
    body: {
      id?: number;
      role_name?: string;
      description?: string;
      perm?: Record<string, any>;
    },
  ) {
    this.requireLogin(req);
    if (!this.isSuperAdmin(req)) return { ok: false, message: 'no_permission' };

    return this.svc.saveRole({
      id: Number(body.id || 0),
      role_name: (body.role_name || '').trim(),
      description: (body.description || '').trim(),
      perm: body.perm || {},
    });
  }

  @Post('roles/delete')
  async deleteRole(@Req() req: SessionRequest, @Body() body: { id?: number }) {
    this.requireLogin(req);
    if (!this.isSuperAdmin(req)) return { ok: false, message: 'no_permission' };

    return this.svc.deleteRole({ id: Number(body.id || 0) });
  }
}
