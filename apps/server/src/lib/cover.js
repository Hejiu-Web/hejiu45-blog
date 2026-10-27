/**
 * 本地封面生成：不依赖任何外部图床。
 * 输出 1600×900 的 SVG：几何底纹 + 首字排印 + 站点色。
 * 种子由 slug 哈希决定，所以同一篇文章每次生成都保持一致。
 */
import fs from 'node:fs';
import path from 'node:path';

const ACCENTS = ['#b8472f', '#1f6f5c', '#2f6bb3', '#8a5a2b', '#5c4f9e'];
const KINDS = ['grid', 'lines', 'dots', 'arc'];

/** 两套纸面：浅色用米白，深色用暖黑，文字随纸面反转 */
const SURFACES = {
  light: { from: '#f5f3ef', to: '#e7e4dd', ink: '#1d1c1a' },
  dark: { from: '#20201e', to: '#171716', ink: '#f0ede7' },
};

export function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 提取标题首字。
 *
 * 用 Intl.Segmenter 按「字素簇」切分：截图里曾出现「把」被切成半个字的乱码，
 * 根因是用 charAt(0) 处理了代理对（emoji / 生僻字）以及组合字符。
 * 没有 Intl.Segmenter 的环境退回 [...str]（按码点切分，足以覆盖绝大多数情况）。
 */
export function firstGrapheme(title) {
  const text = String(title || '久').trim();
  if (!text) return '久';
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const seg = new Intl.Segmenter('zh', { granularity: 'grapheme' });
      const first = seg.segment(text)[Symbol.iterator]().next();
      if (first?.value?.segment) return first.value.segment;
    } catch {
      /* 退回下面的方案 */
    }
  }
  return Array.from(text)[0] || '久';
}

function patternMarkup(kind, accent, ink) {
  switch (kind) {
    case 'grid':
      return `<defs><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="${ink}" stroke-width="1" stroke-opacity="0.09"/>
      </pattern></defs><rect width="1600" height="900" fill="url(#p)"/>`;
    case 'lines':
      return `<defs><pattern id="p" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
        <rect width="120" height="1.5" fill="${ink}" fill-opacity="0.1"/>
      </pattern></defs><rect width="1600" height="900" fill="url(#p)"/>`;
    case 'dots':
      return `<defs><pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="2.2" fill="${ink}" fill-opacity="0.18"/>
      </pattern></defs><rect width="1600" height="900" fill="url(#p)"/>`;
    default:
      return `<circle cx="1290" cy="120" r="430" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>
        <circle cx="1290" cy="120" r="360" fill="none" stroke="${ink}" stroke-width="1.5" stroke-opacity="0.18"/>
        <circle cx="1290" cy="120" r="520" fill="none" stroke="${ink}" stroke-width="1.5" stroke-opacity="0.12"/>
        <circle cx="1010" cy="470" r="64" fill="${accent}" fill-opacity="0.9"/>`;
  }
}

export function renderCover({ title, tag = '鹤酒', seed = 0, theme = 'light' }) {
  const n = typeof seed === 'number' ? seed : hashText(String(seed));
  const accent = ACCENTS[n % ACCENTS.length];
  const kind = KINDS[Math.floor(n / 7) % 4];
  const initial = esc(firstGrapheme(title));
  const s = SURFACES[theme === 'dark' ? 'dark' : 'light'];
  // 标签最长 6 个字符，同时用 textLength 锁定宽度：中文字形宽度不一致也不会溢出画布
  const label = esc(tag).toUpperCase().slice(0, 6);
  const labelWidth = label.replace(/[^\x00-\x7F]/g, '  ').length * 20;

  // 以 <img> 方式加载 SVG 时不支持 CSS 类选择器，样式必须内联，
  // 所以黑/白描边直接写进每个元素的 stroke / fill 属性。
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${s.from}"/>
      <stop offset="1" stop-color="${s.to}"/>
    </linearGradient>
    <clipPath id="frame"><rect x="72" y="72" width="1456" height="756"/></clipPath>
  </defs>
  <rect width="1600" height="900" fill="url(#wash)"/>
  <g clip-path="url(#frame)">
    ${patternMarkup(kind, accent, s.ink)}
  </g>
  <rect x="72" y="72" width="1456" height="756" fill="none" stroke="${s.ink}" stroke-width="1.5" stroke-opacity="0.16"/>
  <!-- 字体链覆盖各平台常见中文字形（macOS / Windows / Linux） -->
  <text x="120" y="712" font-family="'Noto Serif SC','Source Han Serif SC','Songti SC','SimSun',serif" font-size="300" font-weight="700" fill="${s.ink}" fill-opacity="0.88">${initial}</text>
  <rect x="122" y="752" width="96" height="7" fill="${accent}"/>
  <text x="122" y="822" textLength="${labelWidth}" lengthAdjust="spacingAndGlyphs" font-family="'Noto Sans SC','Microsoft YaHei UI','PingFang SC',system-ui,sans-serif" font-size="20" fill="${s.ink}" fill-opacity="0.62">${label}</text>
  <text x="1478" y="812" text-anchor="end" textLength="120" lengthAdjust="spacingAndGlyphs" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="16" fill="${s.ink}" fill-opacity="0.45">HEJIU45</text>
</svg>
`;
}

export function writeCover(dir, post) {
  fs.mkdirSync(dir, { recursive: true });
  const file = `${post.slug}.svg`;
  fs.writeFileSync(
    path.join(dir, file),
    renderCover({ title: post.title, tag: post.tags?.[0] || '鹤酒', seed: hashText(post.slug), theme: post.theme }),
    'utf8',
  );
  return `/covers/${file}`;
}
