<!--
  作品集管理。

  比「增删改」多出的是「管理」：搜索、按类型/状态筛选、多选批量操作、
  复制、上下移动排序。作品数量上去之后这些才是真正省时间的部分。
-->
<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { api } from '@/api/client';
import { toast } from '@/composables/useToast';

const works = ref([]);
const loading = ref(true);
const saving = ref(false);
const editingId = ref(null);
const formOpen = ref(false);

/* 管理视图状态 */
const query = ref('');
const kindFilter = ref('all');
const statusFilter = ref('all');
const sortMode = ref('manual');
const selected = ref(new Set());

const KIND_OPTIONS = [
  { value: 'project', label: '项目' },
  { value: 'package', label: '开源包' },
  { value: 'design', label: '设计' },
  { value: 'writing', label: '写作' },
  { value: 'other', label: '其他' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '维护中' },
  { value: 'wip', label: '开发中' },
  { value: 'archived', label: '已归档' },
];

const blank = () => ({
  title: '',
  summary: '',
  description: '',
  url: '',
  repo: '',
  cover: '',
  kind: 'project',
  tech: '',
  status: 'active',
  featured: false,
  slug: '',
  sortOrder: 100,
});

const form = reactive(blank());
const isEditing = computed(() => Boolean(editingId.value));

/* ── 筛选与排序（纯前端，作品量级不大，交互更即时） ── */

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = works.value;
  if (kindFilter.value !== 'all') list = list.filter((w) => w.kind === kindFilter.value);
  if (statusFilter.value !== 'all') list = list.filter((w) => w.status === statusFilter.value);
  if (q) {
    list = list.filter(
      (w) =>
        w.title.toLowerCase().includes(q) ||
        (w.summary || '').toLowerCase().includes(q) ||
        (w.tech || []).some((t) => t.toLowerCase().includes(q)) ||
        (w.url || '').toLowerCase().includes(q) ||
        (w.repo || '').toLowerCase().includes(q),
    );
  }
  const sorted = [...list];
  if (sortMode.value === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  else if (sortMode.value === 'updated') sorted.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  else sorted.sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder);
  return sorted;
});

const allSelected = computed(() => filtered.value.length > 0 && filtered.value.every((w) => selected.value.has(w.id)));
const someSelected = computed(() => selected.value.size > 0);

const kindCounts = computed(() => {
  const map = { all: works.value.length };
  for (const w of works.value) map[w.kind] = (map[w.kind] || 0) + 1;
  return map;
});

function toggleSelect(id) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function toggleAll() {
  if (allSelected.value) {
    selected.value = new Set();
  } else {
    selected.value = new Set(filtered.value.map((w) => w.id));
  }
}

async function load() {
  loading.value = true;
  try {
    works.value = (await api.adminWorks()).works;
    // 清掉已不存在的选中项
    const ids = new Set(works.value.map((w) => w.id));
    selected.value = new Set([...selected.value].filter((id) => ids.has(id)));
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    loading.value = false;
  }
}

