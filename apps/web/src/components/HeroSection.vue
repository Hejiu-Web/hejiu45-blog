<!--
  首屏：左侧大字 + 右侧横向延伸的「最新一篇」封面。
  不用居中 hero，不用渐变光斑；文字的入场是逐行升起。
-->
<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from './BaseIcon.vue';
import CoverImage from './CoverImage.vue';
import { formatDate } from '@/utils/format';
import { useSiteStore } from '@/stores/site';

const props = defineProps({
  featured: { type: Object, default: null },
  count: { type: Number, default: 0 },
  tags: { type: Array, default: () => [] },
});

const site = useSiteStore();

/** 首屏标题来自站点设置；显式换行优先，否则按长度自动断行 */
const headlineLines = computed(() => {
  const raw = String(site.info.heroTitle || '把想法写下来。').trim();
  // 支持作者在设置里用回车手动断行
  if (raw.includes('\n')) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (raw.length <= 6) return [raw];
  const mid = Math.ceil(raw.length / 2);
  return [raw.slice(0, mid), raw.slice(mid)];
});
const headline = computed(() => headlineLines.value.join(''));
const kicker = computed(() => String(site.info.heroKicker || '').trim());
const primaryLabel = computed(() => site.info.heroPrimaryLabel || '读最新一篇');
const secondaryLabel = computed(() => site.info.heroSecondaryLabel || '全部文章');
/**
 * 副标题优先用作者在设置里填写的文案；
 * 没填时才退回「最新文章摘要」，最后再退到站点描述。
 */
const lead = computed(
  () => site.info.heroLead || props.featured?.excerpt || site.info.siteDescription || '',
);
const metaStrip = computed(() => {
  const items = [`${props.count} 篇文章`];
  if (props.tags.length) items.push(`${props.tags.length} 个标签`);
  if (site.collections.length) items.push(`${site.collections.length} 个合集`);
  items.push(site.info.siteTagline || '长期更新');
  return items;
});
</script>

<template>
  <section class="hero">
    <div class="u-container hero-grid">
      <div class="hero-copy">
        <p v-if="kicker" class="hero-kicker u-mono-label" data-reveal>{{ kicker }}</p>
        <h1 class="hero-title u-line-rise" :aria-label="headline">
          <span v-for="(line, i) in headlineLines" :key="`${line}-${i}`" :style="{ '--line-index': i }">
            <span>{{ line }}</span>
          </span>
        </h1>

        <p class="hero-lead" data-reveal style="--reveal-delay: 220ms">{{ lead }}</p>

        <div class="hero-cta" data-reveal style="--reveal-delay: 320ms">
          <RouterLink v-if="featured" :to="`/post/${featured.slug}`" class="btn-primary u-press">
            {{ primaryLabel }}
            <BaseIcon name="arrowRight" :size="16" />
          </RouterLink>
          <RouterLink to="/archive" class="btn-ghost u-press">
            {{ secondaryLabel }}
            <BaseIcon name="arrowDown" :size="16" />
          </RouterLink>
        </div>

        <ul class="hero-meta" data-reveal style="--reveal-delay: 420ms">
          <li v-for="item in metaStrip" :key="item">{{ item }}</li>
        </ul>
      </div>

      <RouterLink v-if="featured" :to="`/post/${featured.slug}`" class="hero-feature" data-reveal>
        <span class="feature-frame">
          <CoverImage
            :src="featured.cover"
            :title="featured.title"
            :tags="featured.tags"
            :seed="3"
            priority
          />
        </span>
        <span class="feature-caption">
          <span class="feature-tag">最新</span>
          <span class="feature-title">{{ featured.title }}</span>
          <span class="feature-date">{{ formatDate(featured.publishedAt) }}</span>
        </span>
      </RouterLink>
    </div>

    <div class="u-container hero-rule" aria-hidden="true" />
  </section>
</template>

<style scoped>
.hero {
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.hero-grid {
  display: grid;
  gap: clamp(2rem, 5vw, 3.5rem);
  align-items: center;
}

.hero-copy {
  max-width: 34rem;
}

.hero-title {
  font-size: var(--text-display);
  font-weight: 700;
  line-height: 1.02;
  letter-spacing: -0.04em;
  color: var(--ink);
}

.hero-title > span > span {
  padding-bottom: 0.06em;
}

.hero-lead {
  margin-top: 1.5rem;
  font-size: var(--text-lead);
  line-height: 1.75;
  color: var(--ink-mid);
  max-width: 34ch;
}

.hero-cta {
  margin-top: 2rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.btn-primary,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.72rem 1.15rem;
  border-radius: var(--radius-sm);
  font-size: 0.92rem;
  text-decoration: none;
  white-space: nowrap;
}

.btn-primary {
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
}

.btn-primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  gap: 0.7rem;
}

.btn-primary :deep(svg) {
  transition: transform 0.35s var(--ease-out-expo);
}

.btn-primary:hover :deep(svg) {
  transform: translateX(3px);
}

.btn-ghost {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--rule-strong);
}

.btn-ghost:hover {
  border-color: var(--ink-soft);
  background: var(--paper-soft);
}

.hero-meta {
  margin-top: 2.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  list-style: none;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  color: var(--ink-soft);
}

.hero-meta li {
  position: relative;
}

.hero-meta li + li::before {
  content: '';
  position: absolute;
  left: -0.7rem;
  top: 50%;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--ink-soft);
  opacity: 0.6;
}

.hero-feature {
  display: block;
  text-decoration: none;
  color: inherit;
  position: relative;
}

.feature-frame {
  display: block;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
  container-type: inline-size;
}

.hero-feature:hover .feature-frame :deep(img) {
  transform: scale(1.03);
  filter: saturate(1);
}

.feature-caption {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: 0.75rem;
  padding-top: 0.9rem;
}

.feature-tag {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  border: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
  border-radius: var(--radius-xs);
  padding: 0.15rem 0.4rem;
  white-space: nowrap;
}

.feature-title {
  font-size: 0.95rem;
  font-weight: 560;
  color: var(--ink);
  line-height: 1.4;
  background-image: linear-gradient(var(--accent), var(--accent));
  background-size: 0% 1px;
  background-position: 0 100%;
  background-repeat: no-repeat;
  transition: background-size 0.5s var(--ease-out-expo);
}

.hero-feature:hover .feature-title {
  background-size: 100% 1px;
}

.feature-date {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-soft);
  white-space: nowrap;
}

.hero-rule {
  margin-top: clamp(1.75rem, 4vw, 2.75rem);
  border-top: 1px solid var(--rule);
}

@media (min-width: 900px) {
  .hero-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: clamp(2.5rem, 5vw, 4.5rem);
  }

  .feature-frame {
    aspect-ratio: 16 / 11;
  }
}

@media (max-width: 899px) {
  .hero-feature {
    order: 2;
  }

  .hero {
    padding-top: 1.75rem;
  }

  .hero-title {
    font-size: clamp(2.1rem, 11vw, 2.8rem);
    line-height: 1.06;
  }

  .hero-lead {
    margin-top: 1rem;
    font-size: 0.98rem;
    line-height: 1.7;
  }

  .hero-cta {
    margin-top: 1.4rem;
  }

  .hero-meta {
    margin-top: 1.5rem;
  }
}
</style>
