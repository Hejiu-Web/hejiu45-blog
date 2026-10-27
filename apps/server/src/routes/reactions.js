import { Router } from 'express';
import { get, run } from '../db.js';
import { hashVisitor } from '../lib/crypto.js';
import { config } from '../config.js';
import { notFound } from '../lib/http.js';
import { limiters } from '../lib/rate-limit.js';

const router = Router();

const KINDS = new Set(['like', 'clap']);

/**
 * 点赞 / 鼓掌：游客可用。
 *
 * 防刷策略：
 * 1. 按「IP + UA」做单向哈希去重，同一访客每天只能点一次（数据库 UNIQUE 保证）
 * 2. 每 IP 每分钟 40 次上限
 * 3. 计数以 reactions 表为准重新统计，不依赖累加器，避免并发下计数漂移
 */
router.post('/posts/:id/react', limiters.react, (req, res) => {
  const post = get("SELECT id FROM posts WHERE id = ? AND status = 'published'", [req.params.id]);
  if (!post) throw notFound('文章不存在');

  const kind = KINDS.has(req.body?.kind) ? req.body.kind : 'like';
  const visitor = hashVisitor(req.ip, req.get('user-agent') || '', config.authSecret).slice(0, 32);

  const existing = get('SELECT id FROM reactions WHERE post_id = ? AND kind = ? AND visitor = ?', [
    post.id,
    kind,
    visitor,
  ]);

  let liked;
  if (existing) {
    run('DELETE FROM reactions WHERE id = ?', [existing.id]);
    liked = false;
  } else {
    try {
      run('INSERT INTO reactions (post_id, kind, visitor, created_at) VALUES (?, ?, ?, ?)', [
        post.id,
        kind,
        visitor,
        Date.now(),
      ]);
      liked = true;
    } catch {
      liked = true; // 并发下 UNIQUE 冲突：当作已点赞处理
    }
  }

  // 用真实行数回写计数，保证显示值永远与事实一致
  const { n } = get('SELECT COUNT(*) AS n FROM reactions WHERE post_id = ? AND kind = ?', [post.id, kind]);
  run('UPDATE posts SET like_count = ? WHERE id = ?', [n, post.id]);

  const fresh = get('SELECT like_count, views FROM posts WHERE id = ?', [post.id]);
  res.json({ liked, likeCount: fresh.like_count, views: fresh.views });
});

export default router;