function openNew() {
  Object.assign(form, blank());
  editingId.value = null;
  formOpen.value = true;
  requestAnimationFrame(() => document.querySelector('.form-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

function openEdit(work) {
  Object.assign(form, {
    title: work.title,
    summary: work.summary,
    description: work.description || '',
    url: work.url,
    repo: work.repo,
    cover: work.cover,
    kind: work.kind,
    tech: (work.tech || []).join(', '),
    status: work.status,
    featured: work.featured,
    slug: work.slug,
    sortOrder: work.sortOrder,
  });
  editingId.value = work.id;
  formOpen.value = true;
  requestAnimationFrame(() => document.querySelector('.form-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

function closeForm() {
  formOpen.value = false;
  editingId.value = null;
}

async function save() {
  if (!form.title.trim()) {
    toast('请填写作品名称', { tone: 'error' });
    return;
  }
  if (!form.url.trim() && !form.repo.trim()) {
    toast('至少填写作品链接或仓库地址', { tone: 'error' });
    return;
  }
  saving.value = true;
  try {
    if (isEditing.value) {
      await api.updateWork(editingId.value, { ...form });
      toast('作品已更新');
    } else {
      await api.createWork({ ...form });
      toast('作品已添加');
    }
    closeForm();
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    saving.value = false;
  }
}

/**
 * 删除确认走页面内弹层：原生 window.confirm 在部分内嵌浏览器/移动端
 * 会被拦截或静默返回 false，表现为「点了删除没反应」。
 */
const pendingDelete = ref(null);
const deleting = ref(false);

function askRemove(work) {
  pendingDelete.value = work;
}

async function confirmRemove() {
  const work = pendingDelete.value;
  if (!work) return;
  deleting.value = true;
  try {
    await api.deleteWork(work.id);
    toast(`已删除「${work.title}」`);
    pendingDelete.value = null;
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    deleting.value = false;
  }
}

async function duplicate(work) {
  try {
    await api.duplicateWork(work.id);
    toast(`已复制「${work.title}」`);
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

/** 上移 / 下移：仅在手动排序下可用，否则顺序会被筛选打乱 */
async function move(index, delta) {
  if (sortMode.value !== 'manual') {
    toast('切到「自定义顺序」后再调整排序', { tone: 'error' });
    return;
  }
  const next = [...works.value];
  const target = index + delta;
  if (target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]];
  works.value = next;
  try {
    await api.reorderWorks(next.map((w) => w.id));
  } catch (err) {
    toast(err.message, { tone: 'error' });
    await load();
  }
}

/** 批量操作 */
async function bulk(action, confirmText) {
  const ids = [...selected.value];
  if (!ids.length) return;
  if (confirmText && !window.confirm(confirmText)) return;
  try {
    const res = await api.bulkWorks(action, ids);
    toast(`已完成 ${res.succeeded}/${res.total} 项`);
    selected.value = new Set();
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

onMounted(load);
</script>

<template>
  <div class="works-admin u-container">
    <header class="head">
      <div>
        <h1 class="page-title">作品集</h1>
        <p class="page-lead">
          放一些你的成果：npm 包、GitHub 仓库、线上产品、设计稿。访客会在<RouterLink to="/works">作品页</RouterLink>看到它们。
        </p>
      </div>
      <button type="button" class="primary u-press" @click="openNew">
        <BaseIcon name="edit" :size="15" />
        添加作品
      </button>
    </header>

    <!-- 表单 -->
    <Transition name="slide">
      <section v-if="formOpen" class="form-card">
        <h2 class="form-title">{{ isEditing ? '编辑作品' : '添加作品' }}</h2>

        <div class="fields">
          <label class="field field-wide">
            <span class="label">作品名称 *</span>
            <input v-model="form.title" type="text" maxlength="120" placeholder="例如：hl-blog 轻量博客框架" />
          </label>

          <label class="field">
            <span class="label">类型</span>
            <select v-model="form.kind">
              <option v-for="k in KIND_OPTIONS" :key="k.value" :value="k.value">{{ k.label }}</option>
            </select>
          </label>

          <label class="field">
            <span class="label">状态</span>
            <select v-model="form.status">
              <option v-for="s in STATUS_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </label>

          <label class="field field-wide">
            <span class="label">作品链接</span>
            <input v-model="form.url" type="url" placeholder="https://www.npmjs.com/package/xxx" />
            <span class="hint">线上地址，如 npm 包页、产品首页</span>
          </label>

          <label class="field field-wide">
            <span class="label">仓库地址</span>
            <input v-model="form.repo" type="url" placeholder="https://github.com/用户名/仓库" />
            <span class="hint">两个链接至少填一个</span>
          </label>

          <label class="field field-wide">
            <span class="label">一句话简介</span>
            <input v-model="form.summary" type="text" maxlength="300" placeholder="一两句话说明它解决什么问题" />
          </label>

          <label class="field field-wide">
            <span class="label">详细介绍</span>
            <textarea v-model="form.description" rows="5" placeholder="背景、做了什么、结果如何（可选）" />
          </label>

          <label class="field field-wide">
            <span class="label">技术栈</span>
            <input v-model="form.tech" type="text" placeholder="用逗号分隔，如 Vue 3, Node.js, SQLite" />
          </label>

          <label class="field">
            <span class="label">封面图地址</span>
            <input v-model="form.cover" type="url" placeholder="https://... 或 /uploads/..." />
          </label>

          <label class="field">
            <span class="label">排序（越小越靠前）</span>
            <input v-model.number="form.sortOrder" type="number" min="0" max="9999" />
          </label>

          <label class="switch field-wide">
            <input v-model="form.featured" type="checkbox" />
            <span>设为精选（置顶展示）</span>
          </label>
        </div>

        <div class="form-actions">
          <button type="button" class="ghost u-press" @click="closeForm">取消</button>
          <button type="button" class="primary u-press" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : isEditing ? '保存修改' : '添加' }}
          </button>
        </div>
      </section>
    </Transition>

    <!-- 工具栏：搜索 / 筛选 / 排序 -->
    <div class="toolbar">
      <label class="search">
        <BaseIcon name="search" :size="15" />
        <input v-model="query" type="search" placeholder="搜索名称、简介、技术栈或链接" aria-label="搜索作品" />
      </label>

      <div class="filters">
        <select v-model="kindFilter" aria-label="按类型筛选">
          <option value="all">全部类型（{{ kindCounts.all }}）</option>
          <option v-for="k in KIND_OPTIONS" :key="k.value" :value="k.value">
            {{ k.label }}（{{ kindCounts[k.value] || 0 }}）
          </option>
        </select>
        <select v-model="statusFilter" aria-label="按状态筛选">
          <option value="all">全部状态</option>
          <option v-for="s in STATUS_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
        <select v-model="sortMode" aria-label="排序方式">
          <option value="manual">自定义顺序</option>
          <option value="title">按名称</option>
          <option value="updated">最近更新</option>
        </select>
      </div>
    </div>

    <!-- 批量操作条 -->
    <div class="bulk-bar" :class="{ 'is-open': someSelected }">
      <label class="check-all">
        <input type="checkbox" :checked="allSelected" @change="toggleAll" />
        <span>全选{{ someSelected ? `（已选 ${selected.size}）` : '' }}</span>
      </label>
      <template v-if="someSelected">
        <button type="button" class="text-btn" @click="bulk('publish')">标记维护中</button>
        <button type="button" class="text-btn" @click="bulk('archive')">归档</button>
        <button type="button" class="text-btn" @click="bulk('feature')">设为精选</button>
        <button type="button" class="text-btn" @click="bulk('unfeature')">取消精选</button>
        <button type="button" class="text-btn danger" @click="bulk('delete', `确定删除选中的 ${selected.size} 个作品吗？`)">
          删除
        </button>
        <button type="button" class="text-btn" @click="selected = new Set()">清空选择</button>
      </template>
    </div>

    <div v-if="loading" class="rows">
      <span v-for="i in 3" :key="i" class="u-skeleton sk-row" />
    </div>

    <EmptyState
      v-else-if="!works.length"
      icon="bookmark"
      title="还没有作品"
      description="点右上角「添加作品」，先把 npm 或 GitHub 链接放进来。"
    >
      <button type="button" class="primary u-press" @click="openNew">添加第一个作品</button>
    </EmptyState>

    <EmptyState
      v-else-if="!filtered.length"
      icon="search"
      title="没有匹配的作品"
      description="换个关键词，或者把筛选条件调回全部。"
    />

    <ul v-else class="rows">
      <li
        v-for="(work, index) in filtered"
        :key="work.id"
        class="row"
        :class="{ 'is-featured': work.featured, 'is-selected': selected.has(work.id) }"
      >
        <div class="row-check">
          <input type="checkbox" :checked="selected.has(work.id)" :aria-label="`选择 ${work.title}`" @change="toggleSelect(work.id)" />
        </div>

        <div class="row-order">
          <button
            type="button"
            class="mini u-press"
            aria-label="上移"
            :disabled="index === 0 || sortMode !== 'manual'"
            @click="move(index, -1)"
          >
            <BaseIcon name="arrowUp" :size="13" />
          </button>
          <button
            type="button"
            class="mini u-press"
            aria-label="下移"
            :disabled="index === works.length - 1 || sortMode !== 'manual'"
            @click="move(index, 1)"
          >
            <BaseIcon name="arrowDown" :size="13" />
          </button>
        </div>

        <div class="row-main">
          <div class="row-title">
            <span class="name">{{ work.title }}</span>
            <span class="kind">{{ KIND_OPTIONS.find((k) => k.value === work.kind)?.label }}</span>
            <span v-if="work.featured" class="featured">精选</span>
            <span v-if="work.status !== 'active'" class="status">{{ STATUS_OPTIONS.find((s) => s.value === work.status)?.label }}</span>
          </div>
          <p v-if="work.summary" class="summary">{{ work.summary }}</p>
          <div class="row-links">
            <a v-if="work.url" :href="work.url" target="_blank" rel="noopener noreferrer">{{ hostOf(work.url) }}</a>
            <a v-if="work.repo" :href="work.repo" target="_blank" rel="noopener noreferrer">源码</a>
          </div>
        </div>

        <div class="row-actions">
          <RouterLink :to="`/works/${encodeURIComponent(work.slug)}`" class="text-btn">查看</RouterLink>
          <button type="button" class="text-btn" @click="openEdit(work)">编辑</button>
          <button type="button" class="text-btn" @click="duplicate(work)">复制</button>
          <button type="button" class="text-btn danger" @click="askRemove(work)">删除</button>
        </div>
      </li>
    </ul>

    <!-- 删除确认 -->
    <div v-if="pendingDelete" class="dialog-mask" @click.self="pendingDelete = null">
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2 class="dialog-title">删除作品</h2>
        <p class="dialog-hint">确定删除「<strong>{{ pendingDelete.title }}</strong>」吗？</p>
        <p class="dialog-note">此操作无法撤销。</p>
        <div class="dialog-actions">
          <button type="button" class="ghost u-press" @click="pendingDelete = null">取消</button>
          <button type="button" class="danger-solid u-press" :disabled="deleting" @click="confirmRemove">
            {{ deleting ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.works-admin {
  padding-top: clamp(2rem, 5vw, 3.5rem);
  max-width: 980px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--rule);
}

.page-title {
  font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem);
  font-weight: 700;
  letter-spacing: -0.03em;
}

.page-lead {
  margin-top: 0.6rem;
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--ink-mid);
  max-width: 56ch;
}

.page-lead a {
  color: var(--accent);
  text-underline-offset: 0.2em;
}

.form-card {
  margin-top: 1.4rem;
  padding: 1.1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
  display: grid;
  gap: 0.9rem;
}

.form-title {
  font-size: 1rem;
  font-weight: 620;
  color: var(--ink);
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.8rem;
}

.field {
  display: grid;
  gap: 0.3rem;
}

.field-wide {
  grid-column: 1 / -1;
}

.label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink);
  font-family: inherit;
  font-size: 0.85rem;
  resize: vertical;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.hint {
  font-size: 0.7rem;
  color: var(--ink-soft);
}

.switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.84rem;
  color: var(--ink-mid);
  cursor: pointer;
}

.switch input {
  accent-color: var(--accent);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding: 1.2rem 0 0.8rem;
}

.search {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: 1 1 240px;
  padding: 0.42rem 0.65rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  background: var(--paper-soft);
  color: var(--ink-soft);
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 0.84rem;
  color: var(--ink);
}

.filters {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.filters select {
  padding: 0.4rem 0.5rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink-mid);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

/* 批量操作条 */
.bulk-bar {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
  margin-bottom: 0.8rem;
}

.bulk-bar.is-open {
  border-color: var(--accent);
}

.check-all {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--ink-mid);
  cursor: pointer;
}

.check-all input {
  accent-color: var(--accent);
}

.rows {
  list-style: none;
  display: grid;
  gap: 0.6rem;
}

.sk-row {
  height: 76px;
  border-radius: var(--radius-sm);
}

.row {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: start;
  gap: 0.8rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--paper-raised);
}

.row.is-featured {
  border-color: var(--rule-strong);
}

.row.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.row-check input {
  accent-color: var(--accent);
  margin-top: 0.2rem;
}

.row-order {
  display: grid;
  gap: 0.2rem;
}

.mini {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 22px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
}

.mini:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}

.mini:disabled {
  opacity: 0.35;
  cursor: default;
}

.row-main {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.name {
  font-size: 0.96rem;
  font-weight: 600;
  color: var(--ink);
}

.kind,
.featured,
.status {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  color: var(--ink-soft);
}

.featured,
.status {
  color: var(--accent);
}

.summary {
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--ink-mid);
}

.row-links {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.row-links a {
  font-size: 0.72rem;
  color: var(--ink-soft);
  text-decoration: none;
}

.row-links a:hover {
  color: var(--accent);
}

.row-actions {
  display: flex;
  gap: 0.15rem;
  align-items: center;
  flex-wrap: wrap;
}

.text-btn {
  border: 0;
  background: transparent;
  padding: 0.25rem 0.45rem;
  border-radius: var(--radius-xs);
  font-size: 0.78rem;
  font-family: inherit;
  color: var(--ink-mid);
  cursor: pointer;
  text-decoration: none;
}

.text-btn:hover {
  background: var(--paper-soft);
  color: var(--ink);
}

.text-btn.danger:hover {
  color: var(--accent);
}

.primary,
.ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-sm);
  font-size: 0.84rem;
  font-family: inherit;
  cursor: pointer;
  text-decoration: none;
}

.primary {
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
}

.primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.ghost {
  background: transparent;
  border: 1px solid var(--rule-strong);
  color: var(--ink);
}

/* 删除确认弹层 */
.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: color-mix(in oklab, var(--ink) 40%, transparent);
}

.dialog {
  width: min(420px, 100%);
  padding: 1.3rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  box-shadow: var(--shadow-float);
  display: grid;
  gap: 0.7rem;
}

.dialog-title {
  font-size: 1.05rem;
  font-weight: 620;
  color: var(--ink);
}

.dialog-hint {
  font-size: 0.88rem;
  line-height: 1.65;
  color: var(--ink-mid);
}

.dialog-note {
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}

.danger-solid {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 0.82rem;
  font-family: inherit;
  cursor: pointer;
}

.danger-solid:hover {
  filter: brightness(1.08);
}

.danger-solid:disabled {
  opacity: 0.6;
  cursor: default;
}

.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.2s ease, transform 0.25s var(--ease-out-expo);
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 720px) {
  .row {
    grid-template-columns: auto auto 1fr;
  }

  .row-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
