const WORDS_PER_MINUTE = 350; // 中文 + 英文混排的粗略阅读速度

/** 与后端保持一致的阅读时长估算，保证列表页与阅读页数字不会打架 */
export function readingMinutes(markdown) {
  const text = stripMarkdown(markdown);
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]+/g) || []).length;
  return Math.max(1, Math.round((cjk + latin * 1.8) / WORDS_PER_MINUTE));
}

export function stripMarkdown(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
