<!--
  作品集：展示站点之外的成果（npm 包、GitHub 仓库、线上产品、设计稿）。
  与文章不同，作品的核心是「链接 + 一句话说明」，所以用卡片而不是列表。
-->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { api } from '@/api/client';

const works = ref([]);
const loading = ref(true);
const activeKind = ref('all');

const KIND_LABELS = {
  all: '全部',
  project: '项目',
  package: '开源包',
  design: '设计',
  writing: '写作',
  other: '其他',
};

const STATUS_LABELS = {
  active: '维护中',
  wip: '开发中',
  archived: '已归档',
};

const kinds = computed(() => {
  const present = new Set(works.value.map((w) => w.kind));
  return ['all', ...Object.keys(KIND_LABELS).filter((k) => k !== 'all' && present.has(k))];
});

const filtered = computed(() =>
  activeKind.value === 'all' ? works.value : works.value.filter((w) => w.kind === activeKind.value),
);

/** 每个作品的主链接：优先线上地址，其次仓库 */
function primaryLink(work) {
  return work.url || work.repo || '';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const KIND_ICONS = { project: 'arrowUpRight', package: 'tag', design: 'image', writing: 'edit', other: 'bookmark' };

onMounted(async () => {
  try {
    works.value = (await api.works()).works;
  } catch {
    works.value = [];
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="works-page u-container">
    <header class="works-head">
      <h1 class="page-title">作品</h1>
      <p class="page-lead">做过的项目、开源包和一些实验。点开可以看详情与链接。</p>
    </header>

    <div v-if="kinds.length > 1" class="kind-tabs" role="tablist" aria-label="按类型筛选">
      <button
        v-for="kind in kinds"
        :key="kind"
        type="button"
        role="tab"
        :aria-selected="activeKind === kind"
        :class="{ 'is-active': activeKind === kind }"
        @click="activeKind = kind"
      >
        {{ KIND_LABELS[kind] }}
      </button>
    </div>

    <div v-if="loading" class="grid">
      <span v-for="i in 4" :key="i" class="u-skeleton work-skeleton" />
    </div>

    <EmptyState
      v-else-if="!filtered.length"
      icon="bookmark"
      title="还没有作品"
      description="在写作台的作品集里添加第一个吧。"
    />

    <div v-else class="grid">
      <article v-for="work in filtered" :key="work.id" class="work-card">
        <RouterLink :to="`/works/${encodeURIComponent(work.slug)}`" class="card-link">
          <div v-if="work.cover" class="work-cover">
            <img :src="work.cover" :alt="`${work.title} 的封面`" loading="lazy" decoding="async" />
          </div>
          <div class="work-body">
            <div class="work-top">
              <span class="work-kind">
                <BaseIcon :name="KIND_ICONS[work.kind] || 'bookmark'" :size="12" />
                {{ KIND_LABELS[work.kind] }}
              </span>
              <span v-if="work.status !== 'active'" class="work-status">{{ STATUS_LABELS[work.status] }}</span>
              <span v-if="work.featured" class="work-featured">精选</span>
            </div>
            <h2 class="work-title">{{ work.title }}</h2>
            <p v-if="work.summary" class="work-summary">{{ work.summary }}</p>
            <ul v-if="work.tech.length" class="work-tech">
              <li v-for="t in work.tech.slice(0, 4)" :key="t">{{ t }}</li>
            </ul>
          </div>
        </RouterLink>

        <div class="work-links">
          <a v-if="work.url" :href="work.url" target="_blank" rel="noopener noreferrer" class="ext" :title="work.url">
            <BaseIcon name="arrowUpRight" :size="13" />
            {{ hostOf(work.url) }}
          </a>
          <a v-if="work.repo" :href="work.repo" target="_blank" rel="noopener noreferrer" class="ext" :title="work.repo">
            <BaseIcon name="code" :size="13" />
            源码
          </a>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.works-page {
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.works-head {
  display: grid;
  gap: 0.9rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--rule);
}

.page-title {
  font-size: clamp(2rem, 1.4rem + 2.4vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.035em;
}

.page-lead {
  font-size: 0.98rem;
  line-height: 1.75;
  color: var(--ink-mid);
  max-width: 52ch;
}

.kind-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 1.4rem 0 0.4rem;
}

.kind-tabs button {
  padding: 0.32rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.8rem;
  font-family: inherit;
  cursor: pointer;
}

.kind-tabs button.is-active {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--paper);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.2rem;
  padding-top: 1.4rem;
}

.work-skeleton {
  height: 220px;
  border-radius: var(--radius-md);
}

.work-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  background: var(--paper-raised);
  overflow: hidden;
  transition:
    transform 0.3s var(--ease-out-expo),
    border-color 0.2s ease;
}

.work-card:hover {
  transform: translateY(-3px);
  border-color: var(--rule-strong);
}

.card-link {
  display: flex;
  flex-direction: column;
  flex: 1;
  text-decoration: none;
  color: inherit;
}

.work-cover {
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--paper-soft);
}

.work-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.work-body {
  display: grid;
  gap: 0.4rem;
  padding: 0.95rem 1rem 0.7rem;
}

.work-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.work-kind,
.work-status,
.work-featured {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.05em;
  color: var(--ink-soft);
}

.work-status {
  color: var(--accent);
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 0.05rem 0.35rem;
}

.work-featured {
  color: var(--accent);
}

.work-title {
  font-size: 1.06rem;
  font-weight: 620;
  letter-spacing: -0.015em;
  color: var(--ink);
}

.work-summary {
  font-size: 0.86rem;
  line-height: 1.65;
  color: var(--ink-mid);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.work-tech {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.2rem;
}

.work-tech li {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-xs);
  background: var(--paper-soft);
  border: 1px solid var(--rule);
  color: var(--ink-mid);
}

.work-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0 1rem 0.9rem;
  border-top: 1px solid var(--rule);
  margin-top: auto;
  padding-top: 0.7rem;
}

.ext {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  font-size: 0.74rem;
  color: var(--ink-mid);
  text-decoration: none;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ext:hover {
  color: var(--accent);
}
</style>
