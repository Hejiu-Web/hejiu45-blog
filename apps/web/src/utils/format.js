const formatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const shortFormatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' });

export function formatDate(value, { short = false } = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return (short ? shortFormatter : formatter).format(date);
}

export function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.round(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.round(diff / day)} 天前`;
  return formatDate(value, { short: true });
}

export function compactNumber(n = 0) {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n / 1000)}k`;
}

const LONG = ['小时', '分钟', '秒', '天', '周', '个月', '年'];
const SHORT = ['小', '分', '秒', '天', '周', '个月', '年'];

export function formatDuration(seconds, { verbose = false, max = 2 } = {}) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total} 秒`;

  const units = [
    { size: 86400 * 7, label: LONG[4], short: SHORT[4] },
    { size: 86400, label: LONG[3], short: SHORT[3] },
    { size: 3600, label: LONG[0], short: SHORT[0] },
    { size: 60, label: LONG[1], short: SHORT[1] },
    { size: 1, label: LONG[2], short: SHORT[2] },
  ];

  const parts = [];
  let rest = total;
  for (const unit of units) {
    if (rest < unit.size) continue;
    const value = Math.floor(rest / unit.size);
    rest -= value * unit.size;
    parts.push(`${value} ${verbose ? unit.label : unit.short}`);
    if (parts.length >= max) break;
  }
  return parts.join(' ') || `${total} 秒`;
}

/** 统一阅读时长文案，避免 0 分钟这种失误 */
export const readingLabel = (minutes = 1) => `${Math.max(1, minutes)} 分钟阅读`;

export function coverFallback(seed = 'hejiu', w = 800, h = 560) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}
