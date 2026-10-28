# 部署排障实录

这份文档记录的是**真实部署过程中踩过的坑**，按发生顺序排列。每个问题都包含现象、根因和解决方法。

如果你正在部署，README 里的「部署避坑清单」是快速索引，这里是完整细节。

> 环境：CentOS 8 / Nginx 已有反代 / 从 Windows 本地打包上传

---

## 1. 找不到 `.env.example`

**现象**：`cp .env.example .env` 报文件不存在，但文件管理器里也看不到。

**根因**：文件管理器默认隐藏以 `.` 开头的文件。`.env.example`、`.gitignore`、`.dockerignore` 都看不见。

**解决**：

```bash
ls -a | grep env
```

确认存在后正常复制即可。若确实不存在，说明上传的是旧包，重新打包。

---

## 2. 直接传 `node_modules` 到 Linux

**现象**：服务启动报 `invalid ELF header` 或 `cannot open shared object file`。

**根因**：Windows 上安装的 `node_modules` 里是 win32 二进制：

```
@img+sharp-win32-x64
@rolldown+binding-win32-x64-msvc
@tailwindcss+oxide-win32-x64-msvc
lightningcss-win32-x64-msvc
```

这些是平台相关的原生模块，Linux 上无法加载。而且体积约 100MB，源码加产物才几 MB。

**解决**：只上传源码，在服务器上重新安装：

```bash
rm -rf node_modules
pnpm install --frozen-lockfile
```

本项目的 `pnpm release` 脚本已自动排除 `node_modules` 并做校验。

---

## 3. Node 版本过低

**现象**：

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'express'
Node.js v20.20.2
```

装完依赖后仍报：

```
Cannot find module 'node:sqlite'
```

**根因**：项目用了 Node 22.5 才引入的内置模块 `node:sqlite`。v20 里根本没有这个模块。

这不是配置问题，是硬性版本要求。

**解决**：升级 Node。CentOS 8 的软件源已停止维护，`dnf install nodejs` 装不到新版，用官方二进制：

```bash
cd /usr/local
curl -fsSL https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.xz -o node.tar.xz
tar -xJf node.tar.xz

ln -sf /usr/local/node-v22.22.0-linux-x64/bin/node      /usr/local/bin/node
ln -sf /usr/local/node-v22.22.0-linux-x64/bin/npm       /usr/local/bin/npm
ln -sf /usr/local/node-v22.22.0-linux-x64/bin/npx       /usr/local/bin/npx
ln -sf /usr/local/node-v22.22.0-linux-x64/bin/corepack  /usr/local/bin/corepack

hash -r && node -v
```

> ARM 服务器把 `linux-x64` 换成 `linux-arm64`，用 `uname -m` 确认。

---

## 4. pnpm 装不上

这是一个连环坑，走了四步才成功。

### 4.1 corepack 缓存损坏

```
Error: Cannot find module '/root/.cache/node/corepack/v1/pnpm/12.15.0/bin/pnpm.cjs'
```

**原因**：`corepack prepare` 下载中断，留下损坏的缓存。

**尝试**：`rm -rf /root/.cache/node/corepack` 后重试。

### 4.2 npm 全局安装"假成功"

`npm install -g pnpm` 输出 `changed 2 packages`，但 `pnpm -v` 报 `command not found`。

**原因**：`/usr/local/bin/pnpm` 是一个指向 corepack 的软链接，抢占了 npm 生成的入口。

**尝试**：`rm -f /usr/local/bin/pnpm` 后重装。

### 4.3 libatomic 缺失

```
error while loading shared libraries: libatomic.so.1: cannot open shared object file
```

**原因**：pnpm 12 的预编译二进制依赖系统库 `libatomic`，CentOS 8 最小安装没有。

**解决**：

```bash
dnf install -y libatomic
```

如果 `dnf` 因源失效报错，先换镜像：

```bash
sed -i 's|^mirrorlist=|#mirrorlist=|g; s|^#baseurl=http://mirror.centos.org|baseurl=https://mirrors.aliyun.com|g' /etc/yum.repos.d/CentOS-*.repo
dnf makecache
```

### 4.4 最终可行的方案：包装脚本

找到 pnpm 的真实入口，用 shell 脚本包装：

```bash
cat > /usr/local/bin/pnpm <<'EOF'
#!/bin/sh
exec /usr/local/bin/node /usr/local/node-v22.22.0-linux-x64/lib/node_modules/pnpm/bin/pnpm.mjs "$@"
EOF
chmod +x /usr/local/bin/pnpm
hash -r
pnpm -v
```

**关键点**：`<<'EOF'` 的单引号必须保留，否则 `$@` 会被当前 shell 展开，写进去的是空值。

> 注意：新版 pnpm 的入口是 **`pnpm.mjs`** 而不是 `pnpm.cjs`，用 `find` 确认：
> ```bash
> find /usr/local/node-* -path "*/pnpm/bin/pnpm.*" 2>/dev/null
> ```

### 4.5 顺带一提

pnpm 报版本不匹配时，`package.json` 里的 `packageManager` 字段会阻止执行：

```bash
sed -i 's/"packageManager": "pnpm@[^"]*"/"packageManager": "pnpm@你的版本"/' package.json
```

---

## 5. systemd 连续三次失败

### 5.1 `217/USER`

```
Process: ... ExecStart=/usr/bin/node apps/server/src/index.js (code=exited, status=217/USER)
```

**根因**：service 文件里 `User=www-data`，但数据目录属主是 `root`，`www-data` 无法创建数据库。

**解决**：先改 `User=root` 跑通，或 `chown -R www-data:www-data apps/server/{data,uploads}`。

### 5.2 `226/NAMESPACE`

改完用户后：

```
(code=exited, status=226/NAMESPACE)
```

**根因**：service 文件保留了模板里的沙箱选项：

```ini
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict      ← 元凶：整个文件系统只读
ProtectHome=true
ReadWritePaths=...
```

`ProtectSystem=strict` 把文件系统挂成只读，应用无法写数据库。

**解决**：删掉这些选项，先跑通：

```bash
sed -i '/NoNewPrivileges/d; /PrivateTmp/d; /ProtectSystem/d; /ProtectHome/d; /ReadWritePaths/d' /etc/systemd/system/hl-blog.service
systemctl daemon-reload && systemctl restart hl-blog
```

### 5.3 路径写错

```
Failed to load environment files: No such file or directory
Failed to run 'start' task: No such file or directory
```

**根因**：service 里的 `WorkingDirectory=/srv/hl-blog`，实际路径是 `/data_source/web_project/views/hejiu45-blog`。

**解决**：用 `pwd` 确认后批量替换：

```bash
APP_DIR=/你的/实际/路径
NODE_BIN=$(which node)
sed -i "s|/srv/hl-blog|$APP_DIR|g; s|/usr/bin/node|$NODE_BIN|g" /etc/systemd/system/hl-blog.service
systemctl daemon-reload
```

### 5.4 最终可用的 service 文件

```ini
[Unit]
Description=Hejiu Blog (Node.js)
After=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/你的/实际/路径
Environment=NODE_ENV=production
Environment=PORT=8787
Environment=TRUST_PROXY=1
EnvironmentFile=/你的/实际/路径/.env
ExecStart=/usr/local/bin/node apps/server/src/index.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hl-blog

