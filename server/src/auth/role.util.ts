import { Request } from 'express';

type SessionUser = {
  username?: string;
  role?: string;     // 例如 'admin'
  role_id?: number;  // 例如 1
};

export function getRole(req: Request): string {
  // ✅ 1) session 优先（登录后这里会有）
  const sess: any = (req as any).session;
  const sRole = (sess?.role || sess?.role_name || '') as string;
  if (sRole) return sRole.toLowerCase();

  // ✅ 2) header 兜底（你原来的临时模式保留）
  const role = (req.headers['x-role'] || '').toString().toLowerCase();
  return role || 'user';
}

export function isAdmin(req: Request): boolean {
  return getRole(req) === 'admin';
}

export function getSessionUser(req: Request): SessionUser | null {
  const sess: any = (req as any).session;
  if (!sess?.username) return null;
  return {
    username: sess.username,
    role: sess.role || sess.role_name || '',
    role_id: typeof sess.role_id === 'number' ? sess.role_id : Number(sess.role_id || 0),
  };
}
