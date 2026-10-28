# 部署到 Linux（完整步骤）

适用于：CentOS / Ubuntu / Rocky，从 Windows 本地打包上传。

> 已针对 **2026-10 版本**校验：Node ≥ 22.5、上传上限 500MB。
> 你的环境是 CentOS 8，下面的命令已按它写，其他发行版见对应注释。

---

## 零、当前状态

你的服务器**已经在跑旧版本**。这次要更新的两个改动：

| 改动 | 影响 |
|---|---|
| 写作台选择合集无效 | 前端 + 后端 |
| 上传上限 4MB → 500MB | 后端 + Nginx |

**必须重新构建前端**，所以下面会执行 `pnpm build`。

---

## 一、本地打包

在 Windows 项目根目录：

```powershell
pnpm release
```

产出：

```
release\hl-blog-<时间戳>.tar.gz    约 355 KB
```

脚本会校验包内容，自动排除 `node_modules`、数据库、上传文件、`.env`。

---

## 二、上传到服务器

用 iShell 文件面板拖拽，或命令行：

```powershell
scp "release\hl-blog-20261028-101500.tar.gz" root@你的服务器:/data_source/web_project/views/hejiu45-blog/
```

> 注意目标路径是你服务器上的实际目录：
> `/data_source/web_project/views/hejiu45-blog`

---

## 三、服务器上执行部署

登录服务器：

```bash
ssh root@你的服务器
cd /data_source/web_project/views/hejiu45-blog
```

### 方式 A：用部署脚本（推荐）

```bash
bash deploy/remote-deploy.sh hl-blog-20261028-101500.tar.gz root 1
```

脚本会自动：解压 → **备份并保留 data / uploads / .env** → 覆盖源码 → 恢复数据 → `pnpm install` → `pnpm build` → 重启服务。

参数说明：`<包名> <运行用户> <是否重启 1/0>`。
你的服务用 root 运行，所以第二个参数是 `root`。

### 方式 B：手动（脚本不可用时）

```bash
cd /data_source/web_project/views/hejiu45-blog

# 1. 备份（重要）
tar czf ~/blog-backup-$(date +%F).tar.gz apps/server/data apps/server/uploads .env

# 2. 解压覆盖（--overwrite 保留已有文件属性）
tar xzf hl-blog-20261028-101500.tar.gz

# 3. 安装依赖 + 构建
pnpm install --frozen-lockfile
pnpm build

# 4. 重启
systemctl restart hl-blog
```

> **不要删 `.env` 和 `apps/server/data`**。数据都在这些位置。

---

## 四、确认应用起来了

```bash
systemctl status hl-blog --no-pager
```

应看到 `Active: active (running)`。

```bash
journalctl -u hl-blog -n 20 --no-pager
```

期望输出里能看到这两行（关键）：

```
鹤酒 Blog  →  http://localhost:8787
运行模式    →  production
上传上限    →  500MB（单个文件）
Nginx 需同步 → client_max_body_size 500m;
```

**记下最后一行**，第五步要用。

```bash
curl -I http://127.0.0.1:8787/api/health
```

返回 `200` 说明应用正常。

---

## 五、改 Nginx（两个改动都要同步）

```bash
vi /etc/nginx/conf.d/hejiu_hz_service.conf
```

找到 `blog.hejiu45.top` 的 **443 server 块**，改成：

