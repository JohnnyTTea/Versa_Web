import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UsersService } from './users.service';
import { isAdmin } from '../auth/role.util';

function escapeCsvCell(v: any): string {
  const s = (v ?? '').toString();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

@Controller('api/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ✅ Read (List) + CSV export
  @Get()
  async list(@Req() req: Request, @Res() res: Response, @Query() q: any) {
    const exportCsv = String(q.export || '').toLowerCase() === 'csv';

    const data = await this.users.list({
      page: parseInt(q.page, 10) || 1,
      limit: parseInt(q.limit, 10) || 20,
      sort: q.sort || 'id',
      order: q.order || 'desc',
      q: (q.q || '').toString().trim(),
      isAdmin: isAdmin(req),
      exportCsv,
    });

    if (!exportCsv) {
      return res.json(data);
    }

    const cols = isAdmin(req)
      ? ['id', 'username', 'first_name', 'last_name', 'password', 'role_name', 'is_active', 'created_time']
      : ['id', 'username', 'first_name', 'last_name', 'role_name', 'is_active', 'created_time'];

    const lines = [
      cols.join(','),
      ...data.rows.map((r: any) => cols.map((c) => escapeCsvCell(r[c])).join(',')),
    ];

    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    return res.send(csv);
  }

  // ✅ Create: POST /api/users
  @Post()
  async create(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    const result = await this.users.create(
      {
        username: (body?.username || '').toString().trim(),
        first_name: (body?.first_name || '').toString().trim(),
        last_name: (body?.last_name || '').toString().trim(),
        role_id: body?.role_id,
        is_active: body?.is_active,
        password: body?.password, // 只有 admin 会被 service 接受/写入
      },
      { isAdmin: isAdmin(req) },
    );

    return res.json(result);
  }

  // ✅ Update: PUT /api/users/:id
  @Put(':id')
  async update(@Req() req: Request, @Res() res: Response, @Param('id') id: string, @Body() body: any) {
    const result = await this.users.update(
      parseInt(id, 10),
      {
        first_name: body?.first_name,
        last_name: body?.last_name,
        role_id: body?.role_id,
        password: body?.password, // admin 才允许改
      },
      { isAdmin: isAdmin(req) },
    );

    return res.json(result);
  }

  // ✅ Active toggle: PATCH /api/users/:id/active
  @Patch(':id/active')
  async setActive(@Res() res: Response, @Param('id') id: string, @Body() body: any) {
    const is_active = body?.is_active;
    const active01 =
      is_active === 1 || is_active === '1' || is_active === true || is_active === 'true' ? 1 : 0;

    const result = await this.users.setActive(parseInt(id, 10), active01);
    return res.json(result);
  }
}
