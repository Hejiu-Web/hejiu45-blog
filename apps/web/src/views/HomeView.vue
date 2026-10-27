<!--
  首页：首屏 → 置顶文章 → 文章列表（非对称双栏）→ 关于区块。
  每个区块的版式家族都不同，避免「一排一样的卡片」。
-->
<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import HeroSection from '@/components/HeroSection.vue';
import PostCard from '@/components/PostCard.vue';
import PostSkeleton from '@/components/PostSkeleton.vue';
import EmptyState from '@/components/EmptyState.vue';
import BaseIcon from '@/components/BaseIcon.vue';
import { usePosts } from '@/stores/posts';
import { useSiteStore } from '@/stores/site';
import { useReveal } from '@/composables/useReveal';
import { api } from '@/api/client';
import { compactNumber, formatDate, formatDuration } from '@/utils/format';

const store = usePosts();
const site = useSiteStore();

/** 区块标题与说明都来自站点设置 */
const recentLead = computed(() => String(site.info.sectionRecentLead || '').trim());
const latestLead = computed(() => String(site.info.sectionLatestLead || '').trim());
const { published, loading, error, loaded } = storeToRefs(store);
const tags = ref([]);
const pageRef = ref(null);
const { observe } = useReveal(pageRef, { stagger: 70 });

const featured = computed(() => published.value.find((p) => p.featured) || published.value[0] || null);
const rest = computed(() => published.value.filter((p) => p.id !== featured.value?.id));

const PAGE = 6;
const visible = ref(PAGE);
const list = computed(() => rest.value.slice(0, visible.value));
const hasMore = computed(() => visible.value < rest.value.length);

// 置顶之外的「编辑推荐」：按互动量取 3 篇，做横向条目列表
const topPicked = computed(() =>
  [...rest.value].sort((a, b) => b.likeCount + b.views / 50 - (a.likeCount + a.views / 50)).slice(0, 3),
);

watch(
  list,
  () => {
    requestAnimationFrame(observe);
  },
  { flush: 'post' },
);

onMounted(async () => {
  await Promise.all([store.ensure(), api.tags().then((r) => (tags.value = r.tags)).catch(() => [])]);
  requestAnimationFrame(observe);
});

function loadMore() {
  visible.value += PAGE;
}
</script>

