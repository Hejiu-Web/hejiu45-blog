<!--
  搜索：服务端检索（FTS5 trigram / LIKE），结果带高亮片段，支持类型与合集筛选。
  输入 260ms 防抖 + 建议下拉，回车直接搜索。
-->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import PostSkeleton from '@/components/PostSkeleton.vue';
import { api } from '@/api/client';
import { useSiteStore } from '@/stores/site';
import { formatDate, readingLabel } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const site = useSiteStore();

const query = ref(String(route.query.q || ''));
const typeFilter = ref(String(route.query.type || ''));
const collFilter = ref(String(route.query.collection || ''));
const sort = ref(String(route.query.sort || 'relevance'));

const results = ref([]);
const meta = ref({ total: 0, engine: '', hasMore: false, page: 1 });
const loading = ref(false);
const error = ref('');
const suggestions = ref({ titles: [], tags: [] });
const showSuggest = ref(false);
const page = ref(1);

const inputRef = ref(null);
let debounce = 0;
let suggestTimer = 0;
let controller = null;

const hasQuery = computed(() => query.value.trim().length > 0);

async function runSearch({ append = false } = {}) {
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    const res = await api.search({
      q: query.value.trim(),
      type: typeFilter.value,
      collection: collFilter.value,
      sort: sort.value,
      page: append ? page.value + 1 : 1,
      pageSize: 10,
    });
    if (append) {
      results.value = [...results.value, ...res.items];
      page.value += 1;
    } else {
      results.value = res.items;
      page.value = 1;
    }
    meta.value = { total: res.total, engine: res.engine, hasMore: res.hasMore };
  } catch (err) {
    if (err?.name === 'AbortError') return;
    error.value = err.message || '搜索失败';
    results.value = [];
  } finally {
    loading.value = false;
  }
}

function syncUrl() {
  const q = {};
  if (query.value.trim()) q.q = query.value.trim();
  if (typeFilter.value) q.type = typeFilter.value;
  if (collFilter.value) q.collection = collFilter.value;
  if (sort.value !== 'relevance') q.sort = sort.value;
  router.replace({ query: q });
}

function scheduleSearch() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    syncUrl();
    runSearch();
  }, 260);
}

function scheduleSuggest() {
  clearTimeout(suggestTimer);
  const q = query.value.trim();
  if (!q) {
    suggestions.value = { titles: [], tags: [] };
    return;
  }
  suggestTimer = setTimeout(async () => {
    try {
      suggestions.value = await api.suggest(q);
    } catch {
      suggestions.value = { titles: [], tags: [] };
    }
  }, 180);
}

function pick(value) {
  query.value = value;
  showSuggest.value = false;
  scheduleSearch();
  scheduleSuggest();
}

function reset() {
  query.value = '';
  typeFilter.value = '';
  collFilter.value = '';
  results.value = [];
  meta.value = { total: 0, engine: '', hasMore: false, page: 1 };
  syncUrl();
  inputRef.value?.focus();
}

watch([typeFilter, collFilter, sort], () => {
  if (hasQuery.value) {
    syncUrl();
    runSearch();
  }
});

onMounted(async () => {
  await site.ensure();
  await runSearch();
  inputRef.value?.focus();
});
onBeforeUnmount(() => {
  clearTimeout(debounce);
  clearTimeout(suggestTimer);
  controller?.abort();
});
</script>

