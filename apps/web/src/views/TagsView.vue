<!-- 标签总览：按文章数排列，字号随数量缓动放大 -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import EmptyState from '@/components/EmptyState.vue';
import BaseIcon from '@/components/BaseIcon.vue';
import { api } from '@/api/client';
import { useReveal } from '@/composables/useReveal';

const tags = ref([]);
const loading = ref(true);
const root = ref(null);
const { observe } = useReveal(root, { stagger: 35 });

const described = computed(() => tags.value.filter((t) => t.description));

const max = computed(() => Math.max(1, ...tags.value.map((t) => t.count)));

function sizeOf(count) {
  const ratio = count / max.value;
  return `${(0.95 + ratio * 0.55).toFixed(2)}rem`;
}

onMounted(async () => {
  try {
    tags.value = (await api.tags()).tags;
  } catch {
    tags.value = [];
  } finally {
    loading.value = false;
    requestAnimationFrame(observe);
  }
});
</script>

<template>
  <div ref="root" class="tags-page u-container">
    <header class="tags-head">
      <h1 class="page-title" data-reveal>标签</h1>
      <p class="page-lead" data-reveal>按主题归类。字号越大的标签，相关文章越多。</p>
    </header>

    <div v-if="loading" class="tags-loading" aria-hidden="true">
      <span v-for="i in 10" :key="i" class="u-skeleton chip-skeleton" :style="{ width: `${60 + (i % 4) * 24}px` }" />
    </div>

    <EmptyState v-else-if="!tags.length" icon="tag" title="还没有标签" description="写文章时加上标签，它们会自动汇总到这里。" />

    <ul v-else class="tag-cloud">
      <li v-for="tag in tags" :key="tag.name" data-reveal :title="tag.description || undefined">
        <RouterLink
          :to="`/tags/${encodeURIComponent(tag.name)}`"
          class="tag-pill u-press"
          :class="{ 'is-pinned': tag.pinned }"
          :style="{ fontSize: sizeOf(tag.count), '--tag-color': tag.color || undefined }"
        >
          <BaseIcon v-if="tag.pinned" name="bookmark" :size="12" class="pin" />
          <span v-if="tag.color" class="dot" aria-hidden="true" />
          <span class="tag-name">{{ tag.name }}</span>
          <span class="tag-count">{{ tag.count }}</span>
        </RouterLink>
      </li>
    </ul>

    <!-- 有描述的标签单独列出，标签云里放不下长文案 -->
    <section v-if="described.length" class="described">
      <h2 class="described-title">标签说明</h2>
      <dl class="described-list">
        <template v-for="tag in described" :key="`d-${tag.name}`">
          <dt>{{ tag.name }}</dt>
          <dd>{{ tag.description }}</dd>
        </template>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.tags-page {
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.tags-head {
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
}

.tags-loading {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 2rem;
}

.chip-skeleton {
  height: 36px;
  border-radius: var(--radius-sm);
}

.tag-cloud {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 2rem;
}

.tag-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  padding: 0.5rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink);
  text-decoration: none;
  line-height: 1.3;
  transition:
    transform 0.3s var(--ease-out-expo),
    border-color 0.25s ease,
    color 0.25s ease,
    background-color 0.25s ease;
}

.tag-pill:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.tag-pill.is-pinned {
  border-color: var(--rule-strong);
}

.tag-pill .pin {
  color: var(--accent);
}

.tag-pill .dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--tag-color, var(--accent));
  align-self: center;
}

.described {
  margin-top: 3rem;
  padding-top: 1.6rem;
  border-top: 1px solid var(--rule);
}

.described-title {
  font-size: 1.05rem;
  font-weight: 620;
  color: var(--ink);
  margin-bottom: 1rem;
}

.described-list {
  display: grid;
  grid-template-columns: minmax(80px, auto) 1fr;
  gap: 0.55rem 1.2rem;
  max-width: 62ch;
}

.described-list dt {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--accent);
}

.described-list dd {
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--ink-mid);
}

.tag-count {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
  border-left: 1px solid var(--rule);
  padding-left: 0.45rem;
}
</style>
