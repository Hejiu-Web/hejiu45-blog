<!--
  编辑器：左写右看，可拖动分栏（桌面），窄屏切换「写作 / 预览」。
  自动保存草稿到 localStorage；Ctrl/Cmd + S 保存。
-->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import { api } from '@/api/client';
import { usePosts } from '@/stores/posts';
import { useSiteStore } from '@/stores/site';
import { toast } from '@/composables/useToast';
import { readingMinutes } from '@/utils/reading';
import { htmlToMarkdown, isMarkdownFile, looksLikeRichText, parseMarkdownFile } from '@/utils/markdownImport';

/** 当前类型的自定义字段定义 */
const activeType = computed(() => site.typeById(form.value.typeId) || site.types[0] || null);
const typeFields = computed(() => activeType.value?.fields || []);

const props = defineProps({ id: { type: String, default: '' } });
const router = useRouter();
const store = usePosts();
const site = useSiteStore();

const isNew = computed(() => !props.id);
const STORAGE_KEY = computed(() => `hl:draft:${props.id || 'new'}`);

const form = ref({
  title: '',
  slug: '',
  excerpt: '',
  cover: '',
  tags: '',
  content: '',
  status: 'draft',
  featured: false,
  typeId: null,
  fields: {},
  media: [],
  collections: [],
});

const state = ref({
  loading: false,
  saving: false,
  error: '',
  preview: '',
  rendering: false,
  uploadProgress: false,
  generating: false,
  split: 50,
  mobilePane: 'write',
  dirty: false,
  savedAt: null,
});

const textareaRef = ref(null);
const fileRef = ref(null);
const bodyRef = ref(null);

const words = computed(() => form.value.content.trim().length);
const readMin = computed(() => readingMinutes(form.value.content));
const hasPreview = computed(() => Boolean(state.value.preview));

let renderTimer = 0;
/** 预览由服务端渲染并净化，与正式发布走同一条代码路径，所见即所得且安全 */
async function refreshPreview() {
  state.value.rendering = true;
  try {
    const { html } = await api.preview(form.value.content);
    state.value.preview = html;
  } catch {
    state.value.preview = '';
  } finally {
    state.value.rendering = false;
  }
}

watch(
  () => form.value.content,
  () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(refreshPreview, 220);
  },
  { immediate: true },
);

/** 草稿自动保存：600ms 防抖，只写 localStorage，不动服务器 */
let draftTimer = 0;
watch(
  form,
  () => {
    if (!state.value.loading) state.value.dirty = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY.value, JSON.stringify({ ...form.value, savedAt: Date.now() }));
      } catch {
        /* 存储已满时忽略 */
      }
    }, 600);
  },
  { deep: true },
);

function restoreDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY.value);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft || (!draft.title && !draft.content)) return false;
    Object.assign(form.value, {
      title: draft.title || '',
      slug: draft.slug || '',
      excerpt: draft.excerpt || '',
      cover: draft.cover || '',
      tags: Array.isArray(draft.tags) ? draft.tags.join(', ') : draft.tags || '',
      content: draft.content || '',
      typeId: draft.typeId ?? null,
      fields: draft.fields || {},
      media: Array.isArray(draft.media) ? draft.media : [],
    });
    return Boolean(draft.savedAt);
  } catch {
    return false;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY.value);
  } catch {
    /* 忽略 */
  }
}

async function load() {
  await site.ensure();
  if (isNew.value) {
    const restored = restoreDraft();
    if (restored) toast('已恢复本地草稿', { tone: 'default' });
    if (!form.value.typeId && site.types.length) {
      form.value.typeId = site.typeOf('article')?.id ?? site.types[0].id;
    }
    await nextTick();
    textareaRef.value?.focus();
    return;
  }
  state.value.loading = true;
  try {
    const { items } = await api.adminPosts();
    const post = items.find((p) => p.id === props.id);
    if (!post) throw new Error('文章不存在');
    // album=1：后台打开草稿不计数阅读量
    const detail = await api.getPost(post.slug, { query: { album: 1 } });
    Object.assign(form.value, {
      title: detail.post.title,
      slug: detail.post.slug,
      excerpt: detail.post.excerpt,
      cover: detail.post.cover,
      tags: detail.post.tags.join(', '),
      content: detail.post.content,
      status: detail.post.status,
      featured: detail.post.featured,
      typeId: detail.post.typeId,
      fields: { ...(detail.post.fields || {}) },
      media: [...(detail.post.media || [])],
      collections: (detail.collections || []).map((c) => c.slug),
    });
    state.value.dirty = false;
  } catch (err) {
    state.value.error = err.message;
  } finally {
    state.value.loading = false;
  }
}

