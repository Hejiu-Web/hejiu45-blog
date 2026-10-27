import { get, run } from '../db.js';

/**
 * 登录防爆破：按「IP + 账号」双维度计数。
 * 失败 5 次锁 15 分钟，且只对失败计数，成功即清零。
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function read(key) {
  const row = get('SELECT * FROM login_attempts WHERE key = ?', [key]);
  if (!row) return { failures: 0, lockedUntil: 0 };
  if (Date.now() - row.first_at > WINDOW_MS && row.locked_until < Date.now()) {
    run('DELETE FROM login_attempts WHERE key = ?', [key]);
    return { failures: 0, lockedUntil: 0 };
  }
  return { failures: row.failures, lockedUntil: row.locked_until };
}

export function isLocked(keys) {
  for (const key of keys) {
    const state = read(key);
    if (state.lockedUntil > Date.now()) {
      return { locked: true, retryAfter: Math.ceil((state.lockedUntil - Date.now()) / 1000) };
    }
  }
  return { locked: false, retryAfter: 0 };
}

export function recordFailure(keys) {
  const at = Date.now();
  for (const key of keys) {
    const row = get('SELECT * FROM login_attempts WHERE key = ?', [key]);
    if (!row) {
      run('INSERT INTO login_attempts (key, failures, first_at, locked_until) VALUES (?, 1, ?, 0)', [key, at]);
      continue;
    }
    const failures = row.failures + 1;
    const lockedUntil = failures >= MAX_FAILURES ? at + LOCK_MS : row.locked_until;
    run('UPDATE login_attempts SET failures = ?, locked_until = ? WHERE key = ?', [failures, lockedUntil, key]);
  }
}

export function recordSuccess(keys) {
  for (const key of keys) run('DELETE FROM login_attempts WHERE key = ?', [key]);
}

export const lockPolicy = { MAX_FAILURES, WINDOW_MS, LOCK_MS };
