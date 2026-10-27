import { Router } from 'express';
import { all, get, run, indexPost } from '../db.js';
import { requireAuthor } from '../middleware/auth.js';
import { bad, notFound } from '../lib/http.js';
import {
  autoExcerpt,
  bumpViews,
  listTags,
  resolveTag,
  parseTags,
  readingMinutes,
  serializePost,
  slugify,
  uniqueSlug,
} from '../lib/posts.js';
import {
  collectionsOfPost,
  getType,
  listTypes,
  normalizeFieldValues,
  setPostCollections,
} from '../lib/content-model.js';
import { hashVisitor, randomId } from '../lib/crypto.js';
import { writeCover } from '../lib/cover.js';
import { renderMarkdown, extractHeadings } from '../lib/markdown.js';
import { audit } from '../lib/sessions.js';
import { limiters } from '../lib/rate-limit.js';
import { runHook } from '../extensions.js';
import { config } from '../config.js';

const router = Router();

const SORTS = {
  latest: 'COALESCE(p.published_at, p.created_at) DESC',
  popular: 'p.like_count DESC, p.views DESC',
  views: 'p.views DESC, COALESCE(p.published_at, p.created_at) DESC',
};

function visitorOf(req) {
  return hashVisitor(req.ip, req.get('user-agent') || '', config.authSecret);
}

/**
 * 文章列表：支持类型（type）、合集（collection）、标签、搜索与排序。
 * 参数全部绑定，不做字符串拼接 SQL。
 */
