# 本地打包与手动上传

脚本只负责**本地构建 + 打包**，上传由你自己完成（FTP、宝塔面板、scp 都行）。

---

## 一、打包

在项目根目录：

```powershell
.\scripts\release.ps1
```

或者：

```powershell
pnpm release
```

完成后面板会打印：

```
==> 打包完成

  发布包：
    F:\hejiu45\hejiu45-blog\release\hl-blog-20261026-181905.tar.gz

  ── 第 1 步：上传（在你本地执行）──
    scp "..." root@你的服务器:/srv/hl-blog/
```

### 参数

| 参数 | 说明 |
|---|---|
| `-SkipBuild` | 跳过前端构建，使用已有 `apps/web/dist` |
| `-Open` | 打包完成后打开输出文件夹 |

```powershell
# 只改了服务器配置、前端没动，跳过构建更快
.\scripts\release.ps1 -SkipBuild

# 打包后直接打开文件夹，方便拖拽上传
.\scripts\release.ps1 -Open
```

### 产物

```
release\hl-blog-<时间戳>.tar.gz    约 350 KB
```

内容：

- `apps/`：服务端源码 + 前端构建产物（`apps/web/dist`）
- `deploy/`：部署脚本与配置模板
- `package.json`、`pnpm-lock.yaml`、`README.md`、`.env.example`

**自动排除**（脚本会校验，混进去就中止）：

| 排除项 | 原因 |
|---|---|
| `node_modules` | Windows 二进制，Linux 上加载即报错 |
| `apps/server/data` | 数据库，会覆盖服务器上的文章 |
| `apps/server/uploads` | 上传的图片与音频 |
| `.env` | 含密钥，不应进发布包 |

---

## 二、上传

任选一种：

**方式 A：scp（命令行）**

```powershell
scp "release\hl-blog-20261026-181905.tar.gz" root@你的服务器:/srv/hl-blog/
```

**方式 B：FTP / SFTP 工具**

FileZilla、WinSCP、宝塔面板文件管理都可以，把 `.tar.gz` 传到 `/srv/hl-blog/`。

**方式 C：宝塔面板**

文件管理 → 进入 `/srv/hl-blog` → 上传。

---

## 三、服务器上部署

登录服务器：

```bash
ssh root@你的服务器
cd /srv/hl-blog

# 参数：发布包名、运行服务的用户、是否重启（1=重启）
bash deploy/remote-deploy.sh hl-blog-20261026-181905.tar.gz www-data 1
```

> 如果 `deploy/remote-deploy.sh` 不存在（比如你只上传了压缩包、还没解压过），
> 先用 `tar -xzf 包名` 解一次，之后每次都有的。

### 部署脚本做了什么

```
[1/6] 解压到临时目录
[2/6] 备份 data / uploads / .env
[3/6] 覆盖源码
[4/6] 恢复 data / uploads / .env      ← 你的文章和图片不会丢
[5/6] 清理 win32 依赖 → pnpm install → pnpm build
[6/6] 授权目录 → 重启服务
```

### 验证

```bash
systemctl status hl-blog --no-pager
journalctl -u hl-blog -n 50 --no-pager
curl -I https://你的域名
```

---

## 四、第一次部署额外要做的事

第一次服务器上是空的，需要：

### 1. 建目录

```bash
sudo mkdir -p /srv/hl-blog
cd /srv/hl-blog
# 解压发布包
tar -xzf hl-blog-XXX.tar.gz
```

### 2. 配置 .env

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
TRUST_PROXY=1
```

生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. 安装依赖并构建

```bash
pnpm install --frozen-lockfile
pnpm build
```

### 4. 配置 systemd 与 Nginx

见 [SOURCE-DEPLOY.md](./SOURCE-DEPLOY.md) 第六、七节：

```bash
sudo cp deploy/hl-blog.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hl-blog

sudo cp deploy/nginx.conf /etc/nginx/sites-available/hl-blog
sudo sed -i 's/your-domain.com/你的域名/g' /etc/nginx/sites-available/hl-blog
sudo ln -s /etc/nginx/sites-available/hl-blog /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d 你的域名
```

完成之后，日常更新就只需「打包 → 上传 → 跑 remote-deploy.sh」三步。

---

## 五、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 脚本报 `无法解析` | `.ps1` 被存成了无 BOM 的 UTF-8 | VS Code 右下角改「UTF-8 with BOM」保存 |
| `无法加载文件，未对文件进行数字签名` | 执行策略限制 | `powershell -ExecutionPolicy Bypass -File scripts\release.ps1` |
| 校验失败「包含 node_modules」 | 用了自己写的打包命令 | 用本脚本，或手动加 `--exclude=node_modules` |
| 服务器上 `invalid ELF header` | 上传了 Windows 的 node_modules | 删掉服务器上的 `node_modules` 重新 `pnpm install` |
| 部署后 502 | 服务没起来 | `journalctl -u hl-blog -n 100 --no-pager` |
| 上传后解压中文文件名乱码 | Windows zip 编码问题 | 本脚本用 tar.gz，不会有这个问题 |
| `remote-deploy.sh: No such file` | 服务器上还没解压过 | 先 `tar -xzf 包名`，或 `tar -xzf 包名 deploy/remote-deploy.sh` 只解这一个文件 |

---

## 六、回滚

发布包不保留历史版本。要回滚：

1. 重新上传旧版本的 `.tar.gz`
2. 执行 `bash deploy/remote-deploy.sh 旧包名 www-data 1`

文章与图片不受影响（部署脚本每次都会备份并还原）。
