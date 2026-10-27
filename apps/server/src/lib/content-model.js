import { all, get, run, tx } from '../db.js';
import { randomId } from './crypto.js';
import { HttpError, bad, notFound } from './http.js';

/**
 * 自定义内容模型：文章类型（post types）与合集（collections）。
 * 全部落在 SQLite 里，通过 API 增删改 —— 作者不需要改代码就能扩展站点结构。
 */

/* ───────────────────────────── 文章类型 ───────────────────────────── */

const KEY_RE = /^[a-z][a-z0-9-]{1,32}$/;
const RESERVED_KEYS = new Set(['all', 'api', 'admin', 'assets', 'uploads', 'covers', 'media', 'search', 'tags', 'archive', 'post', 'collection', 'rss', 'sitemap']);
const RESERVED_ROUTES = new Set(['admin', 'api', 'uploads', 'covers', 'media', 'tags', 'archive', 'search', 'post', 'about', 'login', 'account', 'rss.xml', 'sitemap.xml', 'assets']);

const FIELD_KINDS = new Set(['text', 'textarea', 'markdown', 'url', 'number', 'date', 'select', 'boolean', 'tags']);

/** 字段定义校验：只允许白名单类型，key 只允许字母数字下划线，避免注入与脏数据 */
function normalizeFields(input) {
  if (!Array.isArray(input)) return [];
  if (input.length > 20) throw bad('字段最多 20 个', 'TOO_MANY_FIELDS');
  const seen = new Set();
  return input
    .filter((f) => f && typeof f === 'object')
    .map((f) => {
      const key = String(f.key || '').trim();
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)) {
        throw bad(`字段标识不合法：${key || '(空)'}，需以字母开头，只含字母数字下划线`, 'BAD_FIELD_KEY');
      }
      if (seen.has(key)) throw bad(`字段标识重复：${key}`, 'DUPLICATE_FIELD_KEY');
      seen.add(key);
      const kind = FIELD_KINDS.has(f.kind) ? f.kind : 'text';
      const field = {
        key,
        label: String(f.label || key).slice(0, 40),
        kind,
        required: Boolean(f.required),
        help: String(f.help || '').slice(0, 120),
      };
      if (kind === 'select') {
        field.options = (Array.isArray(f.options) ? f.options : [])
          .map((o) => String(o).trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 20);
      }
      return field;
    })
    .slice(0, 20);
}

function normalizeRoute(input, key) {
  const route = String(input || '').trim().toLowerCase();
  if (!route) return key;
  if (!/^[a-z][a-z0-9-]{1,32}$/.test(route)) {
    throw bad('路由前缀只能包含小写字母、数字和连字符', 'BAD_ROUTE');
  }
  if (RESERVED_ROUTES.has(route)) throw bad(`路由前缀「${route}」是系统保留字`, 'RESERVED_ROUTE');
  return route;
}

export function serializeType(row, { withCounts = false } = {}) {
  if (!row) return null;
  const type = {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    route: row.route,
    fields: safeJson(row.fields, []),
    sortOrder: row.sort_order,
    builtin: Boolean(row.builtin),
    createdAt: row.created_at,
  };
  if (withCounts) type.count = row.count ?? 0;
  return type;
}

export function listTypes({ withCounts = false } = {}) {
  const rows = withCounts
    ? all(
        `SELECT t.*, (SELECT COUNT(*) FROM posts p WHERE p.type_id = t.id AND p.status = 'published') AS count
         FROM post_types t ORDER BY t.sort_order, t.id`,
      )
    : all('SELECT * FROM post_types ORDER BY sort_order, id');
  return rows.map((row) => serializeType(row, { withCounts }));
}

export function getType(idOrKey) {
  if (idOrKey === undefined || idOrKey === null || idOrKey === '') return null;
  const asNumber = Number(idOrKey);
  const row = Number.isInteger(asNumber)
    ? get('SELECT * FROM post_types WHERE id = ?', [asNumber])
    : get('SELECT * FROM post_types WHERE key = ?', [String(idOrKey)]);
  return row ? serializeType(row) : null;
}

