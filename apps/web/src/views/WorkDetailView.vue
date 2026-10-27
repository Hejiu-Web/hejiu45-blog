<!-- 作品详情：简介 + 技术栈 + 外部链接 -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { api } from '@/api/client';

const route = useRoute();
const work = ref(null);
const loading = ref(true);
const missing = ref(false);

const KIND_LABELS = { project: '项目', package: '开源包', design: '设计', writing: '写作', other: '其他' };
const STATUS_LABELS = { active: '维护中', wip: '开发中', archived: '已归档' };

const links = computed(() => {
  if (!work.value) return [];
  const out = [];
  if (work.value.url) out.push({ href: work.value.url, label: '访问项目', hint: hostOf(work.value.url) });
  if (work.value.repo) out.push({ href: work.value.repo, label: '查看源码', hint: hostOf(work.value.repo) });
  return out;
});

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

onMounted(async () => {
  try {
    work.value = (await api.work(route.params.slug)).work;
    document.title = `${work.value.title} · 作品`;
  } catch {
    missing.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="work-detail u-container">
    <div v-if="loading" class="loading">
      <span class="u-skeleton sk-title" />
      <span class="u-skeleton sk-line" />
      <span class="u-skeleton sk-line short" />
    </div>

    <EmptyState
      v-else-if="missing"
      icon="warning"
      title="作品不存在"
      description="它可能已经被移除，或者链接写错了。"
    >
      <RouterLink to="/works" class="back u-press">返回作品集</RouterLink>
    </EmptyState>

    <template v-else-if="work">
      <nav class="crumb">
        <RouterLink to="/works">作品</RouterLink>
        <span aria-hidden="true">/</span>
        <span>{{ KIND_LABELS[work.kind] }}</span>
      </nav>

      <header class="head">
        <h1 class="title">{{ work.title }}</h1>
        <div class="meta">
          <span v-if="work.status !== 'active'" class="badge">{{ STATUS_LABELS[work.status] }}</span>
          <span v-if="work.featured" class="badge is-accent">精选</span>
        </div>
        <p v-if="work.summary" class="lead">{{ work.summary }}</p>

        <div v-if="links.length" class="actions">
          <a v-for="link in links" :key="link.href" :href="link.href" target="_blank" rel="noopener noreferrer" class="cta u-press">
            <BaseIcon name="arrowUpRight" :size="15" />
            {{ link.label }}
            <span class="hint">{{ link.hint }}</span>
          </a>
        </div>
      </header>

      <div v-if="work.cover" class="cover">
        <img :src="work.cover" :alt="`${work.title} 的封面`" loading="lazy" />
      </div>

      <section v-if="work.description" class="block">
        <h2 class="block-title">关于这个作品</h2>
        <p class="body-text">{{ work.description }}</p>
      </section>

      <section v-if="work.tech.length" class="block">
        <h2 class="block-title">技术栈</h2>
        <ul class="tech">
          <li v-for="t in work.tech" :key="t">{{ t }}</li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.work-detail {
  padding-top: clamp(2rem, 5vw, 3.5rem);
  max-width: 780px;
}

.loading {
  display: grid;
  gap: 0.8rem;
}

.sk-title {
  height: 40px;
  width: 60%;
}
.sk-line {
  height: 18px;
  width: 100%;
}
.sk-line.short {
  width: 70%;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-soft);
  margin-bottom: 1.1rem;
}

.crumb a {
  color: var(--ink-mid);
  text-decoration: none;
}

.crumb a:hover {
  color: var(--accent);
}

.title {
  font-size: clamp(1.9rem, 1.3rem + 2.2vw, 2.7rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.meta {
  display: flex;
  gap: 0.45rem;
  margin-top: 0.6rem;
}

.badge {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--rule);
  color: var(--ink-soft);
}

.badge.is-accent {
  color: var(--accent);
  border-color: var(--accent);
}

.lead {
  margin-top: 0.85rem;
  font-size: 1.02rem;
  line-height: 1.78;
  color: var(--ink-mid);
  max-width: 58ch;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.3rem;
}

.cta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.9rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: var(--paper-raised);
  color: var(--ink);
  text-decoration: none;
  font-size: 0.86rem;
}

.cta:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.hint {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--ink-soft);
}

.cover {
  margin-top: 2rem;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--rule);
}

.cover img {
  width: 100%;
  height: auto;
  display: block;
}

.block {
  margin-top: 2.4rem;
  display: grid;
  gap: 0.8rem;
}

.block-title {
  font-size: 1.1rem;
  font-weight: 620;
  color: var(--ink);
}

.body-text {
  font-size: 0.98rem;
  line-height: 1.9;
  color: var(--ink-mid);
  white-space: pre-wrap;
}

.tech {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tech li {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  background: var(--paper-soft);
  border: 1px solid var(--rule);
  color: var(--ink-mid);
}

.back {
  display: inline-flex;
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  text-decoration: none;
  font-size: 0.86rem;
}
</style>
