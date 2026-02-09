import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { LogService } from './log.service';

function getClientIp(req: Request): string {
  const xfwd = req.headers['x-forwarded-for'];
  if (typeof xfwd === 'string' && xfwd.length) return xfwd.split(',')[0].trim();
  if (Array.isArray(xfwd) && xfwd.length) return String(xfwd[0]).trim();
  // express
  const anyReq: any = req as any;
  return anyReq.ip || req.socket?.remoteAddress || '';
}

function normalizePathToLastTwo(path: string): string {
  const clean = (path || '').split('?')[0].replace(/^\/+|\/+$/g, '');
  const parts = clean.split('/').filter(Boolean);
  const lastTwo = parts.slice(-2);
  return lastTwo.join('/');
}

@Controller('api')
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Post('log')
  async log(@Req() req: Request, @Body() body: { event?: string; path?: string } = {}) {
    const sess: any = (req as any).session;
    const username = sess?.username;

    // 1) 必须已登录
    if (!username) return { ok: true, skipped: 'no-session' };

    // 2) 获取 path/event（前端可传 path，不传就用 referer）
  const ip = getClientIp(req);
  if (ip === '192.168.16.130') return { ok: true, skipped: 'ip' };
  const rawPath = body?.path || (req.headers.referer as string) || req.originalUrl || '';
  const path = normalizePathToLastTwo(rawPath);

  // event 优先用自定义，否则用 path；附带 method 方便审计
  const method = req.method;
  const baseEvent = body?.event || path || rawPath || 'unknown';
  const event = `[${method}] ${baseEvent}`.slice(0, 1000);

    // 6) 写入数据库
    await this.logService.writeLog(username, ip, event);

    return { ok: true };
  }
}
