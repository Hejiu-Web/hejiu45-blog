# 部署与发布

本文档cover从零把博客跑在公网上的完整流程。**先读「上线前检查清单」**，那里任何一项没做都可能导致上线后出问题。

---

## 一、上线前检查清单

无论用哪种部署方式，这几项都必须先准备好。缺项时服务会**主动拒绝启动**或给出明确安全警告。

| 项目 | 说明 | 不做的后果 |
|---|---|---|
| `AUTH_SECRET` | ≥32 位随机串，`openssl rand -hex 32` 或 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成 | **生产模式直接拒绝启动** |
| `ADMIN_PASSWORD` | 改成你自己的强密码 | 仍是默认 `admin123`，等于站点人人可进 |
| `SITE_URL` | 完整 https 地址，如 `https://blog.example.com` | RSS / sitemap / 微信回调地址全错 |
| `NODE_ENV` | 设为 `production` | 不启用严格 CSP、Secure Cookie、HSTS |
| HTTPS 证书 | 域名必须能走 TLS | 微信登录不可用，Cookie 无法设置 |
| 数据备份 | 定期备份 `apps/server/data/` 与 `apps/server/uploads/` | 一旦容器/机器丢失，文章全没 |

生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 二、方式一：Docker Compose（推荐）

适合有 VPS、想要可重复部署的场景。

### 1. 准备服务器

```bash
# 以 Ubuntu 为例
sudo apt update && sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
```

### 2. 拉取代码并配置

```bash
sudo mkdir -p /srv && cd /srv
git clone <你的仓库地址> hl-blog
cd hl-blog

cp .env.example .env
nano .env    # 按上面的清单填好
```

`.env` 至少要有：

```ini
NODE_ENV=production
PORT=8787
SITE_URL=https://your-domain.com
AUTH_SECRET=<64位随机串>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<你的强密码>
COOKIE_SECURE=true
TRUST_PROXY=0

# 微信登录可选，不填则登录页会提示未配置
WECHAT_CHANNEL=website
WECHAT_APP_ID=
WECHAT_APP_SECRET=
```

> `TRUST_PROXY=0`：compose 里 Nginx 在宿主机、应用在容器内，容器看到的来源 IP 是网关，**不要**信任 X-Forwarded-For；限流按网关 IP 生效。如果你把 Nginx 也放进同一网络，再改为 `1`。

### 3. 启动

```bash
docker compose up -d --build
docker compose ps          # 确认 healthy
docker compose logs -f app # 看日志
```

首次启动会自动建库、建管理员账号、写入示例文章。

### 4. 配置 Nginx + HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hl-blog
sudo sed -i 's/your-domain.com/你的域名/g' /etc/nginx/sites-available/hl-blog
sudo ln -s /etc/nginx/sites-available/hl-blog /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 申请证书（certbot 会自动改写或补全 TLS 配置）
sudo certbot --nginx -d 你的域名
```

### 5. 验证

```bash
curl -I https://你的域名            # 应看到 CSP、HSTS、nosniff
curl https://你的域名/api/health     # {"ok":true,...}
```

浏览器打开 `https://你的域名`，登录 → 改掉默认密码 → 开始写作。

---

## 三、方式二：直接跑在服务器上（不用 Docker）

### 1. 安装 Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # 需要 >= 22.5（node:sqlite 依赖）
```

### 2. 部署代码

```bash
sudo mkdir -p /srv/hl-blog && sudo chown $USER /srv/hl-blog
git clone <你的仓库地址> /srv/hl-blog
cd /srv/hl-blog

pnpm install --frozen-lockfile
pnpm build          # 构建前端到 apps/web/dist
cp .env.example .env
nano .env
```

### 3. 用 systemd 托管

```bash
sudo cp deploy/hl-blog.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hl-blog
sudo systemctl status hl-blog
sudo journalctl -u hl-blog -f
```

> service 文件里假定用户是 `www-data`、代码在 `/srv/hl-blog`。路径不同的话记得改，并确认该用户对 `data/` 与 `uploads/` 有写权限。

### 4. Nginx + HTTPS

同方式一的第 4 步。这里的 `TRUST_PROXY` 要设为 `1`，因为应用直接跑在宿主机、通过 localhost 被 Nginx 转发。

---

## 四、微信扫码登录

需要**已审核通过的微信开放平台「网站应用」**（个人主体通常申请不下来，这是微信的限制）。

1. 开放平台 → 网站应用 → 拿到 AppID / AppSecret
2. 填进 `.env`：`WECHAT_CHANNEL=website`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`
3. 开放平台「授权回调域」填**纯域名**（不带协议和路径）：`your-domain.com`
4. 实际回调地址由应用固定为 `https://your-domain.com/api/auth/wechat/callback`
5. 重启应用

没有微信公众号/开放平台资质时，保持 `WECHAT_CHANNEL` 留空即可，登录页会明确提示「微信登录尚未配置」，账号密码登录不受影响。

---

## 五、常见操作

### 备份与恢复

```bash
# 备份（数据 + 上传文件）
docker compose exec app tar czf - /app/apps/server/data /app/apps/server/uploads > backup-$(date +%F).tar.gz

# 恢复
docker compose exec -T app tar xzf - -C / < backup-2026-10-26.tar.gz
docker compose restart app
```

不用 Docker 时直接备份 `apps/server/data/` 和 `apps/server/uploads/` 两个目录。

建议加一条 crontab：

```cron
0 3 * * * tar czf /backup/blog-$(date +\%F).tar.gz -C /srv/hl-blog/apps/server data uploads
```

### 升级

```bash
git pull
docker compose up -d --build    # Docker
# 或：pnpm install && pnpm build && sudo systemctl restart hl-blog
```

数据库结构变更会自动迁移（`migrate()` 幂等），不需要手动执行 SQL。

### 重置示例数据但保留站点设置

```bash
pnpm seed:keep
```

### 安全自检

```bash
pnpm audit:security
```

会输出 35 项检查结果。

---

## 六、排障

| 现象 | 原因与处理 |
|---|---|
| 启动即退出，日志提到 `AUTH_SECRET` | 没配或不足 32 位，按上文生成后填进 `.env` |
| 页面能开但登录后立刻掉登录 | `COOKIE_SECURE=true` 但实际走的是 http，或反代没传 `X-Forwarded-Proto` |
| 上传图片 413 | Nginx `client_max_body_size` 小于 `UPLOAD_MAX_BYTES`，调大或调小后者 |
| 微信扫码后提示 redirect_uri 错误 | 回调域名填错，或 `SITE_URL` 与实际访问域名不一致 |
| 上传文件 404 | `uploads` 目录没挂载卷，重建容器后丢了；或容器内权限不足 |
| 静态资源 404 | 忘记 `pnpm build`，`apps/web/dist` 不存在；生产模式不会回退到源码 |
| 中文封面显示为乱码方块 | 服务器缺少中文字体，`apt install fonts-noto-cjk` |

---

## 七、上线后建议

- **改掉默认管理员密码**（`/account/security` → 登录密码）
- 在 `/admin/settings` 里填好站点名、标语、首页文案、关于页
- 关掉或替换示例文章，删掉示例作品
- 定期备份，并**实际演练一次恢复**
- 打开 `certbot renew --dry-run` 确认证书自动续期正常
