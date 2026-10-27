<!-- 合集列表：把同主题的文章组织成可翻阅的一组 -->
<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import CoverImage from '@/components/CoverImage.vue';
import { useSiteStore } from '@/stores/site';
import { useReveal } from '@/composables/useReveal';

const site = useSiteStore();
const root = ref(null);
const { observe } = useReveal(root, { stagger: 70 });

onMounted(async () => {
  await site.ensure(true);
  requestAnimationFrame(observe);
});
</script>

<template>
  <div ref="root" class="collections u-container">
    <header class="head">
      <h1 class="title">合集</h1>
      <p class="lead">按主题把文章串成一条线，适合系统性地读。</p>
    </header>

    <EmptyState
      v-if="!site.collections.length"
      icon="bookmark"
      title="还没有合集"
      description="在写作台的「合集」里创建第一个，然后把文章加进去。"
    />

    <div v-else class="grid">
      <RouterLink
        v-for="c in site.collections"
        :key="c.slug"
        :to="`/collections/${c.slug}`"
        class="collection"
        data-reveal
      >
        <div class="cover">
          <CoverImage v-if="c.cover" :src="c.cover" :title="c.title" />
          <span v-else class="cover-mark" aria-hidden="true">{{ c.title.slice(0, 1) }}</span>
        </div>
        <div class="body">
          <p class="count">{{ c.count }} 篇</p>
          <h2 class="name">{{ c.title }}</h2>
          <p class="desc">{{ c.description || '这个合集还没有简介。' }}</p>
        </div>
        <span class="arrow" aria-hidden="true"><BaseIcon name="arrowUpRight" :size="15" /></span>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.collections {
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.head {
  display: grid;
  gap: 0.6rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--rule);
}

.title {
  font-size: clamp(1.9rem, 1.4rem + 2.2vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.lead {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--ink-mid);
}

.grid {
  margin-top: 2rem;
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

.collection {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr;
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  transition: border-color 0.3s ease, box-shadow 0.4s var(--ease-out-expo), transform 0.4s var(--ease-out-expo);
}

.collection:hover {
  border-color: var(--rule-strong);
  box-shadow: var(--shadow-lift);
  transform: translateY(-2px);
}

.cover {
  position: relative;
  aspect-ratio: 16 / 8;
  background: var(--paper-soft);
  container-type: inline-size;
}

.cover-mark {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-family: var(--font-serif);
  font-size: clamp(2.5rem, 14cqi, 5rem);
  color: color-mix(in oklab, var(--ink) 20%, transparent);
  background-image: repeating-linear-gradient(-32deg, transparent 0 11px, var(--rule) 11px 12px);
}

.body {
  display: grid;
  gap: 0.35rem;
  padding: 1.1rem 1.2rem 1.4rem;
}

.count {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  color: var(--accent);
}

.name {
  font-size: 1.15rem;
  font-weight: 620;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.desc {
  font-size: 0.86rem;
  line-height: 1.7;
  color: var(--ink-soft);
}

.arrow {
  position: absolute;
  top: 0.9rem;
  right: 0.9rem;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  color: var(--ink-soft);
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.3s ease, transform 0.4s var(--ease-out-expo);
}

.collection:hover .arrow {
  opacity: 1;
  transform: none;
  color: var(--accent);
}

@media (min-width: 700px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1080px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
