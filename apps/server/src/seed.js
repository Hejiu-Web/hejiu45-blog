import fs from 'node:fs';
import path from 'node:path';
import { openDb, get, run, indexPost, rebuildSearchIndex, hasFullTextSearch } from './db.js';
import { hashPassword, randomId } from './lib/crypto.js';
import { config } from './config.js';
import { readingMinutes, autoExcerpt, parseTags, uniqueSlug } from './lib/posts.js';
import { writeCover } from './lib/cover.js';
import { migrateDefaults, DEFAULT_SETTINGS } from './lib/site.js';

/** 首次启动或执行 seed 时创建作者账号 */
export async function ensureAdmin() {
  const existing = get('SELECT id FROM users LIMIT 1');
  if (existing) return;

  const id = randomId('u_');
  run(
    `INSERT INTO users (id, username, password_hash, display_name, role, avatar, source, created_at)
     VALUES (?, ?, ?, ?, 'author', '', 'local', ?)`,
    [id, config.adminUsername, hashPassword(config.adminPassword), config.adminUsername, Date.now()],
  );
  console.log(`[seed] 已创建作者账号 -> ${config.adminUsername} / ${config.adminPassword}`);
  if (config.adminPassword === 'admin123') {
    console.warn('[安全提示] 作者密码仍是默认值 admin123，请在 .env 中修改 ADMIN_PASSWORD 后重启');
  }
}

/**
 * 内置文章类型。
 * 作者可以在后台自由新增类型与字段，但这几个是框架自带的，
 * 保证新站开箱即有可用的内容结构。builtin=1 的类型不能删除。
 */
export const BUILTIN_TYPES = [
  {
    key: 'article',
    name: '文章',
    description: '默认类型，适合长文与教程',
    icon: 'edit',
    route: 'posts',
    sortOrder: 10,
    fields: [],
  },
  {
    key: 'note',
    name: '随笔',
    description: '短小的记录与碎片想法',
    icon: 'bookmark',
    route: 'notes',
    sortOrder: 20,
    fields: [
      { key: 'mood', label: '心情', kind: 'select', options: ['平静', '兴奋', '疲惫', '专注'], help: '' },
      { key: 'location', label: '地点', kind: 'text', help: '写下当时所在的地方' },
    ],
  },
  {
    key: 'video',
    name: '视频',
    description: '以视频为主的内容，可上传 mp4 / webm',
    icon: 'image',
    route: 'videos',
    sortOrder: 30,
    fields: [
      { key: 'duration', label: '时长（秒）', kind: 'number', help: '' },
      { key: 'software', label: '制作工具', kind: 'text', help: '例如 Final Cut / DaVinci' },
    ],
  },
  {
    key: 'gallery',
    name: '相册',
    description: '一组图片，适合记录拍摄或设计稿',
    icon: 'copy',
    route: 'galleries',
    sortOrder: 40,
    fields: [
      { key: 'shotOn', label: '拍摄设备', kind: 'text', help: '' },
      { key: 'place', label: '拍摄地点', kind: 'text', help: '' },
    ],
  },
];