[Install]
WantedBy=multi-user.target
```

> 跑通之后再考虑加沙箱，且必须先 `chown` 数据目录。

---

## 6. Nginx 配置：静态站 vs 反向代理

**现象**：站点能打开但只有静态页面，登录、搜索、后台全部失效。

**根因**：原有的 `blog.hejiu45.top` 配的是静态站：

```nginx
location / {
    root   /data_source/hejiu_web/views/hejiu45-blog;
    index  index.html index.htm;
    try_files $uri $uri/ /index.html;
}
```

这个博客是 Node.js 应用，需要反向代理。

**解决**：替换为：

```nginx
server {
    listen 443 ssl;
    server_name blog.hejiu45.top;

    ssl_certificate     /etc/nginx/ssl/xxx.pem;
    ssl_certificate_key /etc/nginx/ssl/xxx.key;

    client_max_body_size 500m;        # 必须 ≥ UPLOAD_MAX_BYTES（默认 500MB）

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;      # 关键
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Port  443;
        proxy_set_header Connection        "";
    }
}
```

**三个关键点**：

1. `client_max_body_size 500m` —— 不设的话默认只有 1MB，图片稍大就 413
2. `X-Forwarded-Proto https` —— 不设的话 `COOKIE_SECURE` 失效，登录后立刻掉
3. `.env` 里 `TRUST_PROXY=1` —— 不设的话所有访客被识别成同一 IP，一人触发限流全员被锁

---

## 7. 证书过期

**现象**：

```
curl: (60) SSL certificate problem: certificate has expired
```

**根因**：服务器上的证书文件是旧的。证书管理面板里显示有两张 `*.hejiu45.top`：

- 一张到期 2026-10-22（**已过期**）
- 一张到期 2026-12-21（有效）

自动化任务显示「执行成功」，但**没有把新证书部署到 Nginx 的实际路径**。

**排查**：

```bash
openssl x509 -in /etc/nginx/ssl/xxx.pem -noout -dates -subject
```

**解决**：从证书面板下载有效证书，替换并验证配对：

```bash
# 备份
cp xxx.pem xxx.pem.bak-$(date +%F)
cp xxx.key xxx.key.bak-$(date +%F)

# 替换（文件名要与 nginx 配置一致）
mv cert.pem xxx.pem
mv key.pem  xxx.key
chmod 600 xxx.key

# 验证有效期
openssl x509 -in xxx.pem -noout -dates -subject

# 验证配对（两个 MD5 必须相同）
openssl x509 -in xxx.pem -noout -modulus | md5sum
openssl rsa  -in xxx.key -noout -modulus | md5sum

