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

# ── 解析数据目录：必须以 .env 里的 DATA_DIR / UPLOAD_DIR 为准 ──
# 写死 apps/server/data 是个坑：用户一旦把 DATA_DIR 指到别处，
# 备份就会落空，覆盖源码时真实数据处于无保护状态。
read_env() {
  # 读取 .env 中某个键的值，去掉引号与行尾注释；找不到返回空
  [ -f .env ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 |
    sed 's/[[:space:]]*#.*$//; s/^"\(.*\)"$/\1/; s/^'"'"'\(.*\)'"'"'$/\1/; s/[[:space:]]*$//'
}

# 相对路径保持在项目根目录下的原样（不加 ./ 前缀，避免日志里出现 ./data 这种冗余）
resolve_dir() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s' "$1" ;;
  esac
}

DATA_DIR_CFG="$(read_env DATA_DIR)"
UPLOAD_DIR_CFG="$(read_env UPLOAD_DIR)"
DATA_REL="$(resolve_dir "${DATA_DIR_CFG:-apps/server/data}")"
UPLOAD_REL="$(resolve_dir "${UPLOAD_DIR_CFG:-apps/server/uploads}")"
# 去掉用户可能写成 ./data 的前缀，保证路径拼接与日志展示一致
DATA_REL="${DATA_REL#./}"
UPLOAD_REL="${UPLOAD_REL#./}"

# ── 安全防护：这些路径绝不允许 rm -rf ──
# 恢复数据时会先删掉目标目录再复制回去，一旦 DATA_DIR 配错（比如写成 / 或 /usr），
# 后果不可挽回。这里做白名单式校验，宁可中止部署。
safe_dir() {
  local d="$1"
  case "$d" in
    ''|.|./|/|..|../|*'..'|/*/../*|*'//'*)
      return 1 ;;
  esac
  # 明确拒绝系统关键目录及其子目录
  for bad in /bin /boot /dev /etc /home /lib /lib64 /proc /root /run /sbin /srv /sys /tmp /usr /var; do
    if [ "$d" = "$bad" ]; then return 1; fi
  done
  return 0
}

for check_dir in "$DATA_REL" "$UPLOAD_REL"; do
  if ! safe_dir "$check_dir"; then
    echo "拒绝执行：目录路径不安全（$check_dir）" >&2
    echo "请检查 .env 的 DATA_DIR / UPLOAD_DIR，应指向项目内的数据目录。" >&2
    exit 1
  fi
done

echo "[2/6] 备份运行时数据"
echo "    数据目录：${DATA_REL:-（未配置）}"
echo "    上传目录：${UPLOAD_REL:-（未配置）}"

if [ "$DATA_REL" = "$UPLOAD_REL" ]; then
  echo "    警告：DATA_DIR 与 UPLOAD_DIR 相同，将按目录整体备份" >&2
fi

KEEP="$(mktemp -d)"
BACKED_UP=0
if [ -n "$DATA_REL" ] && [ -d "$DATA_REL" ]; then
  mkdir -p "$KEEP/data"
  cp -a "$DATA_REL/." "$KEEP/data/"
  BACKED_UP=1
  echo "    已备份数据：$(du -sh "$DATA_REL" 2>/dev/null | cut -f1)（$DATA_REL）"
fi
if [ -n "$UPLOAD_REL" ] && [ -d "$UPLOAD_REL" ] && [ "$UPLOAD_REL" != "$DATA_REL" ]; then
  mkdir -p "$KEEP/uploads"
  cp -a "$UPLOAD_REL/." "$KEEP/uploads/"
  BACKED_UP=1
  echo "    已备份上传：$(du -sh "$UPLOAD_REL" 2>/dev/null | cut -f1)（$UPLOAD_REL）"
fi
if [ -f .env ]; then cp -a .env "$KEEP/.env"; fi

# 备份失败就中止：宁可不部署，也不能在无备份的情况下覆盖
if [ "$BACKED_UP" = "0" ]; then
  echo "    找不到任何运行时数据目录，为安全起见中止部署。" >&2
  echo "    请检查 .env 的 DATA_DIR / UPLOAD_DIR，或手动确认目录是否存在。" >&2
  rm -rf "$KEEP" .release-tmp
  exit 1
fi

echo "[3/6] 覆盖源码（保留 data / uploads / .env）"
cp -a .release-tmp/. .
rm -rf .release-tmp

echo "[4/6] 恢复运行时数据"
# 恢复前先清掉发布包可能带来的同名目录，避免新旧内容混合
if [ -d "$KEEP/data" ]; then
  if [ -n "$DATA_REL" ]; then
    rm -rf "$DATA_REL"
    mkdir -p "$DATA_REL"
    cp -a "$KEEP/data/." "$DATA_REL/"
  fi
fi
if [ -d "$KEEP/uploads" ]; then
  if [ -n "$UPLOAD_REL" ] && [ "$UPLOAD_REL" != "$DATA_REL" ]; then
    rm -rf "$UPLOAD_REL"
    mkdir -p "$UPLOAD_REL"
    cp -a "$KEEP/uploads/." "$UPLOAD_REL/"
  fi
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
# 按 .env 解析出的真实目录授权，别去碰默认路径
for dir in "$DATA_REL" "$UPLOAD_REL"; do
  [ -n "$dir" ] || continue
  mkdir -p "$dir"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$dir" 2>/dev/null || true
done
# 封面目录固定在数据目录下的 covers，一并授权
[ -n "$DATA_REL" ] && [ -d "$DATA_REL/covers" ] &&
  chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_REL/covers" 2>/dev/null || true

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
