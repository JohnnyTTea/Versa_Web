import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';

@Controller('api')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: { username?: string; password?: string }, @Req() req: Request) {
    const username = (body?.username || '').trim();
    const password = (body?.password || '').trim();
    if (!username || !password) return { ok: false, message: 'Missing username or password' };

    const result = await this.auth.validateLogin('data0', username, password);
    if (!result.ok) return result;

    const sess: any = (req as any).session;
    sess.user_id = result.user.id;
    sess.username = result.user.username;
    sess.role_id = result.user.role_id;
    sess.role_name = result.user.role_name;
    sess.perms = result.user.perms;

    return { ok: true, user: result.user };
  }

  @Public()
  @Get('me')
  me(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const sess: any = (req as any).session;
    if (!sess?.user_id || !sess?.username) return res.json({ ok: false });

    return res.json({
      ok: true,
      user: {
        id: sess.user_id,
        username: sess.username,
        role_id: sess.role_id,
        role_name: sess.role_name,
        perms: sess.perms,
      },
    });
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    const sess: any = (req as any).session;
    if (!sess) return res.json({ ok: true });

    sess.destroy((err: any) => {
      if (err) return res.status(500).json({ ok: false, message: 'Logout failed' });
      res.clearCookie('connect.sid');
      return res.json({ ok: true });
    });
  }
}