# 重载
nginx -t && nginx -s reload
```

**根治**：在证书工具的自动化任务里配置「部署目标」，指定 Nginx 的证书路径，并在部署后执行 `nginx -s reload`。否则 55 天后会重演。

---

## 8. 登录 401 / 忘记密码

**现象**：`POST /api/auth/login` 返回 401。

**根因**：`.env` 里的 `ADMIN_PASSWORD` 只在**首次建库**时生效。之后修改 `.env` 不会改变已有账号的密码。

**排查**：

```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/blog.db');
console.log(db.prepare('SELECT username, role, disabled FROM users').all());
"
```

**解决**：直接重置密码（README「常用运维命令」里有完整脚本）。

注意 heredoc 要用单引号 `<<'SCRIPT'`，否则 `$` 会被 shell 展开导致哈希格式错误。

---

## 9. 部署后文章被覆盖 / 数据丢失

**现象**：每次上传部署，之前写的文章和上传的图片都没了。

**根因**：`tar --exclude` **匹配的是包内相对路径**，传绝对路径进去永远匹配不上。

`.env` 里 `DATA_DIR` 一旦写成绝对路径：

```ini
DATA_DIR=/data_source/web_project/views/hejiu45-blog/data
```

`--exclude=/data_source/.../data` 就对 `./data/blog.db` 无效，发布包里的同名文件直接覆盖真实数据。这个问题很隐蔽——命令不报错，数据却没了。

第二个坑：`UPLOAD_DIR` 没配置时只排除默认的 `apps/server/uploads`，而实际可能用的是根目录下的 `uploads/`，同样失去保护。

**验证是否中招**：

```bash
grep '^DATA_DIR=' .env
ls -la data/
```

如果 `DATA_DIR` 是绝对路径，且部署后文章数变少，就是这个问题。

**解决**：升级 `deploy/remote-deploy.sh` 到最新版。新版不再依赖 tar 的排除匹配，而是：

1. 把发布包复制到临时快照
2. **在快照里**按相对路径删掉 `data` / `uploads`
3. 再把清理过的快照复制回项目

部署输出里会出现这两行，是数据受保护的标志：

```
[3/6] 覆盖源码（跳过数据目录）
    跳过：data / apps/server/uploads
    快照已剔除：data
[4/6] 校验数据完整性（数据全程未被触碰，仅做检查）
    数据目录完好：1.5M
    文章 7 篇 · 账号 1 个
```

**「文章 X 篇」这一行就是证据**——部署完直接看到文章还在。

> 另外：备份前会先停服务。SQLite 开着 WAL 时直接 `cp` 会拿到不一致的快照，
> 停了再复制才保证备份可用。脚本还加了 `trap`，构建失败时会把服务拉起来，
> 不会让站点一直停在停止状态。

---

## 10. 部署脚本报「未预期的符号 '('」

**现象**：

```
deploy/remote-deploy.sh: 行179: 未预期的符号 '(' 附近有语法错误
```

**根因**：脚本里用了 bash 5.x 能解析、但 CentOS 8 的 **bash 4.4 不认**的写法。

**重要**：在 Windows 的 Git Bash（通常是 bash 5.2）里 `bash -n` 能通过，
不代表 Linux 服务器上能跑。**两端版本不一致**是最容易漏掉的一环。

**排查兼容性**：

```bash
bash --version | head -1     # 服务器上的版本
```

**避免这些写法**（bash 4.4 有坑或解析差异）：

| 写法 | 问题 |
|---|---|
| 嵌套子 shell 管道 `( cd x && find . ) \| while ...` | 引号与括号嵌套在旧版易报错 |
| 关联数组 `declare -A` | 需要 bash 4+，但组合用法易出错 |
| `${var^}` `${var,,}` | 大小写转换需要 bash 4，部分写法不支持 |
| `[ ... ] && VAR=1` | `set -e` 下条件为假会返回非零，导致脚本误退出 |

`[ -n "$x" ] && VAR=1` 这种写法尤其危险——在 `set -euo pipefail` 下，
条件为假时整条语句返回 1，脚本会**静默退出**。改成：

```bash
if [ -n "$x" ]; then VAR=1; fi
```

**验证脚本语法**（在服务器上执行，比本地更可靠）：

```bash
bash -n deploy/remote-deploy.sh && echo "语法 OK"
```

---

## 附：为什么是这些选择

| 决策 | 原因 |
|---|---|
| Node 22.5+ | `node:sqlite` 内置，省掉 `better-sqlite3` 的编译与 ABI 问题 |
| 不用 Docker（但也提供） | 低配 VPS 上 Docker 本身占几百 MB，直接跑更省 |
| 打包用 tar.gz 而非 zip | Windows zip 的编码问题会导致中文文件名在 Linux 上乱码 |
| 本地构建而非服务器构建 | Vite 的打包器也是平台二进制，跨平台产物更稳；且服务器只需装运行时 |
| 远端逻辑放 `.sh` 而非内嵌 | PowerShell 字符串里的 `$var`、`&&`、`||` 会被误解析 |
