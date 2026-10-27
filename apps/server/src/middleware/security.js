import { config } from '../config.js';

/**
 * 内容安全响应头。
 *
 * CSP 采用「不放行任何第三方脚本」的策略：
 * 微信扫码用的是服务端跳转（qrconnect 整页跳转）而不是内嵌 JS SDK，
 * 因此页面里不需要加载 res.wx.qq.com 的脚本，CSP 可以保持严格。
 */
const WECHAT_IMG_HOSTS = 'https://thirdwx.qlogo.cn https://wx.qlogo.cn https://res.wx.qq.com';

/**
 * CSP 采用「生产环境不加载任何第三方脚本」的策略：
 * 微信扫码用的是整页跳转（qrconnect），不是内嵌 JS SDK，
 * 因此页面里不需要 res.wx.qq.com 的脚本，生产环境的 CSP 保持严格。
 * 开发环境的 Vite 注入内联脚本与 HMR，需要单独放宽，这不影响线上安全。
 */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.removeHeader('X-Powered-By');

  if (config.session.cookieSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const isHtml = req.path === '/' || (!req.path.startsWith('/api') && !/\.[a-z0-9]+$/i.test(req.path));
  if (isHtml) {
    const csp = [
      "default-src 'self'",
      // Vite 开发模式会注入内联脚本与 HMR 连接，只在开发环境放宽
      config.isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${WECHAT_IMG_HOSTS}`,
      "font-src 'self' data:",
      config.isProd ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'none'",
      "object-src 'none'",
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Cache-Control', 'no-cache');
  }

  next();
}

/**
 * IP 黑名单 + 极简 WAF：拦截明显的扫描/注入特征。
 * 只做「便宜且误伤低」的检查，复杂防护交给反向代理。
 */
const BAD_PATH = [
  /\.(php|asp|aspx|jsp)$/i,
  /wp-admin|wp-login|xmlrpc\.php/i,
  /(^|\/)\.(env|git|svn|htaccess|DS_Store)/i,
  /\/\.\.\//,
  /\/proc\/self/,
];

const BAD_QUERY = [
  /union\s+select/i,
  /<\s*script/i,
  /(\.\.\/){2,}/,
  /\$\{jndi:/i,
];

export function ipDenylist(req, res, next) {
  if (config.security.ipDeny.includes(req.ip)) {
    return res.status(403).type('text').send('Forbidden');
  }
  next();
}

export function waf(req, res, next) {
  const url = decodeURIComponent(`${req.path}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`);
  if (BAD_PATH.some((re) => re.test(url))) {
    return res.status(404).type('text').send('Not Found');
  }
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  if (BAD_QUERY.some((re) => re.test(query))) {
    return res.status(400).json({ error: '请求包含非法字符' });
  }
  next();
}
