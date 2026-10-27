<!-- 归档：按年份分组的紧凑列表，年份作为粘性侧栏 -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import PostCard from '@/components/PostCard.vue';
import PostSkeleton from '@/components/PostSkeleton.vue';
import EmptyState from '@/components/EmptyState.vue';
import { usePosts } from '@/stores/posts';
import { useReveal } from '@/composables/useReveal';
import { formatDate, formatDuration } from '@/utils/format';

const store = usePosts();
const { published, loading, loaded } = storeToRefs(store);
const root = ref(null);
const { observe } = useReveal(root, { stagger: 40 });

const grouped = computed(() => {
  const map = new Map();
  for (const post of published.value) {
    const year = new Date(post.publishedAt || post.createdAt).getFullYear();
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(post);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
});

onMounted(async () => {
  await store.ensure();
  requestAnimationFrame(observe);
});
</script>

<template>
  <div ref="root" class="archive u-container">
    <header class="archive-head">
      <h1 class="page-title" data-reveal>归档</h1>
      <p class="page-lead" data-reveal>
        共 {{ published.length }} 篇公开文章，按时间倒序排列。每一条都是一个完整想法的起点。
      </p>
    </header>

    <div v-if="loading && !loaded" class="archive-body">
      <PostSkeleton variant="row" :lines="8" />
    </div>

    <EmptyState v-else-if="!grouped.length" icon="bookmark" title="档案还是空的" description="第一篇文章发布后，这里会自动按年份整理。" />

    <div v-else class="archive-body">
      <section v-for="[year, posts] in grouped" :key="year" class="year-group" data-reveal>
        <div class="year-label">
          <h2>{{ year }}</h2>
          <span>{{ posts.length }} 篇</span>
        </div>
        <div class="year-list">
          <RouterLink v-for="post in posts" :key="post.id" :to="`/post/${post.slug}`" class="year-item">
            <span class="item-date">{{ formatDate(post.publishedAt, { short: true }) }}</span>
            <span class="item-title">{{ post.title }}</span>
            <span class="item-tag">{{ post.tags[0] }}</span>
            <span class="item-read">{{ formatDuration(post.readingMinutes * 60, { max: 1 }) }}</span>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.archive {
  padding-top: clamp(2rem, 5vw, 3.5rem);
  max-width: var(--page-max);
}

.archive-head {
  display: grid;
  gap: 0.9rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--rule);
}

.page-title {
  font-size: clamp(2rem, 1.4rem + 2.4vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.page-lead {
  font-size: 0.98rem;
  line-height: 1.75;
  color: var(--ink-mid);
  max-width: 48ch;
}

.archive-body {
  display: grid;
  gap: 2.5rem;
  margin-top: 2rem;
}

.year-group {
  display: grid;
  gap: 1rem;
}

.year-label {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.year-label h2 {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.04em;
}

.year-label span {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
}

.year-list {
  display: grid;
  border-top: 1px solid var(--rule);
}

.year-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 0.25rem 0.9rem;
  padding: 0.85rem 0.5rem;
  border-bottom: 1px solid var(--rule);
  text-decoration: none;
  color: inherit;
  transition: background-color 0.3s ease, padding-left 0.4s var(--ease-out-expo);
}

.year-item:hover {
  background: var(--paper-soft);
  padding-left: 0.9rem;
}

.item-date {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-soft);
  white-space: nowrap;
}

.item-title {
  font-size: 0.98rem;
  font-weight: 520;
  color: var(--ink);
  line-height: 1.5;
}

.year-item:hover .item-title {
  color: var(--accent);
}

.item-tag {
  display: none;
  font-size: 0.7rem;
  color: var(--ink-soft);
  border: 1px solid var(--rule);
  border-radius: var(--radius-xs);
  padding: 0.1rem 0.4rem;
  white-space: nowrap;
}

.item-read {
  display: none;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
  white-space: nowrap;
}

@media (min-width: 768px) {
  .year-group {
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 2rem;
  }

  .year-label {
    position: sticky;
    top: calc(var(--header-h) + 1.5rem);
    align-self: start;
    flex-direction: column;
    gap: 0.15rem;
  }

  .year-item {
    grid-template-columns: 52px minmax(0, 1fr) auto auto;
  }

  .item-tag,
  .item-read {
    display: inline-block;
  }
}
</style>
