/**
 * 示例作品：首次初始化时写入，方便访客看到作品集的样子。
 * 幂等：表里已有作品就跳过。
 */
import path from 'node:path';
import { openDb, get, run } from './db.js';
import { config } from './config.js';
import { randomId } from './lib/crypto.js';

const DEMO_WORKS = [
  {
    slug: 'hl-blog',
    title: 'hl-blog 轻量博客框架',
    summary: '一套 Vue 3 + Node.js 的自托管博客，首屏压进 60KB，支持自定义类型、合集与作品集。',
    description: [
      '从「把网页做轻」这个执念开始做的个人博客框架。',
      '',
      '技术上刻意做减法：Vue 3 负责界面，Node.js 负责接口，SQLite 负责存文章，没有任何 CDN 与第三方统计。编辑器直接接受 Markdown 源码，也可以拖入 .md 文件导入。',
      '',
      '后来陆续长出了自定义文章类型、合集、标签管理、作品集和背景音乐，但每加一个功能都在问同一个问题：它值得让首屏变慢吗？',
    ].join('\n'),
    url: 'https://www.npmjs.com/package/hl-blog',
    repo: 'https://github.com/hejiu45/hl-blog',
    kind: 'package',
    tech: ['Vue 3', 'Node.js', 'SQLite', 'Vite'],
    status: 'active',
    featured: 1,
    sort_order: 10,
  },
  {
    slug: 'motion-notes',
    title: '动效笔记',
    summary: '把界面动画的取舍写成可以翻的笔记：什么时候该动，什么时候该停。',
    description:
      '一个纯静态的小站点，收集我在做界面时反复用到的动效判断：入场应该解释结构，而不是制造噪音；超过 300ms 的过渡往往在替用户做决定。',
    url: '',
    repo: 'https://github.com/hejiu45/motion-notes',
    kind: 'project',
    tech: ['CSS', 'Vue 3'],
    status: 'active',
    featured: 0,
    sort_order: 20,
  },
];

export function seedWorks() {
  if (get('SELECT COUNT(*) AS n FROM works').n > 0) return 0;
  const now = Date.now();
  for (const w of DEMO_WORKS) {
    run(
      `INSERT INTO works (id, slug, title, summary, description, url, repo, cover, kind, tech, status, featured, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomId('w_'),
        w.slug,
        w.title,
        w.summary,
        w.description,
        w.url,
        w.repo,
        w.kind,
        JSON.stringify(w.tech),
        w.status,
        w.featured,
        w.sort_order,
        now,
        now,
      ],
    );
  }
  return DEMO_WORKS.length;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.dirname, 'seed-works.js');

if (isMain) {
  await openDb(path.join(config.dataDir, 'blog.db'));
  const n = seedWorks();
  console.log(n ? `[seed] 已写入 ${n} 个示例作品` : '[seed] 已有作品，跳过');
}
