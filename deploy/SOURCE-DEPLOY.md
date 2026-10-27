# 源码方式手动部署到 Linux（上传 + Nginx）

适用于：在本地 `/` Windows 开发，把代码打包上传到 Linux 服务器，用 Nginx 反代。

---

## ⚠️ 最重要的一条

**不要上传 `node_modules`。**

本地是 Windows，`node_modules` 里装的是 win32 二进制：

```
@img+sharp-win32-x64          ← 图片处理
@rolldown+binding-win32-x64-msvc   ← Vite 打包器
@tailwindcss+oxide-win32-x64-msvc  ← Tailwind
lightningcss-win32-x64-msvc        ← CSS 处理
```

这些文件在 Linux 上**加载即报错**（`cannot open shared object file` / `invalid ELF header`）。
必须上传源码，在服务器上重新 `pnpm install`。

体积上也不划算：`node_modules` 约 100MB，源码加构建产物才 11MB。

---

## 一、服务器准备（一次性）

```bash
# Node.js 22（需要 >= 22.5，内置 node:sqlite）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx

# pnpm
sudo corepack enable
sudo corepack prepare pnpm@latest --activate

node -v     # 应为 v22.x
pnpm -v
```

---

## 二、打包（在你本地 Windows 上）

只打包源码，**排除** `node_modules`、`.env`、数据目录。

用 PowerShell：

```powershell
# 在项目根目录执行
$exclude = @('node_modules', '.env', '.local', 'apps/server/data', 'apps/server/uploads', '.git', 'apps/web/dist')
$items = Get-ChildItem -Force | Where-Object { $exclude -notcontains $_.Name }
Compress-Archive -Path $items -DestinationPath hl-blog.zip -Force
```

> 也可以先 `pnpm build` 再打包，把 `apps/web/dist` 一起带上去；但**强烈建议在服务器上构建**，
> 因为 Vite 的打包器同样是平台二进制，本地构建产物在跨平台时更稳妥。

---

## 三、上传并解压

```bash
# 在服务器上
sudo mkdir -p /srv/hl-blog
sudo chown $USER /srv/hl-blog

# 从本地传（在你 Windows 上执行）
scp hl-blog.zip user@your-server:/srv/hl-blog/

# 回到服务器
cd /srv/hl-blog
unzip -q hl-blog.zip
ls    # 应该看到 package.json apps/ deploy/ 等
```

**注意**：`Compress-Archive` 生成的 zip 用 `unzip` 解压时，中文文件名可能变乱码。
如果代码里有中文文件名的资源，用 `scp -r` 直接传目录更稳；或者改用 7-Zip 打包成 tar.gz。

---

## 四、一键安装

```bash
cd /srv/hl-blog
chmod +x deploy/install.sh
sudo ./deploy/install.sh /srv/hl-blog
```

脚本会：检查 Node 版本 → 检测并清理 win32 的 `node_modules` → 安装依赖 → 构建前端 →
创建数据目录并授权 → 检查 `.env` 必需项。

### 或者手动执行

```bash
cd /srv/hl-blog
pnpm install --frozen-lockfile
pnpm build

mkdir -p apps/server/data apps/server/uploads
sudo chown -R www-data:www-data apps/server/data apps/server/uploads
```

---

## 五、配置 `.env`

```bash
cp .env.example .env
nano .env
```

必填：

```ini
NODE_ENV=production
PORT=8787
SITE_URL=https://你的域名
AUTH_SECRET=<64位随机串>
ADMIN_PASSWORD=<你的强密码>
COOKIE_SECURE=true
TRUST_PROXY=1        ← 有 Nginx 反代就是 1
UPLOAD_MAX_BYTES=8388608
```

生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `TRUST_PROXY=1` 很重要：应用通过 Nginx 转发，需要读 `X-Forwarded-For` 拿到真实 IP，
> 否则登录限流会把所有用户当成同一个 IP。

---

## 六、systemd 托管

