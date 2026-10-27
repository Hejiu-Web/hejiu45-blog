<!--
  标签管理：重命名、合并、删除、描述、颜色、置顶。

  标签本身是跟着文章自动出现的，这里管理的是「标签的附加信息」。
  重命名时如果目标已存在，服务端会自动合并，避免出现两个同义标签。
-->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { api } from '@/api/client';
import { toast } from '@/composables/useToast';

const tags = ref([]);
const loading = ref(true);
const query = ref('');
const sortBy = ref('count');

/** 正在编辑的标签 */
const editing = ref(null);
const draft = ref({ description: '', alias: '', color: '', pinned: false });
const saving = ref(false);

/** 重命名 / 合并弹窗 */
const dialog = ref(null);
const dialogValue = ref('');
const dialogMode = ref('rename');

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = tags.value;
  if (q) {
    list = list.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.alias || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q),
    );
  }
  const sorted = [...list];
  if (sortBy.value === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  else if (sortBy.value === 'pinned') sorted.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.count - a.count);
  else sorted.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
  return sorted;
});

const totalPosts = computed(() => tags.value.reduce((sum, t) => sum + t.count, 0));

async function load() {
  loading.value = true;
  try {
    tags.value = (await api.adminTags()).tags;
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    loading.value = false;
  }
}

function startEdit(tag) {
  editing.value = tag.name;
  draft.value = {
    description: tag.description || '',
    alias: tag.alias || '',
    color: tag.color || '',
    pinned: Boolean(tag.pinned),
  };
}

function cancelEdit() {
  editing.value = null;
}

async function saveEdit(name) {
  saving.value = true;
  try {
    await api.updateTag(name, draft.value);
    toast('已保存标签信息');
    editing.value = null;
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    saving.value = false;
  }
}