function payload(overrides = {}) {
  return {
    title: form.value.title.trim(),
    slug: form.value.slug.trim(),
    excerpt: form.value.excerpt.trim(),
    cover: form.value.cover.trim(),
    tags: form.value.tags,
    content: form.value.content,
    status: form.value.status,
    featured: form.value.featured,
    typeId: form.value.typeId,
    fields: form.value.fields,
    media: form.value.media.filter((m) => m.url && m.kind !== 'skipped'),
    // 合集归属必须随请求带上，否则后端无从知道要加入哪些合集
    collections: form.value.collections,
    ...overrides,
  };
}

async function save({ publish } = {}) {
  if (state.value.saving) return;
  if (!form.value.title.trim()) {
    state.value.error = '标题不能为空';
    bodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  state.value.error = '';
  state.value.saving = true;
  const nextStatus = publish ? 'published' : form.value.status;
  try {
    const body = payload({ status: nextStatus });
    const res = isNew.value ? await api.createPost(body) : await api.updatePost(props.id, body);
    const post = res.post;
    Object.assign(form.value, { status: post.status, slug: post.slug });
    store.upsert(post);
    state.value.dirty = false;
    state.value.savedAt = Date.now();
    clearDraft();
    toast(nextStatus === 'published' ? '已发布' : '草稿已保存');
    if (isNew.value) router.replace(`/admin/edit/${post.id}`);
  } catch (err) {
    state.value.error = err.message;
    toast(err.message, { tone: 'error' });
  } finally {
    state.value.saving = false;
  }
}

async function upload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    toast('图片不能超过 4MB', { tone: 'error' });
    return;
  }
  state.value.uploadProgress = true;
  try {
    const res = await api.upload(file);
    form.value.cover = res.url;
    toast('封面已上传');
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    state.value.uploadProgress = false;
    event.target.value = '';
  }
}

/** 让服务端按标题生成一张排印式封面 */
async function generateCover() {
  state.value.generating = true;
  try {
    const { url } = await api.createCover({
      title: form.value.title || '鹤酒',
      tag: form.value.tags.split(',')[0] || '鹤酒',
      slug: form.value.slug,
    });
    form.value.cover = url;
    toast('封面已生成');
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    state.value.generating = false;
  }
}

/** 在当前光标处插入一段文本（替换选区），并把光标放到末尾 */
function insertText(text, { selectLength = 0 } = {}) {
  const el = textareaRef.value;
  // 焦点不在正文时 selectionStart 可能为 null，统一按「追加到末尾」处理
  const hasCursor = el && typeof el.selectionStart === 'number';
  const start = hasCursor ? el.selectionStart : form.value.content.length;
  const end = hasCursor ? el.selectionEnd : start;
  const padded = hasCursor ? text : `${form.value.content.endsWith('\n') || !form.value.content ? '' : '\n\n'}${text}`;
  form.value.content = `${form.value.content.slice(0, start)}${padded}${form.value.content.slice(end)}`;
  state.value.dirty = true;
  if (!el) return;
  nextTick(() => {
    el.focus();
    const pos = start + padded.length + selectLength;
    el.setSelectionRange(pos, pos);
  });
}

/** Markdown 工具栏：在光标处插入语法（包住选中文字） */
function insert(before, after = '', placeholder = '文字') {
  const el = textareaRef.value;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = form.value.content.slice(start, end) || placeholder;
  form.value.content = `${form.value.content.slice(0, start)}${before}${selected}${after}${form.value.content.slice(end)}`;
  nextTick(() => {
    el.focus();
    el.setSelectionRange(start + before.length, start + before.length + selected.length);
  });
}

/**
 * 工具栏：能用一个字符表达的直接用字符（B / I / `），
 * 图标无法准确传达语义的就不要硬用图标。
 */
const TOOLS = [
  { text: 'B', title: '粗体', run: () => insert('**', '**', '粗体'), bold: true },
  { text: 'I', title: '斜体', run: () => insert('*', '*', '斜体'), italic: true },
  { icon: 'link', label: '链接', run: () => insert('[', '](https://)', '链接文字') },
  { text: '<>', title: '行内代码', run: () => insert('`', '`', 'code'), mono: true },
  { text: '{ }', title: '代码块', run: () => insert('\n```js\n', '\n```\n', '// code'), mono: true },
  { icon: 'list', label: '列表', run: () => insert('\n- ', '\n', '列表项') },
  { icon: 'arrowRight', label: '引用', run: () => insert('\n> ', '\n', '引用') },
  { text: 'H2', title: '二级标题', run: () => insert('\n## ', '\n', '小标题'), mono: true },
  { icon: 'image', label: '插入图片 / 视频', run: () => mediaRef.value?.click() },
  { icon: 'upload', label: '导入 Markdown 文件', run: () => mdFileRef.value?.click() },
];

