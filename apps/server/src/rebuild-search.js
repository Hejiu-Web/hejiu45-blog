/** 把当前库里所有已发布文章重写一遍全文索引（升级或索引损坏时用） */
import path from 'node:path';
import { openDb, all, rebuildSearchIndex, hasFullTextSearch } from './db.js';
import { config } from './config.js';

await openDb(path.join(config.dataDir, 'blog.db'));

if (!hasFullTextSearch()) {
  console.log('当前 SQLite 不支持 FTS5，检索会自动使用 LIKE 兜底，无需重建。');
  process.exit(0);
}

const rows = all("SELECT id, slug FROM posts WHERE status = 'published'");
const n = rebuildSearchIndex();
console.log(`已重建全文索引：${n} 篇（数据库中共 ${rows.length} 篇已发布文章）`);
process.exit(0);
