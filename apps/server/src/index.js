import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, auditConfig } from './config.js';
import { openDb, resolveDriver } from './db.js';
import { ensureAdmin, seedDefaults, seedIfEmpty } from './seed.js';
import { loadExtensions } from './extensions.js';
import { errorHandler, apiNotFound } from './lib/http.js';
import { attachAuth, requireCsrf } from './middleware/auth.js';
import { ipDenylist, securityHeaders, waf } from './middleware/security.js';
import { limiters } from './lib/rate-limit.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import reactionRoutes from './routes/reactions.js';
import uploadRoutes from './routes/upload.js';
import mediaRoutes from './routes/media.js';
import contentRoutes from './routes/content.js';
import workRoutes from './routes/works.js';
import searchRoutes from './routes/search.js';
import feedRoutes from './routes/feeds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Node 侧没有 cookie-parser，这里自己解析（限制数量与长度，防止恶意 Cookie 撑爆内存） */
function cookieParser(req, _res, next) {
  const header = req.get('cookie');
  const cookies = Object.create(null);
  if (header && header.length < 8192) {
    let count = 0;
    for (const part of header.split(';')) {
      if (++count > 30) break;
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      const name = part.slice(0, idx).trim();
      if (!name) continue;
      try {
        cookies[name] = decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        cookies[name] = '';
      }
    }
  }
  req.cookies = cookies;
  next();
}

export async function createApp() {
  const report = auditConfig();
  for (const warn of report.warnings) console.warn(`[安全提示] ${warn}`);
  for (const err of report.errors) console.error(`[配置错误] ${err}`);

  await openDb(path.join(config.dataDir, 'blog.db'));
  await ensureAdmin();
  await seedDefaults();
  await seedIfEmpty();

  // 二次开发：加载可选扩展文件（EXTENSIONS_FILE）
  const ext = await loadExtensions();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('etag', 'weak');

  // 1) 最外层：IP 黑名单与基础请求过滤
  app.use(ipDenylist);
  app.use(waf);
  app.use(securityHeaders);

  // 2) 会话解析（只读 Cookie，不做写操作）
  app.use(cookieParser);
  app.use(attachAuth);

  // 3) 上传接口接收二进制，必须挂在 JSON 解析之前
  app.use('/api', uploadRoutes);
  app.use('/api', mediaRoutes);

  // 4) JSON 解析：限制体积，避免超大请求体耗尽内存
  app.use(express.json({ limit: '1mb', strict: true }));

  // 5) 写操作统一校验 CSRF 与同源
  app.use('/api', requireCsrf);

  // 6) 静态资源：上传目录按扩展名给出明确的 Content-Type，其余一律当下载附件
  const ALLOWED_STATIC = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif',
    '.mp4', '.webm', '.mov',
    '.mp3', '.m4a', '.ogg', '.wav', '.flac', '.aac',
  ]);
  if (config.security.uploadsEnabled) {
    app.use(
      '/uploads',
      (req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // 音频文件通常较大，允许跨域读取（不影响同源播放）
        res.setHeader('Accept-Ranges', 'bytes');
        next();
      },
      express.static(config.uploadDir, {
        maxAge: '30d',
        immutable: true,
        dotfiles: 'deny',
        index: false,
        setHeaders(res, filePath) {
          // 只有白名单内的媒体扩展名按媒体类型返回；其他文件强制下载，杜绝把上传目录当脚本宿主
          if (!ALLOWED_STATIC.has(path.extname(filePath).toLowerCase())) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', 'attachment');
          }
        },
      }),
    );
  }
  app.use(
    '/covers',
    (req, res, next) => {
      // 封面是含中文的 SVG：必须声明 UTF-8，否则以 <img> 加载时会被当作 latin-1 解码，汉字变乱码
      const isSvg = req.path.endsWith('.svg');
      if (isSvg) res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      // SVG 体积很小，不缓存最省心；换成新封面后刷新即可生效
      if (isSvg) res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
      next();
    },
    express.static(config.coverDir, { maxAge: '7d', index: false, dotfiles: 'deny' }),
  );

  // 7) 业务路由
  app.get('/api/health', limiters.read, (_req, res) => res.json({ ok: true, at: Date.now() }));
  app.use('/api/auth', authRoutes);
  app.use('/api', contentRoutes);
app.use('/api', workRoutes);
  app.use('/api', searchRoutes);
  app.use('/api', postRoutes);
  app.use('/api', reactionRoutes);
  app.use('/api', apiNotFound); // API 的 404，绝不能落到 SPA 回退
  app.use(feedRoutes);

  // 扩展文件可以自带路由
  if (typeof ext?.routes === 'function') {
    try {
      ext.routes(app);
    } catch (err) {
      console.warn(`[ext] 自定义路由挂载失败：${err.message}`);
    }
  }

  // 8) 生产模式：托管前端构建产物 + SPA 回退
  if (fs.existsSync(config.webDist)) {
    app.use(
      express.static(config.webDist, {
        maxAge: '7d',
        index: false,
        dotfiles: 'deny',
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    // 前端路由（/posts、/collections 等）由类型与合集的 route 决定，这里统一回退
    app.get(/^(?!\/api|\/uploads|\/covers|\/rss\.xml|\/sitemap\.xml|\/media).*/, (req, res) => {
      // 带扩展名的请求（如 /package.json、/.git/config）一律 404，避免把源文件当页面吐出去
      if (path.extname(req.path)) {
        return res.status(404).type('text').send('Not Found');
      }
      res.sendFile(path.join(config.webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__dirname, 'index.js');

if (isMain) {
  // 使用内置 node:sqlite 时屏蔽它的实验性提示，保持启动输出干净
  if (resolveDriver() === 'node:sqlite') {
    const emit = process.emitWarning;
    process.emitWarning = (warning, ...args) => {
      if (String(warning?.message || warning).includes('SQLite')) return;
      return emit.call(process, warning, ...args);
    };
  }

  const app = await createApp();
  const server = app.listen(config.port, () => {
    console.log(`\n  鹤酒 Blog  →  http://localhost:${config.port}`);
    console.log(`  运行模式    →  ${config.isProd ? 'production' : 'development'}`);
    console.log(`  安全响应头  →  CSP / HSTS / X-Frame-Options 已启用\n`);
  });

  // 优雅退出：把已建立的连接处理完再退出，避免写库时被强杀
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log(`\n[${signal}] 正在关闭服务...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}
