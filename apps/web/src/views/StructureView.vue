<!--
  内容结构：管理「文章类型」与「合集」。
  类型支持自定义字段（文本/数字/日期/下拉/标签/开关），保存后写作台会立刻出现对应表单项。
-->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { api } from '@/api/client';
import { useSiteStore } from '@/stores/site';
import { toast } from '@/composables/useToast';

const site = useSiteStore();
const tab = ref('types');
const saving = ref(false);

/* ───────────────── 文章类型 ───────────────── */

const FIELD_KINDS = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '下拉选项' },
  { value: 'tags', label: '标签组' },
  { value: 'boolean', label: '开关' },
  { value: 'url', label: '链接' },
];

const typeForm = ref(blankType());
const editingTypeId = ref(null);
const typeOpen = ref(false);

function blankType() {
  return { key: '', name: '', description: '', route: '', icon: 'bookmark', fields: [] };
}

function editType(t) {
  editingTypeId.value = t.id;
  typeForm.value = {
    key: t.key,
    name: t.name,
    description: t.description,
    route: t.route,
    icon: t.icon,
    fields: t.fields.map((f) => ({ ...f, optionsText: (f.options || []).join('，') })),
  };
  typeOpen.value = true;
}

function newType() {
  editingTypeId.value = null;
  typeForm.value = blankType();
  typeOpen.value = true;
}

function addField() {
  typeForm.value.fields.push({ key: '', label: '', kind: 'text', help: '', optionsText: '' });
}

function removeField(index) {
  typeForm.value.fields.splice(index, 1);
}

async function saveType() {
  const payload = {
    name: typeForm.value.name,
    description: typeForm.value.description,
    route: typeForm.value.route || typeForm.value.key,
    icon: typeForm.value.icon,
    fields: typeForm.value.fields.map((f) => ({
      key: f.key,
      label: f.label || f.key,
      kind: f.kind,
      help: f.help,
      required: Boolean(f.required),
      options: f.kind === 'select' ? String(f.optionsText || '').split(/[,，\s]+/).filter(Boolean) : undefined,
    })),
  };
  if (!editingTypeId.value) payload.key = typeForm.value.key;

  saving.value = true;
  try {
    if (editingTypeId.value) await api.updateType(editingTypeId.value, payload);
    else await api.createType(payload);
    toast('类型已保存');
    typeOpen.value = false;
    await site.ensure(true);
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    saving.value = false;
  }
}

