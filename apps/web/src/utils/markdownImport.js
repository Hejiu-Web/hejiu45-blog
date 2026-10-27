/**
 * Markdown 导入工具。
 *
 * 写作台的导入路径有三条：
 *  1. 直接粘贴纯文本 / Markdown 源码 —— 交给浏览器默认行为，原样进入编辑区
 *  2. 粘贴网页或 Word 的富文本 —— 自动转成 Markdown 语法
 *  3. 选择或拖入 .md 文件 —— 解析 front matter 与标题
 */

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * 解析 front matter 里最常用的几种写法（不做完整 YAML，避免引入依赖）：
 *   title: 标题
 *   tags: [设计, 排版]   或   tags: 设计, 排版
 *   slug / excerpt / cover / description
 */
export function parseFrontMatter(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const match = source.match(FRONT_MATTER);
  if (!match) return { meta: {}, body: source, hasFrontMatter: false };

  const meta = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    let value = line
      .slice(idx + 1)
      .trim()
      .replace(/\s+#.*$/, '')
      .replace(/^["']|["']$/g, '');
    if (!value) continue;
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value
        .slice(1, -1)
        .split(/[,，]/)
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      meta[key] = value;
    }
  }
  return { meta, body: source.slice(match[0].length), hasFrontMatter: true };
}

function firstHeading(body) {
  const match = String(body || '').match(/^\s*#\s+(.+)$/m);
  return match ? match[1].replace(/[*_`]/g, '').trim() : '';
}

function stripFirstHeading(body) {
  return String(body || '').replace(/^\s*#\s+.+\r?\n?/, '');
}

function baseName(name) {
  return String(name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}[-_\s]*/, '')
    .replace(/^[\s_]+|[\s_]+$/g, '');
}

/** 把一份 Markdown 文本解析成写作台可用的字段 */
export function parseMarkdownFile({ name = '', text = '' }) {
  const { meta, body, hasFrontMatter } = parseFrontMatter(text);

  const metaTitle = typeof meta.title === 'string' ? meta.title.trim() : '';
  const title = metaTitle || firstHeading(body) || baseName(name) || '未命名文章';
  // 标题已被抽出时，正文里重复的一级标题去掉
  const content = metaTitle ? stripFirstHeading(body) : body;

  const tags = Array.isArray(meta.tags)
    ? meta.tags
    : typeof meta.tags === 'string'
      ? meta.tags.split(/[,，\s]+/).filter(Boolean)
      : [];

  return {
    title: String(title).slice(0, 120),
    content: content.replace(/^\s*\r?\n/, ''),
    excerpt: typeof meta.excerpt === 'string' ? meta.excerpt : typeof meta.description === 'string' ? meta.description : '',
    tags,
    slug: typeof meta.slug === 'string' ? meta.slug : '',
    cover: typeof meta.cover === 'string' ? meta.cover : typeof meta.image === 'string' ? meta.image : '',
    hasFrontMatter,
  };
}

/** 是否是 Markdown / 文本文件 */
export function isMarkdownFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  return /\.(md|markdown|mdown|mkd|mdx|txt)$/.test(name) || file.type === 'text/markdown' || file.type === 'text/plain';
}

const HTML_BLOCK = /<(p|div|h[1-6]|ul|ol|li|blockquote|pre|table|tr|hr)\b/i;

/** 剪贴板 HTML 是否值得转换（纯内联样式片段按纯文本处理更干净） */
export function looksLikeRichText(html) {
  return Boolean(html && HTML_BLOCK.test(html));
}

/**
 * 把网页 / Word 复制出来的富文本转成 Markdown。
 * 只处理结构标签，保留行内格式；脚本与隐藏内容会被丢弃。
 */
export function htmlToMarkdown(html) {
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script, style, noscript, template, [hidden]').forEach((el) => el.remove());

  const textOf = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim();

  const serialize = (node) => {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const inner = () => [...node.childNodes].map(serialize).join('');

    switch (tag) {
      case 'br':
        return '\n';
      case 'h1':
        return `\n# ${textOf(node)}\n\n`;
      case 'h2':
        return `\n## ${textOf(node)}\n\n`;
      case 'h3':
        return `\n### ${textOf(node)}\n\n`;
      case 'h4':
        return `\n#### ${textOf(node)}\n\n`;
      case 'h5':
        return `\n##### ${textOf(node)}\n\n`;
      case 'h6':
        return `\n###### ${textOf(node)}\n\n`;
      case 'strong':
      case 'b': {
        const value = inner().trim();
        return value ? `**${value}**` : '';
      }
      case 'em':
      case 'i': {
        const value = inner().trim();
        return value ? `*${value}*` : '';
      }
      case 'del':
      case 's': {
        const value = inner().trim();
        return value ? `~~${value}~~` : '';
      }
      case 'code':
        return node.closest('pre') ? textOf(node) : `\`${textOf(node)}\``;
      case 'pre': {
        const codeEl = node.querySelector('code');
        const cls = codeEl?.className || '';
        const lang = (cls.match(/language-([\w-]+)/) || cls.match(/lang-([\w-]+)/) || [])[1] || '';
        const raw = (codeEl?.textContent ?? node.textContent ?? '').replace(/\n+$/, '');
        return `\n\`\`\`${lang}\n${raw}\n\`\`\`\n\n`;
      }
      case 'a': {
        const href = node.getAttribute('href') || '';
        const label = inner().trim() || href;
        return href && !/^javascript:/i.test(href) ? `[${label}](${href})` : label;
      }
      case 'img': {
        const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
        const alt = node.getAttribute('alt') || '';
        return src && !src.startsWith('data:') ? `![${alt}](${src})` : '';
      }
      case 'li': {
        const parent = node.parentElement;
        const ordered = parent?.tagName.toLowerCase() === 'ol';
        const index = ordered ? [...parent.children].indexOf(node) + 1 : 0;
        return `\n${ordered ? `${index}. ` : '- '}${inner().trim()}`;
      }
      case 'ul':
      case 'ol':
        return `${inner()}\n`;
      case 'blockquote': {
        const value = inner()
          .trim()
          .split(/\r?\n/)
          .map((line) => `> ${line}`.trimEnd())
          .join('\n');
        return `\n${value}\n\n`;
      }
      case 'table': {
        const rows = [...node.querySelectorAll('tr')];
        if (!rows.length) return '';
        const cells = (row) =>
          [...row.children].map((cell) => textOf(cell).replace(/\|/g, '\\|'));
        const header = cells(rows[0]);
        const body = rows.slice(1).map(cells);
        const lines = [
          `| ${header.join(' | ')} |`,
          `| ${header.map(() => '---').join(' | ')} |`,
          ...body.map((row) => `| ${row.join(' | ')} |`),
        ];
        return `\n${lines.join('\n')}\n\n`;
      }
      case 'hr':
        return '\n---\n\n';
      case 'p':
      case 'div':
      case 'section':
      case 'article':
        return `\n${inner().trim()}\n\n`;
      default:
        return inner();
    }
  };

  const body = doc.body || doc.documentElement;
  return [...body.childNodes]
    .map(serialize)
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