<template>
  <div ref="pageRef" class="home">
    <HeroSection :featured="featured" :count="published.length" :tags="tags" />

    <!-- 编辑推荐：横向条目，与下方卡片网格形成版式区分 -->
    <section v-if="topPicked.length" class="u-container picked" aria-labelledby="picked-title">
      <div class="picked-head">
        <h2 id="picked-title" class="section-title" data-reveal>{{ site.info.sectionRecentTitle || '读者最常停下来的几篇' }}</h2>
        <p v-if="recentLead" class="picked-sub" data-reveal>{{ recentLead }}</p>
      </div>
      <ol class="picked-list">
        <li v-for="(post, i) in topPicked" :key="post.id" data-reveal>
          <RouterLink :to="`/post/${post.slug}`" class="picked-item">
            <span class="picked-rank">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="picked-body">
              <span class="picked-title">{{ post.title }}</span>
              <span class="picked-meta">
                {{ formatDate(post.publishedAt, { short: true }) }}
                <span aria-hidden="true">/</span>
                {{ formatDuration(post.readingMinutes * 60, { max: 1 }) }}
              </span>
            </span>
            <span class="picked-stat">
              <BaseIcon name="heart" :size="13" weight="fill" />
              {{ compactNumber(post.likeCount) }}
            </span>
            <BaseIcon name="arrowUpRight" :size="15" class="picked-arrow" />
          </RouterLink>
        </li>
      </ol>
    </section>

    <section class="u-container feed" aria-labelledby="feed-title">
      <header class="feed-head">
        <h2 id="feed-title" class="section-title" data-reveal>{{ site.info.sectionLatestTitle || '最近写的' }}</h2>
        <RouterLink to="/archive" class="feed-all" data-reveal>
          按时间浏览全部
          <BaseIcon name="arrowRight" :size="15" />
        </RouterLink>
      </header>
      <p v-if="latestLead" class="feed-lead" data-reveal>{{ latestLead }}</p>

      <div v-if="loading && !loaded" class="feed-grid">
        <PostSkeleton v-for="i in 4" :key="i" variant="card" />
      </div>

      <div v-else-if="error" class="feed-error">
        <EmptyState icon="warning" title="文章没能加载出来" description="可能是服务暂时不可用，稍后刷新再试。">
          <button type="button" class="retry u-press" @click="store.ensure(true)">重新加载</button>
        </EmptyState>
      </div>

      <EmptyState
        v-else-if="!list.length"
        icon="edit"
        title="还没有公开的文章"
        description="登录写作台，写下第一篇吧。发布之后它会出现在这里。"
      >
        <RouterLink to="/login" class="retry u-press">去登录</RouterLink>
      </EmptyState>

      <template v-else>
        <div class="feed-grid">
          <PostCard v-for="(post, i) in list" :key="post.id" :post="post" :index="i" />
        </div>

        <div v-if="hasMore" class="feed-more" data-reveal>
          <button type="button" class="load-more u-press" @click="loadMore">
            再看 {{ Math.min(PAGE, rest.length - visible) }} 篇
            <BaseIcon name="arrowDown" :size="15" />
          </button>
        </div>
      </template>
    </section>

    <!-- 合集：作者自定义的内容组织方式，按主题成组阅读 -->
    <section v-if="site.collections.length" class="u-container col-strip" aria-labelledby="col-title">
      <header class="feed-head">
        <h2 id="col-title" class="section-title" data-reveal>成系列的读</h2>
        <RouterLink to="/collections" class="feed-all" data-reveal>
          全部合集
          <BaseIcon name="arrowRight" :size="15" />
        </RouterLink>
      </header>
      <div class="col-grid">
        <RouterLink v-for="c in site.collections.slice(0, 3)" :key="c.slug" :to="`/collections/${c.slug}`" class="col-card" data-reveal>
          <span class="col-count">{{ c.count }} 篇</span>
          <span class="col-name">{{ c.title }}</span>
          <span class="col-desc">{{ c.description || '按主题组织的一组文章' }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="u-container about-strip" aria-labelledby="about-title">
      <div class="about-line" aria-hidden="true" data-reveal />
      <div class="about-grid">
        <p class="about-kicker u-mono-label" data-reveal>关于</p>
        <div>
          <h2 id="about-title" class="about-title" data-reveal>写得慢一点，但每篇都想留下点东西。</h2>
          <p class="about-body" data-reveal>
            这里记录前端工程的取舍、界面背后的设计判断，以及一些与技术无关的耐心。
          </p>
          <RouterLink to="/about" class="about-link u-press" data-reveal>
            读一读我是谁
            <BaseIcon name="arrowRight" :size="15" />
          </RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  padding-bottom: 1rem;
}

.section-title {
  font-size: clamp(1.35rem, 1.1rem + 1vw, 1.75rem);
  font-weight: 660;
  letter-spacing: -0.025em;
  color: var(--ink);
}

/* ---------- 编辑推荐 ---------- */
.picked {
  margin-top: clamp(2.75rem, 7vw, 4.5rem);
}

.picked-head {
  display: grid;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.picked-sub {
  font-size: 0.88rem;
  color: var(--ink-soft);
}

.feed-lead {
  margin-top: -0.4rem;
  font-size: 0.88rem;
  color: var(--ink-soft);
}

.picked-list {
  list-style: none;
  display: grid;
  gap: 0;
  border-top: 1px solid var(--rule);
}

.picked-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 1rem;
  padding: 0.95rem 0.6rem;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--rule);
  transition: background-color 0.3s ease, padding-left 0.4s var(--ease-out-expo);
}

