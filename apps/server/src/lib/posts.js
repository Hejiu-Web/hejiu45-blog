import { all, get, run } from '../db.js';
import { randomId } from '../lib/crypto.js';

const WORDS_PER_MINUTE = 350; // 中文 + 英文混排的粗略阅读速度

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 生成对中文标题也友好的 slug：优先用英文/数字，中文则回退到短 hash */
export function slugify(input) {
  const base = String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const hasLatin = /[a-z0-9]/.test(base);
  if (!hasLatin || /^[\u4e00-\u9fa5-]+$/.test(base)) {
    const tail = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
    return `post-${tail}`;
  }
  return base;
}

export function uniqueSlug(desired, ignoreId = null) {
  let slug = slugify(desired) || `post-${randomId().slice(0, 6)}`;
  let suffix = 1;
  const exists = (s) =>
    get('SELECT id FROM posts WHERE slug = ? AND id IS NOT ? LIMIT 1', [s, ignoreId]);
  while (exists(slug)) {
    slug = `${slugify(desired)}-${++suffix}`;
  }
  return slug;
}

/** 从 Markdown 中剥离语法，提取纯文本用于摘要 / 阅读时长 */
export function stripMarkdown(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/^\s*[-|:]+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function readingMinutes(md) {
  const text = stripMarkdown(md);
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]+/g) || []).length;
  return Math.max(1, Math.round((cjk + latin * 1.8) / WORDS_PER_MINUTE));
}

export function autoExcerpt(md, length = 120) {
  const text = stripMarkdown(md);
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

export function parseTags(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || '')
        .split(/[,，\s]+/)
        .map((t) => t.trim());
  return [...new Set(list.map((t) => t.trim()).filter(Boolean))].slice(0, 8);
}

export function serializePost(row, { full = false } = {}) {
  if (!row) return null;
  const post = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    cover: row.cover,
    tags: safeJson(row.tags, []),
    status: row.status,
    featured: Boolean(row.featured),
    readingMinutes: row.reading_minutes,
    views: row.views,
    likeCount: row.like_count,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    typeId: row.type_id ?? null,
    fields: safeJson(row.fields, {}),
    media: safeJson(row.media, []),
  };
  if (full) post.content = row.content;
  return post;
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * 标签总览：委托给 tags.js，统一带上描述 / 别名 / 颜色 / 置顶等元信息，
 * 避免这里和标签管理各维护一套统计逻辑。
 */
export { listTags, resolveTag, normalizeTagName } from './tags.js';

export function bumpViews(postId, visitor) {
  const bucket = `${visitor}:${new Date().toISOString().slice(0, 10)}`;
  try {
    run('INSERT INTO post_views (post_id, bucket, created_at) VALUES (?, ?, ?)', [postId, bucket, Date.now()]);
    run('UPDATE posts SET views = views + 1 WHERE id = ?', [postId]);
    return true;
  } catch {
    return false; // UNIQUE 约束命中：同一天同一访客只计一次
  }
}