router.get('/posts', limiters.read, (req, res) => {
  const page = Math.max(1, Math.min(10_000, Number(req.query.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 9));
  const sort = Object.hasOwn(SORTS, req.query.sort) ? req.query.sort : 'latest';
  // 标签可能是别名：先归一成真实标签名再筛选
  const tag = req.query.tag ? resolveTag(String(req.query.tag)) : '';
  const typeKey = req.query.type ? String(req.query.type).slice(0, 40) : '';
  const collectionSlug = req.query.collection ? String(req.query.collection).slice(0, 60) : '';
  const q = req.query.q ? String(req.query.q).trim().slice(0, 80) : '';

  const where = ["p.status = 'published'"];
  const params = [];

  if (typeKey) {
    const type = get('SELECT id FROM post_types WHERE key = ? OR route = ?', [typeKey, typeKey]);
    if (!type) return res.json({ items: [], total: 0, page, pageSize, hasMore: false, sort });
    where.push('p.type_id = ?');
    params.push(type.id);
  }
  if (collectionSlug) {
    where.push(
      'p.id IN (SELECT ci.post_id FROM collection_items ci JOIN collections c ON c.id = ci.collection_id WHERE c.slug = ?)',
    );
    params.push(collectionSlug);
  }
  if (tag) {
    where.push('p.tags LIKE ?');
    params.push(`%"${tag.replace(/[\\%_]/g, '\\$&')}"%`);
  }
  if (q) {
    where.push('(p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)');
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    params.push(like, like, like);
  }
  const whereSql = where.join(' AND ');

  const total = get(`SELECT COUNT(*) AS n FROM posts p WHERE ${whereSql}`, params).n;
  const rows = all(
    `SELECT p.* FROM posts p WHERE ${whereSql} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const types = new Map(listTypes().map((t) => [t.id, t]));

  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({
    items: rows.map((row) => ({
      ...serializePost(row),
      type: row.type_id ? types.get(row.type_id)?.key || null : null,
    })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    sort,
  });
});

router.get('/posts/featured', (_req, res) => {
  const row = get(
    "SELECT * FROM posts WHERE status = 'published' AND featured = 1 ORDER BY COALESCE(published_at, created_at) DESC LIMIT 1",
  );
  res.json({ post: serializePost(row) });
});

router.get('/tags', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ tags: listTags() });
});

/** 单篇文章：正文在这里完成 Markdown 渲染与净化，前端不再拼接 HTML */
router.get('/posts/:slug', limiters.read, async (req, res) => {
  const album = req.query.album === '1'; // 后台预览：不计数
  const row = get('SELECT * FROM posts WHERE slug = ?', [req.params.slug]);
  if (!row) throw notFound('文章不存在或已下线');
  if (row.status !== 'published' && !req.user) throw notFound('文章不存在或已下线');

  if (!album) bumpViews(row.id, visitorOf(req));
  const fresh = get('SELECT * FROM posts WHERE id = ?', [row.id]);

  const liked = Boolean(
    get('SELECT 1 FROM reactions WHERE post_id = ? AND kind = ? AND visitor = ?', [
      row.id,
      'like',
      visitorOf(req),
    ]),
  );
  const neighbors = {
    prev: get(
      "SELECT slug, title FROM posts WHERE status = 'published' AND published_at < ? ORDER BY published_at DESC LIMIT 1",
      [fresh.published_at || Date.now()],
    ) || null,
    next: get(
      "SELECT slug, title FROM posts WHERE status = 'published' AND published_at > ? ORDER BY published_at ASC LIMIT 1",
      [fresh.published_at || 0],
    ) || null,
  };
  const related = all(
    "SELECT * FROM posts WHERE status = 'published' AND id != ? ORDER BY (like_count + views * 0.2) DESC LIMIT 3",
    [row.id],
  ).map((p) => serializePost(p));

  // 净化后的 HTML 与目录一起下发，客户端只负责插入 DOM
  const html = await renderMarkdown(fresh.content);
  const toc = extractHeadings(fresh.content);
  const type = fresh.type_id ? listTypes().find((t) => t.id === fresh.type_id) || null : null;

  res.setHeader('Vary', 'Cookie');
  res.json({
    post: serializePost(fresh, { full: true }),
    html,
    toc,
    type,
    collections: collectionsOfPost(fresh.id),
    liked,
    neighbors,
    related,
  });
});

/** 后台实时预览：只渲染，不写库、不计数（需登录） */
router.post('/preview', limiters.write, requireAuthor, async (req, res) => {
  const source = String(req.body?.content || '').slice(0, MAX_CONTENT);
  const html = await renderMarkdown(source);
  res.json({ html, toc: extractHeadings(source) });
});

/** 相关推荐（基于标签权重） */
router.get('/posts/:slug/related', (req, res) => {
  const row = get('SELECT tags FROM posts WHERE slug = ?', [req.params.slug]);
  if (!row) throw notFound();
  const tags = parseTags(row.tags);
  const rows = all(
    "SELECT * FROM posts WHERE status = 'published' AND slug != ? ORDER BY like_count DESC, views DESC LIMIT 6",
    [req.params.slug],
  );
  const scored = rows
    .map((p) => {
      const overlap = parseTags(p.tags).filter((t) => tags.includes(t)).length;
      return { p, score: overlap * 10 + p.like_count };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ p }) => serializePost(p));
  res.json({ items: scored });
});

/** 生成一张排印式封面（不依赖外部图床），返回可直接写入文章 cover 字段的地址 */
router.post('/covers', limiters.write, requireAuthor, (req, res) => {
  const title = String(req.body?.title || '鹤酒').slice(0, 60);
  const tag = String(req.body?.tag || '鹤酒').slice(0, 20);
  const slug = slugify(req.body?.slug || title) + '-' + randomId().slice(0, 5);
  const light = writeCover(config.coverDir, { title, tag, slug, theme: 'light' });
  writeCover(config.coverDir, { title, tag, slug: `${slug}-dark`, theme: 'dark' });
  res.status(201).json({ url: light });
});

const MAX_CONTENT = 200_000;

/**
 * 封面地址只接受两种输入：站内上传/生成的路径，或 https 外链。
 * 拒绝 javascript: / data: 等协议，避免把危险 URL 写进 <img src>。
 */
function safeCoverUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/') || raw.startsWith('/covers/')) {
    return /^\/[a-z0-9/_.-]+$/i.test(raw) && !raw.includes('..') ? raw : '';
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString().slice(0, 500) : '';
  } catch {
    return '';
  }
}

function normalizeInput(body, current = {}) {
  const title = String(body.title ?? current.title ?? '').trim();
  if (!title) throw bad('标题不能为空', 'TITLE_REQUIRED');
  if (title.length > 120) throw bad('标题最多 120 个字符', 'TITLE_TOO_LONG');

  const content = String(body.content ?? current.content ?? '');
  if (content.length > MAX_CONTENT) throw bad('正文过长（上限 20 万字符）', 'CONTENT_TOO_LONG');

  const status = ['draft', 'published'].includes(body.status) ? body.status : current.status || 'draft';
  const excerpt = String(body.excerpt ?? current.excerpt ?? '').trim().slice(0, 300);

  // 文章类型：未指定时落到内置的「文章」类型
  const typeIdInput = body.typeId ?? body.typeKey ?? current.type_id ?? null;
  const type = typeIdInput ? getType(typeIdInput) : getType('article');
  if (typeIdInput && !type) throw bad('指定的文章类型不存在', 'TYPE_NOT_FOUND');

  return {
    title,
    content,
    excerpt: excerpt || autoExcerpt(content),
    cover: safeCoverUrl(body.cover ?? current.cover ?? ''),
    tags: parseTags(body.tags ?? current.tags ?? []),
    status,
    featured: body.featured === true || body.featured === 1 ? 1 : 0,
    readingMinutes: readingMinutes(content),
    typeId: type ? type.id : null,
    fields: normalizeFieldValues(type, body.fields ?? safeParse(current.fields, {})),
    media: normalizeMediaList(body.media ?? safeParse(current.media, [])),
  };
}

/** 文章内嵌媒体：只接受本地上传或 https 外链，最多 20 个 */
function normalizeMediaList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && typeof m === 'object')
    .map((m) => {
      const kind = ['image', 'video', 'audio', 'embed'].includes(m.kind) ? m.kind : 'image';
      const url = safeCoverUrl(m.url);
      if (!url) return null;
      return {
        kind,
        url,
        title: String(m.title || '').slice(0, 120),
        poster: m.poster ? safeCoverUrl(m.poster) : '',
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function safeParse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

router.post('/posts', limiters.write, requireAuthor, (req, res) => {
  const data = normalizeInput(req.body || {});
  const now = Date.now();
  const id = randomId('p_');
  const slug = uniqueSlug(req.body.slug || data.title);
  run(
    `INSERT INTO posts (id, slug, title, excerpt, content, cover, tags, status, featured,
      reading_minutes, views, like_count, author_id, type_id, fields, media, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      slug,
      data.title,
      data.excerpt,
      data.content,
      data.cover,
      JSON.stringify(data.tags),
      data.status,
      data.featured,
      data.readingMinutes,
      req.user.id,
      data.typeId,
      JSON.stringify(data.fields),
      JSON.stringify(data.media),
      data.status === 'published' ? now : null,
      now,
      now,
    ],
  );
  if (data.featured) run('UPDATE posts SET featured = 0 WHERE id != ?', [id]);
  // 合集归属：只有前端明确传了 collections 才处理，避免「没传」被当成「清空」
  if (Array.isArray(req.body?.collections)) {
    setPostCollections(id, req.body.collections);
  }
  refreshIndex(id);
  audit('post.create', { userId: req.user.id, req, detail: `${slug} ${data.status}` });
  const saved = get('SELECT * FROM posts WHERE id = ?', [id]);
  runHook('onPostCreated', saved, req);
  res.status(201).json({ post: serializePost(saved, { full: true }) });
});

/** 写入后刷新全文索引（草稿会从索引移除） */
function refreshIndex(id) {
  const row = get('SELECT * FROM posts WHERE id = ?', [id]);
  if (row) indexPost(row);
}

router.put('/posts/:id', limiters.write, requireAuthor, (req, res) => {
  const current = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  if (!current) throw notFound('文章不存在');
  const data = normalizeInput(req.body || {}, { ...current, tags: JSON.parse(current.tags) });
  const slug = req.body.slug && req.body.slug !== current.slug ? uniqueSlug(req.body.slug, current.id) : current.slug;
  const publishingNow = data.status === 'published' && !current.published_at;

  run(
    `UPDATE posts SET slug = ?, title = ?, excerpt = ?, content = ?, cover = ?, tags = ?, status = ?,
       featured = ?, reading_minutes = ?, type_id = ?, fields = ?, media = ?, published_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      slug,
      data.title,
      data.excerpt,
      data.content,
      data.cover,
      JSON.stringify(data.tags),
      data.status,
      data.featured,
      data.readingMinutes,
      data.typeId,
      JSON.stringify(data.fields),
      JSON.stringify(data.media),
      publishingNow ? Date.now() : current.published_at,
      Date.now(),
      current.id,
    ],
  );
  if (data.featured) run('UPDATE posts SET featured = 0 WHERE id != ?', [current.id]);
  // 合集归属：只有前端明确传了 collections 才处理
  if (Array.isArray(req.body?.collections)) {
    setPostCollections(current.id, req.body.collections);
  }
  refreshIndex(current.id);
  audit('post.update', { userId: req.user.id, req, detail: `${slug} ${data.status}` });
  const saved = get('SELECT * FROM posts WHERE id = ?', [current.id]);
  runHook('onPostUpdated', saved, req);
  res.json({ post: serializePost(saved, { full: true }) });
});

router.delete('/posts/:id', limiters.write, requireAuthor, (req, res) => {
  // 先取 rowid 再删除：索引按 rowid 对齐，删完就查不到了
  const before = get('SELECT rowid AS rid FROM posts WHERE id = ?', [req.params.id]);
  const info = run('DELETE FROM posts WHERE id = ?', [req.params.id]);
  if (!info.changes) throw notFound('文章不存在');
  indexPost({ rowid: before?.rid, status: 'deleted' });
  audit('post.delete', { userId: req.user.id, req, detail: req.params.id });
  runHook('onPostDeleted', req.params.id, req);
  res.json({ ok: true });
});

/** 作者后台列表：包含草稿，带类型与合集信息 */
router.get('/admin/posts', requireAuthor, (_req, res) => {
  const rows = all('SELECT * FROM posts ORDER BY updated_at DESC');
  const types = new Map(listTypes().map((t) => [t.id, t]));
  res.json({
    items: rows.map((row) => ({
      ...serializePost(row),
      type: row.type_id ? types.get(row.type_id)?.key || null : null,
      typeName: row.type_id ? types.get(row.type_id)?.name || '' : '',
      collections: collectionsOfPost(row.id).map((c) => c.slug),
    })),
  });
});

export default router;
