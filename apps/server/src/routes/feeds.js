import { Router } from 'express';
import { all } from '../db.js';
import { config, site } from '../config.js';
import { limiters } from '../lib/rate-limit.js';

const router = Router();

/** XML 转义：连同控制字符一起清理，避免破坏 RSS 结构 */
const esc = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const escUrl = (s) => encodeURI(String(s)).replace(/&/g, '&amp;');

router.get('/rss.xml', limiters.read, (_req, res) => {
  const rows = all(
    "SELECT slug, title, excerpt, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 20",
  );
  const items = rows
    .map(
      (row) => `    <item>
      <title>${esc(row.title)}</title>
      <link>${escUrl(`${config.siteUrl}/post/${row.slug}`)}</link>
      <guid isPermaLink="true">${escUrl(`${config.siteUrl}/post/${row.slug}`)}</guid>
      <pubDate>${new Date(row.published_at || Date.now()).toUTCString()}</pubDate>
      <description>${esc(row.excerpt)}</description>
    </item>`,
    )
    .join('\n');

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(site.name)}</title>
    <link>${config.siteUrl}</link>
    <description>${esc(site.description)}</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>`);
});

router.get('/sitemap.xml', limiters.read, (_req, res) => {
  const rows = all("SELECT slug, updated_at FROM posts WHERE status = 'published'");
  const urls = [
    `  <url><loc>${escUrl(`${config.siteUrl}/`)}</loc></url>`,
    `  <url><loc>${escUrl(`${config.siteUrl}/archive`)}</loc></url>`,
    ...rows.map(
      (row) =>
        `  <url><loc>${escUrl(`${config.siteUrl}/post/${row.slug}`)}</loc><lastmod>${new Date(
          row.updated_at,
        ).toISOString()}</lastmod></url>`,
    ),
  ].join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
});

export default router;