async function togglePin(tag) {
  try {
    await api.updateTag(tag.name, { pinned: !tag.pinned });
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

function openDialog(tag, mode) {
  dialogMode.value = mode;
  dialog.value = tag;
  dialogValue.value = mode === 'rename' ? tag.name : '';
}

function closeDialog() {
  dialog.value = null;
  dialogValue.value = '';
}

async function submitDialog() {
  const target = dialogValue.value.trim();
  if (!target) return;
  try {
    if (dialogMode.value === 'rename') {
      const res = await api.renameTag(dialog.value.name, target);
      toast(res.merged ? `已合并到「${res.name}」，影响 ${res.affected} 篇文章` : `已重命名为「${res.name}」，影响 ${res.affected} 篇文章`);
    } else {
      const res = await api.mergeTag(dialog.value.name, target);
      toast(`已把「${dialog.value.name}」合并进「${res.name}」，影响 ${res.affected} 篇文章`);
    }
    closeDialog();
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

/**
 * 删除确认用页面内弹层，不用 window.confirm。
 * 原生 confirm 在部分内嵌浏览器/移动端会被拦截或静默返回 false，
 * 表现为「点了删除没反应」，很难判断是没生效还是被取消。
 */
const pendingDelete = ref(null);
const deleting = ref(false);

function askRemove(tag) {
  pendingDelete.value = tag;
}

async function confirmRemove() {
  const tag = pendingDelete.value;
  if (!tag) return;
  deleting.value = true;
  try {
    const res = await api.deleteTag(tag.name);
    toast(`已删除「${tag.name}」，更新了 ${res.affected} 篇文章`);
    pendingDelete.value = null;
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="tag-admin u-container">
    <header class="head">
      <div>
        <h1 class="page-title">标签管理</h1>
        <p class="page-lead">
          标签会跟着文章自动出现。这里可以修改描述、设置别名与颜色、置顶，也可以重命名、合并或删除。
        </p>
      </div>
      <RouterLink to="/tags" class="ghost u-press">
        查看前台标签页
        <BaseIcon name="arrowUpRight" :size="14" />
      </RouterLink>
    </header>

    <div class="toolbar">
      <label class="search">
        <BaseIcon name="search" :size="15" />
        <input v-model="query" type="search" placeholder="搜索标签、别名或描述" aria-label="搜索标签" />
      </label>
      <div class="sorts" role="group" aria-label="排序">
        <button type="button" :class="{ 'is-active': sortBy === 'count' }" @click="sortBy = 'count'">按文章数</button>
        <button type="button" :class="{ 'is-active': sortBy === 'name' }" @click="sortBy = 'name'">按名称</button>
        <button type="button" :class="{ 'is-active': sortBy === 'pinned' }" @click="sortBy = 'pinned'">置顶优先</button>
      </div>
      <p class="stat">{{ tags.length }} 个标签 · 共 {{ totalPosts }} 次标记</p>
    </div>

    <div v-if="loading" class="rows">
      <span v-for="i in 6" :key="i" class="u-skeleton sk-row" />
    </div>

    <EmptyState
      v-else-if="!filtered.length"
      icon="tag"
      title="没有匹配的标签"
      :description="tags.length ? '换个关键词试试。' : '写文章时加上标签，它们会自动汇总到这里。'"
    />

    <ul v-else class="rows">
      <li v-for="tag in filtered" :key="tag.name" class="row" :class="{ 'is-pinned': tag.pinned }">
        <div class="row-main">
          <div class="row-title">
            <span v-if="tag.color" class="dot" :style="{ background: tag.color }" aria-hidden="true" />
            <BaseIcon v-if="tag.pinned" name="bookmark" :size="13" class="pin-icon" />
            <span class="name">{{ tag.name }}</span>
            <span class="count">{{ tag.count }} 篇</span>
            <span v-if="!tag.count" class="muted">暂无文章</span>
          </div>
          <p v-if="tag.description" class="desc">{{ tag.description }}</p>
          <p v-if="tag.alias" class="alias">别名：{{ tag.alias }}</p>
        </div>

        <div class="row-actions">
          <button type="button" class="mini u-press" :aria-label="tag.pinned ? '取消置顶' : '置顶'" :title="tag.pinned ? '取消置顶' : '置顶'" @click="togglePin(tag)">
            <BaseIcon name="bookmark" :size="14" />
          </button>
          <button type="button" class="text-btn u-press" @click="editing === tag.name ? cancelEdit() : startEdit(tag)">
            {{ editing === tag.name ? '收起' : '编辑' }}
          </button>
          <button type="button" class="text-btn u-press" @click="openDialog(tag, 'rename')">重命名</button>
          <button type="button" class="text-btn u-press" @click="openDialog(tag, 'merge')">合并</button>
          <button type="button" class="text-btn danger u-press" @click="askRemove(tag)">删除</button>
        </div>

        <!-- 展开编辑 -->
        <div v-if="editing === tag.name" class="edit-panel">
          <label class="field">
            <span class="label">描述</span>
            <textarea v-model="draft.description" rows="2" maxlength="160" placeholder="这个标签收录什么样的文章？" />
          </label>
          <div class="edit-grid">
            <label class="field">
              <span class="label">别名</span>
              <input v-model="draft.alias" type="text" maxlength="60" placeholder="用逗号分隔，如 前端, FE" />
              <span class="hint">同一组含义的写法，访问时会自动跳转到这个标签</span>
            </label>
            <label class="field">
              <span class="label">颜色</span>
              <div class="color-row">
                <input v-model="draft.color" type="text" maxlength="7" placeholder="#b8472f" />
                <input v-model="draft.color" type="color" class="color-pick" aria-label="选择颜色" />
              </div>
            </label>
          </div>
          <label class="switch">
            <input v-model="draft.pinned" type="checkbox" />
            <span>置顶（在前台标签页排在最前）</span>
          </label>
          <div class="edit-actions">
            <button type="button" class="primary u-press" :disabled="saving" @click="saveEdit(tag.name)">
              {{ saving ? '保存中…' : '保存' }}
            </button>
            <button type="button" class="ghost u-press" @click="cancelEdit">取消</button>
          </div>
        </div>
      </li>
    </ul>

    <!-- 重命名 / 合并 -->
    <div v-if="dialog" class="dialog-mask" @click.self="closeDialog">
      <div class="dialog" role="dialog" aria-modal="true">
        <h2 class="dialog-title">{{ dialogMode === 'rename' ? '重命名标签' : '合并标签' }}</h2>
        <p class="dialog-hint">
          {{ dialogMode === 'rename' ? `把「${dialog.name}」改成：` : `把「${dialog.name}」合并到：` }}
        </p>
        <input v-model="dialogValue" type="text" maxlength="24" :placeholder="dialogMode === 'rename' ? '新标签名' : '目标标签名'" @keyup.enter="submitDialog" />
        <p v-if="dialogMode === 'rename'" class="dialog-note">如果新名字已存在，会直接合并，不会产生重复标签。</p>
        <div class="dialog-actions">
          <button type="button" class="ghost u-press" @click="closeDialog">取消</button>
          <button type="button" class="primary u-press" @click="submitDialog">确定</button>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <div v-if="pendingDelete" class="dialog-mask" @click.self="pendingDelete = null">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
        <h2 id="del-title" class="dialog-title">删除标签</h2>
        <p class="dialog-hint">
          确定删除「<strong>{{ pendingDelete.name }}</strong>」吗？
        </p>
        <p class="dialog-note">
          它会被从 {{ pendingDelete.count }} 篇文章中移除，<strong>文章本身不受影响</strong>。此操作无法撤销。
        </p>
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
.tag-admin {
  padding-top: clamp(2rem, 5vw, 3.5rem);
  max-width: 920px;
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

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  padding: 1.2rem 0;
}

.search {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: 1 1 240px;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  background: var(--paper-soft);
  color: var(--ink-soft);
}

.search input {
  flex: 1;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 0.86rem;
  color: var(--ink);
}

.sorts {
  display: inline-flex;
  padding: 0.2rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
}

.sorts button {
  border: 0;
  background: transparent;
  padding: 0.3rem 0.65rem;
  border-radius: var(--radius-xs);
  font-size: 0.78rem;
  color: var(--ink-mid);
  cursor: pointer;
  font-family: inherit;
}

.sorts button.is-active {
  background: var(--paper-raised);
  color: var(--ink);
  box-shadow: var(--shadow-lift);
}

.stat {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-soft);
}

.rows {
  list-style: none;
  display: grid;
  gap: 0.6rem;
}

.sk-row {
  height: 64px;
  border-radius: var(--radius-sm);
}

.row {
  padding: 0.9rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--paper-raised);
  display: grid;
  gap: 0.55rem;
}

.row.is-pinned {
  border-color: var(--rule-strong);
}

.row-main {
  display: grid;
  gap: 0.25rem;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  flex-shrink: 0;
}

.pin-icon {
  color: var(--accent);
}

.name {
  font-size: 0.96rem;
  font-weight: 600;
  color: var(--ink);
}

.count {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--paper-soft);
  border: 1px solid var(--rule);
  color: var(--ink-mid);
}

.muted {
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.desc {
  font-size: 0.84rem;
  line-height: 1.65;
  color: var(--ink-mid);
}

.alias {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-soft);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.mini {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-mid);
  cursor: pointer;
}

.mini:hover {
  color: var(--accent);
  border-color: var(--accent);
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
}

.text-btn:hover {
  background: var(--paper-soft);
  color: var(--ink);
}

.text-btn.danger:hover {
  color: var(--accent);
}

.edit-panel {
  display: grid;
  gap: 0.7rem;
  padding: 0.9rem;
  margin-top: 0.2rem;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--rule-strong);
  background: var(--paper-soft);
}

.edit-grid {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.field {
  display: grid;
  gap: 0.3rem;
}

.label {
  font-size: 0.74rem;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.field input,
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
.field textarea:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.hint {
  font-size: 0.7rem;
  color: var(--ink-soft);
  line-height: 1.5;
}

.color-row {
  display: flex;
  gap: 0.4rem;
}

.color-pick {
  width: 38px;
  padding: 0.1rem;
  cursor: pointer;
}

.switch {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.82rem;
  color: var(--ink-mid);
  cursor: pointer;
}

.switch input {
  accent-color: var(--accent);
}

.edit-actions {
  display: flex;
  gap: 0.45rem;
}

.primary,
.ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
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

.ghost:hover {
  border-color: var(--accent);
  color: var(--accent);
}

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
  font-size: 0.84rem;
  color: var(--ink-mid);
}

.dialog input {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 0.88rem;
}

.dialog-note {
  font-size: 0.72rem;
  color: var(--ink-soft);
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}

/* 危险操作按钮：用实心强调色，与普通主按钮区分 */
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

@media (max-width: 640px) {
  .head {
    flex-direction: column;
  }
}
</style>
