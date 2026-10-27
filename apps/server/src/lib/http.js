import { config } from '../config.js';

/** 统一的错误响应：生产环境不泄露堆栈与内部细节 */
export class HttpError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const bad = (message, code = 'BAD_REQUEST', details) => new HttpError(400, message, code, details);
export const unauthorized = (message = '请先登录') => new HttpError(401, message, 'UNAUTHENTICATED');
export const forbidden = (message = '没有权限') => new HttpError(403, message, 'FORBIDDEN');
export const notFound = (message = '内容不存在') => new HttpError(404, message, 'NOT_FOUND');

export function errorHandler(err, req, res, _next) {
  const status = Number(err.status) || 500;
  const isServer = status >= 500;

  if (isServer) {
    // 完整堆栈只进服务器日志，绝不返回给客户端
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  // 请求体解析失败（例如 JSON 格式错误、超过大小限制）
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求内容过大', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求格式不正确', code: 'BAD_JSON' });
  }

  // 业务错误（带 code）原样提示；未预期的 5xx 才隐藏细节
  const known = Boolean(err.code) && status < 500;
  res.status(status).json({
    error: known ? err.message : isServer && config.isProd ? '服务器开小差了，请稍后再试' : err.message || '服务器开小差了',
    code: err.code || (isServer ? 'INTERNAL' : 'ERROR'),
    ...(err.details && !config.isProd ? { details: err.details } : {}),
  });
}

/** 404 兜底（API 用） */
export function apiNotFound(_req, res) {
  res.status(404).json({ error: '接口不存在', code: 'NOT_FOUND' });
}

/** 只允许站内相对路径，防止开放重定向 */
export function safeRedirect(target, fallback = '/') {
  if (typeof target !== 'string') return fallback;
  const value = target.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  if (value.length > 300) return fallback;
  return value;
}