```nginx
server {
    listen 443 ssl;
    server_name blog.hejiu45.top;

    ssl_certificate      /etc/nginx/ssl/ssl-master.hejiu45.top.pem;
    ssl_certificate_key  /etc/nginx/ssl/ssl-master.hejiu45.top.key;
    ssl_protocols        TLSv1.2 TLSv1.3;
    ssl_ciphers          HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache    shared:SSL:10m;
    ssl_session_timeout  10m;

    # ① 上传上限：必须 ≥ .env 的 UPLOAD_MAX_BYTES（现在是 500MB）
    client_max_body_size 500m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Port  443;
        proxy_set_header Connection        "";

        # ② 大文件上传：不缓冲 + 放宽超时，否则传大文件会被掐断
        proxy_request_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

校验并重载：

```bash
nginx -t && nginx -s reload
```

`nginx -t` 必须显示 `test is successful`。

---

## 六、确认 .env 的上传上限

```bash
grep '^UPLOAD_MAX_BYTES=' /data_source/web_project/views/hejiu45-blog/.env
```

如果**没有这一行**或值是旧的 `4194304`，改成：

```bash
sed -i 's/^UPLOAD_MAX_BYTES=.*/UPLOAD_MAX_BYTES=500MB/' /data_source/web_project/views/hejiu45-blog/.env
# 如果没有这一行，手动追加
grep -q '^UPLOAD_MAX_BYTES=' /data_source/web_project/views/hejiu45-blog/.env || \
  echo 'UPLOAD_MAX_BYTES=500MB' >> /data_source/web_project/views/hejiu45-blog/.env

systemctl restart hl-blog
```

**两处必须一致**：`.env` 的 500MB 与 Nginx 的 `500m`。
不一致的话，Nginx 先拦截，请求根本到不了应用（表现就是 413）。

---

## 七、验证

### 1. 服务通不通

```bash
curl -I https://blog.hejiu45.top
curl -I https://blog.hejiu45.top/api/health
```

都返回 `200`，且**不带证书警告**。

### 2. 合集 bug 是否修好

浏览器打开 https://blog.hejiu45.top，登录后：

1. 点「写文章」
2. 填标题、正文
3. **勾选一个合集**（卡片变红、右上角显示"已选 1"）
4. 点「发布」
5. 打开该合集页面 → **应该能看到这篇新文章**

### 3. 上传上限是否生效

浏览器打开 https://blog.hejiu45.top/admin/media，应该看到：

```
单个文件上限 500 MB
```

传一个 10MB 以上的图片或视频，能成功就是对的。

---

## 八、常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 上传仍报 413 | Nginx 没改或没 reload | `grep client_max_body_size /etc/nginx/conf.d/hejiu_hz_service.conf` 确认是 `500m`，再 `nginx -s reload` |
| 大文件传到一半断开 | 超时太短 | 加上 `proxy_read_timeout 600s; proxy_send_timeout 600s;` |
| 合集还是没文章 | 前端没重新构建 | 确认 `pnpm build` 执行过，浏览器强制刷新（Ctrl+Shift+R） |
| 502 Bad Gateway | 应用没起来 | `systemctl status hl-blog` + `journalctl -u hl-blog -n 50` |
| 登录后立刻掉登录 | 反代缺 `X-Forwarded-Proto` | 按上面配置补上 |
| 所有访客被同一 IP 锁定 | `TRUST_PROXY` 不是 1 | `grep TRUST_PROXY .env`，改成 `1` 后重启 |

### 强制刷新前端缓存

改完前端后如果界面没变化：

- 浏览器按 `Ctrl + Shift + R`
- 或开发者工具里勾选 `Disable cache` 后刷新

静态资源文件名带 hash，正常会自动更新，但 HTML 可能被缓存。

---

## 九、回滚

万一新版有问题：

```bash
# 恢复数据
systemctl stop hl-blog
tar xzf ~/blog-backup-2026-10-28.tar.gz -C /data_source/web_project/views/hejiu45-blog
systemctl start hl-blog
```

或者重新上传上一个版本的 tar.gz，执行 `remote-deploy.sh`。

> `remote-deploy.sh` 每次部署都会备份并还原 `data` / `uploads` / `.env`，
> 所以**换版本不会丢文章和图片**。

---

## 附：一条命令走完全部（确认无误后可用）

```bash
cd /data_source/web_project/views/hejiu45-blog && \
bash deploy/remote-deploy.sh hl-blog-20261028-101500.tar.gz root 1 && \
nginx -t && nginx -s reload && \
sleep 2 && curl -I https://blog.hejiu45.top | head -1
```

把包名换成你的实际文件名。