const mediaRef = ref(null);
const uploading = ref(false);

/* ─────────────── Markdown 导入 ─────────────── */

const mdFileRef = ref(null);
const importing = ref(false);
const dragActive = ref(false);

/** 把解析结果填入表单：标题、标签、正文都会带上 */
function applyMarkdown(parsed, { mode = 'replace' } = {}) {
  if (!parsed) return;
  if (mode === 'replace' || !form.value.title.trim()) {
    form.value.title = parsed.title || form.value.title;
    form.value.content = parsed.content;
  } else {
    const sep = form.value.content.trim() ? '\n\n' : '';
    form.value.content = `${form.value.content}${sep}${parsed.content}`;
  }
  if (parsed.tags?.length) {
    const existing = form.value.tags ? form.value.tags.split(/[,，\s]+/).filter(Boolean) : [];
    form.value.tags = [...new Set([...existing, ...parsed.tags])].join(', ');
  }
  if (parsed.excerpt) form.value.excerpt = parsed.excerpt;
  if (parsed.slug) form.value.slug = parsed.slug;
  if (parsed.cover) form.value.cover = parsed.cover;
  state.value.dirty = true;
}

/** 读取并导入一个 Markdown 文件；已有内容时询问替换还是追加 */
async function importMarkdownFile(file, { confirmOverwrite = true, mode } = {}) {
  const text = await file.text();
  const parsed = parseMarkdownFile({ name: file.name, text });
  const hasContent = Boolean(form.value.title.trim() || form.value.content.trim());
  let finalMode = mode || 'replace';
  if (!mode && hasContent && confirmOverwrite) {
    const replace = window.confirm(`《${parsed.title}》\n\n当前文章已有内容。\n确定 = 替换；取消 = 追加到末尾。`);
    finalMode = replace ? 'replace' : 'append';
  }
  applyMarkdown(parsed, { mode: finalMode });
  toast(finalMode === 'append' ? `已追加《${parsed.title}》` : `已导入《${parsed.title}》`);
  return parsed;
}

async function onMarkdownPicked(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  importing.value = true;
  try {
    await importMarkdownFile(file);
  } catch (err) {
    toast(`导入失败：${err.message}`, { tone: 'error' });
  } finally {
    importing.value = false;
  }
}

/**
 * 粘贴处理。
 * - 纯文本 / Markdown 源码：原样插入（不做任何转换，避免破坏语法）
 * - 网页 / Word 的富文本：自动转成 Markdown
 * - 剪贴板里的图片或 .md 文件：走上传 / 导入
 */
function onEditorPaste(event) {
  const files = [...(event.clipboardData?.files || [])];
  const file = files.find((f) => isMarkdownFile(f) || f.type.startsWith('image/'));
  if (file) {
    event.preventDefault();
    if (isMarkdownFile(file)) {
      importing.value = true;
      importMarkdownFile(file, { mode: 'append' })
        .catch((err) => toast(`导入失败：${err.message}`, { tone: 'error' }))
        .finally(() => (importing.value = false));
    } else {
      uploading.value = true;
      api
        .uploadMedia(file)
        .then(({ media }) => handleUploadedMedia(media, file.name))
        .catch((err) => toast(err.message, { tone: 'error' }))
        .finally(() => (uploading.value = false));
    }
    return;
  }

  const html = event.clipboardData?.getData('text/html');
  const plain = event.clipboardData?.getData('text/plain') || '';
  if (looksLikeRichText(html)) {
    const markdown = htmlToMarkdown(html);
    if (markdown) {
      event.preventDefault();
      insertText(`${markdown}\n`);
      toast('已把富文本转换为 Markdown');
      return;
    }
  }
  if (plain) {
    event.preventDefault();
    insertText(plain.replace(/\r\n/g, '\n'));
  }
}

/** 图片 / 音视频上传后的落位 */
function handleUploadedMedia(media, fileName = '') {
  if (media.kind === 'image') {
    const alt = fileName.replace(/\.[^.]+$/, '') || '图片';
    insertText(`![${alt}](${media.variants?.[0]?.url || media.url})`);
  } else {
    form.value.media.push({ kind: media.kind, url: media.url, title: fileName.slice(0, 60) });
    toast(media.kind === 'video' ? '视频已添加到正文' : '音频已添加到正文');
  }
}

