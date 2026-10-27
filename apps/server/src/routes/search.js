import { Router } from 'express';
import { all, get, hasFullTextSearch } from '../db.js';
import { limiters } from '../lib/rate-limit.js';
import { serializePost, stripMarkdown } from '../lib/posts.js';

const router = Router();

/**
 * 文章搜索。
 *
 * 用 FTS5 + trigram 分词：中文没有空格，unicode61 分词器会把整句当一个词，
 * 导致「网页」搜不到「把网页做轻」；trigram 按 3 字符滑窗建索引，天然支持中文子串。
 * 若当前 SQLite 构建没有 FTS5，自动退回 LIKE。
 *
 * 支持筛选：类型（type）、合集（collection）、标签（tag）、排序（sort）。
 */

const SORTS = {
  relevance: 'rank',
  latest: 'COALESCE(p.published_at, p.created_at) DESC',
  popular: 'p.like_count DESC, p.views DESC',
  views: 'p.views DESC',
};

/** 把用户输入转成安全的 FTS 查询：每个词加引号，避免 AND/OR/NEAR 等语法注入 */
function toMatchQuery(raw) {
  const words = String(raw || '')
    .replace(/["'()*:^]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!words.length) return '';
  return words.map((w) => `"${w.replace(/"/g, '')}"`).join(' AND ');
}

const escapeLike = (s) => String(s).replace(/[\\%_]/g, '\\$&');

/** 生成带 <mark> 的高亮片段，输出前做 HTML 转义 */
function snippet(text, terms, { length = 150 } = {}) {
  const plain = stripMarkdown(text || '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const lower = plain.toLowerCase();
  let hit = -1;
  let hitTerm = '';
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx >= 0 && (hit < 0 || idx < hit)) {
      hit = idx;
      hitTerm = term;
    }
  }
  const start = hit < 0 ? 0 : Math.max(0, hit - Math.floor(length / 3));
  let out = plain.slice(start, start + length);
  if (start > 0) out = `…${out}`;
  if (start + length < plain.length) out = `${out}…`;
  return highlight(out, terms);
}

function highlight(text, terms) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  if (!terms.length) return escaped;
  const pattern = terms
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!pattern) return escaped;
  return escaped.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

function termList(raw) {
  return String(raw || '')
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/["'()*:^]/g, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

router.get('/search', limiters.read, (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const pageSize = Math.min(30, Math.max(1, Number(req.query.pageSize) || 10));
  const sortKey = Object.hasOwn(SORTS, req.query.sort) ? req.query.sort : 'relevance';
  const typeKey = req.query.type ? String(req.query.type).slice(0, 40) : '';
  const collectionSlug = req.query.collection ? String(req.query.collection).slice(0, 60) : '';
  const tag = req.query.tag ? String(req.query.tag).slice(0, 40) : '';

  const terms = termList(q);
  const filters = ["p.status = 'published'"];
  const filterParams = [];

  if (typeKey) {
    const type = get('SELECT id FROM post_types WHERE key = ? OR route = ?', [typeKey, typeKey]);
    if (!type) return res.json({ items: [], total: 0, page, pageSize, hasMore: false, q, engine: 'none' });
    filters.push('p.type_id = ?');
    filterParams.push(type.id);
  }
  if (collectionSlug) {
    filters.push(
      'p.id IN (SELECT ci.post_id FROM collection_items ci JOIN collections c ON c.id = ci.collection_id WHERE c.slug = ?)',
    );
    filterParams.push(collectionSlug);
  }
  if (tag) {
    filters.push('p.tags LIKE ?');
    filterParams.push(`%"${escapeLike(tag)}"%`);
  }

  // trigram 按 3 字符滑窗建索引：少于 3 个字符的词（如「网页」「播客」）永远匹配不到，
  // 因此短词一律走 LIKE，长词走 FTS 以获得 bm25 相关性排序。
  const useFts = hasFullTextSearch() && terms.length > 0 && terms.every((t) => [...t].length >= 3);
  const matchQuery = toMatchQuery(q);
  const orderBy = useFts && sortKey === 'relevance' ? 'rank ASC' : SORTS[sortKey];

  let rows = [];
  let total = 0;
  try {
    if (useFts) {
      const where = [...filters, 'posts_fts MATCH ?'].join(' AND ');
      total = get(
        `SELECT COUNT(*) AS n FROM posts p JOIN posts_fts f ON f.rowid = p.rowid WHERE ${where}`,
        [...filterParams, matchQuery],
      ).n;
      rows = all(
        `SELECT p.*, bm25(posts_fts) AS rank FROM posts p
         JOIN posts_fts f ON f.rowid = p.rowid
         WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...filterParams, matchQuery, pageSize, (page - 1) * pageSize],
      );
    } else {
      if (terms.length) {
        filters.push('(p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)');
        const like = `%${escapeLike(q)}%`;
        filterParams.push(like, like, like, like);
      }
      const where = filters.join(' AND ');
      total = get(`SELECT COUNT(*) AS n FROM posts p WHERE ${where}`, filterParams).n;
      rows = all(
        `SELECT p.* FROM posts p WHERE ${where} ORDER BY ${SORTS[sortKey] === 'rank' ? SORTS.latest : SORTS[sortKey]} LIMIT ? OFFSET ?`,
        [...filterParams, pageSize, (page - 1) * pageSize],
      );
    }
  } catch (err) {
    console.warn('[search] 查询失败，退回 LIKE', err.message);
    return fallbackLike(res, { q, terms, page, pageSize, filters, filterParams, sortKey });
  }

  res.setHeader('Cache-Control', 'public, max-age=20');
  res.json({
    q,
    engine: useFts ? 'fts5-trigram' : 'like',
    terms,    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    items: rows.map((row) => ({
      ...serializePost(row),
      snippet: snippet(row.content || row.excerpt || '', terms),
      titleHtml: highlight(row.title, terms),
    })),
  });
});

function fallbackLike(res, { q, terms, page, pageSize, filters, filterParams, sortKey }) {
  const local = [...filters];
  const params = [...filterParams];
  if (q) {
    local.push('(p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)');
    const like = `%${escapeLike(q)}%`;
    params.push(like, like, like, like);
  }
  const where = local.join(' AND ');
  const total = get(`SELECT COUNT(*) AS n FROM posts p WHERE ${where}`, params).n;
  const rows = all(
    `SELECT p.* FROM posts p WHERE ${where} ORDER BY ${SORTS[sortKey] === 'rank' ? SORTS.latest : SORTS[sortKey]} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  res.json({
    q,
    engine: 'like',
    terms,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    items: rows.map((row) => ({
      ...serializePost(row),
      snippet: snippet(row.content || row.excerpt || '', terms),
      titleHtml: highlight(row.title, terms),
    })),
  });
}

/** 搜索建议：标题前缀 + 常用标签，用于输入时的下拉 */
router.get('/search/suggest', limiters.read, (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 40);
  if (!q) return res.json({ titles: [], tags: [] });
  const rows = all(
    "SELECT slug, title FROM posts WHERE status = 'published' AND title LIKE ? ORDER BY published_at DESC LIMIT 6",
    [`%${escapeLike(q)}%`],
  );
  const tagRows = all(
    "SELECT tags FROM posts WHERE status = 'published' AND tags LIKE ? LIMIT 40",
    [`%${escapeLike(q)}%`],
  );
  const tags = [...new Set(tagRows.flatMap((r) => JSON.parse(r.tags || '[]')).filter((t) => t.includes(q)))].slice(0, 6);
  res.json({ titles: rows, tags });
});

export default router;
