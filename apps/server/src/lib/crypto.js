import crypto from 'node:crypto';

/**
 * 密码哈希：scrypt + 随机盐 + 参数版本标记。
 * 格式 `scrypt$N$r$p$salt$hash`，便于以后提升强度而不破坏旧密码。
 */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !password) return false;
  const parts = stored.split('$');
  // 兼容旧格式 scrypt$salt$hash
  if (parts[0] !== 'scrypt') return false;

  let N = SCRYPT.N;
  let r = SCRYPT.r;
  let p = SCRYPT.p;
  let saltHex;
  let hashHex;

  if (parts.length === 3) {
    [, saltHex, hashHex] = parts;
  } else if (parts.length === 6) {
    N = Number(parts[1]);
    r = Number(parts[2]);
    p = Number(parts[3]);
    saltHex = parts[4];
    hashHex = parts[5];
  } else {
    return false;
  }

  try {
    const expected = Buffer.from(hashHex, 'hex');
    const candidate = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length, {
      N,
      r,
      p,
      maxmem: 128 * 1024 * 1024,
    });
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/** 固定长度的随机令牌（CSRF / state / 会话 ID） */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function randomId(prefix = '') {
  return prefix + crypto.randomBytes(9).toString('base64url');
}

export function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

/** 把 IP 与 UA 做单向哈希后再落库，满足「可去重、不可反查」 */
export function hashVisitor(ip, ua, secret) {
  return sha256(`${ip}|${ua}|${secret}`).slice(0, 32);
}

/** 常量时间比较字符串，避免时序侧信道 */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