/* 拖拽导入：.md 文件替换正文，图片与音视频走上传 */
function onEditorDragOver(event) {
  if (!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault();
  dragActive.value = true;
}

function onEditorDragLeave() {
  dragActive.value = false;
}

async function onEditorDrop(event) {
  const file = event.dataTransfer?.files?.[0];
  dragActive.value = false;
  if (!file) return;
  event.preventDefault();
  if (isMarkdownFile(file)) {
    importing.value = true;
    try {
      await importMarkdownFile(file, { mode: 'replace' });
    } catch (err) {
      toast(`导入失败：${err.message}`, { tone: 'error' });
    } finally {
      importing.value = false;
    }
    return;
  }
  if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
    uploading.value = true;
    try {
      const { media } = await api.uploadMedia(file);
      handleUploadedMedia(media, file.name);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      uploading.value = false;
    }
    return;
  }
  toast('只支持导入 .md 文件或图片、音视频', { tone: 'error' });
}

/** 从媒体库选文件：图片插入 Markdown，视频/音频追加到正文媒体列表 */
/**
 * 从工具栏选文件上传。
 * 统一走 handleUploadedMedia：之前这里用 insert()，它依赖 textarea 的当前选区，
 * 焦点不在正文时（刚进页面就点上传）会插不进去，图片就“消失”了。
 */
async function uploadInline(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  uploading.value = true;
  try {
    const { media } = await api.uploadMedia(file);
    handleUploadedMedia(media, file.name);
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    uploading.value = false;
  }
}

function removeMedia(index) {
  form.value.media.splice(index, 1);
}

/** 切换类型时，丢弃不属于新类型的字段值 */
function onTypeChange() {
  const allowed = new Set(typeFields.value.map((f) => f.key));
  form.value.fields = Object.fromEntries(Object.entries(form.value.fields).filter(([k]) => allowed.has(k)));
}

/** 分栏拖拽 */
function startResize(event) {
  event.preventDefault();
  const move = (e) => {
    const rect = document.querySelector('.editor-body')?.getBoundingClientRect();
    if (!rect) return;
    const ratio = ((e.clientX - rect.left) / rect.width) * 100;
    state.value.split = Math.min(72, Math.max(28, ratio));
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function onKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    save();
  }
}

onMounted(() => {
  load();
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  clearTimeout(renderTimer);
  clearTimeout(draftTimer);
});

const savedLabel = computed(() => {
  if (state.value.saving) return '保存中';
  if (!state.value.savedAt) return state.value.dirty ? '有未保存改动' : '';
  const sec = Math.round((Date.now() - state.value.savedAt) / 1000);
  return sec < 60 ? `${sec} 秒前已保存` : '已保存';
});
</script>