<template>
  <div class="search u-container">
    <header class="head">
      <h1 class="title">搜索</h1>
      <p class="lead">支持中文子串检索与相关性排序，可以按文章类型或合集缩小范围。</p>
    </header>

    <div class="search-bar">
      <form class="field" role="search" @submit.prevent="pick(query)">
        <BaseIcon name="search" :size="18" />
        <input
          id="search-input"
          ref="inputRef"
          v-model="query"
          type="search"
          placeholder="输入关键词，例如「排版」「部署」「SQLite」"
          autocomplete="off"
          spellcheck="false"
          aria-label="搜索文章"
          @input="scheduleSearch(); scheduleSuggest(); showSuggest = true"
          @focus="showSuggest = true"
          @keydown.esc="showSuggest = false"
        />
        <button v-if="query" type="button" class="clear u-press" aria-label="清空" @click="reset">
          <BaseIcon name="close" :size="14" />
        </button>
      </form>

      <div v-if="showSuggest && hasQuery && (suggestions.titles.length || suggestions.tags.length)" class="suggest" role="listbox">
        <button
          v-for="item in suggestions.titles"
          :key="item.slug"
          type="button"
          class="suggest-item"
          role="option"
          @click="pick(item.title)"
        >
          <BaseIcon name="search" :size="13" />
          {{ item.title }}
        </button>
        <div v-if="suggestions.tags.length" class="suggest-tags">
          <button v-for="tag in suggestions.tags" :key="tag" type="button" class="tag-chip" @click="pick(tag)">
            # {{ tag }}
          </button>
        </div>
      </div>
    </div>

    <div class="filters">
      <label class="filter">
        <span>类型</span>
        <select v-model="typeFilter">
          <option value="">全部类型</option>
          <option v-for="t in site.types" :key="t.key" :value="t.key">{{ t.name }}（{{ t.count }}）</option>
        </select>
      </label>
      <label class="filter">
        <span>合集</span>
        <select v-model="collFilter">
          <option value="">全部合集</option>
          <option v-for="c in site.collections" :key="c.slug" :value="c.slug">{{ c.title }}（{{ c.count }}）</option>
        </select>
      </label>
      <label class="filter">
        <span>排序</span>
        <select v-model="sort">
          <option value="relevance">相关性</option>
          <option value="latest">最新</option>
          <option value="popular">最受欢迎</option>
          <option value="views">阅读最多</option>
        </select>
      </label>
    </div>

    <p class="meta-line">
      <template v-if="loading">检索中…</template>
      <template v-else>
        共 {{ meta.total }} 条结果<template v-if="hasQuery"> · 关键词「{{ query.trim() }}」</template>
        <span class="engine">{{ meta.engine === 'fts5-trigram' ? '全文索引' : '模糊匹配' }}</span>
      </template>
    </p>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div v-if="loading && !results.length" class="results">
      <PostSkeleton v-for="i in 3" :key="i" variant="row" :lines="2" />
    </div>

    <EmptyState
      v-else-if="hasQuery && !results.length && !loading"
      icon="search"
      title="没有找到相关内容"
      description="试试更短的关键词，或者切换筛选条件。中文检索支持任意子串。"
    />

    <ul v-else-if="results.length" class="results">
      <li v-for="item in results" :key="item.id" class="result">
        <RouterLink :to="`/post/${item.slug}`" class="result-link">
          <div class="result-head">
            <span class="result-title" v-html="item.titleHtml || item.title" />
            <span class="result-date">{{ formatDate(item.publishedAt, { short: true }) }}</span>
          </div>
          <p v-if="item.snippet" class="result-snippet" v-html="item.snippet" />
          <div class="result-meta">
            <span v-if="item.type" class="type-badge">
              {{ site.typeOf(item.type)?.name || item.type }}
            </span>
            <span>{{ readingLabel(item.readingMinutes) }}</span>
            <span v-for="tag in item.tags.slice(0, 3)" :key="tag" class="tag">#{{ tag }}</span>
          </div>
        </RouterLink>
      </li>
    </ul>

    <div v-if="meta.hasMore" class="more">
      <button type="button" class="more-btn u-press" @click="runSearch({ append: true })">加载更多</button>
    </div>

    <div class="presets">
      <p class="preset-title">开始浏览</p>
      <div class="preset-tags">
        <RouterLink v-for="c in site.collections.slice(0, 4)" :key="c.slug" :to="`/collections/${c.slug}`" class="preset-card">
          <span class="preset-name">{{ c.title }}</span>
          <span class="preset-count">{{ c.count }} 篇</span>
        </RouterLink>
        <RouterLink v-for="t in site.types.filter((x) => x.count > 0)" :key="t.key" :to="`/${t.route}`" class="preset-card">
          <span class="preset-name">{{ t.name }}</span>
          <span class="preset-count">{{ t.count }} 篇</span>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search {
  padding-top: clamp(2rem, 5vw, 3.5rem);
  max-width: 980px;
}

.head {
  display: grid;
  gap: 0.6rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--rule);
}

.title {
  font-size: clamp(1.9rem, 1.4rem + 2.2vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.lead {
  font-size: 0.92rem;
  line-height: 1.7;
  color: var(--ink-mid);
}

.search-bar {
  position: relative;
  margin-top: 1.5rem;
}

.field {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule-strong);
  background: var(--paper-raised);
  color: var(--ink-soft);
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.field:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.field input {
  flex: 1;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 1.02rem;
  color: var(--ink);
  font-family: inherit;
  min-width: 0;
}

/* 不同浏览器会在 type=search 里注入自带的清除按钮，统一隐藏，用我们自己的 */
.field input::-webkit-search-cancel-button,
.field input::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}

.field input::placeholder {
  color: var(--ink-soft);
}

.clear {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  border: 0;
  background: var(--paper-soft);
  color: var(--ink-mid);
  cursor: pointer;
}

.suggest {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  display: grid;
  gap: 0.15rem;
  padding: 0.45rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  box-shadow: var(--shadow-float);
  max-height: 340px;
  overflow: auto;
}

.suggest-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.86rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.suggest-item:hover {
  background: var(--paper-soft);
  color: var(--ink);
}

.suggest-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.35rem 0.6rem 0.2rem;
  border-top: 1px solid var(--rule);
  margin-top: 0.2rem;
}

.tag-chip {
  padding: 0.22rem 0.5rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.75rem;
  cursor: pointer;
}

.tag-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.filter {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.filter select {
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 0.8rem;
  max-width: 200px;
}

.meta-line {
  margin-top: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.engine {
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
}

.error {
  margin-top: 1rem;
  padding: 0.5rem 0.7rem;
  border-left: 2px solid var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.82rem;
}

.results {
  list-style: none;
  display: grid;
  border-top: 1px solid var(--rule);
  margin-top: 0.6rem;
}

.result {
  border-bottom: 1px solid var(--rule);
}

.result-link {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 0.5rem;
  color: inherit;
  text-decoration: none;
  transition: background-color 0.25s ease;
}

.result:hover {
  background: var(--paper-soft);
}

.result-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.result-title {
  font-size: 1rem;
  font-weight: 580;
  color: var(--ink);
}

.result-date {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
  white-space: nowrap;
}

.result-snippet {
  font-size: 0.86rem;
  line-height: 1.7;
  color: var(--ink-mid);
}

.result-snippet :deep(mark),
.result-title :deep(mark) {
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 2px;
  padding: 0 1px;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
}

.type-badge {
  padding: 0.05rem 0.4rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule-strong);
  color: var(--ink-mid);
}

.tag {
  opacity: 0.85;
}

.more {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
}

.more-btn {
  padding: 0.55rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink);
  font-size: 0.85rem;
  cursor: pointer;
}

.more-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.presets {
  margin-top: 2rem;
}

.preset-title {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 0.7rem;
}

.preset-tags {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.6rem;
}

.preset-card {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink);
  text-decoration: none;
  font-size: 0.86rem;
}

.preset-card:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.preset-count {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-soft);
}
</style>
