import crypto from 'node:crypto';
import { config, wechatStatus } from '../config.js';
import { get, run, all } from '../db.js';
import { randomId, safeEqual } from './crypto.js';
import { HttpError } from './http.js';

/**
 * 微信登录：两种合法通道，配置哪一个就走哪一个。
 *
 * ── website（网站应用扫码登录，PC 端主流方案）
 *    授权地址  https://open.weixin.qq.com/connect/qrconnect
 *    scope    snsapi_login
 *    资质     微信开放平台「网站应用」，审核通过后获得 AppID/AppSecret
 *    体验     电脑上展示二维码，手机微信扫码后确认，浏览器自动跳回
 *
 * ── mp（公众号网页授权，适合手机端）
 *    授权地址  https://open.weixin.qq.com/connect/oauth2/authorize
 *    scope    snsapi_userinfo
 *    资质     已认证的服务号（订阅号 / 未认证账号不支持）
 *    体验     微信内打开页面，授权后直接登录
 *
 * 安全要点（逐条对应实现）：
 *  1. AppSecret 只存在服务端，code 换 token 的请求全部由服务端发起
 *  2. state 一次性 + 10 分钟过期 + 绑定发起时的浏览器 Cookie，防 CSRF / 登录劫持
 *  3. code 只能兑换一次，服务端再校验 openid / unionid 一致
 *  4. 快照页虚拟账号（is_snapshotuser=1）直接拒绝，避免垃圾账号
 *  5. 昵称头像视为不可信输入：落库前裁剪长度，输出时由前端按文本渲染
 */

const STATE_TTL_MS = 10 * 60 * 1000;

export function channelConfig() {
  const status = wechatStatus();
  if (!status.enabled) {
    throw new HttpError(503, `微信登录不可用：${status.reason}`, 'WECHAT_DISABLED');
  }
  return status;
}

export function redirectUri() {
  return `${config.siteUrl}/api/auth/wechat/callback`;
}

export function buildAuthorizeUrl(state) {
  const { channel } = channelConfig();
  const params = new URLSearchParams({
    appid: config.wechat.appId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    state,
  });

  if (channel === 'website') {
    params.set('scope', 'snsapi_login');
    // 扫码页支持跟随系统深浅色
    params.set('lang', 'cn');
    return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
  }

  params.set('scope', 'snsapi_userinfo');
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`;
}

/** 生成 state：库里存行，浏览器再拿一份 Cookie 绑定，两者必须同时对上 */
export function createState(redirectTo) {
  const state = crypto.randomBytes(24).toString('base64url');
  // 每个 state 配一个独立的随机 nonce，写进浏览器 Cookie。
  // 这样「知道 state」不等于「能完成登录」：攻击者还要拿到发起者的这个 Cookie。
  const nonce = crypto.randomBytes(32).toString('base64url');
  const at = Date.now();
  run(
    'INSERT INTO wechat_login_states (state, browser_nonce, redirect_to, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    [state, nonce, redirectTo, at, at + STATE_TTL_MS],
  );
  return { state, nonce };
}

/**
 * 消费 state。返回库里那一行。
 * state 一次性、10 分钟过期；浏览器必须带回与 state 匹配的 nonce Cookie。
 */
export function consumeState(state, browserNonce) {
  if (!state || typeof state !== 'string') {
    throw new HttpError(400, '登录状态缺失，请重新发起登录', 'WECHAT_STATE_MISSING');
  }
  if (!browserNonce || typeof browserNonce !== 'string') {
    throw new HttpError(400, '登录凭证已过期，请重新扫码', 'WECHAT_STATE_MISSING');
  }

  const row = get('SELECT * FROM wechat_login_states WHERE state = ?', [state]);
  if (!row || row.used_at) {
    throw new HttpError(400, '登录状态已失效，请重新扫码', 'WECHAT_STATE_INVALID');
  }
  if (row.expires_at < Date.now()) {
    run('DELETE FROM wechat_login_states WHERE state = ?', [state]);
    throw new HttpError(400, '登录超时，请重新扫码', 'WECHAT_STATE_EXPIRED');
  }
  // 绑定校验：Cookie 里的 nonce 必须等于发起本 state 时下发的那个
  if (!safeEqual(row.browser_nonce || '', browserNonce)) {
    throw new HttpError(400, '登录凭证与当前浏览器不匹配，请重新扫码', 'WECHAT_STATE_MISMATCH');
  }

  run('UPDATE wechat_login_states SET used_at = ? WHERE state = ?', [Date.now(), state]);
  return row;
}

/* ------------------------------ 微信开放接口 ------------------------------ */
async function wechatGet(path, params) {
  const url = new URL(path, config.wechat.apiBase);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new HttpError(502, `微信接口返回 ${res.status}`, 'WECHAT_HTTP_ERROR');
    const data = await res.json();
    if (data.errcode) {
      // 不把 errmsg 原文回显给用户，只记录日志
      console.warn('[wechat] api error', { path, errcode: data.errcode, errmsg: data.errmsg });
      throw new HttpError(400, mapWechatError(data.errcode), 'WECHAT_API_ERROR');
    }
    return data;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.name === 'AbortError') throw new HttpError(504, '微信接口响应超时', 'WECHAT_TIMEOUT');
    throw new HttpError(502, '无法连接微信服务', 'WECHAT_UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }
}

function mapWechatError(errcode) {
  const map = {
    40029: '授权码无效，请重新扫码',
    40163: '授权码已被使用，请重新扫码',
    40013: 'AppID 配置不正确',
    40125: 'AppSecret 配置不正确',
    48001: '该账号未获得此接口权限',
    42001: 'access_token 已过期，请重试',
  };
  return map[errcode] || '微信授权失败，请重试';
}

/** 用 code 换取 access_token 与 openid / unionid */
export async function exchangeCode(code) {
  const data = await wechatGet('/sns/oauth2/access_token', {
    appid: config.wechat.appId,
    secret: config.wechat.appSecret,
    code,
    grant_type: 'authorization_code',
  });
  if (!data.openid) throw new HttpError(400, '微信未返回用户标识', 'WECHAT_NO_OPENID');
  if (data.is_snapshotuser) {
    throw new HttpError(403, '检测到未完整授权，请在微信中正常打开页面后重试', 'WECHAT_SNAPSHOT');
  }
  return data;
}

/** 拉取用户昵称头像；失败不影响登录，只是少个头像 */
export async function fetchProfile(accessToken, openid) {
  try {
    const data = await wechatGet('/sns/userinfo', { access_token: accessToken, openid, lang: 'zh_CN' });
    return {
      nickname: sanitizeNickname(data.nickname),
      avatar: sanitizeAvatar(data.headimgurl),
      unionid: data.unionid || null,
    };
  } catch {
    return { nickname: '', avatar: '', unionid: null };
  }
}

/* ------------------------------ 输入清洗 ------------------------------ */

const CONTROL_CHARS = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g;
const HTML_TAGS = /<[^>]*>/g;

/**
 * 昵称来自微信，属于完全不可信的输入：
 * 去掉控制字符、HTML 标签与尖括号，再截断长度。
 * 前端本身用文本插值渲染，这里是第二道防线。
 */
export function sanitizeNickname(value) {
  return String(value || '')
    .replace(CONTROL_CHARS, '')
    .replace(HTML_TAGS, '')
    .replace(/[<>]/g, '')
    .replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}

/** 只接受微信官方图床的 https 地址，其余一律丢弃 */
export function sanitizeAvatar(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    const allowed = ['thirdwx.qlogo.cn', 'wx.qlogo.cn'];
    if (url.protocol !== 'https:') return '';
    if (!allowed.includes(url.hostname)) return '';
    return `https://${url.hostname}${url.pathname}`;
  } catch {
    return '';
  }
}

