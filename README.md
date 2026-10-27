# 鹤酒 · 轻量博客框架

**Vue 3 + JavaScript + Node.js + SQLite，一个文件就能跑起来，一台 VPS 就能上线。**

[![Node](https://img.shields.io/badge/Node-%E2%89%A522.5-3c873a)](https://nodejs.org)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883)](https://vuejs.org)
[![SQLite](https://img.shields.io/badge/SQLite-%E5%86%85%E7%BD%AE-003b57)](https://sqlite.org)
[![License](https://img.shields.io/badge/License-MIT-blue)](#许可证)

---

## 为什么又写一个博客？

市面上的博客方案，要么是「静态生成器，写作体验像在改代码」，要么是「WordPress，为了发一篇文章装了一整套生态」。

我想做一个**中间态**：

- 写作时像在用编辑器——左边写 Markdown，右边实时预览，粘贴 Word/网页会自动转 Markdown
- 部署时像在传一个静态站——打包 355KB，上传解压，一条命令重启
- 长期维护时不欠债——没有 Redis、没有消息队列、没有 ORM、没有 CDN

**首屏 JS 约 6KB（gzip）**。真的很快，因为真的没什么东西。

---

## 30 秒认识它

| | |
|---|---|
| 🪶 **极轻** | 单包工程，一个 SQLite 文件存所有数据。没有 Docker 也能跑 |
| ✍️ **好写** | Markdown 编辑 + 实时预览，支持粘贴富文本、拖入 `.md` 文件、粘贴截图自动上传 |
| 🎨 **能改** | 文章类型、自定义字段、合集、标签、作品集、首页文案、关于页——**全在后台改，不用碰代码** |
| 🔍 **能搜** | SQLite FTS5 + trigram 分词，中文子串搜索开箱可用（搜「网页」能找到「把网页做轻」） |
| 🔐 **够安全** | 服务端会话、CSRF、严格 CSP、登录限流、上传魔数校验，附 `pnpm audit:security` 自检 |
| 📱 **响应式** | 移动端完整可用，深浅双主题，`prefers-reduced-motion` 降级 |
| 🚀 **易部署** | 本地打包 → 上传 → 解压 → 重启。也有 Docker Compose 方案 |

---

## 5 分钟跑起来

```bash
# 1. 安装（需要 Node >= 22.5，pnpm）
pnpm install

# 2. 初始化：建库 + 作者账号 + 示例内容 + 搜索索引
pnpm seed

# 3. 开发模式（后端 :8787，前端 :5173 带热更新）
pnpm dev
```

打开 <http://localhost:5173>。

**默认账号**：`admin` / `admin123` —— 上线前务必在「账号安全」里改掉。

---

## 功能一览

### 内容

- **文章类型**：内置文章/随笔/视频/相册，可自建任意类型（播客、周报……），每种类型有自己的路由前缀（`/notes`、`/podcasts`）和**自定义字段**（文本、多行、Markdown、数字、日期、下拉、标签组、开关、链接）
- **合集**：把文章按主题串成有序的一组，卡片式多选，支持拖拽排序
- **标签**：跟着文章自动出现，管理页可加描述、设别名与颜色、置顶、重命名、合并、删除
- **作品集**：放 npm 包、GitHub 仓库、线上产品。卡片式展示，支持类型筛选、批量操作、复制
- **搜索**：中文子串命中、结果高亮、按类型/合集/标签过滤、四种排序

### 写作

- Markdown 编辑 + 实时预览，分栏可拖拽
- 直接粘贴 Markdown 源码——原样保留，不会被"聪明地"改写
- 从网页/Word 复制富文本——自动转成 Markdown
- 拖入或选择 `.md` 文件——解析 front matter（title/tags/slug/excerpt/cover）
- 粘贴截图自动上传并插入正文

### 媒体

- 图片：`sharp` 自动转正，生成 1600/800/320 三档 WebP
- 视频/音频：魔数校验容器格式，直接播放
- 头像：可上传，微信登录默认用微信头像
- 背景音乐：全站播放器，支持循环、音量、暂停记忆

### 设计

- 单色纸墨 + 单一朱砂强调色，靠版式而非装饰建立层次
- 系统 CJK 字体栈，零外部字体请求
- 深浅双主题（浅色/深色/跟随系统），首帧无闪烁
- 全局只有 4 个动效原语，尊重 `prefers-reduced-motion`

---

## 部署

两条路，选一条。

### 方式一：本地打包 + 手动上传（推荐）

```powershell
# 本地
pnpm release
```

产出 `release\hl-blog-<时间戳>.tar.gz`（约 355KB），并打印后续命令。

```bash
# 上传到服务器后
cd /srv/hl-blog
tar -xzf hl-blog-xxx.tar.gz
cp .env.example .env && nano .env     # 填 AUTH_SECRET 等
pnpm install --frozen-lockfile
pnpm build

# 启动
sudo cp deploy/hl-blog.service /etc/systemd/system/
sudo systemctl enable --now hl-blog
```

详细步骤见 **[deploy/RELEASE.md](deploy/RELEASE.md)** 与 **[deploy/SOURCE-DEPLOY.md](deploy/SOURCE-DEPLOY.md)**。

### 方式二：Docker Compose

```bash
cp .env.example .env && nano .env
docker compose up -d --build
```

见 **[DEPLOY.md](DEPLOY.md)**。

### 生产环境最低要求

```ini
NODE_ENV=production
SITE_URL=https://your-domain.com
AUTH_SECRET=<至少 32 位随机串>     # 不填会直接拒绝启动
ADMIN_PASSWORD=<你的强密码>
COOKIE_SECURE=true
TRUST_PROXY=1                      # 有 Nginx 反代时必须为 1
```

生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 上传大小：只改一处

单个文件上限由 `.env` 里**唯一一个**变量控制，默认 **500MB**：

```ini
UPLOAD_MAX_BYTES=500MB
```

支持带单位（`500MB`、`2GB`、`100mb`）或纯字节（`524288000`）。媒体库、封面、头像上传全部读它，不用分别配置。

改完重启，应用会在启动日志里**直接打印** Nginx 该写什么：

```
  上传上限    →  500MB（单个文件）
  Nginx 需同步 → client_max_body_size 500m;
```

把这一行抄进 Nginx 的 `server` 块即可。上传大文件还需要放宽超时（`deploy/nginx.conf` 里已经配好）：

```nginx
client_max_body_size 500m;

location /api/ {
    proxy_request_buffering off;   # 上传不缓冲，直接流式转发
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
}
```

---

## 部署避坑清单

这些都是真实踩过的坑，按顺序检查能省下几个小时。

### 环境

| 现象 | 原因 | 解决 |
|---|---|---|
| `Cannot find module 'node:sqlite'` | Node < 22.5 | 升级到 22.5+。这是**硬性要求**，不是配置问题 |
| `sharp` 安装失败 | 缺构建工具 | `apt install build-essential` / `dnf install gcc-c++ make python3` |
| `pnpm: command not found` | corepack 未启用 | `corepack enable`，或 `npm install -g pnpm` |
| pnpm 报 `libatomic.so.1: cannot open shared object file` | CentOS/RHEL 缺系统库 | `dnf install -y libatomic` |
| `npm install -g pnpm` 提示成功但命令找不到 | 旧 shim 抢占 PATH | 删除 `/usr/local/bin/pnpm` 后重装，或直接写包装脚本调 `pnpm.cjs`/`pnpm.mjs` |

### 打包与上传

| 现象 | 原因 | 解决 |
|---|---|---|
| 服务器上 `invalid ELF header` | 上传了 Windows 的 `node_modules` | **绝不要上传 `node_modules`**，里面是 win32 二进制，必须在服务器重新安装 |
| 解压后目录多套了一层 | 压缩包内已含根目录 | `tar -xzf` 后检查，必要时 `mv hl-blog/* .` |
| 解压后中文文件名乱码 | Windows zip 编码 | 用本项目的 `pnpm release`（生成 tar.gz，无此问题） |

### systemd

| 退出码 / 现象 | 原因 | 解决 |
|---|---|---|
| `status=217/USER` | `User=` 指定的用户不存在 | 确认 `User=root` 或 `www-data` 真实存在 |
| `status=226/NAMESPACE` | 保留了 `ProtectSystem=strict` 等沙箱选项 | 先删掉沙箱选项跑通，`.service` 里已给出精简版 |
| `Failed to load environment files: No such file` | `EnvironmentFile=` 路径写错 | 用 `pwd` 确认真实路径，`sed` 批量替换 |
| `Failed to run 'start' task: No such file` | `WorkingDirectory=` 写错 | 同上 |
| 启动后立刻退出但无错误 | `ExecStart` 指向旧版 node | `sed -i "s|ExecStart=.*|ExecStart=$(which node) apps/server/src/index.js|"` |
| 手册能跑、服务不行 | 环境变量不同 | `.env` 里的 `NODE_ENV` 会影响行为，手动测试时也要带上 |

### Nginx

| 现象 | 原因 | 解决 |
|---|---|---|
| 502 Bad Gateway | Nginx 连不上应用 | 先 `curl -I http://127.0.0.1:8787/api/health`，再查 SELinux：`setsebool -P httpd_can_network_connect 1` |
| 登录后立刻掉登录 | `COOKIE_SECURE=true` 但走 http，或反代没传 `X-Forwarded-Proto` | 确认 HTTPS，并在 `location` 里加 `proxy_set_header X-Forwarded-Proto https;` |
| 上传图片 413 | Nginx `client_max_body_size` 太小 | 调到 ≥ `UPLOAD_MAX_BYTES`（默认 500MB，写 `500m`）。改 `.env` 后重启，启动日志会打印该填的值 |
| 所有访客被当成同一 IP | `TRUST_PROXY` 没设 | 有反代时必须 `TRUST_PROXY=1`，否则登录限流会误伤所有人 |
| 页面 404 / 白屏 | 忘记 `pnpm build`，`apps/web/dist` 不存在 | 执行构建 |

### 证书

| 现象 | 原因 | 解决 |
|---|---|---|
| `SSL certificate problem: certificate has expired` | 证书过期 | 用 `openssl x509 -in xxx.pem -noout -dates` 确认 |
| 证书面板显示有效，但站点仍报过期 | 自动化任务申请成功但**没部署到 Nginx 路径** | 手动替换 pem/key，或用证书工具的「部署」功能指定路径 + 部署后 `nginx -s reload` |
| `nginx: [emerg] cannot load certificate key` | pem 与 key 不配对 | `openssl x509 -noout -modulus \| md5sum` 与 `openssl rsa -noout -modulus \| md5sum` 比对，必须一致 |
| 私钥权限错误 | 权限过宽 | `chmod 600 xxx.key` |

### 数据与登录

| 现象 | 原因 | 解决 |
|---|---|---|
| 改了 `.env` 里的 `ADMIN_PASSWORD` 但登录不了 | 该变量只在**首次建库**时生效 | 登录后走「账号安全 → 登录密码」修改 |
| 忘记密码 | — | 见下方「重置管理员密码」 |
| 登录提示「尝试次数过多」 | 连续失败 5 次锁定 15 分钟 | 等待，或清理 `login_attempts` 表 |

---

## 常用运维命令

### 重置管理员密码

```bash
cd /path/to/hl-blog

cat > /tmp/reset-pw.cjs <<'SCRIPT'
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const db = new DatabaseSync('data/blog.db');

const username = 'admin';          // 改成你的用户名
const newPassword = 'NewPass@2026!';

const N = 16384, r = 8, p = 1;
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(newPassword, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
const stored = ['scrypt', N, r, p, salt.toString('hex'), hash.toString('hex')].join('$');

db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(stored, username);
db.prepare('DELETE FROM login_attempts').run();   // 顺手清限流
console.log('已重置，新密码：', newPassword);
SCRIPT

node /tmp/reset-pw.cjs && rm -f /tmp/reset-pw.cjs
```

### 查看账号

```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/blog.db');
console.log(db.prepare('SELECT username, role, disabled FROM users').all());
"
```

### 备份与恢复

```bash
# 备份（数据 + 上传文件）
tar czf ~/blog-backup-$(date +%F).tar.gz -C /path/to/hl-blog/apps/server data uploads

# 恢复
systemctl stop hl-blog
tar xzf ~/blog-backup-2026-10-27.tar.gz -C /path/to/hl-blog/apps/server
systemctl start hl-blog
```

建议加 crontab：

```cron
0 3 * * * tar czf /backup/blog-$(date +\%F).tar.gz -C /srv/hl-blog/apps/server data uploads
```

### 安全自检

```bash
pnpm audit:security     # 35 项检查
```

### 重建搜索索引

```bash
pnpm rebuild:search
```

---

## 自定义：不改代码能改什么

打开 `/admin/settings`，改完立刻生效，不需要重新构建。

- **站点**：站点名、标语、描述
- **首页巨幕**：大标题（支持回车换行）、副标题、小标签、主次按钮文字
- **首页区块**：精选与最新区的标题和说明
- **关于页**：标题、介绍、坐标、正文（支持简单 Markdown）、数字条目、技能分组
- **背景音乐**：上传或外链、音量、循环、自动播放策略

## 二次开发入口

按从轻到重四层：

1. **后台配置**：类型、字段、合集、标签、作品、站点文案
2. **`apps/server/src/extensions.js`**：生命周期钩子（`onPostCreated`、`onUserLogin`、`onMediaUploaded` 等）
3. **`EXTENSIONS_FILE=./my-extensions.js`**：不改仓库，外部文件注入 `{ hooks, routes }`
4. **改源码**：`site.config.js` 放站点级配置，`routes/` 加接口，`views/` 改页面

---

## 技术栈

| 层 | 选型 | 为什么 |
|---|---|---|
| 前端 | Vue 3.5 + Vite 8 + Pinia + Tailwind v4 | 组合式 API 组织逻辑，Tailwind v4 的 CSS-first 省掉配置文件 |
| 后端 | Node.js 22 + Express 5 | 只用中间件，不引框架 |
| 数据 | SQLite（`node:sqlite` 内置，`better-sqlite3` 兜底） | 单文件、零运维、FTS5 全文搜索够用 |
| 图片 | sharp | 唯一的原生依赖，性能与体积的平衡点 |
| Markdown | marked + highlight.js + sanitize-html | 服务端渲染 + 白名单净化，前端不拼 HTML |

**为什么不用**：Redis（会话存 SQLite 足够）、ORM（SQL 直白可控）、JWT（服务端会话能真正吊销）、CDN（系统字体够用）。

---

## 项目结构

```
hl-blog/
├─ apps/
│  ├─ server/                     # Node.js 后端
│  │  ├─ src/index.js             # 入口：中间件顺序 + API + 生产静态托管
│  │  ├─ src/db.js                # 数据层：双驱动 + 迁移 + FTS5
│  │  ├─ src/config.js            # 配置与启动自检
│  │  ├─ src/site.config.js       # ★ 二次开发入口：站点配置
│  │  ├─ src/extensions.js        # ★ 二次开发入口：生命周期钩子
│  │  ├─ src/lib/                 # content-model / media / wechat / tags / works ...
│  │  ├─ src/routes/              # posts / content / search / media / auth / works / feeds
│  │  └─ data/                    # 数据库（已 gitignore）
│  └─ web/                        # Vue 3 前端
│     └─ src/                     # api / styles / components / stores / views
├─ deploy/                        # 部署脚本与模板
│  ├─ release.ps1 → scripts/      # 本地打包
│  ├─ remote-deploy.sh            # 服务器端部署
│  ├─ nginx.conf                  # Nginx 示例
│  └─ hl-blog.service             # systemd 单元
├─ scripts/release.ps1            # 本地一键打包
└─ package.json                   # 单包工程
```

---

## 常见问题

**能纯静态部署吗？**
不能。搜索、登录、评论式的点赞、后台写作都需要服务端。但构建产物只有几百 KB，一台 1 核 1G 的 VPS 足够。

**数据存在哪？**
`apps/server/data/blog.db` 一个文件，加上 `apps/server/uploads/`。备份这两个就够了。

**支持多作者吗？**
当前是单作者模型（一个 `author` 角色 + 任意读者）。多作者需要扩展 `users` 与权限中间件，钩子系统留了入口。

**有评论系统吗？**
没有。这是刻意的取舍——评论需要审核、反垃圾、通知，会显著增加复杂度。可以接第三方，或用 `extensions.js` 自己实现。

**为什么中文搜索要用 FTS5 trigram？**
SQLite 默认分词器按空格切词，中文整段被当成一个词，搜「网页」找不到「把网页做轻」。trigram 按 3 字符滑窗建索引，天然支持中文子串。少于 3 个字的词会退回 `LIKE`。

---

## 许可证

MIT。拿去用，改成你自己的样子。

---

<p align="center">
  <sub>写代码，也写生活里的留白。</sub>
</p>