<template>
  <div ref="bodyRef" class="editor">
    <header class="editor-bar">
      <div class="bar-left">
        <button type="button" class="back u-press" aria-label="返回写作台" @click="router.push('/admin')">
          <BaseIcon name="arrowLeft" :size="16" />
        </button>
        <div class="bar-status">
          <span class="bar-mode">{{ isNew ? '新文章' : '编辑中' }}</span>
          <span v-if="savedLabel" class="bar-saved">{{ savedLabel }}</span>
        </div>
      </div>

      <div class="bar-right">
        <span class="bar-count">{{ words }} 字 · {{ readMin }} 分钟</span>
        <button type="button" class="btn-plain u-press" :disabled="state.saving" @click="save()">
          保存草稿
        </button>
        <button
          type="button"
          class="btn-solid u-press"
          :disabled="state.saving"
          @click="save({ publish: form.status !== 'published' })"
        >
          {{ state.saving ? '处理中' : form.status === 'published' ? '更新发布' : '发布' }}
        </button>
      </div>
    </header>

    <p v-if="state.error" class="editor-error" role="alert">{{ state.error }}</p>

    <div class="editor-body" :style="{ '--split': state.split + '%' }">
      <!-- 写作区 -->
      <section class="pane pane-write" :class="{ 'is-hidden-mobile': state.mobilePane !== 'write' }">
        <input
          v-model="form.title"
          class="title-input"
          type="text"
          placeholder="标题"
          maxlength="120"
          aria-label="文章标题"
        />

        <div class="meta-grid">
          <label class="field">
            <span>类型</span>
            <select v-model.number="form.typeId" @change="onTypeChange">
              <option v-for="t in site.types" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>标签</span>
            <input v-model="form.tags" type="text" placeholder="用逗号分隔，如 设计, Vue" />
          </label>
          <label class="field">
            <span>链接别名</span>
            <input v-model="form.slug" type="text" placeholder="留空自动生成" />
          </label>
          <label class="field field-wide">
            <span>摘要</span>
            <input v-model="form.excerpt" type="text" placeholder="留空则自动截取正文前 120 字" />
          </label>

          <!-- 当前类型的自定义字段 -->
          <div v-if="typeFields.length" class="custom-fields field-wide">
            <p class="custom-title">
              {{ activeType?.name }}的字段
              <RouterLink to="/admin/structure" class="custom-edit">编辑字段</RouterLink>
            </p>
            <div class="custom-grid">
              <label v-for="f in typeFields" :key="f.key" class="field" :class="{ 'field-wide': f.kind === 'textarea' || f.kind === 'markdown' }">
                <span>{{ f.label }}</span>
                <select v-if="f.kind === 'select'" v-model="form.fields[f.key]">
                  <option value="">未选择</option>
                  <option v-for="o in f.options || []" :key="o" :value="o">{{ o }}</option>
                </select>
                <select v-else-if="f.kind === 'boolean'" v-model="form.fields[f.key]">
                  <option :value="false">否</option>
                  <option :value="true">是</option>
                </select>
                <textarea
                  v-else-if="f.kind === 'textarea' || f.kind === 'markdown'"
                  v-model="form.fields[f.key]"
                  rows="3"
                  :placeholder="f.help"
                />
                <input
                  v-else
                  v-model="form.fields[f.key]"
                  :type="f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : f.kind === 'url' ? 'url' : 'text'"
                  :placeholder="f.help || f.label"
                />
              </label>
            </div>
          </div>

          <div class="field field-wide cover-field">
            <span>封面图</span>
            <div class="cover-row">
              <input v-model="form.cover" type="url" placeholder="封面地址，或上传 / 生成一张" />
              <button type="button" class="upload-btn u-press" :disabled="state.uploadProgress" @click="fileRef.click()">
                <BaseIcon name="upload" :size="14" />
                {{ state.uploadProgress ? '上传中' : '上传' }}
              </button>
              <button type="button" class="upload-btn u-press" :disabled="state.generating" @click="generateCover">
                <BaseIcon name="image" :size="14" />
                {{ state.generating ? '生成中' : '生成' }}
              </button>
            </div>
            <img v-if="form.cover" :src="form.cover" alt="封面预览" class="cover-preview" />
            <input ref="fileRef" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" class="sr-only" @change="upload" />
            <p class="cover-hint">不上传也可以：点「生成」会按标题做一张排印封面，无需外部图床。</p>
          </div>
          <label class="check">
            <input v-model="form.featured" type="checkbox" />
            <span>设为置顶（首页首屏展示）</span>
          </label>

          <!-- 合集归属：卡片式多选，显示文章数与选中态 -->
          <div v-if="site.collections.length" class="field field-wide collection-field">
            <div class="collection-head">
              <span>加入合集</span>
              <span v-if="form.collections.length" class="collection-count">已选 {{ form.collections.length }}</span>
            </div>

            <div class="collection-grid" role="group" aria-label="选择所属合集">
              <label
                v-for="c in site.collections"
                :key="c.slug"
                class="collection-card"
                :class="{ 'is-selected': form.collections.includes(c.slug) }"
              >
                <input v-model="form.collections" type="checkbox" :value="c.slug" class="sr-only" />
                <span class="card-check" aria-hidden="true">
                  <BaseIcon v-if="form.collections.includes(c.slug)" name="check" :size="12" />
                </span>
                <span class="card-body">
                  <span class="card-title">{{ c.title }}</span>
                  <span class="card-meta">
                    <template v-if="c.count">{{ c.count }} 篇</template>
                    <template v-else>暂无文章</template>
                    <template v-if="c.description"> · {{ c.description }}</template>
                  </span>
                </span>
              </label>
            </div>

            <p class="collection-hint">
              合集在<RouterLink to="/admin/structure">内容结构</RouterLink>里创建与排序。
            </p>
          </div>
        </div>

        <!-- 正文媒体（视频 / 音频） -->
        <div v-if="form.media.length" class="media-list">
          <p class="media-title">正文媒体</p>
          <div v-for="(m, i) in form.media" :key="`${m.url}-${i}`" class="media-item">
            <BaseIcon :name="m.kind === 'video' ? 'image' : 'rss'" :size="14" />
            <span class="media-url">{{ m.title || m.url }}</span>
            <button type="button" class="ghost-mini" @click="removeMedia(i)">移除</button>
          </div>
        </div>

        <div class="toolbar" role="toolbar" aria-label="Markdown 工具">
          <button
            v-for="tool in TOOLS"
            :key="tool.title || tool.label"
            type="button"
            class="tool u-press"
            :aria-label="tool.title || tool.label"
            :title="tool.title || tool.label"
            :disabled="uploading && tool.icon === 'image'"
            @click="tool.run"
          >
            <span
              v-if="tool.text"
              class="tool-glyph"
              :class="{ 'is-bold': tool.bold, 'is-italic': tool.italic, 'is-mono': tool.mono }"
              aria-hidden="true"
              >{{ tool.text }}</span
            >
            <BaseIcon v-else :name="tool.icon" :size="14" />
          </button>
          <input
            ref="mediaRef"
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/ogg"
            class="sr-only"
            @change="uploadInline"
          />
          <!-- 导入 .md 文件 -->
          <input
            ref="mdFileRef"
            type="file"
            accept=".md,.markdown,.mdown,.mkd,.mdx,.txt,text/markdown"
            class="sr-only"
            @change="onMarkdownPicked"
          />
          <span v-if="uploading" class="uploading">上传中…</span>
          <span v-if="importing" class="uploading">导入中…</span>
        </div>

        <div
          class="editor-drop"
          :class="{ 'is-dragging': dragActive }"
          @dragover="onEditorDragOver"
          @dragleave="onEditorDragLeave"
          @drop="onEditorDrop"
        >
          <textarea
            ref="textareaRef"
            v-model="form.content"
            class="content-input"
            placeholder="直接用 Markdown 写，或把 .md 文件拖进来、从网页复制后粘贴。支持 # 标题、**粗体**、- 列表、```代码块```、> 引用、| 表格 |"
            spellcheck="false"
            aria-label="正文 Markdown"
            @paste="onEditorPaste"
          />
          <div v-if="dragActive" class="drop-mask" aria-hidden="true">
            <BaseIcon name="upload" :size="22" />
            <span>松手导入 .md 文件或上传图片</span>
          </div>
        </div>
      </section>

      <div class="resizer" role="separator" aria-orientation="vertical" aria-label="拖动调整分栏" @pointerdown="startResize" />

      <!-- 预览区 -->
      <section class="pane pane-preview" :class="{ 'is-hidden-mobile': state.mobilePane !== 'preview' }">
        <div class="preview-head">
          <span>实时预览</span>
          <span v-if="state.rendering" class="preview-dot" aria-hidden="true" />
        </div>
        <div class="preview-scroll">
          <h1 v-if="form.title" class="preview-title">{{ form.title }}</h1>
          <div v-if="hasPreview" class="prose preview-prose" v-html="state.preview" />
          <p v-else class="preview-empty">正文会实时渲染在这里。</p>

          <!-- 视频 / 音频在正文末尾展示 -->
          <div v-for="(m, i) in form.media" :key="`p-${i}`" class="preview-media">
            <video v-if="m.kind === 'video'" :src="m.url" controls preload="metadata" playsinline />
            <audio v-else-if="m.kind === 'audio'" :src="m.url" controls />
            <p v-if="m.title" class="preview-caption">{{ m.title }}</p>
          </div>
        </div>
      </section>
    </div>

    <!-- 移动端切换 -->
    <div class="mobile-toggle" role="tablist" aria-label="切换写作与预览">
      <button type="button" role="tab" :aria-selected="state.mobilePane === 'write'" class="u-press" :class="{ 'is-active': state.mobilePane === 'write' }" @click="state.mobilePane = 'write'">
        写作
      </button>
      <button type="button" role="tab" :aria-selected="state.mobilePane === 'preview'" class="u-press" :class="{ 'is-active': state.mobilePane === 'preview' }" @click="state.mobilePane = 'preview'">
        预览
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--header-h));
  padding-inline: clamp(0.75rem, 2vw, 1.5rem);
}

