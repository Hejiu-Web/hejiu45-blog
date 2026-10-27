/**
 * 把仓库根目录的背景音乐导入媒体库，并设为站点默认背景音乐。
 *
 * 幂等：媒体库里已有同样大小的音频时直接复用，不会重复上传。
 * 用法：node apps/server/src/import-bgm.js [文件路径]
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDb, get } from './db.js';
import { config } from './config.js';
import { saveAv } from './lib/media.js';
import { updateSettings, getSettings } from './lib/site.js';

const DEFAULT_FILE = '艾拉拉,Luv4 - 千年之后.mp3';
const TITLE = '千年之后';

async function main() {
  const filePath = path.resolve(process.argv[2] || DEFAULT_FILE);
  if (!fs.existsSync(filePath)) {
    console.error(`找不到文件：${filePath}`);
    process.exitCode = 1;
    return;
  }

  const buffer = fs.readFileSync(filePath);

  // 幂等：同尺寸的音频视为已导入
  const existing = get("SELECT id, url FROM media WHERE kind = 'audio' AND size = ? LIMIT 1", [buffer.length]);

  let url = existing?.url;
  if (url) {
    console.log(`[bgm] 媒体库里已有这个音频，直接复用：${url}`);
  } else {
    const media = await saveAv(buffer, { userId: null });
    url = media.url;
    console.log(`[bgm] 已导入媒体库：${url}`);
  }

  const applied = updateSettings({ bgmEnabled: 'true', bgmUrl: url, bgmTitle: TITLE });
  const settings = getSettings();
  console.log(`[bgm] 已设为默认背景音乐：${applied.bgmUrl}`);
  console.log(`[bgm] 启用=${settings.bgmEnabled} 标题=${settings.bgmTitle} 循环=${settings.bgmLoop} 音量=${settings.bgmVolume}`);
}

await openDb(path.join(config.dataDir, 'blog.db'));
await main();