/** 首次启动时补齐内置类型（幂等：已存在则跳过，不覆盖用户改动） */
export async function seedDefaults() {
  const now = Date.now();
  for (const type of BUILTIN_TYPES) {
    const exists = get('SELECT id FROM post_types WHERE key = ?', [type.key]);
    if (exists) continue;
    run(
      `INSERT INTO post_types (key, name, description, icon, route, fields, sort_order, builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [type.key, type.name, type.description, type.icon, type.route, JSON.stringify(type.fields), type.sortOrder, now, now],
    );
  }
  migrateSiteDefaults();
}

/**
 * 站点改名等默认值变更：把数据库里仍是旧默认值的设置迁移过来。
 * LEGACY_DEFAULTS 记录历史版本用过的默认值。
 */
const LEGACY_DEFAULTS = [{ siteName: '和久', authorName: '和久', rssTitle: '' }];

function migrateSiteDefaults() {
  for (const previous of LEGACY_DEFAULTS) {
    const changed = migrateDefaults(DEFAULT_SETTINGS, previous);
    if (changed) console.log(`[settings] 已把 ${changed} 项旧默认值迁移为新默认值`);
  }
}

function typeIdOf(key) {
  return get('SELECT id FROM post_types WHERE key = ?', [key])?.id ?? null;
}

/** 首次启动时若一篇文章都没有，写入示例内容，让站点开箱即有形态 */
export async function seedIfEmpty() {
  // 作品集与文章互不依赖，单独判断，保证只补缺不覆盖
  const { seedWorks } = await import('./seed-works.js');
  const worksAdded = seedWorks();
  if (worksAdded) console.log(`[seed] 已写入 ${worksAdded} 个示例作品`);

  if (get('SELECT id FROM posts LIMIT 1')) {
    // 已有数据的站点：确保搜索索引与内容同步（升级后第一次启动）
    ensureSearchIndex();
    return;
  }

  const { demoPosts } = await import('./demo.js');
  const author = get('SELECT id FROM users WHERE username = ?', [config.adminUsername]);
  const authorId = author?.id || get('SELECT id FROM users LIMIT 1')?.id || null;
  const now = Date.now();
  let offset = 0;
  const created = [];

  for (const post of demoPosts) {
    const id = randomId('p_');
    const published = now - offset;
    offset += 1000 * 60 * 60 * 34;
    const slug = uniqueSlug(post.slug);
    // 同时生成浅色与深色两版封面，暗色模式下用深色版，避免整块亮色纸片
    const cover = post.cover || writeCover(config.coverDir, { ...post, slug });
    if (!post.cover) writeCover(config.coverDir, { ...post, slug: `${slug}-dark`, theme: 'dark' });
    const typeId = typeIdOf(post.type || 'article');
    run(
      `INSERT INTO posts (id, slug, title, excerpt, content, cover, tags, status, featured,
        reading_minutes, views, like_count, author_id, type_id, fields, media, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)`,
      [
        id,
        slug,
        post.title,
        post.excerpt || autoExcerpt(post.content),
        post.content,
        cover,
        JSON.stringify(parseTags(post.tags)),
        post.featured ? 1 : 0,
        readingMinutes(post.content),
        post.views ?? 0,
        post.likes ?? 0,
        authorId,
        typeId,
        JSON.stringify(post.fields || {}),
        published,
        published,
        published,
      ],
    );
    created.push({ id, slug, title: post.title });
  }

  seedDemoCollections(created);
  console.log(`[seed] 已写入 ${created.length} 篇示例文章`);

  const indexed = rebuildSearchIndex();
  console.log(`[seed] 全文索引已建立（${hasFullTextSearch() ? 'FTS5 trigram' : 'LIKE 兜底'}），共 ${indexed} 篇`);
}

/** 示例合集：让「合集」开箱有内容可看 */
function seedDemoCollections(created) {
  if (get('SELECT id FROM collections LIMIT 1')) return;
  const now = Date.now();
  const groups = [
    {
      slug: 'craft',
      title: '一条更轻的工程路线',
      description: '从构建体积、状态管理到数据库选型，记录一次刻意的减法。',
      titles: ['把网页做轻：一次关于克制的实践', '用组合式函数替代半个状态库', '一个博客，SQLite 就够了'],
    },
    {
      slug: 'making',
      title: '界面里的小决定',
      description: '排版、动效与阅读体验，那些容易被忽略但决定质感的细节。',
      titles: ['中文排版里的留白，不只是间距', '动效的唯一职责：解释变化', '速度为读者而做'],
    },
  ];
  for (const [i, group] of groups.entries()) {
    const info = run(
      'INSERT INTO collections (slug, title, description, cover, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [group.slug, group.title, group.description, '', (i + 1) * 10, now, now],
    );
    const collectionId = info.lastInsertRowid;
    let position = 0;
    for (const title of group.titles) {
      const post = created.find((p) => p.title === title);
      if (!post) continue;
      run('INSERT INTO collection_items (collection_id, post_id, position, added_at) VALUES (?, ?, ?, ?)', [
        String(collectionId),
        post.id,
        position++,
        now,
      ]);
    }
  }
  console.log(`[seed] 已写入 ${groups.length} 个示例合集`);
}

/** 升级兼容：确保索引条数与已发布文章一致 */
function ensureSearchIndex() {
  if (!hasFullTextSearch()) return;
  const published = get("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'").n;
  const indexed = get('SELECT COUNT(*) AS n FROM posts_fts').n;
  if (published !== indexed) {
    const n = rebuildSearchIndex();
    console.log(`[search] 索引已重建，共 ${n} 篇`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.dirname, 'seed.js');

if (isMain) {
  await openDb(path.join(config.dataDir, 'blog.db'));
  const reset = process.argv.includes('--reset');
  // --keep-settings：重建示例内容但保留站点设置（站点名、首页文案、关于页等自定义内容）
  const keepSettings = process.argv.includes('--keep-settings');
  if (reset) {
    const tables = [
      'audit_logs',
      'login_attempts',
      'wechat_login_states',
      'wechat_identities',
      'sessions',
      'reactions',
      'post_views',
      'posts_fts',
      'collection_items',
      'collections',
      'posts',
      'post_types',
      'media',
      'users',
    ];
    // settings 表默认也清空；加 --keep-settings 时保留，避免重置示例数据把用户配置一起抹掉
    if (!keepSettings) tables.push('settings');
    for (const table of tables) {
      run(`DELETE FROM ${table}`);
    }
    for (const dir of [config.uploadDir]) {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`[seed] 已清空旧数据${keepSettings ? '（保留站点设置）' : ''}`);
  }
  await ensureAdmin();
  await seedDefaults();
  await seedIfEmpty();
  // 兜底：把所有已发布文章都写进索引，避免历史数据缺失
  const rows = (await import('./db.js')).all("SELECT * FROM posts WHERE status = 'published'");
  for (const row of rows) indexPost(row);
  console.log(`[seed] 完成，作者账号：${config.adminUsername} / ${config.adminPassword}`);
  process.exit(0);
}