.editor-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 0.65rem;
  border-bottom: 1px solid var(--rule);
  flex-wrap: wrap;
}

.bar-left,
.bar-right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.back {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-mid);
  cursor: pointer;
}

.back:hover {
  color: var(--ink);
  border-color: var(--ink-soft);
}

.bar-status {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}

.bar-mode {
  font-size: 0.88rem;
  font-weight: 560;
  color: var(--ink);
}

.bar-saved {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--ink-soft);
}

.bar-count {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
  white-space: nowrap;
}

.btn-plain,
.btn-solid {
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  cursor: pointer;
  white-space: nowrap;
}

.btn-plain {
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink);
}

.btn-plain:hover {
  border-color: var(--ink-soft);
}

.btn-solid {
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
}

.btn-solid:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.btn-plain:disabled,
.btn-solid:disabled {
  opacity: 0.6;
  cursor: progress;
}

.editor-error {
  margin-top: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-xs);
  border-left: 2px solid var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.82rem;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  padding-block: 0.75rem 0;
}

.pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  overflow: hidden;
}

.pane-write {
  padding-right: 0.75rem;
  overflow-y: auto;
}

.title-input {
  width: 100%;
  border: 0;
  background: transparent;
  font-size: clamp(1.4rem, 1.1rem + 1.2vw, 1.9rem);
  font-weight: 680;
  letter-spacing: -0.03em;
  color: var(--ink);
  padding: 0.15rem 0;
  outline: none;
}

