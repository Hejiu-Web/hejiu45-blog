/**
 * 两个 SQLite 驱动：better-sqlite3（原生，快）或 Node 22.5+ 内置 node:sqlite。
 * 二者 API 接近，这里统一成 exec / all / get / run / tx 五个方法，
 * 业务代码不需要关心底层用的是哪个驱动。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** 依赖（可选）：better-sqlite3 缺失或原生编译失败时，自动退回 Node 内置的 node:sqlite */
export function resolveDriver() {
  if (process.env.DB_DRIVER === 'node') return 'node:sqlite';
  try {
    require('better-sqlite3');
    return 'better-sqlite3';
  } catch {
    return 'node:sqlite';
  }
}

function openBetterSqlite(file) {
  const Database = require('better-sqlite3');
  const raw = new Database(file);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  return {
    driver: 'better-sqlite3',
    exec: (sql) => raw.exec(sql),
    all: (sql, params = []) => raw.prepare(sql).all(...params),
    get: (sql, params = []) => raw.prepare(sql).get(...params),
    run: (sql, params = []) => raw.prepare(sql).run(...params),
    tx: (fn) => raw.transaction(fn)(),
    close: () => raw.close(),
  };
}

async function openNodeSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA foreign_keys = ON;');
  return {
    driver: 'node:sqlite',
    exec: (sql) => raw.exec(sql),
    all: (sql, params = []) => raw.prepare(sql).all(...params),
    get: (sql, params = []) => raw.prepare(sql).get(...params),
    run: (sql, params = []) => raw.prepare(sql).run(...params),
    tx: (fn) => {
      raw.exec('BEGIN');
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => raw.close(),
  };
}

let db = null;

export async function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (resolveDriver() === 'better-sqlite3') {
    try {
      db = openBetterSqlite(file);
    } catch (err) {
      console.warn(`[db] better-sqlite3 打开失败（${err.message}），改用 node:sqlite`);
      db = null;
    }
  }
  if (!db) {
    try {
      db = await openNodeSqlite(file);
    } catch (err) {
      throw new Error(`数据库初始化失败：better-sqlite3 与 node:sqlite 都不可用（${err.message}）`);
    }
  }
  console.log(`[db] 驱动 ${db.driver} · ${file}`);
  migrate();
  return db;
}

export function getDb() {
  if (!db) throw new Error('数据库尚未初始化');
  return db;
}