/* ------------------------------ 账号绑定 ------------------------------ */

/**
 * 根据 openid / unionid 找到或创建用户。
 * 普通微信用户注册为 reader 角色：能登录、能看自己的账号，但没有写作权限。
 */
export function findOrCreateUser(identity) {
  const { channel, openid, unionid, nickname, avatar } = identity;
  const appId = config.wechat.appId;

  let row = get('SELECT * FROM wechat_identities WHERE channel = ? AND app_id = ? AND openid = ?', [
    channel,
    appId,
    openid,
  ]);

  // unionid 优先：同一微信用户在网站应用与公众号之间是同一个账号
  if (!row && unionid) {
    row = get('SELECT * FROM wechat_identities WHERE unionid = ? LIMIT 1', [unionid]);
  }

  const at = Date.now();
  if (row) {
    const user = get('SELECT * FROM users WHERE id = ?', [row.user_id]);
    if (user) {
      run('UPDATE wechat_identities SET nickname = ?, avatar = ?, unionid = COALESCE(?, unionid), updated_at = ? WHERE id = ?', [
        nickname || row.nickname,
        avatar || row.avatar,
        unionid,
        at,
        row.id,
      ]);
      return { user, created: false };
    }
  }

  const userId = randomId('u_');
  const displayName = nickname || `微信用户${openid.slice(-4)}`;
  run(
    `INSERT INTO users (id, username, password_hash, display_name, role, avatar, source, created_at)
     VALUES (?, ?, '', ?, 'reader', ?, 'wechat', ?)`,
    [userId, `wx_${openid.slice(-12)}`, displayName, avatar, at],
  );
  run(
    `INSERT INTO wechat_identities (channel, app_id, openid, unionid, nickname, avatar, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [channel, appId, openid, unionid, nickname, avatar, userId, at, at],
  );
  return { user: get('SELECT * FROM users WHERE id = ?', [userId]), created: true };
}

export function identitiesOf(userId) {
  return all('SELECT channel, nickname, created_at FROM wechat_identities WHERE user_id = ?', [userId]);
}