.title-input::placeholder {
  color: var(--ink-soft);
  font-weight: 500;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem 0.75rem;
  padding: 0.7rem 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}

.field {
  display: grid;
  gap: 0.25rem;
}

.field > span {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.field input {
  width: 100%;
  padding: 0.38rem 0.55rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: var(--paper);
  color: var(--ink);
  font-size: 0.84rem;
  font-family: inherit;
}

.field select,
.field textarea {
  width: 100%;
  padding: 0.38rem 0.55rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: var(--paper);
  color: var(--ink);
  font-size: 0.84rem;
  font-family: inherit;
}

.field select:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

/* 自定义字段区 */
.custom-fields {
  border: 1px dashed var(--rule-strong);
  border-radius: var(--radius-sm);
  padding: 0.7rem;
  background: var(--paper-soft);
}

.custom-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 0.5rem;
}

.custom-edit {
  color: var(--accent);
  text-decoration: none;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.7rem;
}

.custom-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem 0.75rem;
}

/* 合集选择 */
/* 合集选择：卡片式多选
   之前的 flex 换行把标签挤成竖排，且没有选中反馈，这里重做 */
.collection-field {
  gap: 0.5rem;
}

.collection-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
}

.collection-count {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--accent);
}

.collection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 0.5rem;
}

.collection-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  background: var(--paper-raised);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s var(--ease-out-expo);
}

.collection-card:hover {
  border-color: var(--rule-strong);
  transform: translateY(-1px);
}

.collection-card.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

/* 自绘复选框：原生 checkbox 无法与卡片融为一体 */
.card-check {
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-top: 0.1rem;
  border-radius: 5px;
  border: 1.5px solid var(--rule-strong);
  background: var(--paper);
  color: var(--accent-ink);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;
}

.collection-card.is-selected .card-check {
  background: var(--accent);
  border-color: var(--accent);
}

/* 键盘焦点：sr-only 的 input 获得焦点时高亮整张卡片 */
.collection-card:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.card-body {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}

.card-title {
  font-size: 0.84rem;
  font-weight: 560;
  color: var(--ink);
  line-height: 1.35;
}

.card-meta {
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.collection-hint {
  font-size: 0.7rem;
  color: var(--ink-soft);
}

.collection-hint a {
  color: var(--accent);
  text-underline-offset: 0.2em;
}

/* 正文媒体列表 */
.media-list {
  display: grid;
  gap: 0.35rem;
  padding: 0.6rem 0;
  border-top: 1px solid var(--rule);
}

.media-title {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.media-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--ink-mid);
}

.media-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.ghost-mini {
  padding: 0.15rem 0.45rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.72rem;
  cursor: pointer;
}

.ghost-mini:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.uploading {
  align-self: center;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--accent);
}

.preview-media {
  margin-top: 1rem;
}

.preview-media video,
.preview-media audio {
  width: 100%;
  border-radius: var(--radius-sm);
  background: #000;
}

.preview-caption {
  margin-top: 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-soft);
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.field-wide {
  grid-column: 1 / -1;
}

.cover-row {
  display: flex;
  gap: 0.4rem;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0 0.7rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
}

.upload-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.cover-preview {
  margin-top: 0.4rem;
  width: 100%;
  max-height: 120px;
  object-fit: cover;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
}

.cover-hint {
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--ink-soft);
}

.check {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  color: var(--ink-mid);
  cursor: pointer;
}

