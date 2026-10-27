import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';

/**
 * 服务端 Markdown 渲染 + 强净化。
 *
 * 为什么必须用白名单净化而不是正则删标签：
 * 正则无法穷举 `javascript&colon;`、`vbscript:`、`<style>@import`、mXSS 变体等绕过手法。
 * 这里用 sanitize-html（基于 htmlparser2 的 DOM 级白名单），只放行原创博客真正需要的标签与属性。
 */

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'blockquote', 'ul', 'ol', 'li',
  'a', 'img', 'figure', 'figcaption',
  'code', 'pre', 'kbd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'div', 'span', 'button',
];

const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading', 'decoding', 'width', 'height'],
    code: ['class'],
    pre: ['class'],
    div: ['class', 'data-lang', 'data-copy'],
    button: ['class', 'type', 'data-copy'],
    span: ['class'],
    th: ['align', 'style'],
    td: ['align', 'style'],
    h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'],
  },
  // 只允许 http(s)、mailto 与相对路径；javascript:/data:/vbscript: 一律丢弃
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href || '';
      const external = /^https?:\/\//i.test(href);
      return {
        tagName: 'a',
        attribs: {
          ...(href ? { href } : {}),
          ...(attribs.title ? { title: attribs.title } : {}),
          ...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {}),
        },
      };
    },
    img: (tagName, attribs) => ({
      tagName: 'img',
      attribs: {
        ...(attribs.src ? { src: attribs.src } : {}),
        alt: attribs.alt || '',
        loading: 'lazy',
        decoding: 'async',
      },
    }),
  },
  // 不允许任何 on* 事件属性
  allowedClasses: {
    code: ['hljs', 'language-*'],
    pre: [],
    div: ['code-block'],
    span: ['kbd'],
  },
  exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href,
};

const ALLOWED_LANGS = new Set([
  'js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'vue', 'html', 'xml', 'css', 'scss', 'sass', 'less',
  'json', 'yaml', 'yml', 'toml', 'ini', 'md', 'markdown', 'bash', 'shell', 'sh', 'powershell', 'sql', 'python',
  'py', 'go', 'rust', 'java', 'kotlin', 'swift', 'c', 'cpp', 'csharp', 'php', 'ruby', 'lua', 'diff', 'nginx',
  'dockerfile', 'http', 'makefile',
]);

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let hljsPromise = null;
function loadHighlighter() {
  if (!hljsPromise) {
    hljsPromise = import('highlight.js/lib/common')
      .then((mod) => mod.default || mod)
      .catch(() => null);
  }
  return hljsPromise;
}

export async function renderMarkdown(source, { highlight = true } = {}) {
  const raw = marked.parse(source || '', { gfm: true, breaks: false, async: false });

  if (!highlight || !String(raw).includes('<pre>')) {
    return withHeadingIds(sanitizeHtml(String(raw), SANITIZE_OPTIONS));
  }

  const hljs = await loadHighlighter();
  const html = String(raw).replace(
    /<pre><code(?: class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_m, lang, code) => {
      const text = decodeEntities(code);
      let body;
      try {
        if (hljs && lang && hljs.getLanguage(lang)) body = hljs.highlight(text, { language: lang }).value;
        else if (hljs && lang && ALLOWED_LANGS.has(lang)) body = hljs.highlightAuto(text).value;
        else body = escapeHtml(text);
      } catch {
        body = escapeHtml(text);
      }
      const label = lang && ALLOWED_LANGS.has(lang) ? escapeHtml(lang) : 'code';
      return `<div class="code-block" data-lang="${label}"><button class="code-copy" type="button" data-copy>复制</button><pre><code class="hljs">${body}</code></pre></div>`;
    },
  );

  return withHeadingIds(sanitizeHtml(html, SANITIZE_OPTIONS));
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 给 h2 / h3 注入锚点 id，供右侧目录跳转 */
export function withHeadingIds(html) {
  let index = 0;
  return html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, level, inner) => {
    index += 1;
    return `<h${level} id="section-${index}">${inner}</h${level}>`;
  });
}

/** 从 Markdown 提取标题，生成目录 */
export function extractHeadings(markdown) {
  const headings = [];
  const re = /^(#{2,3})\s+(.+)$/gm;
  let match;
  let index = 0;
  while ((match = re.exec(markdown || ''))) {
    index += 1;
    headings.push({
      id: `section-${index}`,
      level: match[1].length,
      text: match[2].replace(/[*_`]/g, '').replace(/<[^>]*>/g, '').trim().slice(0, 80),
    });
  }
  return headings;
}

/** 净化纯文本字段（标题/摘要），前端用 v-text 渲染时也保持干净 */
export function cleanText(value, max = 200) {
  return sanitizeHtml(String(value ?? ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