async function removeType(t) {
  if (!confirm(`确定删除类型「${t.name}」？`)) return;
  try {
    await api.deleteType(t.id);
    toast('类型已删除');
    await site.ensure(true);
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

/* ───────────────── 合集 ───────────────── */

const collectionForm = ref({ title: '', slug: '', description: '' });
const editingCollectionId = ref(null);

async function saveCollection() {
  if (!collectionForm.value.title.trim()) {
    toast('请填写合集标题', { tone: 'error' });
    return;
  }
  saving.value = true;
  try {
    const payload = {
      title: collectionForm.value.title,
      description: collectionForm.value.description,
    };
    if (collectionForm.value.slug) payload.slug = collectionForm.value.slug;
    if (editingCollectionId.value) await api.updateCollection(editingCollectionId.value, payload);
    else await api.createCollection(payload);
    toast('合集已保存');
    collectionForm.value = { title: '', slug: '', description: '' };
    editingCollectionId.value = null;
    await site.ensure(true);
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    saving.value = false;
  }
}

function editCollection(c) {
  editingCollectionId.value = c.id;
  collectionForm.value = { title: c.title, slug: c.slug, description: c.description };
}

async function removeCollection(c) {
  if (!confirm(`删除合集「${c.title}」？文章本身不会被删除。`)) return;
  try {
    await api.deleteCollection(c.id);
    toast('合集已删除');
    await site.ensure(true);
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

const customTypes = computed(() => site.types.filter((t) => !t.builtin));
const builtinTypes = computed(() => site.types.filter((t) => t.builtin));

onMounted(() => site.ensure(true));
</script>

<template>
  <div class="structure u-container">
    <header class="head">
      <div>
        <h1 class="title">内容结构</h1>
        <p class="lead">定义自己的文章类型与合集，写作台会自动出现对应表单。</p>
      </div>
      <RouterLink to="/admin" class="back u-press">返回写作台</RouterLink>
    </header>

    <div class="tabs" role="tablist">
      <button type="button" role="tab" class="tab u-press" :class="{ 'is-active': tab === 'types' }" @click="tab = 'types'">
        文章类型 <span>{{ site.types.length }}</span>
      </button>
      <button type="button" role="tab" class="tab u-press" :class="{ 'is-active': tab === 'collections' }" @click="tab = 'collections'">
        合集 <span>{{ site.collections.length }}</span>
      </button>
    </div>

    <!-- 类型 -->
    <section v-if="tab === 'types'" class="panel">
      <div class="panel-head">
        <h2 class="panel-title">文章类型</h2>
        <button type="button" class="primary u-press" @click="newType">
          <BaseIcon name="plus" :size="15" /> 新建类型
        </button>
      </div>

      <div class="type-list">
        <article v-for="t in site.types" :key="t.id" class="type-card">
          <div class="type-main">
            <p class="type-name">
              {{ t.name }}
              <code>/{{ t.route }}</code>
              <span v-if="t.builtin" class="builtin">内置</span>
            </p>
            <p class="type-desc">{{ t.description || '暂无描述' }}</p>
            <p class="type-meta">
              {{ t.count }} 篇 · 标识 {{ t.key }} · {{ t.fields.length }} 个自定义字段
            </p>
          </div>
          <div class="type-actions">
            <RouterLink :to="`/${t.route}`" class="ghost u-press">查看</RouterLink>
            <button type="button" class="ghost u-press" @click="editType(t)">编辑</button>
            <button v-if="!t.builtin" type="button" class="ghost danger u-press" @click="removeType(t)">删除</button>
          </div>
        </article>
      </div>

      <div v-if="typeOpen" class="editor-panel">
        <h3 class="editor-title">{{ editingTypeId ? '编辑类型' : '新建类型' }}</h3>
        <div class="form-grid">
          <label class="field">
            <span>类型名称</span>
            <input v-model="typeForm.name" placeholder="例如：播客、摄影、读书笔记" />
          </label>
          <label class="field">
            <span>标识（英文，创建后不可改）</span>
            <input v-model="typeForm.key" :disabled="Boolean(editingTypeId)" placeholder="podcast" />
          </label>
          <label class="field">
            <span>路由前缀</span>
            <input v-model="typeForm.route" placeholder="podcasts（默认等于标识）" />
          </label>
          <label class="field field-wide">
            <span>描述</span>
            <input v-model="typeForm.description" placeholder="一句话说明这个类型放什么内容" />
          </label>
        </div>

        <div class="fields-head">
          <h4 class="fields-title">自定义字段</h4>
          <button type="button" class="ghost u-press" @click="addField">+ 添加字段</button>
        </div>

        <p v-if="!typeForm.fields.length" class="fields-empty">
          没有自定义字段也可以。加字段后，写作台会为每篇文章显示对应的输入项。
        </p>

        <div v-for="(f, i) in typeForm.fields" :key="i" class="field-row">
          <input v-model="f.key" placeholder="key（英文）" class="mini" />
          <input v-model="f.label" placeholder="显示名" class="mini" />
          <select v-model="f.kind" class="mini">
            <option v-for="k in FIELD_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select>
          <input v-if="f.kind === 'select'" v-model="f.optionsText" placeholder="选项，用逗号分隔" class="mini wide" />
          <input v-else v-model="f.help" placeholder="提示文字（可选）" class="mini wide" />
          <button type="button" class="ghost danger" aria-label="删除字段" @click="removeField(i)">
            <BaseIcon name="trash" :size="13" />
          </button>
        </div>

        <div class="editor-actions">
          <button type="button" class="primary u-press" :disabled="saving" @click="saveType">
            {{ saving ? '保存中…' : '保存类型' }}
          </button>
          <button type="button" class="ghost u-press" @click="typeOpen = false">取消</button>
        </div>
      </div>
    </section>

    <!-- 合集 -->
    <section v-else class="panel">
      <div class="panel-head">
        <h2 class="panel-title">合集</h2>
      </div>

      <div class="collection-form">
        <label class="field">
          <span>合集标题</span>
          <input v-model="collectionForm.title" placeholder="例如：从零搭建一个博客" />
        </label>
        <label class="field">
          <span>地址别名（可留空）</span>
          <input v-model="collectionForm.slug" placeholder="build-a-blog" />
        </label>
        <label class="field field-wide">
          <span>简介</span>
          <input v-model="collectionForm.description" placeholder="这个合集会带你读什么" />
        </label>
        <div class="editor-actions field-wide">
          <button type="button" class="primary u-press" :disabled="saving" @click="saveCollection">
            {{ editingCollectionId ? '保存修改' : '创建合集' }}
          </button>
          <button
            v-if="editingCollectionId"
            type="button"
            class="ghost u-press"
            @click="editingCollectionId = null; collectionForm = { title: '', slug: '', description: '' }"
          >
            取消编辑
          </button>
        </div>
      </div>

      <EmptyState
        v-if="!site.collections.length"
        icon="bookmark"
        title="还没有合集"
        description="创建一个合集，然后在写作台的文章里把它加进去。"
      />

      <div v-else class="collection-list">
        <div v-for="c in site.collections" :key="c.slug" class="collection-row">
          <div>
            <p class="c-title">{{ c.title }}</p>
            <p class="c-meta">/{{ c.slug }} · {{ c.count }} 篇 · {{ c.description || '无简介' }}</p>
          </div>
          <div class="type-actions">
            <RouterLink :to="`/collections/${c.slug}`" class="ghost u-press">查看</RouterLink>
            <button type="button" class="ghost u-press" @click="editCollection(c)">编辑</button>
            <button type="button" class="ghost danger u-press" @click="removeCollection(c)">删除</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.structure {
  padding-top: clamp(2rem, 5vw, 3.5rem);
  max-width: 1000px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  padding-bottom: 1.75rem;
  border-bottom: 1px solid var(--rule);
  flex-wrap: wrap;
}

.title {
  font-size: clamp(1.7rem, 1.3rem + 2vw, 2.3rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.lead {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: var(--ink-mid);
}

.back {
  font-size: 0.84rem;
  color: var(--ink-mid);
  text-decoration: none;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.85rem;
}

.back:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.tabs {
  display: inline-flex;
  gap: 0.25rem;
  margin-top: 1.5rem;
  padding: 0.22rem;
  border-radius: var(--radius-sm);
  background: var(--paper-soft);
  border: 1px solid var(--rule);
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.85rem;
  cursor: pointer;
}

.tab.is-active {
  background: var(--paper-raised);
  color: var(--ink);
  box-shadow: var(--shadow-lift);
}

.tab span {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
}

.panel {
  margin-top: 1.25rem;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.panel-title {
  font-size: 1.05rem;
  font-weight: 620;
  color: var(--ink);
}

.primary,
.ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}

.primary {
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
}

.primary:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.primary:disabled {
  opacity: 0.6;
  cursor: progress;
}

.ghost {
  background: transparent;
  color: var(--ink-mid);
  border: 1px solid var(--rule-strong);
}

.ghost:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.ghost.danger:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}

.type-list {
  display: grid;
  gap: 0.6rem;
}

.type-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  flex-wrap: wrap;
}

.type-name {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.98rem;
  font-weight: 580;
  color: var(--ink);
}

.type-name code {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.builtin {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  padding: 0.05rem 0.35rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule-strong);
  color: var(--ink-soft);
}

.type-desc {
  margin-top: 0.25rem;
  font-size: 0.84rem;
  color: var(--ink-mid);
}

.type-meta {
  margin-top: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--ink-soft);
}

.type-actions {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.editor-panel {
  margin-top: 1.25rem;
  padding: 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule-strong);
  background: var(--paper-soft);
  display: grid;
  gap: 1rem;
}

.editor-title {
  font-size: 0.98rem;
  font-weight: 620;
  color: var(--ink);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

.field {
  display: grid;
  gap: 0.3rem;
}

.field span {
  font-size: 0.78rem;
  color: var(--ink-mid);
}

.field input {
  padding: 0.55rem 0.7rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 0.88rem;
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.field-wide {
  grid-column: 1 / -1;
}

.fields-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid var(--rule);
  padding-top: 0.9rem;
}

.fields-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink);
}

.fields-empty {
  font-size: 0.8rem;
  color: var(--ink-soft);
  line-height: 1.6;
}

.field-row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
}

.mini {
  padding: 0.4rem 0.5rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 0.8rem;
  min-width: 0;
  flex: 1 1 120px;
}

.mini.wide {
  flex: 2 1 180px;
}

.editor-actions {
  display: flex;
  gap: 0.5rem;
}

.collection-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  padding: 1.1rem;
  border-radius: var(--radius-md);
  border: 1px dashed var(--rule-strong);
  background: var(--paper-soft);
  margin-bottom: 1.25rem;
}

.collection-list {
  display: grid;
  border-top: 1px solid var(--rule);
}

.collection-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 0.25rem;
  border-bottom: 1px solid var(--rule);
  flex-wrap: wrap;
}

.c-title {
  font-size: 0.95rem;
  font-weight: 560;
  color: var(--ink);
}

.c-meta {
  margin-top: 0.2rem;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
}

@media (min-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }

  .collection-form {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
