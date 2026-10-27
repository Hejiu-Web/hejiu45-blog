#!/usr/bin/env bash
# 和久博客 · Linux 手动部署脚本（源码方式）
#
# 用法：
#   chmod +x deploy/install.sh
#   sudo ./deploy/install.sh /srv/hl-blog
#
# 脚本做的事：
#   1. 检查 Node.js 版本
#   2. 安装生产依赖（不装 devDependencies 里的平台二进制）
#   3. 构建前端
#   4. 创建数据目录并授权
#   5. 生成/检查 .env 必需项
#
# 它不会做的事：装 Nginx、申请证书、启动服务——那几步在 DEPLOY.md 里。

set -euo pipefail

APP_DIR="${1:-/srv/hl-blog}"
APP_USER="${APP_USER:-www-data}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

echo "==> 部署目录：$APP_DIR"

if [[ ! -f "$APP_DIR/package.json" ]]; then
  red "找不到 $APP_DIR/package.json，请先把源码上传到这里"
  exit 1
fi

cd "$APP_DIR"

# ── 1. Node.js 版本 ──
if ! command -v node >/dev/null 2>&1; then
  red "未安装 Node.js，请先安装 22.x："
  echo '  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs'
  exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]')
if (( NODE_MAJOR < 22 || (NODE_MAJOR == 22 && NODE_MINOR < 5) )); then
  red "Node.js $(node -v) 过低，需要 >= 22.5（内置 node:sqlite）"
  exit 1
fi
green "Node.js $(node -v) ✓"

# ── 2. pnpm ──
if ! command -v pnpm >/dev/null 2>&1; then
  yellow "未找到 pnpm，尝试用 corepack 启用…"
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@latest --activate
  else
    red "请先安装 pnpm：npm i -g pnpm"
    exit 1
  fi
fi
green "pnpm $(pnpm -v) ✓"

# ── 3. 清理 Windows 传上来的 node_modules ──
if [[ -d node_modules ]]; then
  # 从 Windows 直接传上来的 node_modules 里是 win32 二进制，在 Linux 上必然报错
  if [[ -d node_modules/.pnpm ]] && find node_modules/.pnpm -maxdepth 1 -name '*win32*' -print -quit 2>/dev/null | grep -q .; then
    yellow "检测到 Windows 平台的 node_modules，正在删除重建（这是必须的）"
    rm -rf node_modules
  fi
fi

# ── 4. 安装依赖 ──
echo "==> 安装依赖"
if [[ -f pnpm-lock.yaml ]]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi
green "依赖安装完成 ✓"

# ── 5. 构建前端 ──
echo "==> 构建前端"
pnpm build
if [[ ! -f apps/web/dist/index.html ]]; then
  red "构建失败：apps/web/dist/index.html 不存在"
  exit 1
fi
green "前端构建完成 ✓"

# ── 6. 数据目录 ──
echo "==> 准备数据目录"
mkdir -p apps/server/data apps/server/uploads
chown -R "$APP_USER":"$APP_USER" apps/server/data apps/server/uploads 2>/dev/null || \
  yellow "无法 chown 为 $APP_USER，请手动处理权限"
chmod 750 apps/server/data apps/server/uploads
green "数据目录就绪 ✓"

# ── 7. .env 检查 ──
echo "==> 检查 .env"
if [[ ! -f .env ]]; then
  yellow ".env 不存在，已从 .env.example 生成，请填写后重启服务"
  cp .env.example .env
fi

missing=()
# 注意：不要写成 `grep ... && missing+=(...)`。
# grep 没匹配时返回非 0，在 set -e 下整条语句失败会让脚本静默退出。
if ! grep -q '^AUTH_SECRET=.\{32,\}' .env 2>/dev/null; then
  missing+=("AUTH_SECRET（至少 32 位）")
fi
if grep -qE '^ADMIN_PASSWORD=(please-change-this-password|admin123)?$' .env 2>/dev/null; then
  missing+=("ADMIN_PASSWORD（仍为默认值）")
fi
if ! grep -qE '^SITE_URL=https://' .env 2>/dev/null; then
  missing+=("SITE_URL（需 https）")
fi

if (( ${#missing[@]} > 0 )); then
  yellow "以下配置需要处理，否则服务会拒绝启动或存在安全风险："
  for m in "${missing[@]}"; do echo "  - $m"; done
  echo
  echo "生成密钥：node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
else
  green ".env 配置检查通过 ✓"
fi

echo
green "部署完成。接下来："
echo "  1. 确认 .env 已填好"
echo "  2. 配置 Nginx：sudo cp deploy/nginx.conf /etc/nginx/sites-available/hl-blog"
echo "  3. 启动服务：sudo systemctl enable --now hl-blog"
echo "  4. 申请证书：sudo certbot --nginx -d 你的域名"
