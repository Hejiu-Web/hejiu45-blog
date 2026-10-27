import { config } from '../config.js';
import { resolveSession, hashVisitorIp } from '../lib/sessions.js';

/**
 * 鉴权中间件。
 *
 * req.auth = { session, user }  已登录
 * 写操作要求：已登录 + 通过 CSRF 校验（同源 Cookie 会话）
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function attachAuth(req, _res, next) {
  try {
    const found = resolveSession(req);
    req.auth = found ? { session: found.session, user: found.user } : null;
    req.user = found
      ? {
          id: found.user.id,
          role: found.user.role,
          name: found.user.display_name,
          source: found.user.source,
        }
      : null;
  } catch {
    req.auth = null;
    req.user = null;
  }
  next();
}

/** 需要登录：只负责身份，不做权限判断 */
export function requireAuth(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: '请先登录', code: 'UNAUTHENTICATED' });
  next();
}

/** 写操作：验证 CSRF 与同源 */
export function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.auth) return next(); // requireAuth 会处理未登录
  const header = req.get('x-csrf-token') || '';
  if (!header || header !== req.auth.session.csrf) {
    return res.status(403).json({ error: '安全校验失败，请刷新页面后重试', code: 'CSRF_FAILED' });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ error: '来源不被允许', code: 'ORIGIN_DENIED' });
  }
  next();
}

/** 具备作者权限（可写文章 / 上传） */
export function requireAuthor(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: '请先登录', code: 'UNAUTHENTICATED' });
  if (!['author', 'admin'].includes(req.auth.user.role)) {
    return res.status(403).json({ error: '当前账号只有阅读权限', code: 'FORBIDDEN' });
  }
  if (req.auth.user.disabled) {
    return res.status(403).json({ error: '账号已被停用', code: 'DISABLED' });
  }
  next();
}

/** 同源检查：只要带了 Origin / Referer，就必须与站点同源 */
export function originAllowed(req) {
  const origin = req.get('origin');
  const referer = req.get('referer');
  const source = origin || referer;
  if (!source) return true; // 非浏览器客户端（curl 等）没有 Origin，由 CSRF 令牌兜底
  try {
    const url = new URL(source);
    const site = new URL(config.siteUrl);
    if (url.host === site.host) return true;
    // 开发环境允许 Vite 端口
    const devHosts = [req.get('host')];
    return devHosts.includes(url.host);
  } catch {
    return false;
  }
}

export function clientIp(req) {
  return hashVisitorIp(req);
}

/** 统一的用户序列化，避免把内部字段（密码哈希）带到前端 */
export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username || '',
    displayName: user.display_name || user.displayName || '',
    role: user.role,
    avatar: user.avatar || '',
    bio: user.bio || '',
    source: user.source || 'local',
    createdAt: user.created_at || null,
  };
}
