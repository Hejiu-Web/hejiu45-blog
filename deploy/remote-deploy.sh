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

# 备份前先停服务：SQLite 开着 WAL 时直接 cp 会拿到不一致的快照。
# 停一下再复制，能保证备份是完整可用的（真要回滚时靠得住）。
SERVICE_WAS_ACTIVE=0
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet hl-blog 2>/dev/null; then
  SERVICE_WAS_ACTIVE=1
  echo "    暂停服务以保证备份一致"
  systemctl stop hl-blog 2>/dev/null || true
  sleep 1

  # 兜底：无论后面哪一步失败（装依赖、构建报错等），都要把服务拉起来，
  # 否则站点会一直处于停止状态。
  trap 'if systemctl is-active --quiet hl-blog 2>/dev/null; then :; else echo "    [中断] 正在恢复服务..." >&2; systemctl start hl-blog 2>/dev/null || true; fi' EXIT
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

echo "[3/6] 覆盖源码（跳过数据目录）"
# 核心原则：数据目录原地不动，既不删除也不复制。
# 旧做法是「先备份 → 覆盖 → rm -rf 数据目录 → 复制回来」，
# 一旦备份不完整（WAL 未落盘、磁盘满、复制中断）就是永久丢数据。
# 现在改为在覆盖源码时直接排除数据目录，数据全程不被触碰。
ROOT_ABS="$(pwd -P)"

# tar 的 --exclude 匹配的是包内相对路径，必须把绝对路径换算成相对路径，
# 否则 --exclude=/abs/path 永远匹配不上，数据就会被发布包覆盖。
to_rel() {
  local abs="$1" rel
  [ -n "$abs" ] || { printf ''; return; }
  case "$abs" in
    "$ROOT_ABS"/*) rel="${abs#"$ROOT_ABS"/}" ;;
    /*) printf ''; return ;;   # 项目外的路径，不在覆盖范围内
    *) rel="$abs" ;;
  esac
  # 统一去掉 ./ 前缀与结尾斜杠
  rel="${rel#./}"
  rel="${rel%/}"
  printf '%s' "$rel"
}

DATA_TAR_REL="$(to_rel "$DATA_REL")"
UPLOAD_TAR_REL="$(to_rel "$UPLOAD_REL")"

EXCLUDES=()
if [ -n "$DATA_TAR_REL" ]; then
  EXCLUDES+=(--exclude="$DATA_TAR_REL" --exclude="./$DATA_TAR_REL")
fi
if [ -n "$UPLOAD_TAR_REL" ] && [ "$UPLOAD_TAR_REL" != "$DATA_TAR_REL" ]; then
  EXCLUDES+=(--exclude="$UPLOAD_TAR_REL" --exclude="./$UPLOAD_TAR_REL")
fi

# 兜底：连同项目根下常见的运行时目录一起排除。
# 用户可能把 DATA_DIR 指向 data，却忘了配 UPLOAD_DIR，
# 此时不许让发布包里的 uploads/ 覆盖真实上传文件。
for guess in data uploads; do
  EXCLUDES+=(--exclude="$guess" --exclude="./$guess")
done

if [ ${#EXCLUDES[@]} -gt 0 ]; then
  echo "    跳过：${DATA_TAR_REL:-$DATA_REL}${UPLOAD_TAR_REL:+ / $UPLOAD_TAR_REL}"
  SNAP="$(mktemp -d)"
  tar -cf "$SNAP/src.tar" -C .release-tmp "${EXCLUDES[@]}" .
  # 二次保险：确认包内已无数据路径；若有则改用逐文件复制
  GUARD_PAT="^\\./(data|uploads)($|/)"
  [ -n "$DATA_TAR_REL" ] && GUARD_PAT="$GUARD_PAT|^\\./$DATA_TAR_REL($|/)"
  [ -n "$UPLOAD_TAR_REL" ] && GUARD_PAT="$GUARD_PAT|^\\./$UPLOAD_TAR_REL($|/)"
  if tar -tf "$SNAP/src.tar" | grep -qE "$GUARD_PAT"; then
    echo "    警告：排除未完全生效，改用逐文件复制" >&2
    rm -f "$SNAP/src.tar"
    ( cd .release-tmp && find . \( -type f -o -type l \) -print ) | while IFS= read -r f; do
      rel="${f#./}"
      skip=0
      case "$rel" in
        data|data/*|uploads|uploads/*) skip=1 ;;
      esac
      if [ -n "$DATA_TAR_REL" ]; then
        case "$rel" in
          "$DATA_TAR_REL"|"$DATA_TAR_REL"/*) skip=1 ;;
        esac
      fi
      if [ -n "$UPLOAD_TAR_REL" ]; then
        case "$rel" in
          "$UPLOAD_TAR_REL"|"$UPLOAD_TAR_REL"/*) skip=1 ;;
        esac
      fi
      [ "$skip" = "1" ] && continue
      mkdir -p "$(dirname "$rel")"
      cp -a ".release-tmp/$rel" "$rel"
    done
  else
    tar -xf "$SNAP/src.tar" -C .
  fi
  rm -rf "$SNAP"
else
  cp -a .release-tmp/. .
fi

# .env 单独保护：发布包不含它，但万一带了也绝不允许覆盖
if [ -f "$KEEP/.env" ]; then
  cp -a "$KEEP/.env" . 2>/dev/null || true
fi
rm -rf .release-tmp

echo "[4/6] 校验数据完整性（数据全程未被触碰，仅做检查）"
if [ -n "$DATA_REL" ] && [ -d "$DATA_REL" ]; then
  echo "    数据目录完好：$(du -sh "$DATA_REL" 2>/dev/null | cut -f1)（$DATA_REL）"
  # 主库存在则报告行数，便于确认文章还在
  DB_FILE=""
  for candidate in "$DATA_REL/blog.db" "$DATA_REL/app.db"; do
    [ -f "$candidate" ] && DB_FILE="$candidate" && break
  done
  if [ -n "$DB_FILE" ] && command -v node >/dev/null 2>&1; then
    node -e "
      try {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(process.argv[1], { readOnly: true });
        const posts = db.prepare('SELECT COUNT(*) AS c FROM posts').get().c;
        const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
        console.log('    文章 ' + posts + ' 篇 · 账号 ' + users + ' 个');
      } catch (e) { console.log('    （无法读取数据库统计，不影响部署）'); }
    " "$DB_FILE" 2>/dev/null || true
  fi
else
  echo "    警告：数据目录不存在（$DATA_REL）" >&2
fi
if [ -n "$UPLOAD_REL" ] && [ -d "$UPLOAD_REL" ]; then
  echo "    上传目录完好：$(du -sh "$UPLOAD_REL" 2>/dev/null | cut -f1)（$UPLOAD_REL）"
fi
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