export const all = (sql, params) => getDb().all(sql, params);
export const get = (sql, params) => getDb().get(sql, params);
export const run = (sql, params) => getDb().run(sql, params);
export const exec = (sql) => getDb().exec(sql);
export const tx = (fn) => getDb().tx(fn);

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      display_name  TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'reader',
      avatar        TEXT NOT NULL DEFAULT '',
      source        TEXT NOT NULL DEFAULT 'local',
      disabled      INTEGER NOT NULL DEFAULT 0,
      last_login_at INTEGER,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf         TEXT NOT NULL,
      ua           TEXT NOT NULL DEFAULT '',
      ip_hash      TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT 'password',
      created_at   INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL,
      revoked_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, revoked_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS wechat_identities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      channel     TEXT NOT NULL,
      app_id      TEXT NOT NULL,
      openid      TEXT NOT NULL,
      unionid     TEXT,
      nickname    TEXT NOT NULL DEFAULT '',
      avatar      TEXT NOT NULL DEFAULT '',
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      UNIQUE (channel, app_id, openid)
    );
    CREATE INDEX IF NOT EXISTS idx_wechat_user ON wechat_identities(user_id);

    CREATE TABLE IF NOT EXISTS wechat_login_states (
      state         TEXT PRIMARY KEY,
      browser_nonce TEXT NOT NULL DEFAULT '',
      redirect_to   TEXT NOT NULL DEFAULT '/',
      created_at    INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL,
      used_at       INTEGER
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      key        TEXT PRIMARY KEY,
      failures   INTEGER NOT NULL DEFAULT 0,
      first_at   INTEGER NOT NULL,
      locked_until INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      at         INTEGER NOT NULL,
      event      TEXT NOT NULL,
      user_id    TEXT,
      ip_hash    TEXT NOT NULL DEFAULT '',
      detail     TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at DESC);

    CREATE TABLE IF NOT EXISTS posts (
      id              TEXT PRIMARY KEY,
      slug            TEXT NOT NULL UNIQUE,
      title           TEXT NOT NULL,
      excerpt         TEXT NOT NULL DEFAULT '',
      content         TEXT NOT NULL DEFAULT '',
      cover           TEXT NOT NULL DEFAULT '',
      tags            TEXT NOT NULL DEFAULT '[]',
      status          TEXT NOT NULL DEFAULT 'draft',
      featured        INTEGER NOT NULL DEFAULT 0,
      reading_minutes INTEGER NOT NULL DEFAULT 1,
      views           INTEGER NOT NULL DEFAULT 0,
      like_count      INTEGER NOT NULL DEFAULT 0,
      author_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
      published_at    INTEGER,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, published_at DESC);

    CREATE TABLE IF NOT EXISTS reactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      visitor    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (post_id, kind, visitor)
    );

    CREATE TABLE IF NOT EXISTS post_views (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      bucket     TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (post_id, bucket)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    /* ───────────────────── 自定义内容模型 ───────────────────── */

    -- 文章类型：作者可自定义（长文、笔记、视频、相册…），带独立路由前缀与字段定义
    CREATE TABLE IF NOT EXISTS post_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon        TEXT NOT NULL DEFAULT 'bookmark',
      route       TEXT NOT NULL DEFAULT 'posts',
      fields      TEXT NOT NULL DEFAULT '[]',
      sort_order  INTEGER NOT NULL DEFAULT 100,
      builtin     INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    -- 合集：把同一主题的文章组织成有顺序、可翻阅的一组
    CREATE TABLE IF NOT EXISTS collections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover       TEXT NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 100,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_items (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      position      INTEGER NOT NULL DEFAULT 0,
      added_at      INTEGER NOT NULL,
      PRIMARY KEY (collection_id, post_id)
    );
    CREATE INDEX IF NOT EXISTS idx_collection_items_post ON collection_items(post_id);

    -- 标签：文章的 tags 字段仍是 JSON，这张表只存「标签本身的元信息」
    -- 描述、别名、颜色、置顶。标签本身仍随文章自动出现，不需要预先创建。
    CREATE TABLE IF NOT EXISTS tags (
      name        TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      alias       TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '',
      pinned      INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tags_pinned ON tags(pinned);

    -- 作品集：指向站点外部的成果（npm 包、GitHub 仓库、线上产品等）
    -- 与文章的区别是不需要正文，主要是链接 + 简介 + 技术栈
    CREATE TABLE IF NOT EXISTS works (
      id          TEXT PRIMARY KEY,
      slug        TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      summary     TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      url         TEXT NOT NULL DEFAULT '',
      repo        TEXT NOT NULL DEFAULT '',
      cover       TEXT NOT NULL DEFAULT '',
      kind        TEXT NOT NULL DEFAULT 'project',
      tech        TEXT NOT NULL DEFAULT '[]',
      status      TEXT NOT NULL DEFAULT 'active',
      featured    INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 100,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_works_order ON works(sort_order, created_at);

    -- 媒体库：图片、视频、音频、附件，统一元数据
    CREATE TABLE IF NOT EXISTS media (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
      kind        TEXT NOT NULL,
      mime        TEXT NOT NULL,
      size        INTEGER NOT NULL DEFAULT 0,
      width       INTEGER,
      height      INTEGER,
      duration    REAL,
      variants    TEXT NOT NULL DEFAULT '{}',
      url         TEXT NOT NULL,
      original    TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_media_kind ON media(kind, created_at DESC);
  `);

  // 旧版本建的表缺少新列时补上（SQLite 没有 IF NOT EXISTS 的 ADD COLUMN）
  addColumnIfMissing('users', 'avatar', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('users', 'source', "TEXT NOT NULL DEFAULT 'local'");
  addColumnIfMissing('users', 'disabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('users', 'last_login_at', 'INTEGER');
  addColumnIfMissing('users', 'bio', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('wechat_login_states', 'browser_nonce', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('posts', 'type_id', 'INTEGER');
  addColumnIfMissing('posts', 'fields', "TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing('posts', 'media', "TEXT NOT NULL DEFAULT '[]'");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type_id, status, published_at DESC);
  `);

  setupSearch();
}

/**
 * 全文检索。
 *
 * 中文没有空格分词，SQLite 自带的 unicode61 分词器会把整句当成一个词，
 * 搜「网页」是搜不到「把网页做轻」的。这里用 trigram 分词器（按 3 字符滑窗切分），
 * 天然支持中文子串检索；若当前 SQLite 构建不支持 FTS5，则自动退回 LIKE 方案。
 */
const SEARCH_TABLE = 'posts_fts';

function setupSearch() {
  try {
    getDb().exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_TABLE}
      USING fts5(title, excerpt, body, tags, tokenize='trigram');
    `);
    searchAvailable = true;
  } catch {
    searchAvailable = false;
    console.warn('[search] 当前 SQLite 不支持 FTS5，已退回 LIKE 模糊匹配');
  }
}

let searchAvailable = false;
export const hasFullTextSearch = () => searchAvailable;

/** 重建某篇文章的检索索引（发布、更新、下线时调用）。索引 rowid 与 posts.rowid 一一对应。 */
export function indexPost(row) {
  if (!searchAvailable) return;
  try {
    const db = getDb();
    const rid = row?.rowid || db.get('SELECT rowid FROM posts WHERE id = ?', [row?.id])?.rowid;
    if (!rid) return;
    db.run(`DELETE FROM ${SEARCH_TABLE} WHERE rowid = ?`, [rid]);
    // 只索引已发布文章：草稿与下线文章不应出现在搜索结果里
    if (row && row.status === 'published') {
      db.run(`INSERT INTO ${SEARCH_TABLE} (rowid, title, excerpt, body, tags) VALUES (?, ?, ?, ?, ?)`, [
        rid,
        row.title || '',
        row.excerpt || '',
        row.content || '',
        row.tags || '[]',
      ]);
    }
  } catch (err) {
    console.warn('[search] 索引更新失败', err.message);
  }
}

/** 全量重建索引（站点初始化、升级后修复用），返回写入的条数 */
export function rebuildSearchIndex() {
  if (!searchAvailable) return 0;
  const db = getDb();
  db.run(`DELETE FROM ${SEARCH_TABLE}`);
  const rows = db.all("SELECT rowid, title, excerpt, content, tags FROM posts WHERE status = 'published'");
  let written = 0;
  for (const r of rows) {
    db.run(`INSERT INTO ${SEARCH_TABLE} (rowid, title, excerpt, body, tags) VALUES (?, ?, ?, ?, ?)`, [
      r.rowid,
      r.title || '',
      r.excerpt || '',
      r.content || '',
      r.tags || '[]',
    ]);
    written += 1;
  }
  return written;
}

function addColumnIfMissing(table, column, ddl) {
  const columns = getDb().all(`PRAGMA table_info(${table})`);
  if (columns.some((c) => c.name === column)) return;
  getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
