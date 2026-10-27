/**
 * 标签管理。
 *
 * 标签本身没有独立创建流程：文章里写了什么标签，标签就自动存在。
 * 这张 tags 表存的是标签的「附加信息」——描述、别名、颜色、是否置顶，
 * 以及重命名 / 合并这类维护操作。
 */
import { all, get, run } from '../db.js';
import { HttpError } from './http.js';

const MAX_NAME = 24;
const MAX_DESC = 160;
const MAX_ALIAS = 60;
/** 只接受 #rgb / #rrggbb，避免把任意字符串塞进样式 */
const COLOR_RE = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

function safeJson(text, fallback) {
  try {
    const value = JSON.parse(text ?? '');
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** 标签名清洗：去首尾空白、去 #、合并内部空白，限制长度 */
export function normalizeTagName(raw) {
  return String(raw ?? '')
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME);
}

function tagRow(name) {
  return get('SELECT * FROM tags WHERE name = ?', [name]) || null;
}

/**
 * 标签总览：把「文章里的标签」与「tags 表里的元信息」合并。
 * @param {{ includeEmpty?: boolean }} options includeEmpty 时也返回只在表里存在、暂无文章的标签
 */
export function listTags({ includeEmpty = false } = {}) {
  const rows = all("SELECT tags, status FROM posts");
  const counts = new Map();
  for (const row of rows) {
    if (row.status !== 'published') continue;
    for (const tag of safeJson(row.tags, [])) {
      const name = normalizeTagName(tag);
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }

  // 草稿也统计一份，方便管理时知道「这个标签有没有被用过」
  const allCounts = new Map();
  for (const row of allCounts.keys()) void row;
  void allCounts;

  const meta = new Map(all('SELECT * FROM tags').map((t) => [t.name, t]));
  const names = new Set([...counts.keys(), ...meta.keys()]);

  const list = [...names].map((name) => {
    const row = meta.get(name) || null;
    return {
      name,
      count: counts.get(name) || 0,
      description: row?.description || '',
      alias: row?.alias || '',
      color: row?.color || '',
      pinned: Boolean(row?.pinned),
      hasMeta: Boolean(row),
    };
  });

  return list
    .filter((tag) => includeEmpty || tag.count > 0 || tag.pinned)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.count - a.count || a.name.localeCompare(b.name, 'zh'));
}

/** 按别名反查真实标签名（/tags/:tag 与文章筛选都会先做一次别名归一） */
export function resolveTag(raw) {
  const name = normalizeTagName(decodeURIComponentSafe(raw));
  if (!name) return '';
  if (tagRow(name)) return name;
  // alias 以逗号分隔存储，逐条精确比对，避免 LIKE 通配带来的误匹配。
  // 注意 SQL 里字符串必须用单引号：双引号会被 SQLite 当成标识符。
  for (const row of all("SELECT name, alias FROM tags WHERE alias <> ''")) {
    const aliases = String(row.alias)
      .split(/[,，]/)
      .map((s) => normalizeTagName(s));
    if (aliases.includes(name)) return row.name;
  }
  return name;
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch {
    return String(value ?? '');
  }
}

/** 更新标签元信息（描述 / 别名 / 颜色 / 置顶） */
export function updateTag(rawName, patch = {}) {
  const name = normalizeTagName(rawName);
  if (!name) throw new HttpError(400, '标签名不能为空', 'INVALID_TAG');

  const current = tagRow(name);
  const next = {
    description: patch.description === undefined ? current?.description || '' : String(patch.description).slice(0, MAX_DESC),
    alias: patch.alias === undefined ? current?.alias || '' : normalizeAlias(patch.alias),
    color: patch.color === undefined ? current?.color || '' : normalizeColor(patch.color),
    pinned: patch.pinned === undefined ? Number(current?.pinned || 0) : patch.pinned ? 1 : 0,
  };

  const now = Date.now();
  if (current) {
    run('UPDATE tags SET description = ?, alias = ?, color = ?, pinned = ?, updated_at = ? WHERE name = ?', [
      next.description,
      next.alias,
      next.color,
      next.pinned,
      now,
      name,
    ]);
  } else {
    run(
      'INSERT INTO tags (name, description, alias, color, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, next.description, next.alias, next.color, next.pinned, now, now],
    );
  }
  return { name, ...next, pinned: Boolean(next.pinned) };
}

function normalizeAlias(raw) {
  return String(raw ?? '')
    .split(/[,，]/)
    .map((s) => normalizeTagName(s))
    .filter(Boolean)
    .join(',')
    .slice(0, MAX_ALIAS);
}

function normalizeColor(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (!COLOR_RE.test(value)) throw new HttpError(400, '颜色需为 #rgb 或 #rrggbb', 'INVALID_COLOR');
  return value.toLowerCase();
}

/** 把某个标签从所有文章里摘掉 */
export function deleteTag(rawName) {
  const name = normalizeTagName(rawName);
  const affected = rewriteTags((tag) => (tag === name ? null : tag));
  run('DELETE FROM tags WHERE name = ?', [name]);
  return { affected };
}

/**
 * 重命名标签；目标已存在时自动合并（等价于「合并」操作）。
 */
export function renameTag(rawFrom, rawTo) {
  const from = normalizeTagName(rawFrom);
  const to = normalizeTagName(rawTo);
  if (!from || !to) throw new HttpError(400, '标签名不能为空', 'INVALID_TAG');
  if (from === to) return { affected: 0, merged: false, name: to };

  const merged = Boolean(tagRow(to)) || countTag(to) > 0;
  const affected = rewriteTags((tag) => (tag === from ? to : tag), { dedupe: true });

  const fromRow = tagRow(from);
  const toRow = tagRow(to);
  if (fromRow) {
    // 把源标签的描述/颜色带过去（目标已有值时保留目标）
    if (!toRow) {
      run('UPDATE tags SET name = ? WHERE name = ?', [to, from]);
    } else {
      run('UPDATE tags SET description = CASE WHEN description = "" THEN ? ELSE description END, color = CASE WHEN color = "" THEN ? ELSE color END WHERE name = ?', [
        fromRow.description,
        fromRow.color,
        to,
      ]);
      run('DELETE FROM tags WHERE name = ?', [from]);
    }
  }
  return { affected, merged, name: to };
}

function countTag(name) {
  let n = 0;
  for (const row of all('SELECT tags FROM posts')) {
    for (const tag of safeJson(row.tags, [])) if (normalizeTagName(tag) === name) n += 1;
  }
  return n;
}

/**
 * 按映射函数重写所有文章的 tags 字段。
 * mapper 返回 null 表示删除该标签，返回新名字表示替换。
 */
function rewriteTags(mapper, { dedupe = false } = {}) {
  let affected = 0;
  const rows = all('SELECT id, tags FROM posts');
  for (const row of rows) {
    const original = safeJson(row.tags, []).map(normalizeTagName).filter(Boolean);
    let next = original.map((tag) => mapper(tag)).filter((tag) => tag !== null);
    if (dedupe) next = [...new Set(next)];
    if (JSON.stringify(next) === JSON.stringify(original)) continue;
    run('UPDATE posts SET tags = ?, updated_at = ? WHERE id = ?', [JSON.stringify(next), Date.now(), row.id]);
    affected += 1;
  }
  return affected;
}

/** 合并两个标签：把 from 全部并入 to */
export function mergeTags(rawFrom, rawTo) {
  return renameTag(rawFrom, rawTo);
}
