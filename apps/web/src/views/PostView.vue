<!--
  文章阅读页：主栏 66ch 正文 + 右侧粘性目录 + 顶部细进度线。
  目录高亮由 IntersectionObserver 驱动，不监听 scroll。
-->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import LikeButton from '@/components/LikeButton.vue';
import ShareDialog from '@/components/ShareDialog.vue';
import PostCard from '@/components/PostCard.vue';
import CoverImage from '@/components/CoverImage.vue';
import PostSkeleton from '@/components/PostSkeleton.vue';
import EmptyState from '@/components/EmptyState.vue';
import { api } from '@/api/client';
import { formatDate, readingLabel, compactNumber } from '@/utils/format';
import { toast } from '@/composables/useToast';
import { useCopyFeedback } from '@/composables/useReaction';
import { usePosts } from '@/stores/posts';

const props = defineProps({ slug: { type: String, required: true } });

const store = usePosts();
const post = ref(null);
const postType = ref(null);
const collections = ref([]);
const liked = ref(false);
const related = ref([]);
const neighbors = ref({ prev: null, next: null });
const headings = ref([]);
const html = ref('');
const loading = ref(true);
const error = ref(null);
const activeId = ref('');

const articleRef = ref(null);
const copied = useCopyFeedback();
const progress = ref(0);

let headingObserver = null;

async function load(slug) {
  loading.value = true;
  error.value = null;
  html.value = '';
  try {
    // 正文 HTML 与目录都由服务端渲染并净化，客户端只负责插入 DOM
    const res = await api.getPost(slug);
    post.value = res.post;
    postType.value = res.type || null;
    collections.value = res.collections || [];
    liked.value = res.liked;
    related.value = res.related || [];
    neighbors.value = res.neighbors || { prev: null, next: null };
    headings.value = res.toc || [];
    html.value = res.html || '';
    document.title = `${res.post.title} · 鹤酒`;
  } catch (err) {
    error.value = err;
    post.value = null;
  } finally {
    loading.value = false;
  }
  requestAnimationFrame(setupObservers);
}

function setupObservers() {
  headingObserver?.disconnect();
  const root = articleRef.value;
  if (!root) return;

  const targets = [...root.querySelectorAll('h2[id], h3[id]')];
  if (!targets.length) return;

  headingObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) activeId.value = entry.target.id;
      }
      const seen = targets.findIndex((t) => t.id === activeId.value);
      progress.value = seen < 0 ? 0 : (seen + 1) / targets.length;
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
  );
  targets.forEach((t) => headingObserver.observe(t));
}

function onArticleClick(event) {
  const btn = event.target.closest('[data-copy]');
  if (btn) {
    const code = btn.parentElement.querySelector('code');
    if (code) {
      navigator.clipboard?.writeText(code.innerText).then(() => {
        btn.dataset.copied = 'true';
        btn.textContent = '已复制';
        setTimeout(() => {
          btn.dataset.copied = 'false';
          btn.textContent = '复制';
        }, 1600);
        toast('代码已复制');
      });
    }
    return;
  }
  const link = event.target.closest('a[href^="http"]');
  if (link) link.setAttribute('rel', 'noopener noreferrer');
}

function jumpTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copyLink() {
  await copied.copy(`${window.location.origin}/post/${post.value.slug}`);
  toast('链接已复制');
}

function onLikeChange(payload) {
  if (post.value) post.value.likeCount = payload.likeCount;
  store.patchLike(post.value.id, payload.likeCount);
}

onMounted(() => load(props.slug));
watch(
  () => props.slug,
  (slug) => slug && load(slug),
);
onBeforeUnmount(() => headingObserver?.disconnect());

const showToc = computed(() => headings.value.length >= 2);

/** 把自定义字段按定义渲染成键值对，未填的字段不显示 */
const customFieldEntries = computed(() => {
  const defs = postType.value?.fields || [];
  const values = post.value?.fields || {};
  return defs
    .filter((f) => values[f.key] !== undefined && values[f.key] !== '' && values[f.key] !== null)
    .map((f) => ({
      key: f.key,
      label: f.label,
      value: Array.isArray(values[f.key])
        ? values[f.key].join('、')
        : typeof values[f.key] === 'boolean'
          ? values[f.key]
            ? '是'
            : '否'
          : String(values[f.key]),
    }));
});
</script>

