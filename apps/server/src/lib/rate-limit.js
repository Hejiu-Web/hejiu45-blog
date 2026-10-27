/**
 * 带滑动窗口 + 封禁的限流。
 * 内存实现，单进程足够；多实例部署时换成 Redis 即可，接口保持不变。
 */

const buckets = new Map();

/**
 * @param {object} options
 * @param {number} options.windowMs 窗口长度
 * @param {number} options.max 窗口内最大请求数
 * @param {number} [options.banMs] 超限后的封禁时长
 * @param {string} [options.scope] 桶名，用于区分不同路由
 * @param {(req: any) => string} [options.key] 自定义 key
 */
export function rateLimit({ windowMs = 60_000, max = 60, banMs = 0, scope = 'default', key } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const id = `${scope}:${key ? key(req) : req.ip}`;
    let entry = buckets.get(id);

    if (!entry || now > entry.resetAt) {
      entry = { hits: 0, resetAt: now + windowMs, bannedUntil: entry?.bannedUntil ?? 0 };
      buckets.set(id, entry);
    }
    if (entry.bannedUntil > now) {
      res.setHeader('Retry-After', String(Math.ceil((entry.bannedUntil - now) / 1000)));
      return res.status(429).json({ error: '请求过于频繁，请稍后再试', code: 'RATE_LIMITED' });
    }

    entry.hits += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.hits)));

    if (entry.hits > max) {
      if (banMs) entry.bannedUntil = now + banMs;
      res.setHeader('Retry-After', String(Math.ceil((banMs || entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: '请求过于频繁，请稍后再试', code: 'RATE_LIMITED' });
    }
    next();
  };
}

/** 预设：按用途给出合理的阈值 */
export const limiters = {
  login: rateLimit({ scope: 'login', windowMs: 10 * 60_000, max: 12, banMs: 10 * 60_000 }),
  wechat: rateLimit({ scope: 'wechat', windowMs: 60_000, max: 20, banMs: 5 * 60_000 }),
  react: rateLimit({ scope: 'react', windowMs: 60_000, max: 40 }),
  upload: rateLimit({ scope: 'upload', windowMs: 60_000, max: 10, banMs: 5 * 60_000 }),
  write: rateLimit({ scope: 'write', windowMs: 60_000, max: 60 }),
  read: rateLimit({ scope: 'read', windowMs: 60_000, max: 300 }),
};

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now > v.resetAt && v.bannedUntil < now) buckets.delete(k);
  }
}, 120_000).unref();