```bash
sudo cp deploy/hl-blog.service /etc/systemd/system/
# 如果代码不在 /srv/hl-blog 或用户不是 www-data，改这两行
sudo nano /etc/systemd/system/hl-blog.service

sudo systemctl daemon-reload
sudo systemctl enable --now hl-blog
sudo systemctl status hl-blog
sudo journalctl -u hl-blog -f
```

看到 `运行模式 → production` 就说明起来了。

---

## 七、Nginx 与 HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hl-blog
sudo sed -i 's/your-domain.com/你的域名/g' /etc/nginx/sites-available/hl-blog

# 先注释掉 ssl 相关几行，用 80 端口跑通再上证书（首次部署更省事）
sudo ln -s /etc/nginx/sites-available/hl-blog /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 申请证书（certbot 会自动补全 TLS 配置）
sudo certbot --nginx -d 你的域名
```

验证：

```bash
curl -I https://你的域名              # 应看到 CSP / HSTS / nosniff
curl https://你的域名/api/health       # {"ok":true,...}
```

---

## 八、验证发布成功

1. 浏览器打开 `https://你的域名`，能看到首页
2. 登录（`ADMIN_USERNAME` / `ADMIN_PASSWORD`）
3. 头像 → 账号安全 → 改掉默认密码
4. 写一篇测试文章并发布，确认前台能看到
5. 上传一张图片，确认能显示（验证 sharp 正常）
6. 检查 `sudo journalctl -u hl-blog -n 50` 无报错

---

## 九、日常维护

### 更新代码

```bash
cd /srv/hl-blog
# 重新上传并覆盖源码（别覆盖 .env 和 apps/server/data）
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart hl-blog
```

### 备份

```bash
# 手动
sudo tar czf ~/blog-backup-$(date +%F).tar.gz -C /srv/hl-blog/apps/server data uploads

# 定时（crontab -e）
0 3 * * * tar czf /backup/blog-$(date +\%F).tar.gz -C /srv/hl-blog/apps/server data uploads
```

### 恢复

```bash
sudo systemctl stop hl-blog
sudo tar xzf ~/blog-backup-2026-10-26.tar.gz -C /srv/hl-blog/apps/server/
sudo chown -R www-data:www-data /srv/hl-blog/apps/server/data /srv/hl-blog/apps/server/uploads
sudo systemctl start hl-blog
```

---

## 十、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `invalid ELF header` 或 `cannot open shared object file` | 上传了 Windows 的 `node_modules` | `rm -rf node_modules && pnpm install` |
| 启动即退出，日志提 `AUTH_SECRET` | 密钥没配或不足 32 位 | 按上文生成后填 `.env` |
| 登录后立刻掉登录 | `COOKIE_SECURE=true` 但走的是 http，或 Nginx 未传 `X-Forwarded-Proto` | 确认 HTTPS，检查 nginx 配置 |
| 上传图片 413 | Nginx `client_max_body_size` 太小 | 调大，且要 ≥ `UPLOAD_MAX_BYTES` |
| 页面 404 或白屏 | 忘记 `pnpm build`，`apps/web/dist` 不存在 | 执行构建 |
| 中文文件名乱码 | Windows zip 与 Linux unzip 编码不一致 | 改用 tar.gz 或 `scp -r` |
| 权限错误 `EACCES` | 数据目录属主不对 | `chown -R www-data:www-data apps/server/{data,uploads}` |
| 中文封面显示方块 | 服务器缺中文字体 | `sudo apt install fonts-noto-cjk` |

---

## 附：为什么不用直接上传 node_modules

除了二进制不兼容，还有一个隐性风险：`pnpm` 的 `node_modules` 里是**符号链接**。
Windows 下创建符号链接需要管理员权限，用 `Compress-Archive` 打包时符号链接往往被展开成实体文件，
体积暴涨且结构损坏。在服务器上重新 `pnpm install` 是唯一可靠的做法。