<template>
  <div class="post-page">
    <div class="progress" aria-hidden="true">
      <span class="progress-bar" :style="{ transform: `scaleX(${progress})` }" />
    </div>

    <div v-if="loading" class="u-container article-grid">
      <div class="article-skeleton">
        <div class="u-skeleton sk-block" style="height: 14px; width: 30%"></div>
        <div class="u-skeleton sk-block" style="height: 46px; width: 92%"></div>
        <div class="u-skeleton sk-block" style="height: 46px; width: 62%"></div>
        <PostSkeleton variant="row" :lines="6" />
      </div>
    </div>

    <div v-else-if="error" class="u-container">
      <EmptyState
        icon="warning"
        :title="error.status === 404 ? '这篇文章不在' : '文章没能加载出来'"
        :description="error.status === 404 ? '也许链接写错了，或者它已经被作者下线。' : error.message"
      >
        <RouterLink to="/archive" class="link-btn u-press">回归档看看</RouterLink>
      </EmptyState>
    </div>

    <template v-else-if="post">
      <header class="u-container article-head">
        <nav class="crumbs" aria-label="面包屑">
          <RouterLink to="/">首页</RouterLink>
          <span aria-hidden="true">/</span>
          <RouterLink to="/archive">文章</RouterLink>
        </nav>

        <h1 class="article-title">{{ post.title }}</h1>
        <p v-if="post.excerpt" class="article-excerpt">{{ post.excerpt }}</p>

        <div class="article-info">
          <div class="info-left">
            <span class="avatar" aria-hidden="true">和</span>
            <div class="info-meta">
              <span class="info-author">鹤酒</span>
              <span class="info-line">
                <time :datetime="new Date(post.publishedAt).toISOString()">{{ formatDate(post.publishedAt) }}</time>
                <span aria-hidden="true">/</span>
                {{ readingLabel(post.readingMinutes) }}
                <span aria-hidden="true">/</span>
                {{ compactNumber(post.views) }} 次阅读
              </span>
            </div>
          </div>
          <div class="info-actions">
            <LikeButton :post="post" :liked="liked" @change="onLikeChange" />
            <ShareDialog :post="post" />
            <button type="button" class="icon-action u-press" :aria-label="'复制链接'" @click="copyLink">
              <BaseIcon :name="copied.state.copied ? 'check' : 'copy'" :size="16" />
            </button>
          </div>
        </div>

        <figure v-if="post.cover" class="article-cover">
          <CoverImage :src="post.cover" :title="post.title" :tags="post.tags" ratio="16/8" priority />
        </figure>
      </header>

      <div class="u-container article-grid">
        <article ref="articleRef" class="article-body" @click="onArticleClick">
          <div class="prose" v-html="html" />

          <!-- 正文媒体：视频与音频由作者在写作台添加 -->
          <div v-for="(m, i) in post.media || []" :key="`m-${i}`" class="article-media">
            <video v-if="m.kind === 'video'" :src="m.url" :poster="m.poster || undefined" controls preload="metadata" playsinline />
            <audio v-else-if="m.kind === 'audio'" :src="m.url" controls />
            <a v-else :href="m.url" target="_blank" rel="noopener noreferrer" class="media-link">{{ m.title || m.url }}</a>
            <p v-if="m.title && m.kind !== 'embed'" class="media-caption">{{ m.title }}</p>
          </div>

          <!-- 自定义字段：按字段定义以「键值」形式展示 -->
          <dl v-if="customFieldEntries.length" class="article-fields">
            <div v-for="entry in customFieldEntries" :key="entry.key">
              <dt>{{ entry.label }}</dt>
              <dd>{{ entry.value }}</dd>
            </div>
          </dl>

          <ul v-if="post.tags.length" class="article-tags" aria-label="文章标签">
            <li v-for="tag in post.tags" :key="tag">
              <RouterLink :to="`/tags/${encodeURIComponent(tag)}`" class="tag-chip u-press">
                <BaseIcon name="tag" :size="12" />
                {{ tag }}
              </RouterLink>
            </li>
          </ul>

          <!-- 所属合集：给出「继续读这个系列」的入口 -->
          <div v-if="collections.length" class="article-collections">
            <p class="col-label">属于合集</p>
            <RouterLink v-for="c in collections" :key="c.slug" :to="`/collections/${c.slug}`" class="col-link">
              {{ c.title }}
              <BaseIcon name="arrowRight" :size="13" />
            </RouterLink>
          </div>

          <div class="article-end">
            <p class="end-note">读到这里了。如果这篇对你有用，留个喜欢，或者分享出去。</p>
            <div class="end-actions">
              <LikeButton :post="post" :liked="liked" @change="onLikeChange" />
              <ShareDialog :post="post" />
            </div>
          </div>

          <nav class="pager" aria-label="上一篇与下一篇">
            <RouterLink v-if="neighbors.prev" :to="`/post/${neighbors.prev.slug}`" class="pager-link">
              <span class="pager-label">
                <BaseIcon name="arrowLeft" :size="13" />
                上一篇
              </span>
              <span class="pager-title">{{ neighbors.prev.title }}</span>
            </RouterLink>
            <span v-else class="pager-empty">这是最早的一篇</span>

            <RouterLink v-if="neighbors.next" :to="`/post/${neighbors.next.slug}`" class="pager-link pager-next">
              <span class="pager-label">
                下一篇
                <BaseIcon name="arrowRight" :size="13" />
              </span>
              <span class="pager-title">{{ neighbors.next.title }}</span>
            </RouterLink>
            <span v-else class="pager-empty">已是最新的一篇</span>
          </nav>
        </article>

        <aside v-if="showToc" class="toc" aria-label="本文目录">
          <p class="toc-title u-mono-label">目录</p>
          <ul>
            <li v-for="h in headings" :key="h.id" :data-level="h.level">
              <button
                type="button"
                class="toc-link"
                :class="{ 'is-active': activeId === h.id }"
                @click="jumpTo(h.id)"
              >
                {{ h.text }}
              </button>
            </li>
          </ul>
        </aside>
      </div>

      <section v-if="related.length" class="u-container related" aria-labelledby="related-title">
        <h2 id="related-title" class="related-title">接着读</h2>
        <div class="related-grid">
          <PostCard v-for="item in related" :key="item.id" :post="item" />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.post-page {
  padding-top: clamp(1.75rem, 4vw, 3rem);
}

.progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 45;
  pointer-events: none;
}

.progress-bar {
  display: block;
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform 0.35s var(--ease-out-expo);
}

.article-skeleton {
  display: grid;
  gap: 1rem;
}

.sk-block {
  border-radius: var(--radius-sm);
}

.article-head {
  max-width: var(--page-max);
}

.crumbs {
  display: flex;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  color: var(--ink-soft);
  margin-bottom: 1.5rem;
}

.crumbs a {
  color: inherit;
  text-decoration: none;
}

.crumbs a:hover {
  color: var(--accent);
}

.article-title {
  font-size: clamp(1.95rem, 1.3rem + 3vw, 3.35rem);
  line-height: 1.15;
  letter-spacing: -0.035em;
  font-weight: 700;
  color: var(--ink);
  max-width: 24ch;
}

.article-excerpt {
  margin-top: 1.15rem;
  font-size: var(--text-lead);
  line-height: 1.75;
  color: var(--ink-mid);
  max-width: 52ch;
}

.article-info {
  margin-top: 1.75rem;
  padding-top: 1.15rem;
  border-top: 1px solid var(--rule);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.info-left {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.avatar {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--paper);
  font-size: 0.8rem;
  font-weight: 600;
}

.info-meta {
  display: grid;
  gap: 0.15rem;
}

.info-author {
  font-size: 0.88rem;
  font-weight: 560;
  color: var(--ink);
}

.info-line {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
}

.info-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.icon-action {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink-mid);
  cursor: pointer;
}

