<!--
  文章卡片：一张纸，而不是一个盒子。
  用悬浮时的墨色阴影与左上角的序号来建立层级，避免「三张一样的卡片」。
-->
<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from './BaseIcon.vue';
import CoverImage from './CoverImage.vue';
import { formatDate, readingLabel, compactNumber } from '@/utils/format';

const props = defineProps({
  post: { type: Object, required: true },
  index: { type: Number, default: 0 },
  variant: { type: String, default: 'default' }, // default | row | featured
});

const hasCover = computed(() => Boolean(props.post.cover));function trackSpot(event) {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
  el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
}
</script>

<template>
  <article
    class="post-card"
    :data-variant="variant"
    :data-reveal="variant !== 'featured' ? '' : undefined"
    @pointermove="trackSpot"
  >
    <RouterLink :to="`/post/${post.slug}`" class="card-link" :aria-label="post.title">
      <div v-if="variant !== 'row'" class="card-media">
        <CoverImage
          :src="post.cover"
          :title="post.title"
          :tags="post.tags"
          :seed="index"
          ratio="16/10"
        />
      </div>

      <div class="card-body">
        <div class="card-meta">
          <time :datetime="new Date(post.publishedAt || post.createdAt).toISOString()">
            {{ formatDate(post.publishedAt || post.createdAt) }}
          </time>
          <span class="meta-gap" aria-hidden="true"></span>
          <span>{{ readingLabel(post.readingMinutes) }}</span>
        </div>

        <h3 class="card-title">{{ post.title }}</h3>
        <p class="card-excerpt">{{ post.excerpt }}</p>

        <div class="card-foot">
          <ul v-if="post.tags?.length" class="card-tags" aria-label="文章标签">
            <li v-for="tag in post.tags.slice(0, 3)" :key="tag">{{ tag }}</li>
          </ul>
          <div class="card-stats">
            <span class="stat">
              <BaseIcon name="heart" :size="13" :weight="post.likeCount > 0 ? 'fill' : 'regular'" />
              {{ compactNumber(post.likeCount) }}
            </span>
            <span class="stat"><BaseIcon name="eye" :size="13" />{{ compactNumber(post.views) }}</span>
          </div>
        </div>
      </div>

      <span class="card-arrow" aria-hidden="true">
        <BaseIcon name="arrowUpRight" :size="16" />
      </span>
    </RouterLink>
  </article>
</template>

<style scoped>
.post-card {
  position: relative;
  border-radius: var(--radius-lg);
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  transition:
    border-color 0.35s ease,
    box-shadow 0.45s var(--ease-out-expo),
    transform 0.45s var(--ease-out-expo);
}

.post-card:hover {
  border-color: var(--rule-strong);
  box-shadow: var(--shadow-lift);
  transform: translateY(-2px);
}

.card-link {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  color: inherit;
  text-decoration: none;
  padding: clamp(1.15rem, 2.4vw, 1.6rem);
}

.card-media {
  margin: calc(clamp(1.15rem, 2.4vw, 1.6rem) * -1) calc(clamp(1.15rem, 2.4vw, 1.6rem) * -1) 1.2rem;
  overflow: hidden;
  border-radius: calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px) 0 0;
  background: var(--paper-soft);
  container-type: inline-size;
}

.post-card:hover .card-media :deep(img) {
  transform: scale(1.035);
  filter: saturate(1) contrast(1.02);
}

.card-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0.7rem;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
}

.meta-gap {
  width: 14px;
  height: 1px;
  background: var(--rule-strong);
}

.card-title {
  font-size: clamp(1.15rem, 1rem + 0.5vw, 1.4rem);
  font-weight: 640;
  line-height: 1.35;
  color: var(--ink);
  letter-spacing: -0.018em;
  padding-right: 1.6rem;
  background-image: linear-gradient(var(--accent), var(--accent));
  background-size: 0% 1px;
  background-position: 0 calc(100% + 2px);
  background-repeat: no-repeat;
  transition: background-size 0.5s var(--ease-out-expo);
}

.post-card:hover .card-title {
  background-size: 100% 1px;
}

.card-excerpt {
  font-size: 0.92rem;
  line-height: 1.72;
  color: var(--ink-soft);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-foot {
  margin-top: auto;
  padding-top: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  min-width: 0;
}

.card-tags {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  list-style: none;
}

.card-tags li {
  font-size: 0.72rem;
  padding: 0.18rem 0.5rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  color: var(--ink-mid);
  background: var(--paper);
}

.card-stats {
  display: flex;
  gap: 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-soft);
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.card-arrow {
  position: absolute;
  top: clamp(1.15rem, 2.4vw, 1.6rem);
  right: clamp(1.15rem, 2.4vw, 1.6rem);
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  color: var(--ink-soft);
  opacity: 0;
  transform: translate(-4px, 4px);
  transition: opacity 0.3s ease, transform 0.45s var(--ease-out-expo);
}

.post-card:hover .card-arrow {
  opacity: 1;
  transform: none;
  color: var(--accent);
}

/* 横向变体：归档 / 搜索结果，左侧日期栏 */
.post-card[data-variant='row'] {
  border-radius: var(--radius-md);
  background: transparent;
  border-color: transparent;
  border-bottom: 1px solid var(--rule);
  box-shadow: none;
  transform: none;
}

.post-card[data-variant='row']:hover {
  background: var(--paper-soft);
  transform: none;
  box-shadow: none;
}

.post-card[data-variant='row'] .card-link {
  flex-direction: row;
  align-items: baseline;
  gap: 1.25rem;
  padding-inline: 0.75rem;
}

.post-card[data-variant='row'] .card-body {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    'title stats'
    'excerpt excerpt';
  gap: 0.35rem 1rem;
  align-items: baseline;
}

.post-card[data-variant='row'] .card-meta {
  display: none;
}

.post-card[data-variant='row'] .card-title {
  grid-area: title;
  font-size: 1.02rem;
  font-weight: 560;
  padding-right: 0;
}

.post-card[data-variant='row'] .card-excerpt {
  grid-area: excerpt;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  font-size: 0.85rem;
}

.post-card[data-variant='row'] .card-foot {
  display: none;
}

.post-card[data-variant='row'] .card-stats {
  grid-area: stats;
  justify-self: end;
}

.post-card[data-variant='row'] .card-arrow {
  display: none;
}

@media (max-width: 560px) {
  .post-card[data-variant='row'] .card-link {
    flex-direction: column;
  }

  .post-card[data-variant='row'] .card-body {
    grid-template-columns: 1fr;
    grid-template-areas: 'title' 'excerpt';
  }

  .post-card[data-variant='row'] .card-stats {
    display: none;
  }
}
</style>
