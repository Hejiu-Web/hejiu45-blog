<!-- 写作台首页：文章清单 + 数据总览，操作全部就地完成 -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import PostSkeleton from '@/components/PostSkeleton.vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { usePosts } from '@/stores/posts';
import { toast } from '@/composables/useToast';
import { formatDate, compactNumber, relativeTime } from '@/utils/format';

const auth = useAuthStore();
const store = usePosts();
const router = useRouter();

const items = ref([]);
const loading = ref(true);
const error = ref(null);
const filter = ref('all');
const busyId = ref('');
const confirmingId = ref('');

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'published', label: '已发布' },
  { id: 'draft', label: '草稿' },
];

const filtered = computed(() =>
  filter.value === 'all' ? items.value : items.value.filter((p) => p.status === filter.value),
);

const totals = computed(() => ({
  posts: items.value.length,
  published: items.value.filter((p) => p.status === 'published').length,
  views: items.value.reduce((sum, p) => sum + p.views, 0),
  likes: items.value.reduce((sum, p) => sum + p.likeCount, 0),
}));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    items.value = (await api.adminPosts()).items;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function toggleStatus(post) {
  busyId.value = post.id;
  const next = post.status === 'published' ? 'draft' : 'published';
  try {
    const { post: updated } = await api.updatePost(post.id, { status: next });
    Object.assign(post, updated);
    store.upsert(updated);
    toast(next === 'published' ? '已发布' : '已转为草稿');
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    busyId.value = '';
  }
}

async function remove(post) {
  if (confirmingId.value !== post.id) {
    confirmingId.value = post.id;
    setTimeout(() => {
      if (confirmingId.value === post.id) confirmingId.value = '';
    }, 3200);
    return;
  }
  busyId.value = post.id;
  try {
    await api.deletePost(post.id);
    items.value = items.value.filter((p) => p.id !== post.id);
    store.remove(post.id);
    toast('已删除');
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    busyId.value = '';
    confirmingId.value = '';
  }
}

async function logout() {
  await auth.logout();
  router.push('/');
}
onMounted(load);
</script>

