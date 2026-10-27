# =============================================================================
# 和久博客 · 本地打包脚本（Windows）
#
# 用法：
#   .\scripts\release.ps1                    # 构建 + 打包
#   .\scripts\release.ps1 -SkipBuild         # 跳过构建，用已有 dist
#   .\scripts\release.ps1 -Open              # 打包完成后打开所在文件夹
#
# 它只做两件事：构建前端、生成发布包。上传由你自己完成。
#
# 打包内容：源码 + 前端构建产物 + deploy/ 脚本
# 自动排除：node_modules（Windows 二进制，Linux 上会报错）、数据库、上传文件、.env
#
# 生成后脚本会打印上传与部署命令，照着做即可。
# =============================================================================

[CmdletBinding()]
param(
  # 跳过前端构建，使用已有的 apps/web/dist
  [switch]$SkipBuild,

  # 打包完成后在资源管理器中打开输出目录
  [switch]$Open
)

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host ''; Write-Host ('==> ' + $msg) -ForegroundColor Cyan }
function Ok($msg)   { Write-Host ('    ' + $msg) -ForegroundColor Green }
function Warn($msg) { Write-Host ('    ' + $msg) -ForegroundColor Yellow }
function Fail($msg) { Write-Host ('    ' + $msg) -ForegroundColor Red }

function CheckExit($what) {
  if ($LASTEXITCODE -ne 0) {
    Fail ($what + ' 失败，退出码 ' + $LASTEXITCODE)
    exit 1
  }
}

# ---------------------------------------------------------------- 0. 环境检查
Step '检查本地环境'

if (-not (Test-Path 'package.json')) {
  Fail '请在项目根目录运行本脚本'
  exit 1
}

if (-not (Get-Command 'tar' -ErrorAction SilentlyContinue)) {
  Fail '缺少 tar 命令（Windows 10/11 自带，可在「设置 / 应用 / 可选功能」中启用）'
  exit 1
}
Ok 'tar 可用'

$nodeV = (node -v)
if (-not $nodeV) { Fail '缺少 Node.js，需要 22.5 或更高'; exit 1 }
Ok ('Node.js ' + $nodeV)

$pnpmV = (pnpm -v)
if (-not $pnpmV) { Fail '缺少 pnpm，请先执行 npm i -g pnpm'; exit 1 }
Ok ('pnpm ' + $pnpmV)

# ---------------------------------------------------------------- 1. 构建
$distFile = 'apps/web/dist/index.html'

if ($SkipBuild) {
  Step '跳过构建'
  if (-not (Test-Path $distFile)) {
    Fail 'apps/web/dist 不存在，无法跳过构建'
    exit 1
  }
  Warn '使用已有构建产物'
} else {
  Step '构建前端'
  pnpm build
  CheckExit '前端构建'
  if (-not (Test-Path $distFile)) { Fail ('构建完成但缺少 ' + $distFile); exit 1 }
  Ok '构建完成'
}

# ---------------------------------------------------------------- 2. 打包
Step '打包'

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tarName = 'hl-blog-' + $stamp + '.tar.gz'
$outDir = Join-Path (Get-Location) 'release'
$tarLocal = Join-Path $outDir $tarName

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $tarLocal) { Remove-Item $tarLocal -Force }

$items = @('package.json', 'pnpm-lock.yaml', 'apps', 'deploy', 'README.md', 'DEPLOY.md', '.env.example')
$items = $items | Where-Object { Test-Path $_ }

$excludes = @(
  '--exclude=node_modules',
  '--exclude=*/node_modules',
  '--exclude=apps/server/data',
  '--exclude=apps/server/uploads',
  '--exclude=.env',
  '--exclude=.local',
  '--exclude=release',
  '--exclude=.git',
  '--exclude=.shots',
  '--exclude=*.log'
)

tar -czf $tarLocal @excludes @items
CheckExit '打包'

$sizeBytes = (Get-Item $tarLocal).Length
$tarKB = [string]([math]::Round($sizeBytes / 1024, 1))
Ok ('已生成 release\' + $tarName + '（' + $tarKB + ' KB）')

# ---------------------------------------------------------------- 3. 内容校验
Step '校验包内容'

$listing = (tar -tzf $tarLocal) -join [Environment]::NewLine

$problems = @()
if ($listing -match '(^|/)node_modules/') { $problems += '包含 node_modules（Linux 上无法运行）' }
if ($listing -match '(^|/)apps/server/data/') { $problems += '包含数据库文件（会覆盖服务器数据）' }
if ($listing -match '(^|/)apps/server/uploads/') { $problems += '包含上传文件（会覆盖服务器文件）' }
if ($listing -notmatch 'apps/web/dist/index\.html') { $problems += '缺少前端构建产物' }
if ($listing -notmatch 'remote-deploy\.sh') { $problems += '缺少远端部署脚本' }

if ($problems.Count -gt 0) {
  Fail '包内容有问题：'
  $problems | ForEach-Object { Fail ('  - ' + $_) }
  exit 1
}
Ok '不含 node_modules / 数据库 / 上传文件'
Ok '包含构建产物与部署脚本'

# ---------------------------------------------------------------- 4. 提示后续步骤
Step '打包完成'

$outFull = Join-Path $outDir $tarName

Write-Host ''
Write-Host '  发布包：' -ForegroundColor White
Write-Host ('    ' + $outFull) -ForegroundColor Gray
Write-Host ''
Write-Host '  接下来手动上传。以下是完整命令，替换服务器地址即可：' -ForegroundColor White
Write-Host ''
Write-Host '  ── 第 1 步：上传（在你本地执行）──' -ForegroundColor Cyan
Write-Host ('    scp "' + $outFull + '" root@你的服务器:/srv/hl-blog/') -ForegroundColor Gray
Write-Host ''
Write-Host '  ── 第 2 步：登录服务器并部署 ──' -ForegroundColor Cyan
Write-Host '    ssh root@你的服务器' -ForegroundColor Gray
Write-Host '    cd /srv/hl-blog' -ForegroundColor Gray
Write-Host ('    bash deploy/remote-deploy.sh ' + $tarName + ' www-data 1') -ForegroundColor Gray
Write-Host ''
Write-Host '  ── 第 3 步：确认服务状态 ──' -ForegroundColor Cyan
Write-Host '    systemctl status hl-blog --no-pager' -ForegroundColor Gray
Write-Host '    curl -I https://你的域名' -ForegroundColor Gray
Write-Host ''
Write-Host '  说明：' -ForegroundColor White
Write-Host '    - 部署脚本会自动备份并保留服务器上的 data / uploads / .env' -ForegroundColor DarkGray
Write-Host '    - 首次部署若没有 .env，先执行 cp .env.example .env 并填写' -ForegroundColor DarkGray
Write-Host '    - 详细步骤见 deploy/SOURCE-DEPLOY.md 与 deploy/RELEASE.md' -ForegroundColor DarkGray
Write-Host ''

if ($Open) {
  Start-Process explorer.exe $outDir
}
