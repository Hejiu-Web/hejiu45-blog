import { Router } from 'express';
import { config, wechatStatus } from '../config.js';
import { get, run } from '../db.js';
import { verifyPassword, hashPassword } from '../lib/crypto.js';
import { createSession, revokeSession, revokeByRawId, revokeAllForUser, listSessions, audit } from '../lib/sessions.js';
import { isLocked, recordFailure, recordSuccess } from '../lib/login-guard.js';
import { limiters } from '../lib/rate-limit.js';
import { bad, safeRedirect, HttpError } from '../lib/http.js';
import { publicUser, requireAuth } from '../middleware/auth.js';
import { runHook } from '../extensions.js';
import {
  buildAuthorizeUrl,
  channelConfig,
  consumeState,
  createState,
  exchangeCode,
  fetchProfile,
  findOrCreateUser,
  identitiesOf,
} from '../lib/wechat.js';

const router = Router();

const STATE_COOKIE = 'hl_wx_state';

/** 统一的会话响应：前端把 csrf 放在内存里，绝不写 localStorage */
function sessionPayload(req) {
  return {
    user: publicUser(req.auth.user),
    csrf: req.auth.session.csrf,
    source: req.auth.session.source,
    expiresAt: req.auth.session.expires_at,
  };
}
/* ------------------------------- 账号密码登录 ------------------------------- */

router.post('/login', limiters.login, (req, res) => {
  const username = String(req.body?.username || '').trim().slice(0, 64);
  const password = String(req.body?.password || '');
  if (!username || !password) throw bad('请输入账号和密码', 'MISSING_CREDENTIALS');
  if (password.length > 200) throw bad('账号或密码不正确', 'INVALID_CREDENTIALS');

  const keys = [`ip:${req.ip}`, `user:${username.toLowerCase()}`];
  const lock = isLocked(keys);
  if (lock.locked) {
    res.setHeader('Retry-After', String(lock.retryAfter));
    throw new HttpError(429, `尝试次数过多，请 ${Math.ceil(lock.retryAfter / 60)} 分钟后再试`, 'LOCKED');
  }

  const user = get('SELECT * FROM users WHERE username = ?', [username]);
  // 无论账号是否存在都执行一次哈希校验，避免通过响应时间枚举账号
  const ok = verifyPassword(password, user?.password_hash || 'scrypt$16384$8$1$00$00');
  if (!user || !ok || user.disabled) {
    recordFailure(keys);
    audit('login.failed', { req, detail: `user=${username}` });
    return res.status(401).json({ error: '账号或密码不正确', code: 'INVALID_CREDENTIALS' });
  }

  recordSuccess(keys);
  const { csrf, sessionId } = createSession(res, user, req, 'password');
  const fresh = get('SELECT * FROM users WHERE id = ?', [user.id]);
  audit('login.success', { userId: user.id, req, detail: 'password' });
  runHook('onUserLogin', fresh, 'password', req);
  res.json({
    user: publicUser(fresh),
    csrf,
    sessionId,
    source: 'password',
    expiresAt: Date.now() + config.session.ttlSeconds * 1000,
  });
});

router.post('/logout', (req, res) => {
  const raw = req.cookies?.[config.session.cookieName];
  if (raw) revokeByRawId(raw);
  if (req.auth) audit('logout', { userId: req.auth.user.id, req });
  res.clearCookie(config.session.cookieName, { path: '/', httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

/** 当前会话：前端刷新后用它恢复登录态与 CSRF 令牌 */
router.get('/session', (req, res) => {
  if (!req.auth) return res.json({ authenticated: false, wechat: wechatStatus() });
  res.json({ authenticated: true, ...sessionPayload(req), wechat: wechatStatus() });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.auth.user) });
});

/**
 * 更新自己的资料：显示名、简介、头像。
 * 头像只接受站内上传路径或 https 外链；微信头像也在允许列表里（thirdwx.qlogo.cn）。
 */
router.put('/profile', limiters.write, requireAuth, (req, res) => {
  const body = req.body || {};
  const patch = {};

  if (body.displayName !== undefined) {
    const name = String(body.displayName).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
    if (!name) throw bad('显示名不能为空', 'EMPTY_NAME');
    patch.display_name = name;
  }
  if (body.bio !== undefined) {
    patch.bio = String(body.bio).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 160);
  }
  if (body.avatar !== undefined) {
    const avatar = String(body.avatar || '').trim();
    if (avatar) {
      const local = /^\/uploads\/[a-z0-9/_.-]+$/i.test(avatar) && !avatar.includes('..');
      const wechat = /^https:\/\/(thirdwx\.qlogo\.cn|wx\.qlogo\.cn)\//.test(avatar);
      const https = (() => {
        try {
          return new URL(avatar).protocol === 'https:';
        } catch {
          return false;
        }
      })();
      if (!local && !wechat && !https) throw bad('头像地址不合法', 'BAD_AVATAR');
    }
    patch.avatar = avatar.slice(0, 500);
  }

  if (!Object.keys(patch).length) return res.json({ user: publicUser(req.auth.user) });

  const sets = Object.keys(patch).map((k) => `${k} = ?`).join(', ');
  run(`UPDATE users SET ${sets} WHERE id = ?`, [...Object.values(patch), req.auth.user.id]);
  audit('profile.update', { userId: req.auth.user.id, req, detail: Object.keys(patch).join(',') });
  const fresh = get('SELECT * FROM users WHERE id = ?', [req.auth.user.id]);
  res.json({ user: publicUser(fresh) });
});