<template>
  <div class="admin u-container">
    <header class="admin-head">
      <div>
        <h1 class="page-title">写作台</h1>
        <p class="page-lead">你好，{{ auth.displayName }}。今天想写点什么？</p>
      </div>
      <div class="head-actions">
        <RouterLink to="/admin/new" class="new-btn u-press">
          <BaseIcon name="plus" :size="16" />
          新文章
        </RouterLink>
        <button type="button" class="logout-btn u-press" @click="logout">
          <BaseIcon name="signOut" :size="15" />
          退出
        </button>
      </div>
    </header>

    <ul class="stats" aria-label="数据总览">
      <li><span class="stat-value">{{ totals.posts }}</span><span class="stat-label">全部文章</span></li>
      <li><span class="stat-value">{{ totals.published }}</span><span class="stat-label">已公开</span></li>
      <li><span class="stat-value">{{ compactNumber(totals.views) }}</span><span class="stat-label">累计阅读</span></li>
      <li><span class="stat-value">{{ compactNumber(totals.likes) }}</span><span class="stat-label">累计喜欢</span></li>
    </ul>

    <!-- 管理入口：结构 / 媒体 / 设置 -->
    <nav class="admin-nav" aria-label="管理模块">
      <RouterLink to="/admin/structure" class="admin-card u-press">
        <BaseIcon name="tag" :size="16" />
        <span>
          <span class="admin-card-name">内容结构</span>
          <span class="admin-card-desc">文章类型、自定义字段、合集</span>
        </span>
      </RouterLink>
      <RouterLink to="/admin/media" class="admin-card u-press">
        <BaseIcon name="image" :size="16" />
        <span>
          <span class="admin-card-name">媒体库</span>
          <span class="admin-card-desc">图片、视频、音频</span>
        </span>
      </RouterLink>
      <RouterLink to="/admin/works" class="admin-card u-press">
        <BaseIcon name="bookmark" :size="16" />
        <span>
          <span class="admin-card-name">作品集</span>
          <span class="admin-card-desc">npm、GitHub、线上项目</span>
        </span>
      </RouterLink>
      <RouterLink to="/admin/tags" class="admin-card u-press">
        <BaseIcon name="tag" :size="16" />
        <span>
          <span class="admin-card-name">标签管理</span>
          <span class="admin-card-desc">重命名、合并、描述</span>
        </span>
      </RouterLink>
      <RouterLink to="/admin/settings" class="admin-card u-press">
        <BaseIcon name="edit" :size="16" />
        <span>
          <span class="admin-card-name">站点设置</span>
          <span class="admin-card-desc">站点名、首页文案、关于页</span>
        </span>
      </RouterLink>
      <RouterLink to="/account/security" class="admin-card u-press">
        <BaseIcon name="check" :size="16" />
        <span>
          <span class="admin-card-name">账号与安全</span>
          <span class="admin-card-desc">头像、资料、登录设备</span>
        </span>
      </RouterLink>
    </nav>

    <div class="toolbar">
      <div class="filters" role="tablist" aria-label="按状态筛选">
        <button
          v-for="f in FILTERS"
          :key="f.id"
          type="button"
          role="tab"
          class="filter u-press"
          :aria-selected="filter === f.id"
          :class="{ 'is-active': filter === f.id }"
          @click="filter = f.id"
        >
          {{ f.label }}
          <span class="filter-count">
            {{ f.id === 'all' ? items.length : items.filter((p) => p.status === f.id).length }}
          </span>
        </button>
      </div>
    </div>

    <PostSkeleton v-if="loading" variant="row" :lines="5" />

    <EmptyState
      v-else-if="error"
      icon="warning"
      title="没能读取文章列表"
      :description="error.message"
    >
      <button type="button" class="retry u-press" @click="load">重试</button>
    </EmptyState>

    <EmptyState
      v-else-if="!filtered.length"
      icon="edit"
      title="这里还没有文章"
      description="点击右上角的「新文章」，从第一段开始。"
    >
      <RouterLink to="/admin/new" class="retry u-press">开始写作</RouterLink>
    </EmptyState>

    <div v-else class="post-table">
      <div class="table-head" aria-hidden="true">
        <span>标题</span>
        <span>状态</span>
        <span>数据</span>
        <span>更新</span>
        <span>操作</span>
      </div>

      <article v-for="post in filtered" :key="post.id" class="table-row" :data-busy="busyId === post.id">
        <div class="cell-title">
          <RouterLink :to="`/admin/edit/${post.id}`" class="row-title">{{ post.title }}</RouterLink>
          <span class="row-meta">
            {{ post.slug }}
            <template v-if="post.tags.length"> · {{ post.tags.join(' / ') }}</template>
          </span>
        </div>

        <div class="cell-status">
          <button
            type="button"
            class="status-pill u-press"
            :data-status="post.status"
            :title="post.status === 'published' ? '点击转为草稿' : '点击发布'"
            @click="toggleStatus(post)"
          >
            {{ post.status === 'published' ? '已发布' : '草稿' }}
          </button>
        </div>

        <div class="cell-stats">
          <span><BaseIcon name="eye" :size="12" />{{ compactNumber(post.views) }}</span>
          <span><BaseIcon name="heart" :size="12" />{{ compactNumber(post.likeCount) }}</span>
        </div>

        <div class="cell-updated">
          <span>{{ relativeTime(post.updatedAt) }}</span>
          <span class="row-date">{{ formatDate(post.publishedAt || post.createdAt, { short: true }) }}</span>
        </div>

        <div class="cell-actions">
          <RouterLink :to="`/admin/edit/${post.id}`" class="mini-btn u-press" aria-label="编辑">
            <BaseIcon name="edit" :size="14" />
          </RouterLink>
          <RouterLink
            v-if="post.status === 'published'"
            :to="`/post/${post.slug}`"
            class="mini-btn u-press"
            aria-label="查看"
          >
            <BaseIcon name="arrowUpRight" :size="14" />
          </RouterLink>
          <button
            type="button"
            class="mini-btn mini-danger u-press"
            :class="{ 'is-confirm': confirmingId === post.id }"
            :aria-label="confirmingId === post.id ? '再次点击确认删除' : '删除'"
            @click="remove(post)"
          >
            <BaseIcon name="trash" :size="14" />
            <span v-if="confirmingId === post.id" class="confirm-text">确认</span>
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.admin {
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.admin-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1.5rem;
  flex-wrap: wrap;
  padding-bottom: 1.75rem;
  border-bottom: 1px solid var(--rule);
}

