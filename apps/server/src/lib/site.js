import { all, get, run } from '../db.js';
import { config } from '../config.js';

/**
 * 站点设置：作者可以自定义站点名、标语、首页文案、页脚等，不需要改代码。
 * 存 settings 表，公开接口只读暴露白名单字段。
 */
const DEFAULTS = {
  siteName: '鹤酒',
  siteTagline: '写代码，也写生活里的留白',
  siteDescription: '一个关于前端工程、视觉设计与长期主义的个人空间。',
  heroTitle: '把想法写下来。',
  heroLead: '一个关于前端工程、视觉设计与长期主义的个人空间。',
  authorName: '鹤酒',
  authorBio: '前端工程师。白天写界面，晚上写文章。',
  footerText: '',
  rssTitle: '',
  icp: '',

  /* ── 背景音乐 ── */
  bgmEnabled: 'false',
  bgmUrl: '', // 本地上传路径（/uploads/...）或 https 外链
  bgmTitle: '',
  bgmLoop: 'true',
  bgmVolume: '0.35', // 0 ~ 1
  bgmAutoplay: 'true', // 浏览器要求用户交互后才能真正出声，前端会做「首次交互淡入」兜底
  bgmShowControl: 'true', // 是否在页面上显示播放控制条

  /* ── 写作台 ── */
  pasteHint: 'true', // 是否显示「支持 Markdown 粘贴」的提示条

  /* ── 首页 ── */
  heroKicker: '', // 首屏上方的小标签，如「长期主义」
  heroPrimaryLabel: '读最新一篇',
  heroSecondaryLabel: '全部文章',
  sectionRecentTitle: '读者最常停下来的几篇',
  sectionRecentLead: '按喜欢与阅读量排序，不是榜单，只是一个入口。',
  sectionLatestTitle: '最近写的',
  sectionLatestLead: '',

  /* ── 关于页 ── */
  aboutTitle: '', // 留空用站点名
  aboutLead: '',
  aboutLocation: '中国 · 远程',
  aboutSince: '自 2019 年起',
  aboutBody: '', // Markdown，正文主体
  aboutStats: '', // 每行「值|说明」
  aboutStacks: '', // 每行「分组名|条目1, 条目2」
  aboutCtaText: '',

  /* ── 导航与页脚链接（每行「标签|路径」）── */
  navLinks: '',
  footerLinks: '',
};

const EDITABLE = Object.keys(DEFAULTS);
/** 长文本字段放宽上限（关于页正文、多行配置） */
const MAX_LEN = 400;
const LONG_KEYS = new Set(['aboutBody', 'aboutStats', 'aboutStacks', 'navLinks', 'footerLinks', 'heroTitle', 'heroLead']);

const BOOL_KEYS = new Set(['bgmEnabled', 'bgmLoop', 'bgmAutoplay', 'bgmShowControl', 'pasteHint']);

/** 音量与 URL 需要收敛成安全值：不允许 javascript: 之类的协议，音量夹在 0~1 */
function normalizeValue(key, raw) {
  const value = String(raw ?? '').slice(0, LONG_KEYS.has(key) ? 8000 : MAX_LEN);
  if (BOOL_KEYS.has(key)) return value === 'true' || value === '1' ? 'true' : 'false';
  if (key === 'bgmVolume') {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.min(1, Math.max(0, Number(n.toFixed(2))))) : '0.35';
  }
  if (key === 'bgmUrl') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/covers/')) {
      return /^\/[a-z0-9/_.-]+$/i.test(trimmed) && !trimmed.includes('..') ? trimmed : '';
    }
    try {
      const url = new URL(trimmed);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch {
      return '';
    }
  }
  return value;
}

export function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = {};
  for (const key of EDITABLE) {
    out[key] = key in stored ? stored[key] : DEFAULTS[key];
  }
  return out;
}

export function updateSettings(patch) {
  const applied = {};
  for (const [key, raw] of Object.entries(patch || {})) {
    if (!EDITABLE.includes(key)) continue;
    const value = normalizeValue(key, raw);
    if (get('SELECT key FROM settings WHERE key = ?', [key])) {
      run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
    } else {
      run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
    applied[key] = value;
  }
  return applied;
}

/**
 * 把数据库里仍是「上一版默认值」的字段更新为新默认值。
 *
 * 站点名这类字段的默认值写在代码里：用户没在后台改过时数据库里没有记录，
 * 但一旦保存过一次就会固化旧值。改名时把这类记录一并迁移，避免界面出现新旧两个名字。
 */
export function migrateDefaults(nextDefaults, previousDefaults) {
  let changed = 0;
  for (const [key, nextValue] of Object.entries(nextDefaults)) {
    const previous = previousDefaults[key];
    if (previous === undefined || previous === nextValue) continue;
    const row = get('SELECT value FROM settings WHERE key = ?', [key]);
    if (row && row.value === previous) {
      run('UPDATE settings SET value = ? WHERE key = ?', [nextValue, key]);
      changed += 1;
    }
  }
  return changed;
}

export const DEFAULT_SETTINGS = DEFAULTS;

/** 对外暴露的站点信息：含默认值兜底与当前年份 */
export function publicSiteInfo() {
  const settings = getSettings();
  return {
    ...settings,
    rssTitle: settings.rssTitle || settings.siteName,
    footerText: settings.footerText || `© ${new Date().getFullYear()} ${settings.siteName} · 保留所有权利`,
    siteUrl: config.siteUrl,
  };
}

export const SETTING_KEYS = EDITABLE;
