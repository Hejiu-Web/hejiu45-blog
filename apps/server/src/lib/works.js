/**
 * 作品集。
 *
 * 作品指的是站点之外的成果：npm 包、GitHub 仓库、线上产品、设计稿……
 * 和文章的区别是它没有正文正文，核心是「链接 + 简介 + 技术栈」。
 */
import { all, get, run } from '../db.js';
import { HttpError } from './http.js';
import { randomId } from './crypto.js';

const KINDS = new Set(['project', 'package', 'design', 'writing', 'other']);
const STATUSES = new Set(['active', 'archived', 'wip']);

/** 链接只允许 http(s)，杜绝 javascript: 之类的伪协议 */
function safeUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().slice(0, 500);
  } catch {
    return '';
  }
}

function safeJson(text, fallback) {
  try {
    const value = JSON.parse(text ?? '');
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** 技术栈：数组或逗号分隔的字符串都能接受 */
function normalizeTech(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[,，、\n]/);
  return [...new Set(list.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12).map((t) => t.slice(0, 24));
}

/** 从链接里推断一个稳定的 slug，避免中文标题生成拼音依赖 */
function slugify(title, url) {
  const base = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (base) return base;
  try {
    return new URL(url).hostname.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || `work-${randomId().slice(0, 6)}`;
  } catch {
    return `work-${randomId().slice(0, 6)}`;
  }
}

function uniqueSlug(base, exceptId = null) {
  let slug = base;
  let n = 1;
  while (true) {
    const row = get('SELECT id FROM works WHERE slug = ?', [slug]);
    if (!row || row.id === exceptId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export function serializeWork(row, { full = false } = {}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    ...(full ? { description: row.description } : {}),
    url: row.url,
    repo: row.repo,
    cover: row.cover,
    kind: KINDS.has(row.kind) ? row.kind : 'project',
    tech: safeJson(row.tech, []),
    status: STATUSES.has(row.status) ? row.status : 'active',
    featured: Boolean(row.featured),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listWorks({ kind = '', status = '', limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (kind && KINDS.has(kind)) {
    where.push('kind = ?');
    params.push(kind);
  }
  if (status && STATUSES.has(status)) {
    where.push('status = ?');
    params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = all(`SELECT * FROM works ${clause} ORDER BY featured DESC, sort_order ASC, created_at DESC LIMIT ?`, [
    ...params,
    Math.min(500, Math.max(1, Number(limit) || 200)),
  ]);
  return rows.map((r) => serializeWork(r));
}

export function getWork(slugOrId) {
  const row = get('SELECT * FROM works WHERE slug = ? OR id = ?', [slugOrId, slugOrId]);
  return row ? serializeWork(row, { full: true }) : null;
}

export function createWork(input = {}) {
  const title = String(input.title ?? '').trim().slice(0, 120);
  if (!title) throw new HttpError(400, '作品名称不能为空', 'INVALID_TITLE');

  const url = safeUrl(input.url);
  const repo = safeUrl(input.repo);
  if (!url && !repo) throw new HttpError(400, '至少填写一个作品链接或仓库地址', 'INVALID_URL');

  const now = Date.now();
  const base = slugify(String(input.slug || '').trim() || title, url || repo);
  const id = randomId('w_');

  run(
    `INSERT INTO works (id, slug, title, summary, description, url, repo, cover, kind, tech, status, featured, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      uniqueSlug(base),
      title,
      String(input.summary ?? '').slice(0, 300),
      String(input.description ?? '').slice(0, 8000),
      url,
      repo,
      safeUrl(input.cover) || '',
      KINDS.has(input.kind) ? input.kind : 'project',
      JSON.stringify(normalizeTech(input.tech)),
      STATUSES.has(input.status) ? input.status : 'active',
      input.featured ? 1 : 0,
      Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 100,
      now,
      now,
    ],
  );
  return getWork(id);
}

export function updateWork(id, input = {}) {
  const current = get('SELECT * FROM works WHERE id = ?', [id]);
  if (!current) throw new HttpError(404, '作品不存在', 'NOT_FOUND');

  const title = input.title === undefined ? current.title : String(input.title).trim().slice(0, 120);
  if (!title) throw new HttpError(400, '作品名称不能为空', 'INVALID_TITLE');

  const url = input.url === undefined ? current.url : safeUrl(input.url);
  const repo = input.repo === undefined ? current.repo : safeUrl(input.repo);
  if (!url && !repo) throw new HttpError(400, '至少填写一个作品链接或仓库地址', 'INVALID_URL');

  // slug 只在显式传入时变更，保持已分享出去的链接稳定
  let slug = current.slug;
  if (input.slug !== undefined && String(input.slug).trim()) {
    slug = uniqueSlug(slugify(String(input.slug).trim(), url || repo), current.id);
  }

  run(
    `UPDATE works SET slug = ?, title = ?, summary = ?, description = ?, url = ?, repo = ?, cover = ?,
       kind = ?, tech = ?, status = ?, featured = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
    [
      slug,
      title,
      input.summary === undefined ? current.summary : String(input.summary).slice(0, 300),
      input.description === undefined ? current.description : String(input.description).slice(0, 8000),
      url,
      repo,
      input.cover === undefined ? current.cover : safeUrl(input.cover) || '',
      input.kind === undefined ? current.kind : KINDS.has(input.kind) ? input.kind : current.kind,
      input.tech === undefined ? current.tech : JSON.stringify(normalizeTech(input.tech)),
      input.status === undefined ? current.status : STATUSES.has(input.status) ? input.status : current.status,
      input.featured === undefined ? current.featured : input.featured ? 1 : 0,
      input.sortOrder === undefined ? current.sort_order : Number(input.sortOrder) || 100,
      Date.now(),
      id,
    ],
  );
  return getWork(id);
}

export function deleteWork(id) {
  const row = get('SELECT * FROM works WHERE id = ? OR slug = ?', [id, id]);
  if (!row) throw new HttpError(404, '作品不存在', 'NOT_FOUND');
  run('DELETE FROM works WHERE id = ?', [row.id]);
  return { id: row.id };
}

/** 批量调整排序（拖拽或手填序号后用） */
export function reorderWorks(ids = []) {
  ids.forEach((id, index) => {
    run('UPDATE works SET sort_order = ?, updated_at = ? WHERE id = ? OR slug = ?', [index * 10 + 10, Date.now(), id, id]);
  });
  return { updated: ids.length };
}

export const WORK_KINDS = [...KINDS];
export const WORK_STATUSES = [...STATUSES];

/**
 * 批量操作：发布 / 下线、精选、改状态、删除。
 * 单条失败不影响其余项，返回逐条结果便于前端提示。
 */
export function bulkWorks(action, ids = []) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  const results = [];
  for (const id of list) {
    try {
      const row = get('SELECT * FROM works WHERE id = ? OR slug = ?', [id, id]);
      if (!row) {
        results.push({ id, ok: false, error: '不存在' });
        continue;
      }
      switch (action) {
        case 'delete':
          run('DELETE FROM works WHERE id = ?', [row.id]);
          break;
        case 'feature':
          run('UPDATE works SET featured = 1, updated_at = ? WHERE id = ?', [Date.now(), row.id]);
          break;
        case 'unfeature':
          run('UPDATE works SET featured = 0, updated_at = ? WHERE id = ?', [Date.now(), row.id]);
          break;
        case 'publish':
          run('UPDATE works SET status = ?, updated_at = ? WHERE id = ?', ['active', Date.now(), row.id]);
          break;
        case 'archive':
          run('UPDATE works SET status = ?, updated_at = ? WHERE id = ?', ['archived', Date.now(), row.id]);
          break;
        default:
          results.push({ id, ok: false, error: '未知操作' });
          continue;
      }
      results.push({ id: row.id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  return { action, total: results.length, succeeded: results.filter((r) => r.ok).length, results };
}

/** 复制一份作品（标题加「副本」后缀，slug 自动去重），便于复用结构 */
export function duplicateWork(id) {
  const row = get('SELECT * FROM works WHERE id = ? OR slug = ?', [id, id]);
  if (!row) throw new HttpError(404, '作品不存在', 'NOT_FOUND');
  return createWork({
    title: `${row.title} 副本`.slice(0, 120),
    summary: row.summary,
    description: row.description,
    url: row.url,
    repo: row.repo,
    cover: row.cover,
    kind: row.kind,
    tech: safeJson(row.tech, []),
    status: 'draft' in row ? row.status : 'active',
    featured: false,
    sortOrder: row.sort_order + 1,
  });
}
