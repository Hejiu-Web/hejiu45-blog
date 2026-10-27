import { Router } from 'express';
import { all, get } from '../db.js';
import { requireAuthor } from '../middleware/auth.js';
import { limiters } from '../lib/rate-limit.js';
import { audit } from '../lib/sessions.js';
import {
  collectionPosts,
  createCollection,
  createType,
  deleteCollection,
  deleteType,
  getCollection,
  listCollections,
  listTypes,
  setCollectionItems,
  toggleCollectionItem,
  updateCollection,
  updateType,
} from '../lib/content-model.js';
import { serializePost } from '../lib/posts.js';
import { getSettings, publicSiteInfo, updateSettings } from '../lib/site.js';
import { deleteTag, listTags, mergeTags, renameTag, updateTag } from '../lib/tags.js';

const router = Router();

/* ───────────────────────────── 标签管理 ───────────────────────────── */

/** 后台标签列表：含暂无文章的标签，方便统一维护 */
router.get('/admin/tags', limiters.read, requireAuthor, (_req, res) => {
  res.json({ tags: listTags({ includeEmpty: true }) });
});

router.put('/admin/tags/:name', limiters.write, requireAuthor, (req, res) => {
  const tag = updateTag(req.params.name, req.body || {});
  audit('tag.update', { userId: req.user.id, req, detail: tag.name });
  res.json({ tag });
});

router.post('/admin/tags/:name/rename', limiters.write, requireAuthor, (req, res) => {
  const to = String(req.body?.to || '');
  const result = renameTag(req.params.name, to);
  audit('tag.rename', { userId: req.user.id, req, detail: `${req.params.name} -> ${result.name}` });
  res.json({ ...result, tags: listTags({ includeEmpty: true }) });
});

router.post('/admin/tags/:name/merge', limiters.write, requireAuthor, (req, res) => {
  const to = String(req.body?.into || '');
  const result = mergeTags(req.params.name, to);
  audit('tag.merge', { userId: req.user.id, req, detail: `${req.params.name} -> ${result.name}` });
  res.json({ ...result, tags: listTags({ includeEmpty: true }) });
});

router.delete('/admin/tags/:name', limiters.write, requireAuthor, (req, res) => {
  const result = deleteTag(req.params.name);
  audit('tag.delete', { userId: req.user.id, req, detail: req.params.name });
  res.json(result);
});

/* ───────────────────────────── 站点设置 ───────────────────────────── */

router.get('/site', limiters.read, (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ site: publicSiteInfo() });
});

router.get('/admin/settings', limiters.read, requireAuthor, (_req, res) => {
  res.json({ settings: getSettings() });
});

router.put('/admin/settings', limiters.write, requireAuthor, (req, res) => {
  const applied = updateSettings(req.body || {});
  audit('settings.update', { userId: req.user.id, req, detail: Object.keys(applied).join(',') });
  res.json({ settings: getSettings() });
});

/* ───────────────────────────── 文章类型 ───────────────────────────── */

router.get('/types', limiters.read, (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ types: listTypes({ withCounts: true }) });
});

/** 按路由前缀取该类型下的文章：/api/types/:route/posts */
router.get('/types/:route/posts', limiters.read, (req, res) => {
  const type = listTypes().find((t) => t.route === req.params.route || t.key === req.params.route);
  if (!type) return res.status(404).json({ error: '类型不存在', code: 'NOT_FOUND' });

  const page = Math.max(1, Math.min(10_000, Number(req.query.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12));
  const total = get("SELECT COUNT(*) AS n FROM posts WHERE type_id = ? AND status = 'published'", [type.id]).n;
  const rows = all(
    `SELECT * FROM posts WHERE type_id = ? AND status = 'published'
     ORDER BY COALESCE(published_at, created_at) DESC LIMIT ? OFFSET ?`,
    [type.id, pageSize, (page - 1) * pageSize],
  ).map((row) => serializePost(row));

  res.json({ type, items: rows, total, page, pageSize, hasMore: page * pageSize < total });
});

router.post('/admin/types', limiters.write, requireAuthor, (req, res) => {
  const type = createType(req.body || {});
  audit('type.create', { userId: req.user.id, req, detail: type.key });
  res.status(201).json({ type });
});
router.put('/admin/types/:id', limiters.write, requireAuthor, (req, res) => {
  const type = updateType(req.params.id, req.body || {});
  audit('type.update', { userId: req.user.id, req, detail: type.key });
  res.json({ type });
});

router.delete('/admin/types/:id', limiters.write, requireAuthor, (req, res) => {
  deleteType(req.params.id);
  audit('type.delete', { userId: req.user.id, req, detail: req.params.id });
  res.json({ ok: true });
});

/* ───────────────────────────── 合集 ───────────────────────────── */

router.get('/collections', limiters.read, (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ collections: listCollections() });
});

router.get('/collections/:slug', limiters.read, (req, res) => {
  const collection = getCollection(req.params.slug);
  if (!collection) return res.status(404).json({ error: '合集不存在', code: 'NOT_FOUND' });
  const items = collectionPosts(collection.id).map((row) => serializePost(row));
  res.json({ collection: { ...collection, count: items.length }, items });
});

router.post('/admin/collections', limiters.write, requireAuthor, (req, res) => {
  const collection = createCollection(req.body || {});
  audit('collection.create', { userId: req.user.id, req, detail: collection.slug });
  res.status(201).json({ collection });
});

router.put('/admin/collections/:id', limiters.write, requireAuthor, (req, res) => {
  const collection = updateCollection(req.params.id, req.body || {});
  audit('collection.update', { userId: req.user.id, req, detail: collection.slug });
  res.json({ collection });
});

router.delete('/admin/collections/:id', limiters.write, requireAuthor, (req, res) => {
  deleteCollection(req.params.id);
  audit('collection.delete', { userId: req.user.id, req, detail: req.params.id });
  res.json({ ok: true });
});

/** 整体设置合集成员与顺序 */
router.put('/admin/collections/:id/items', limiters.write, requireAuthor, (req, res) => {
  const items = setCollectionItems(req.params.id, req.body?.postIds || []);
  res.json({ items: items.map((row) => serializePost(row)) });
});

/** 把某篇文章加入 / 移出合集 */
router.post('/admin/collections/:id/toggle', limiters.write, requireAuthor, (req, res) => {
  res.json(toggleCollectionItem(req.params.id, String(req.body?.postId || '')));
});

router.get('/admin/collections/:id/items', limiters.read, requireAuthor, (req, res) => {
  const collection = getCollection(String(req.params.id));
  if (!collection) return res.status(404).json({ error: '合集不存在', code: 'NOT_FOUND' });
  res.json({ collection, items: collectionPosts(collection.id).map((row) => serializePost(row)) });
});

export default router;