.picked-item:hover {
  background: var(--paper-soft);
  padding-left: 1rem;
}

.picked-rank {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--accent);
  letter-spacing: 0.06em;
}

.picked-body {
  display: grid;
  gap: 0.2rem;
}

.picked-title {
  font-size: 1rem;
  font-weight: 540;
  color: var(--ink);
  line-height: 1.45;
}

.picked-meta {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
  display: inline-flex;
  gap: 0.45rem;
}

.picked-stat {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.picked-arrow {
  color: var(--ink-soft);
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 0.3s ease, transform 0.4s var(--ease-out-expo);
}

.picked-item:hover .picked-arrow {
  opacity: 1;
  transform: none;
  color: var(--accent);
}

/* ---------- 文章列表 ---------- */
.feed {
  margin-top: clamp(3rem, 8vw, 5.5rem);
}

.feed-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1.75rem;
  flex-wrap: wrap;
}

.feed-all {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--ink-mid);
  text-decoration: none;
  white-space: nowrap;
}

.feed-all:hover {
  color: var(--accent);
}

.feed-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.feed-more {
  display: flex;
  justify-content: center;
  margin-top: 2rem;
}

.load-more,
.retry {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.62rem 1.1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink);
  font-size: 0.86rem;
  cursor: pointer;
  text-decoration: none;
}

.load-more:hover,
.retry:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ---------- 合集 ---------- */
.col-strip {
  margin-top: clamp(3rem, 8vw, 5rem);
}

.col-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.8rem;
}

.col-card {
  display: grid;
  gap: 0.3rem;
  padding: 1.1rem 1.2rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.25s ease, transform 0.35s var(--ease-out-expo);
}

.col-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.col-count {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  color: var(--accent);
}

.col-name {
  font-size: 1.02rem;
  font-weight: 580;
  color: var(--ink);
}

.col-desc {
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--ink-soft);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ---------- 关于 ---------- */
.about-strip {
  margin-top: clamp(3.5rem, 9vw, 6rem);
}

.about-line {
  height: 1px;
  background: linear-gradient(90deg, var(--accent), var(--rule) 45%, transparent);
  transform-origin: left;
  margin-bottom: 1.75rem;
}

.about-grid {
  display: grid;
  gap: 1rem;
}

.about-title {
  font-size: clamp(1.5rem, 1.1rem + 1.8vw, 2.25rem);
  line-height: 1.28;
  letter-spacing: -0.03em;
  font-weight: 640;
  max-width: 22ch;
  color: var(--ink);
}

.about-body {
  margin-top: 1rem;
  max-width: 46ch;
  font-size: 0.95rem;
  line-height: 1.8;
  color: var(--ink-mid);
}

.about-link {
  margin-top: 1.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
  color: var(--ink);
  text-decoration: none;
  border-bottom: 1px solid var(--rule-strong);
  padding-bottom: 0.25rem;
}

.about-link:hover {
  color: var(--accent);
  border-color: var(--accent);
}

@media (min-width: 640px) {
  .feed-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1000px) {
  /* 非对称：每 4 篇一组，第一行 7+5，第二行 5+7。
     显式写列号而不是交给自动放置，避免 span 卡片被塞进 12 列网格的残留列。 */
  .feed-grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 1.25rem;
    align-items: stretch;
  }

  .feed-grid > :nth-child(4n + 1) {
    grid-column: 1 / span 7;
    grid-row: 1;
  }

  .feed-grid > :nth-child(4n + 2) {
    grid-column: 8 / span 5;
    grid-row: 1;
  }

  .feed-grid > :nth-child(4n + 3) {
    grid-column: 1 / span 5;
    grid-row: 2;
  }

  .feed-grid > :nth-child(4n) {
    grid-column: 6 / span 7;
    grid-row: 2;
  }

  .about-grid {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 2rem;
  }
}
</style>
