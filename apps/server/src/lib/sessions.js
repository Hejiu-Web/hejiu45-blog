import { all, get, run } from '../db.js';
import { config } from '../config.js';
import { randomToken, sha256, safeEqual } from './crypto.js';

/**
 * 服务端会话。
 *
 * 为什么不用 JWT：JWT 无法单点吊销，令牌一旦泄露只能等过期。
 * 这里把会话 ID 放在 HttpOnly Cookie 里，服务端持有状态，可以随时踢下线、
 * 查看设备列表、限制空闲超时；配合 CSRF Token 解决 Cookie 会话的跨站请求问题。
 */

const now = () => Date.now();

export function createSession(res, user, req, source = 'password') {
  const id = randomToken(32);
  const csrf = randomToken(32);
  const at = now();
  const ipHash = hashVisitorIp(req);
  run(
    `INSERT INTO sessions (id, user_id, csrf, ua, ip_hash, source, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sha256(id), // 库里只存哈希：即使数据库泄露也无法直接冒充会话
      user.id,
      csrf,
      String(req.get('user-agent') || '').slice(0, 255),
      ipHash,
      source,
      at,
      at,
      at + config.session.ttlSeconds * 1000,
    ],
  );
  writeSessionCookie(res, id);
  run('UPDATE users SET last_login_at = ? WHERE id = ?', [at, user.id]);
  return { id, csrf, sessionId: sha256(id) };
}

export function writeSessionCookie(res, sessionId) {
  res.cookie(config.session.cookieName, sessionId, cookieOptions(config.session.ttlSeconds * 1000));
}

export function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, cookieOptions(0));
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.cookieSecure,
    path: '/',
    maxAge,
  };
}

export function hashVisitorIp(req) {
  return sha256(req.ip || '').slice(0, 24);
}

/** 读取并校验会话；同时处理滑动过期与空闲超时 */
export function resolveSession(req) {
  const raw = req.cookies?.[config.session.cookieName];
  if (!raw || typeof raw !== 'string') return null;
  const row = get('SELECT * FROM sessions WHERE id = ?', [sha256(raw)]);
  if (!row || row.revoked_at) return null;

  const at = now();
  if (row.expires_at < at) {
    revokeSession(row.id);
    return null;
  }
  if (at - row.last_seen_at > config.session.idleSeconds * 1000) {
    revokeSession(row.id);
    return null;
  }
  const user = get('SELECT * FROM users WHERE id = ?', [row.user_id]);
  if (!user || user.disabled) {
    revokeSession(row.id);
    return null;
  }

  // 每 5 分钟更新一次活跃时间，避免每个请求都写库
  if (at - row.last_seen_at > 5 * 60 * 1000) {
    run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [at, row.id]);
  }

  return { session: row, user };
}

export function revokeSession(sessionId) {
  run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [now(), sessionId]);
}

export function revokeByRawId(rawId) {
  if (!rawId) return;
  revokeSession(sha256(rawId));
}

export function revokeAllForUser(userId, exceptSessionId = null) {
  run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id IS NOT ?', [
    now(),
    userId,
    exceptSessionId,
  ]);
}

export function listSessions(userId) {
  return all(
    `SELECT id, ua, source, created_at, last_seen_at, expires_at FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC`,
    [userId, now()],
  );
}

/** CSRF：双提交 + 同源校验。令牌放在内存变量里，由前端通过 X-CSRF-Token 头回传 */
export function csrfValid(req, session) {
  const header = req.get('x-csrf-token') || '';
  if (!header || !session?.csrf) return false;
  return safeEqual(header, session.csrf);
}

/** 清理过期会话与过期的登录 state */
export function purgeExpired() {
  run('DELETE FROM sessions WHERE expires_at < ? OR revoked_at < ?', [now(), now() - 7 * 24 * 3600 * 1000]);
  run('DELETE FROM wechat_login_states WHERE expires_at < ?', [now()]);
  run('DELETE FROM login_attempts WHERE locked_until < ? AND first_at < ?', [now(), now() - 24 * 3600 * 1000]);
}

setInterval(purgeExpired, 10 * 60 * 1000).unref();

/* --------------------------------- 审计日志 -------------------------------- */

export function audit(event, { userId = null, req = null, detail = '' } = {}) {
  try {
    run('INSERT INTO audit_logs (at, event, user_id, ip_hash, detail) VALUES (?, ?, ?, ?, ?)', [
      now(),
      event,
      userId,
      req ? hashVisitorIp(req) : '',
      String(detail).slice(0, 500),
    ]);
  } catch {
    /* 审计失败不能影响主流程 */
  }
}

export function recentAudit(limit = 50) {
  return all('SELECT at, event, user_id, detail FROM audit_logs ORDER BY at DESC LIMIT ?', [
    Math.min(200, Math.max(1, Number(limit) || 50)),
  ]);
}
