import { Router } from 'express';
import { requireAuthor } from '../middleware/auth.js';
import { limiters } from '../lib/rate-limit.js';
import { audit } from '../lib/sessions.js';
import {
  bulkWorks,
  createWork,
  deleteWork,
  duplicateWork,
  getWork,
  listWorks,
  reorderWorks,
  updateWork,
  WORK_KINDS,
  WORK_STATUSES,
} from '../lib/works.js';

const router = Router();

/* ───────────────── 公开接口 ───────────────── */

router.get('/works', limiters.read, (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  const works = listWorks({
    kind: String(req.query.kind || ''),
    status: String(req.query.status || ''),
  });
  res.json({ works, kinds: WORK_KINDS, statuses: WORK_STATUSES });
});

router.get('/works/:slug', limiters.read, (req, res) => {
  const work = getWork(req.params.slug);
  if (!work) return res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' });
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ work });
});

/* ───────────────── 管理接口 ───────────────── */

router.get('/admin/works', limiters.read, requireAuthor, (req, res) => {
  res.json({
    works: listWorks({ kind: String(req.query.kind || ''), status: String(req.query.status || '') }),
    kinds: WORK_KINDS,
    statuses: WORK_STATUSES,
  });
});

router.post('/admin/works', limiters.write, requireAuthor, (req, res) => {
  const work = createWork(req.body || {});
  audit('work.create', { userId: req.user.id, req, detail: work.slug });
  res.status(201).json({ work });
});

router.put('/admin/works/:id', limiters.write, requireAuthor, (req, res) => {
  const work = updateWork(req.params.id, req.body || {});
  audit('work.update', { userId: req.user.id, req, detail: work.slug });
  res.json({ work });
});

router.delete('/admin/works/:id', limiters.write, requireAuthor, (req, res) => {
  const result = deleteWork(req.params.id);
  audit('work.delete', { userId: req.user.id, req, detail: result.id });
  res.json({ ok: true, ...result });
});

router.post('/admin/works/reorder', limiters.write, requireAuthor, (req, res) => {
  const { updated } = reorderWorks(Array.isArray(req.body?.ids) ? req.body.ids : []);
  audit('work.reorder', { userId: req.user.id, req, detail: String(updated) });
  res.json({ ok: true, updated });
});

/** 批量操作：发布、归档、精选、删除 */
router.post('/admin/works/bulk', limiters.write, requireAuthor, (req, res) => {
  const result = bulkWorks(String(req.body?.action || ''), req.body?.ids);
  if (!result.total) return res.status(400).json({ error: '没有选中任何作品', code: 'EMPTY_SELECTION' });
  audit('work.bulk', { userId: req.user.id, req, detail: `${result.action} × ${result.succeeded}` });
  res.json(result);
});

/** 复制作品 */
router.post('/admin/works/:id/duplicate', limiters.write, requireAuthor, (req, res) => {
  const work = duplicateWork(req.params.id);
  audit('work.duplicate', { userId: req.user.id, req, detail: work.slug });
  res.status(201).json({ work });
});

export default router;
