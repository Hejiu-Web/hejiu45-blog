<!-- 合集详情：按顺序列出文章，形成一条阅读路径 -->
<script setup>
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import PostSkeleton from '@/components/PostSkeleton.vue';
import { api } from '@/api/client';
import { formatDate, readingLabel, compactNumber } from '@/utils/format';
import { useSiteStore } from '@/stores/site';

const props = defineProps({ slug: { type: String, required: true } });

const site = useSiteStore();
const collection = ref(null);
const items = ref([]);
const loading = ref(true);
const error = ref('');

async function load(slug) {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.collection(slug);
    collection.value = res.collection;
    items.value = res.items;
    document.title = `${res.collection.title} · 合集`;
  } catch (err) {
    error.value = err.message;
    collection.value = null;
  } finally {
    loading.value = false;
  }
}

const totalMinutes = () => items.value.reduce((sum, p) => sum + (p.readingMinutes || 0), 0);

onMounted(async () => {
  await site.ensure();
  await load(props.slug);
});
watch(() => props.slug, (v) => v && load(v));
</script>

<template>
  <div class="collection u-container">
    <div v-if="loading" class="loading">
      <PostSkeleton variant="row" :lines="4" />
    </div>

    <EmptyState v-else-if="error" icon="warning" title="合集不存在" :description="error">
      <RouterLink to="/collections" class="btn u-press">浏览全部合集</RouterLink>
    </EmptyState>

    <template v-else-if="collection">
      <header class="head">
        <RouterLink to="/collections" class="back">全部合集</RouterLink>
        <h1 class="title">{{ collection.title }}</h1>
        <p v-if="collection.description" class="lead">{{ collection.description }}</p>
        <p class="stats">
          {{ items.length }} 篇 · 约 {{ totalMinutes() }} 分钟可读完
        </p>
      </header>

      <ol class="list">
        <li v-for="(post, i) in items" :key="post.id" class="item">
          <RouterLink :to="`/post/${post.slug}`" class="item-link">
            <span class="rank">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="body">
              <span class="name">{{ post.title }}</span>
              <span v-if="post.excerpt" class="excerpt">{{ post.excerpt }}</span>
              <span class="meta">
                {{ formatDate(post.publishedAt, { short: true }) }}
                <span aria-hidden="true">/</span> {{ readingLabel(post.readingMinutes) }}
                <span aria-hidden="true">/</span> {{ compactNumber(post.likeCount) }} 喜欢
              </span>
            </span>
            <BaseIcon name="arrowRight" :size="15" class="arrow" />
          </RouterLink>
        </li>
      </ol>

      <p v-if="!items.length" class="empty-note">这个合集的文章都还在草稿里。</p>
    </template>
  </div>
</template>

<style scoped>
.collection {
  padding-top: clamp(2rem, 5vw, 3.5rem);
  max-width: 860px;
}

.loading {
  display: grid;
  gap: 1rem;
}

.head {
  display: grid;
  gap: 0.7rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--rule);
}

.back {
  justify-self: start;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  text-decoration: none;
}

.back:hover {
  color: var(--accent);
}

.title {
  font-size: clamp(1.9rem, 1.4rem + 2.2vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.lead {
  font-size: 1rem;
  line-height: 1.75;
  color: var(--ink-mid);
  max-width: 56ch;
}

.stats {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.list {
  list-style: none;
  display: grid;
  border-top: 1px solid var(--rule);
  margin-top: 1.5rem;
}

.item {
  border-bottom: 1px solid var(--rule);
}

.item-link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 1rem;
  padding: 1.1rem 0.5rem;
  color: inherit;
  text-decoration: none;
  transition: background-color 0.25s ease, padding-left 0.35s var(--ease-out-expo);
}

.item-link:hover {
  background: var(--paper-soft);
  padding-left: 0.9rem;
}

.rank {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--accent);
  padding-top: 0.15rem;
}

.body {
  display: grid;
  gap: 0.3rem;
}

.name {
  font-size: 1.02rem;
  font-weight: 560;
  color: var(--ink);
  line-height: 1.45;
}

.item-link:hover .name {
  color: var(--accent);
}

.excerpt {
  font-size: 0.85rem;
  line-height: 1.65;
  color: var(--ink-soft);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
  display: inline-flex;
  gap: 0.4rem;
}

.arrow {
  color: var(--ink-soft);
  margin-top: 0.25rem;
  opacity: 0;
  transition: opacity 0.25s ease, transform 0.35s var(--ease-out-expo);
}

.item-link:hover .arrow {
  opacity: 1;
  color: var(--accent);
  transform: translateX(2px);
}

.empty-note {
  margin-top: 1.5rem;
  font-size: 0.88rem;
  color: var(--ink-soft);
}

.btn {
  display: inline-flex;
  padding: 0.55rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  text-decoration: none;
  font-size: 0.86rem;
}
</style>