export function typeByRoute(route) {
  const row = get('SELECT * FROM post_types WHERE route = ?', [route]);
  return row ? serializeType(row) : null;
}

export function createType(input) {
  const key = String(input?.key || '').trim().toLowerCase();
  if (!KEY_RE.test(key)) throw bad('类型标识需以小写字母开头，2-33 位，只含字母数字与连字符', 'BAD_KEY');
  if (RESERVED_KEYS.has(key)) throw bad(`标识「${key}」是系统保留字`, 'RESERVED_KEY');
  if (get('SELECT id FROM post_types WHERE key = ?', [key])) throw bad('该类型标识已存在', 'DUPLICATE_KEY');

  const name = String(input?.name || '').trim().slice(0, 30);
  if (!name) throw bad('类型名称不能为空', 'MISSING_NAME');

  const route = normalizeRoute(input?.route, key);
  if (get('SELECT id FROM post_types WHERE route = ?', [route])) throw bad(`路由前缀「${route}」已被其他类型占用`, 'DUPLICATE_ROUTE');

  const now = Date.now();
  const info = run(
    `INSERT INTO post_types (key, name, description, icon, route, fields, sort_order, builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      key,
      name,
      String(input?.description || '').slice(0, 200),
      String(input?.icon || 'bookmark').slice(0, 24),
      route,
      JSON.stringify(normalizeFields(input?.fields)),
      Number(input?.sortOrder) || 100,
      now,
      now,
    ],
  );
  return getType(info.lastInsertRowid);
}

export function updateType(id, input) {
  const current = get('SELECT * FROM post_types WHERE id = ?', [Number(id)]);
  if (!current) throw notFound('类型不存在');

  const name = input?.name !== undefined ? String(input.name).trim().slice(0, 30) : current.name;
  if (!name) throw bad('类型名称不能为空', 'MISSING_NAME');

  let route = current.route;
  if (input?.route !== undefined) {
    route = normalizeRoute(input.route, current.key);
    const clash = get('SELECT id FROM post_types WHERE route = ? AND id != ?', [route, current.id]);
    if (clash) throw bad(`路由前缀「${route}」已被其他类型占用`, 'DUPLICATE_ROUTE');
  }

  const fields = input?.fields !== undefined ? normalizeFields(input.fields) : JSON.parse(current.fields || '[]');

  run(
    `UPDATE post_types SET name = ?, description = ?, icon = ?, route = ?, fields = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`,
    [
      name,
      input?.description !== undefined ? String(input.description).slice(0, 200) : current.description,
      input?.icon !== undefined ? String(input.icon).slice(0, 24) : current.icon,
      route,
      JSON.stringify(fields),
      input?.sortOrder !== undefined ? Number(input.sortOrder) || 100 : current.sort_order,
      Date.now(),
      current.id,
    ],
  );
  return getType(current.id);
}

export function deleteType(id) {
  const current = get('SELECT * FROM post_types WHERE id = ?', [Number(id)]);
  if (!current) throw notFound('类型不存在');
  if (current.builtin) throw new HttpError(400, '内置类型不能删除，但可以改名、改路由与字段', 'BUILTIN_TYPE');
  const used = get('SELECT COUNT(*) AS n FROM posts WHERE type_id = ?', [current.id]).n;
  if (used > 0) {
    throw new HttpError(400, `该类型下还有 ${used} 篇文章，请先移动或删除这些文章`, 'TYPE_IN_USE');
  }
  run('DELETE FROM post_types WHERE id = ?', [current.id]);
  return true;
}

/* ───────────────────────────── 合集 ───────────────────────────── */

export function serializeCollection(row, { items = null } = {}) {
  if (!row) return null;
  const collection = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    cover: row.cover,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    count: row.count ?? 0,
  };
  if (items) collection.items = items;
  return collection;
}

export function listCollections() {
  const rows = all(
    `SELECT c.*, (SELECT COUNT(*) FROM collection_items ci JOIN posts p ON p.id = ci.post_id
                  WHERE ci.collection_id = c.id AND p.status = 'published') AS count
     FROM collections c ORDER BY c.sort_order, c.id`,
  );
  return rows.map((row) => serializeCollection(row));
}

export function getCollection(slug) {
  const row = get(
    `SELECT c.*, (SELECT COUNT(*) FROM collection_items ci JOIN posts p ON p.id = ci.post_id
                  WHERE ci.collection_id = c.id AND p.status = 'published') AS count
     FROM collections c WHERE c.slug = ? OR c.id = ?`,
    [String(slug), Number(slug) || -1],
  );
  return row ? serializeCollection(row) : null;
}

/** 合集内的文章：按 position 排序，只取已发布的（collection_id 是 TEXT 列，需转字符串比较） */
export function collectionPosts(collectionId) {
  const id = String(collectionId);
  const rows = all(
    `SELECT p.*, ci.position FROM collection_items ci
     JOIN posts p ON p.id = ci.post_id
     WHERE ci.collection_id = ? AND p.status = 'published'
     ORDER BY ci.position, ci.added_at`,
    [id],
  );
  return rows;
}

export function collectionsOfPost(postId) {
  return all(
    `SELECT c.id, c.slug, c.title FROM collection_items ci JOIN collections c ON c.id = ci.collection_id
     WHERE ci.post_id = ? ORDER BY c.sort_order`,
    [String(postId)],
  );
}

export function createCollection(input) {
  const title = String(input?.title || '').trim().slice(0, 80);
  if (!title) throw bad('合集标题不能为空', 'MISSING_TITLE');
  const slug = uniqueCollectionSlug(input?.slug || title);
  const now = Date.now();
  const info = run(
    'INSERT INTO collections (slug, title, description, cover, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      slug,
      title,
      String(input?.description || '').slice(0, 400),
      String(input?.cover || '').slice(0, 500),
      Number(input?.sortOrder) || 100,
      now,
      now,
    ],
  );
  return getCollection(String(info.lastInsertRowid));
}

export function updateCollection(id, input) {
  const current = get('SELECT * FROM collections WHERE id = ?', [Number(id)]);
  if (!current) throw notFound('合集不存在');
  const title = input?.title !== undefined ? String(input.title).trim().slice(0, 80) : current.title;
  if (!title) throw bad('合集标题不能为空', 'MISSING_TITLE');

  let slug = current.slug;
  if (input?.slug !== undefined && String(input.slug).trim() !== current.slug) {
    slug = uniqueCollectionSlug(input.slug, current.id);
  }

  run(
    'UPDATE collections SET slug = ?, title = ?, description = ?, cover = ?, sort_order = ?, updated_at = ? WHERE id = ?',
    [
      slug,
      title,
      input?.description !== undefined ? String(input.description).slice(0, 400) : current.description,
      input?.cover !== undefined ? String(input.cover).slice(0, 500) : current.cover,
      input?.sortOrder !== undefined ? Number(input.sortOrder) || 100 : current.sort_order,
      Date.now(),
      current.id,
    ],
  );
  return getCollection(String(current.id));
}

export function deleteCollection(id) {
  const info = run('DELETE FROM collections WHERE id = ?', [Number(id)]);
  if (!info.changes) throw notFound('合集不存在');
  return true;
}

/** 设置合集成员：整体覆盖，按传入顺序写 position（事务保证要么全成要么全不动） */
export function setCollectionItems(collectionId, postIds) {
  const collection = get('SELECT id FROM collections WHERE id = ?', [Number(collectionId)]);
  if (!collection) throw notFound('合集不存在');
  if (!Array.isArray(postIds) || postIds.length > 500) throw bad('文章列表格式不正确', 'BAD_ITEMS');

  const ids = [...new Set(postIds.map((v) => String(v)))];
  for (const id of ids) {
    if (!get('SELECT id FROM posts WHERE id = ?', [id])) throw bad(`文章不存在：${id}`, 'POST_NOT_FOUND');
  }

  const now = Date.now();
  tx(() => {
    run('DELETE FROM collection_items WHERE collection_id = ?', [String(collection.id)]);
    ids.forEach((postId, index) => {
      run('INSERT INTO collection_items (collection_id, post_id, position, added_at) VALUES (?, ?, ?, ?)', [
        String(collection.id),
        postId,
        index,
        now,
      ]);
    });
  });
  return collectionPosts(String(collection.id));
}

/** 把文章加入/移出合集（点击式操作） */
export function toggleCollectionItem(collectionId, postId) {
  const collection = get('SELECT id FROM collections WHERE id = ?', [Number(collectionId)]);
  if (!collection) throw notFound('合集不存在');
  const existing = get('SELECT 1 AS x FROM collection_items WHERE collection_id = ? AND post_id = ?', [
    String(collection.id),
    String(postId),
  ]);
  // 全用 EXISTS 语义判断，避免 (collection_id, post_id) 唯一约束在重复点击时报错
  if (existing) {
    run('DELETE FROM collection_items WHERE collection_id = ? AND post_id = ?', [String(collection.id), String(postId)]);
    return { added: false };
  }
  const { next } = get('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM collection_items WHERE collection_id = ?', [
    String(collection.id),
  ]);
  try {
    run('INSERT INTO collection_items (collection_id, post_id, position, added_at) VALUES (?, ?, ?, ?)', [
      String(collection.id),
      String(postId),
      next,
      Date.now(),
    ]);
    return { added: true };
  } catch (err) {
    // 并发点击导致的唯一约束冲突：视为已加入，不报错
    if (String(err.message).includes('UNIQUE')) return { added: true };
    throw err;
  }
}

function uniqueCollectionSlug(desired, ignoreId = null) {
  const base =
    String(desired || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `collection-${randomId().slice(0, 6)}`;
  const latin = /^[a-z0-9-]+$/.test(base) ? base : `collection-${randomId().slice(0, 6)}`;
  let slug = latin;
  let i = 1;
  while (get('SELECT id FROM collections WHERE slug = ? AND id IS NOT ?', [slug, ignoreId])) {
    slug = `${latin}-${++i}`;
  }
  return slug;
}

/** 文章自带的自定义字段：按类型的字段定义清洗，未知字段丢弃 */
export function normalizeFieldValues(type, input) {
  if (!type || !type.fields?.length) return {};
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const field of type.fields) {
    const raw = source[field.key];
    if (raw === undefined || raw === null || raw === '') continue;
    switch (field.kind) {
      case 'number': {
        const n = Number(raw);
        if (Number.isFinite(n)) out[field.key] = n;
        break;
      }
      case 'boolean':
        out[field.key] = raw === true || raw === 'true' || raw === 1;
        break;
      case 'tags':
        out[field.key] = (Array.isArray(raw) ? raw : String(raw).split(/[,，\s]+/))
          .map((t) => String(t).trim().slice(0, 30))
          .filter(Boolean)
          .slice(0, 10);
        break;
      case 'date': {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) out[field.key] = d.toISOString().slice(0, 10);
        break;
      }
      case 'select':
        if (field.options?.includes(String(raw))) out[field.key] = String(raw);
        break;
      case 'url': {
        try {
          const url = new URL(String(raw));
          if (url.protocol === 'https:' || url.protocol === 'http:') out[field.key] = url.toString().slice(0, 500);
        } catch {
          /* 丢弃非法 URL */
        }
        break;
      }
      default:
        out[field.key] = String(raw).slice(0, field.kind === 'textarea' || field.kind === 'markdown' ? 5000 : 300);
    }
  }
  return out;
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