.icon-action:hover {
  color: var(--ink);
  border-color: var(--ink-soft);
}

.article-cover {
  margin: 2rem 0 0;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
  container-type: inline-size;
}

.article-grid {
  display: grid;
  gap: 3rem;
  margin-top: clamp(2rem, 5vw, 3rem);
}

.article-body {
  max-width: var(--measure);
  min-width: 0;
}

.article-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  list-style: none;
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--rule);
}

/* 正文媒体 */
.article-media {
  margin-top: 1.6rem;
}

.article-media video,
.article-media audio {
  width: 100%;
  border-radius: var(--radius-md);
  background: #000;
}

.media-caption {
  margin-top: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.media-link {
  color: var(--accent);
}

/* 自定义字段 */
.article-fields {
  display: grid;
  gap: 0.5rem;
  margin-top: 1.8rem;
  padding: 1rem 1.1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
}

.article-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.86rem;
}

.article-fields dt {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.article-fields dd {
  color: var(--ink);
  text-align: right;
}

/* 所属合集 */
.article-collections {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

.col-label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.col-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.65rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule-strong);
  font-size: 0.8rem;
  color: var(--ink);
  text-decoration: none;
}

.col-link:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.65rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  font-size: 0.76rem;
  color: var(--ink-mid);
  text-decoration: none;
  background: var(--paper);
}

.tag-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.article-end {
  margin-top: 2.5rem;
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
  display: grid;
  gap: 1rem;
}

.end-note {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--ink-mid);
  max-width: 44ch;
}

.end-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.pager {
  margin-top: 2.5rem;
  display: grid;
  gap: 1rem;
}

.pager-link {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 0;
  border-top: 1px solid var(--rule);
  text-decoration: none;
  color: var(--ink);
}

.pager-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.pager-title {
  font-size: 0.98rem;
  font-weight: 540;
  line-height: 1.45;
  transition: color 0.25s ease;
}

.pager-link:hover .pager-title {
  color: var(--accent);
}

.pager-empty {
  padding: 1rem 0;
  border-top: 1px solid var(--rule);
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.toc {
  display: none;
}

.toc ul {
  list-style: none;
  display: grid;
  gap: 0.1rem;
  border-left: 1px solid var(--rule);
}

.toc-link {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.3rem 0 0.3rem 0.8rem;
  margin-left: -1px;
  border: 0;
  border-left: 1px solid transparent;
  background: transparent;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--ink-soft);
  cursor: pointer;
  transition: color 0.25s ease, border-color 0.25s ease;
}

.toc li[data-level='3'] .toc-link {
  padding-left: 1.6rem;
  font-size: 0.78rem;
}

.toc-link:hover {
  color: var(--ink);
}

.toc-link.is-active {
  color: var(--accent);
  border-left-color: var(--accent);
  font-weight: 560;
}

.related {
  margin-top: clamp(3.5rem, 9vw, 6rem);
  padding-top: clamp(2rem, 5vw, 3rem);
  border-top: 1px solid var(--rule);
}

.related-title {
  font-size: 1.15rem;
  font-weight: 620;
  margin-bottom: 1.25rem;
  color: var(--ink);
}

.related-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

.link-btn {
  display: inline-flex;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  font-size: 0.85rem;
  text-decoration: none;
}

@media (max-width: 640px) {
  .article-cover {
    aspect-ratio: 3 / 2;
  }
}

@media (min-width: 900px) {
  .pager {
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  .pager-next {
    text-align: right;
    justify-items: end;
  }

  .pager-next .pager-label {
    flex-direction: row-reverse;
  }

  .related-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1080px) {
  .article-grid {
    grid-template-columns: minmax(0, var(--measure)) 200px;
    gap: clamp(3rem, 7vw, 5.5rem);
    justify-content: start;
  }

  .toc {
    display: block;
    position: sticky;
    top: calc(var(--header-h) + 2rem);
    align-self: start;
  }

  .toc-title {
    margin-bottom: 0.75rem;
  }
}
</style>
