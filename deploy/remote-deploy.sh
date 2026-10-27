#!/usr/bin/env bash
# 远端部署脚本：由 release.ps1 上传后执行，也可手动运行
#
# 用法：bash deploy/remote-deploy.sh <发布包路径> [服务用户] [是否重启 1/0]
#   例：bash deploy/remote-deploy.sh /srv/hl-blog/hl-blog-20260101.tar.gz www-data 1
#
# 特点：
#   - 先备份 data / uploads / .env，覆盖源码后再恢复，绝不丢用户数据
#   - 自动清理 Windows 平台残留的 node_modules
#   - 出错即停（set -e）

set -euo pipefail

TARBALL="${1:?用法: remote-deploy.sh <发布包路径> [服务用户] [是否重启]}"
SERVICE_USER="${2:-www-data}"
DO_RESTART="${3:-1}"

if [ ! -f "$TARBALL" ]; then
  echo "找不到发布包：$TARBALL" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "$TARBALL")" && pwd)"
cd "$APP_DIR"

echo "[1/6] 解压到临时目录"
rm -rf .release-tmp
mkdir -p .release-tmp
tar -xzf "$TARBALL" -C .release-tmp

echo "[2/6] 备份运行时数据"
KEEP="$(mktemp -d)"
if [ -d apps/server/data ]; then cp -a apps/server/data "$KEEP/"; fi
if [ -d apps/server/uploads ]; then cp -a apps/server/uploads "$KEEP/"; fi
if [ -f .env ]; then cp -a .env "$KEEP/"; fi

echo "[3/6] 覆盖源码（保留 data / uploads / .env）"
cp -a .release-tmp/. .
rm -rf .release-tmp

echo "[4/6] 恢复运行时数据"
if [ -d "$KEEP/data" ]; then
  rm -rf apps/server/data
  cp -a "$KEEP/data" apps/server/data
fi
if [ -d "$KEEP/uploads" ]; then
  rm -rf apps/server/uploads
  cp -a "$KEEP/uploads" apps/server/uploads
fi
if [ -f "$KEEP/.env" ]; then cp -a "$KEEP/.env" .; fi
rm -rf "$KEEP"

echo "[5/6] 安装依赖并构建"
# 从 Windows 上传的 node_modules 里是 win32 二进制，在 Linux 上必然报错
if [ -d node_modules/.pnpm ]; then
  if find node_modules/.pnpm -maxdepth 1 -name '*win32*' -print -quit 2>/dev/null | grep -q .; then
    echo "    检测到 Windows 平台依赖，重新安装"
    rm -rf node_modules
  fi
fi

if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi
pnpm build

echo "[6/6] 授权并重启"
mkdir -p apps/server/data apps/server/uploads
chown -R "$SERVICE_USER:$SERVICE_USER" apps/server/data apps/server/uploads 2>/dev/null || true

if [ "$DO_RESTART" = "1" ]; then
  systemctl restart hl-blog
  sleep 2
  if systemctl is-active --quiet hl-blog; then
    echo "    服务已重启"
  else
    echo "    服务启动失败，请查看：journalctl -u hl-blog -n 50 --no-pager" >&2
    exit 1
  fi
else
  echo "    已跳过重启"
fi

rm -f "$TARBALL"
echo "DONE"