.page-title {
  font-size: clamp(1.8rem, 1.3rem + 2vw, 2.5rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.page-lead {
  margin-top: 0.5rem;
  font-size: 0.92rem;
  color: var(--ink-mid);
}

.head-actions {
  display: flex;
  gap: 0.5rem;
}

.new-btn,
.logout-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.95rem;
  border-radius: var(--radius-sm);
  font-size: 0.86rem;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.new-btn {
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
}

.new-btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.logout-btn {
  background: transparent;
  color: var(--ink-mid);
  border: 1px solid var(--rule-strong);
}

.logout-btn:hover {
  color: var(--ink);
  border-color: var(--ink-soft);
}

.stats {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: var(--rule);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-top: 1.75rem;
}

.stats li {
  display: grid;
  gap: 0.15rem;
  padding: 1rem;
  background: var(--paper);
}

.stat-value {
  font-size: 1.35rem;
  font-weight: 640;
  color: var(--ink);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
}

.toolbar {
  margin-top: 2rem;
  margin-bottom: 1rem;
}

/* 管理入口卡片 */
.admin-nav {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.7rem;
  margin-top: 1.2rem;
}

.admin-card {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink-mid);
  text-decoration: none;
  transition: border-color 0.25s ease, color 0.25s ease, transform 0.3s var(--ease-out-expo);
}

.admin-card:hover {
  border-color: var(--accent);
  color: var(--accent);
  transform: translateY(-1px);
}

.admin-card > span {
  display: grid;
  gap: 0.15rem;
}

.admin-card-name {
  font-size: 0.9rem;
  font-weight: 580;
  color: var(--ink);
}

.admin-card-desc {
  font-size: 0.74rem;
  color: var(--ink-soft);
}

.filters {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.2rem;
  border-radius: var(--radius-sm);
  background: var(--paper-soft);
  border: 1px solid var(--rule);
}

.filter {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border-radius: var(--radius-xs);
  border: 0;
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.82rem;
  cursor: pointer;
}

.filter.is-active {
  background: var(--paper-raised);
  color: var(--ink);
  box-shadow: var(--shadow-lift);
}

.filter-count {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--ink-soft);
}

.post-table {
  border-top: 1px solid var(--rule-strong);
}

.table-head {
  display: none;
}

.table-row {
  display: grid;
  gap: 0.6rem;
  padding: 1rem 0.25rem;
  border-bottom: 1px solid var(--rule);
  transition: opacity 0.25s ease, background-color 0.25s ease;
}

.table-row[data-busy='true'] {
  opacity: 0.55;
  pointer-events: none;
}

.cell-title {
  display: grid;
  gap: 0.2rem;
}

.row-title {
  font-size: 0.98rem;
  font-weight: 560;
  color: var(--ink);
  text-decoration: none;
  line-height: 1.45;
}

.row-title:hover {
  color: var(--accent);
}

.row-meta {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  justify-self: start;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  border: 1px solid var(--rule);
  background: var(--paper-soft);
  color: var(--ink-mid);
  cursor: pointer;
  white-space: nowrap;
}

.status-pill[data-status='published'] {
  color: var(--accent);
  border-color: color-mix(in oklab, var(--accent) 40%, transparent);
  background: var(--accent-soft);
}

.status-pill:hover {
  border-color: var(--ink-soft);
}

.cell-stats {
  display: flex;
  gap: 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.cell-stats span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.cell-updated {
  display: grid;
  gap: 0.1rem;
  font-size: 0.78rem;
  color: var(--ink-mid);
}

.row-date {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--ink-soft);
}

.cell-actions {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}

.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.32rem 0.5rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.72rem;
  cursor: pointer;
  text-decoration: none;
}

.mini-btn:hover {
  border-color: var(--ink-soft);
  color: var(--ink);
}

.mini-danger:hover,
.mini-danger.is-confirm {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.retry {
  display: inline-flex;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink);
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: none;
}

@media (min-width: 640px) {
  .stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .table-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 90px 110px 130px 130px;
    gap: 1rem;
    padding: 0.6rem 0.25rem;
    border-bottom: 1px solid var(--rule);
    font-family: var(--font-mono);
    font-size: 0.64rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }

  .table-row {
    grid-template-columns: minmax(0, 1fr) 90px 110px 130px 130px;
    gap: 1rem;
    align-items: center;
    padding: 0.85rem 0.25rem;
  }

  .table-row:hover {
    background: var(--paper-soft);
  }
}
</style>