/**
 * 修改自己的密码。
 * 必须校验旧密码；修改成功后作废其它设备的会话，只保留当前这台。
 */
router.put('/password', limiters.write, requireAuth, (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');

  if (!current) throw bad('请输入当前密码', 'MISSING_CURRENT');
  if (!next) throw bad('请输入新密码', 'MISSING_NEW');
  if (next.length < 8) throw bad('新密码至少 8 位', 'WEAK_PASSWORD');
  if (next.length > 200) throw bad('新密码过长', 'WEAK_PASSWORD');
  if (next === current) throw bad('新密码不能与当前密码相同', 'SAME_PASSWORD');

  const user = get('SELECT * FROM users WHERE id = ?', [req.auth.user.id]);
  if (!user) throw bad('账号不存在', 'NOT_FOUND');
  if (!verifyPassword(current, user.password_hash)) throw bad('当前密码不正确', 'WRONG_PASSWORD');

  // users 表没有 updated_at 列，密码更新时间看审计日志即可
  run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(next), user.id]);
  audit('password.change', { userId: user.id, req, detail: 'self' });

  // 密码变了，其它设备上的会话必须失效。
  // 注意用 revokeAllForUser 接收真实的 session.id ——
  // listSessions() 会把当前会话的 id 脱敏成 'current'，不能拿来比对。
  revokeAllForUser(user.id, req.auth.session.id);

  res.json({ ok: true });
});

/** 账号绑定情况 */
router.get('/identities', requireAuth, (req, res) => {
  res.json({
    wechat: identitiesOf(req.auth.user.id).map((row) => ({
      channel: row.channel,
      nickname: row.nickname,
      avatar: row.avatar,
      createdAt: row.created_at,
    })),
  });
});

/* -------------------------------- 会话管理 -------------------------------- */

router.get('/sessions', requireAuth, (req, res) => {
  const rows = listSessions(req.auth.user.id);
  res.json({
    items: rows.map((row) => ({
      id: row.id === req.auth.session.id ? 'current' : row.id,
      current: row.id === req.auth.session.id,
      device: describeDevice(row.ua),
      source: row.source,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    })),
  });
});

router.delete('/sessions/:id', requireAuth, (req, res) => {
  const userId = req.auth.user.id;
  if (req.params.id === 'current') {
    revokeByRawId(req.cookies?.[config.session.cookieName]);
  } else {
    const row = get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [req.params.id, userId]);
    if (!row) throw new HttpError(404, '会话不存在', 'NOT_FOUND');
    revokeSession(row.id);
  }
  audit('session.revoked', { userId, req, detail: req.params.id });
  res.json({ ok: true });
});

router.post('/sessions/revoke-others', requireAuth, (req, res) => {
  revokeAllForUser(req.auth.user.id, req.auth.session.id);
  audit('session.revoked_all', { userId: req.auth.user.id, req });
  res.json({ ok: true });
});

/* ------------------------------- 微信扫码登录 ------------------------------- */

/**
 * 发起登录：服务端生成 state 与浏览器绑定 Cookie，返回微信授权地址。
 * 前端整页跳转到该地址，由微信渲染二维码。
 */
router.post('/wechat/start', limiters.wechat, (req, res) => {
  const status = channelConfig();
  const redirectTo = safeRedirect(req.body?.redirect, '/');
  const { state, nonce } = createState(redirectTo);

  res.cookie(STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.cookieSecure,
    path: '/api/auth/wechat',
    maxAge: 10 * 60 * 1000,
  });

  res.json({ url: buildAuthorizeUrl(state), channel: status.channel });
});

/** 回调：微信把浏览器带回这里，带上 code 与 state */
router.get('/wechat/callback', limiters.wechat, async (req, res) => {
  const fail = (message, code = 'WECHAT_FAILED') =>
    res.redirect(302, `/login?wechat=${encodeURIComponent(code)}&message=${encodeURIComponent(message)}`);

  try {
    if (req.query.errcode || (!req.query.code && !req.query.state)) {
      return fail('你取消了微信授权，或授权未完成', 'WECHAT_DENIED');
    }

    const nonce = req.cookies?.[STATE_COOKIE];
    const row = consumeState(String(req.query.state || ''), nonce);
    res.clearCookie(STATE_COOKIE, { path: '/api/auth/wechat' });

    const token = await exchangeCode(String(req.query.code));
    const profile = await fetchProfile(token.access_token, token.openid);
    const unionid = token.unionid || profile.unionid || null;

    const { user, created } = findOrCreateUser({
      channel: config.wechat.channel,
      openid: token.openid,
      unionid,
      nickname: profile.nickname,
      avatar: profile.avatar,
    });
    if (user.disabled) return fail('该账号已被停用', 'ACCOUNT_DISABLED');

    createSession(res, user, req, 'wechat');
    audit(created ? 'wechat.register' : 'wechat.login', { userId: user.id, req, detail: config.wechat.channel });
    runHook('onUserLogin', user, 'wechat', req);
    if (created) runHook('onUserRegistered', user);
    return res.redirect(302, safeRedirect(row.redirect_to, '/'));
  } catch (err) {
    audit('wechat.failed', { req, detail: err.code || err.message });
    return fail(err.status && err.status < 500 ? err.message : '微信登录失败，请重试', err.code || 'WECHAT_FAILED');
  }
});

/* -------------------------------- 工具函数 -------------------------------- */

function describeDevice(ua = '') {
  const browser = /MicroMessenger/.test(ua)
    ? '微信'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : '未知浏览器';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '未知系统';
  return `${browser} · ${os}`;
}

export default router;
