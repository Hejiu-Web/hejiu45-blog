import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

// 读取根目录 .env（不引 dotenv，保持零依赖）
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(rootDir, '.env'));

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 8787);

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

/** 密钥：优先用环境变量；开发环境回退到固定值；生产环境禁止使用默认值 */
function resolveSecret() {
  const raw = process.env.AUTH_SECRET;
  if (raw && raw.length >= 32 && raw !== 'dev-only-secret-change-me') return { value: raw, hardened: true };
  if (isProd) {
    throw new Error(
      'AUTH_SECRET 未配置或过短。生产环境请在 .env 中设置至少 32 位随机字符串，' +
        '可用 `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"` 生成。',
    );
  }
  return { value: raw || 'dev-only-secret-change-me', hardened: Boolean(raw) };
}

const secret = resolveSecret();

const wechatChannel = (process.env.WECHAT_CHANNEL || '').toLowerCase();
const wechatAppId = process.env.WECHAT_APP_ID || '';
const wechatAppSecret = process.env.WECHAT_APP_SECRET || '';

export const config = {
  rootDir,
  port,
  isProd,
  authSecret: secret.value,
  secretHardened: secret.hardened,
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  siteUrl: (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  dataDir: process.env.DATA_DIR || path.join(rootDir, 'apps/server/data'),
  uploadDir: path.join(rootDir, 'apps/server/uploads'),
  coverDir: path.join(rootDir, 'apps/server/data/covers'),
  webDist: path.join(rootDir, 'apps/web/dist'),

  /** 会话 */
  session: {
    cookieName: 'hl_session',
    ttlSeconds: Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 14),
    idleSeconds: Number(process.env.SESSION_IDLE_SECONDS || 60 * 60 * 24 * 7),
    cookieSecure: bool(process.env.COOKIE_SECURE, isProd),
  },

  /** 反向代理：信任几层代理，决定 req.ip 是否可信 */
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),

  /** 微信登录 */
  wechat: {
    channel: wechatChannel, // '' | 'website' | 'mp'
    appId: wechatAppId,
    appSecret: wechatAppSecret,
    apiBase: process.env.WECHAT_API_BASE || 'https://api.weixin.qq.com',
  },

  /** 内容安全 */
  security: {
    uploadsEnabled: bool(process.env.UPLOADS_ENABLED, true),
    uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES || 4 * 1024 * 1024),
    ipDeny: (process.env.IP_DENYLIST || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
};

/** 站点默认值来自 site.config.js（二次开发入口），这里统一转出 */
export { site } from './site.config.js';

/** 微信登录是否可用（同时给出不可用原因，便于前端给出准确提示） */
export function wechatStatus() {
  const { channel, appId, appSecret } = config.wechat;
  const missing = [];
  if (!channel) missing.push('WECHAT_CHANNEL');
  if (!appId) missing.push('WECHAT_APP_ID');
  if (!appSecret) missing.push('WECHAT_APP_SECRET');
  if (channel && !['website', 'mp'].includes(channel)) {
    return { enabled: false, channel, reason: 'WECHAT_CHANNEL 只能是 website（网站应用扫码）或 mp（公众号网页授权）' };
  }
  if (missing.length) {
    return { enabled: false, channel: channel || null, reason: `缺少配置：${missing.join('、')}` };
  }
  return { enabled: true, channel };
}

/** 启动自检：把不安全的配置直接暴露在日志里，而不是等出事才发现 */
export function auditConfig() {
  const warnings = [];
  const errors = [];

  if (!config.secretHardened) {
    warnings.push('AUTH_SECRET 使用的是开发默认值，任何人都能伪造登录态');
  }
  if (config.adminPassword === 'admin123') {
    warnings.push('ADMIN_PASSWORD 仍是默认值 admin123');
  }
  if (config.isProd && !config.session.cookieSecure) {
    warnings.push('生产环境 COOKIE_SECURE=false：会话 Cookie 会在明文 HTTP 下传输');
  }
  if (config.isProd && config.siteUrl.startsWith('http://') && !config.siteUrl.includes('localhost')) {
    warnings.push('SITE_URL 不是 https：微信要求回调域名使用 HTTPS');
  }
  if (config.trustProxy > 0 && !config.isProd) {
    warnings.push('开发环境信任代理：直接访问时可通过伪造 X-Forwarded-For 绕过按 IP 限流（生产环境有真实反代时属正常配置）');
  }
  if (config.security.uploadMaxBytes > 8 * 1024 * 1024) {
    warnings.push('UPLOAD_MAX_BYTES 过大，可能被用于耗尽磁盘');
  }

  const wx = wechatStatus();
  if (!wx.enabled && config.wechat.channel) errors.push(`微信登录已声明但不可用：${wx.reason}`);

  return { warnings, errors, wechat: wx };
}

/** 会话 ID：128 位随机数，base64url 后 22 字符 */
export function newSessionId() {
  return crypto.randomBytes(16).toString('base64url');
}