.check input {
  accent-color: var(--accent);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
}

.tool {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-xs);
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-mid);
  cursor: pointer;
}

.tool:hover {
  border-color: var(--rule);
  background: var(--paper-soft);
  color: var(--ink);
}

/* 字符型工具按钮：用排版本身表达语义，比含义模糊的图标更准确 */
.tool-glyph {
  font-size: 0.82rem;
  line-height: 1;
  letter-spacing: -0.02em;
  color: inherit;
}

.tool-glyph.is-bold {
  font-weight: 800;
}

.tool-glyph.is-italic {
  font-style: italic;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.95rem;
}

.tool-glyph.is-mono {
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

/* 拖拽导入的落地容器 */
.editor-drop {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  min-height: 240px;
}

.editor-drop.is-dragging {
  outline: 2px dashed var(--accent);
  outline-offset: 6px;
  border-radius: var(--radius-sm);
}

.drop-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.5rem;
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--paper-raised) 82%, transparent);
  color: var(--accent);
  font-size: 0.86rem;
  pointer-events: none;
  backdrop-filter: blur(2px);
}

.content-input {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  resize: none;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.88rem;
  line-height: 1.8;
  outline: none;
}

@media (min-width: 900px) {
  .content-input {
    field-sizing: content;
    min-height: 320px;
  }
}

.content-input::placeholder {
  color: var(--ink-soft);
}

.resizer {
  display: none;
}

.pane-preview {
  border-top: 1px solid var(--rule);
  padding-top: 0.75rem;
}

.preview-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.preview-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.preview-scroll {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  /* 预览里的超长链接、宽表格不应把整页撑出横向滚动条 */
  overflow-x: hidden;
  padding-right: 0.5rem;
}

.preview-prose {
  font-size: 0.95rem;
  min-width: 0;
  /* v-html 注入的内容无法加 scoped 样式，用 :deep 约束 */
  overflow-wrap: anywhere;
}

.preview-prose :deep(img),
.preview-prose :deep(video),
.preview-prose :deep(table),
.preview-prose :deep(pre) {
  max-width: 100%;
}

.preview-prose :deep(table),
.preview-prose :deep(pre) {
  display: block;
  overflow-x: auto;
}

.preview-prose :deep(a) {
  overflow-wrap: anywhere;
}

.preview-title {
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.25;
  color: var(--ink);
  margin-bottom: 1.1rem;
}

.preview-empty {
  font-size: 0.88rem;
  color: var(--ink-soft);
}

.mobile-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
  padding: 0.4rem;
  margin-bottom: 0.5rem;
  border-radius: var(--radius-sm);
  background: var(--paper-soft);
  border: 1px solid var(--rule);
}

.mobile-toggle button {
  padding: 0.42rem;
  border-radius: var(--radius-xs);
  border: 0;
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.82rem;
  cursor: pointer;
}

.mobile-toggle button.is-active {
  background: var(--paper-raised);
  color: var(--ink);
  box-shadow: var(--shadow-lift);
}

.is-hidden-mobile {
  display: none;
}

@media (min-width: 900px) {
  .editor-body {
    grid-template-columns: 1fr;
  }

  .editor-body {
    /* 分隔条占 8px，两栏的百分比必须扣掉它，否则总和超过 100% 会出现横向溢出 */
    grid-template-columns: minmax(0, calc(var(--split) - 4px)) 8px minmax(0, calc(100% - var(--split) - 4px));
    overflow: hidden;
  }

  .pane-preview {
    border-top: 0;
    padding-top: 0;
    padding-left: 0.75rem;
    border-left: 1px solid var(--rule);
  }

  .resizer {
    display: block;
    width: 7px;
    cursor: col-resize;
    position: relative;
    touch-action: none;
  }

  .resizer::after {
    content: '';
    position: absolute;
    inset: 0 3px;
    border-radius: 999px;
    background: var(--rule);
    transition: background-color 0.2s ease;
  }

  .resizer:hover::after {
    background: var(--accent);
  }

  .mobile-toggle {
    display: none;
  }

  .is-hidden-mobile {
    display: flex;
  }
}

/* 视觉隐藏但保留可访问性。
   实现要点：缩到 0 尺寸并整块裁剪，不参与布局、不拦截点击，
   但仍保留在焦点顺序里（键盘可操作）。
   这里用 `input.sr-only` 而非 `.sr-only`：页面上还有 `.field input` 这类
   两段式选择器，单类选择器会被它覆盖，导致隐藏失败的输入框撑开整行。 */
input.sr-only,
.sr-only {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>

