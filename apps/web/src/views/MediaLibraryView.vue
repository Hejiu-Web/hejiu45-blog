<!-- 媒体库：图片 / 视频 / 音频统一管理，支持拖拽上传、复制地址、删除 -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import BaseIcon from '@/components/BaseIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { api } from '@/api/client';
import { toast } from '@/composables/useToast';
import { formatDate } from '@/utils/format';
import { useSiteStore } from '@/stores/site';

const site = useSiteStore();

/** 单个文件上限：直接显示后端换算好的数值，用户不用去翻 .env */
const uploadLimitLabel = computed(() => {
  const bytes = Number(site.info.uploadMaxBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return '受限';
  if (bytes >= 1024 ** 3) return `${Math.round((bytes / 1024 ** 3) * 10) / 10} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round((bytes / 1024 ** 2) * 10) / 10} MB`;
  return `${Math.round(bytes / 1024)} KB`;
});

const kind = ref('');
const items = ref([]);
const total = ref(0);
const loading = ref(true);
const uploading = ref(false);
const progress = ref(0);
const page = ref(1);
const hasMore = ref(false);
const dragOver = ref(false);
const fileRef = ref(null);

const KINDS = [
  { value: '', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
];

const humanSize = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

async function load(nextPage = 1, append = false) {
  loading.value = true;
  try {
    const res = await api.mediaList({ kind: kind.value, page: nextPage, pageSize: 24 });
    items.value = append ? [...items.value, ...res.items] : res.items;
    total.value = res.total;
    hasMore.value = res.hasMore;
    page.value = nextPage;
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    loading.value = false;
  }
}

async function upload(files) {
  const list = [...(files || [])];
  if (!list.length) return;
  uploading.value = true;
  let ok = 0;
  for (const file of list) {
    progress.value = 0;
    try {
      await api.uploadMedia(file);
      ok += 1;
    } catch (err) {
      toast(`${file.name}：${err.message}`, { tone: 'error' });
    }
  }
  uploading.value = false;
  progress.value = 0;
  if (ok) toast(`已上传 ${ok} 个文件`);
  await load(1);
}

function onDrop(event) {
  dragOver.value = false;
  upload(event.dataTransfer?.files);
}

async function copy(url) {
  const absolute = `${window.location.origin}${url}`;
  try {
    await navigator.clipboard.writeText(absolute);
    toast('地址已复制');
  } catch {
    window.prompt('复制这个地址', absolute);
  }
}

async function remove(item) {
  if (!confirm('删除这个文件？引用它的文章会显示不出图片。')) return;
  try {
    await api.deleteMedia(item.id);
    items.value = items.value.filter((i) => i.id !== item.id);
    toast('已删除');
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

const empty = computed(() => !loading.value && !items.value.length);

onMounted(() => load());
</script>

<template>
  <div class="media-page u-container">
    <header class="head">
      <div>
        <h1 class="title">媒体库</h1>
        <p class="lead">
          图片会自动转正并生成三档 WebP（1600 / 800 / 320），视频音频按容器校验后直接播放。
        </p>
      </div>
      <button type="button" class="primary u-press" :disabled="uploading" @click="fileRef.click()">
        <BaseIcon name="upload" :size="15" />
        {{ uploading ? `上传中 ${progress}%` : '上传文件' }}
      </button>
      <input
        ref="fileRef"
        type="file"
        multiple
        accept="image/*,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/ogg"
        class="sr-only"
        @change="upload($event.target.files); $event.target.value = ''"
      />
    </header>

    <div
      class="dropzone"
      :data-active="dragOver"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <BaseIcon name="upload" :size="18" />
      把图片或视频拖到这里上传
      <span class="drop-hint">单个文件上限 {{ uploadLimitLabel }}</span>
    </div>

    <div class="tabs" role="tablist">
      <button
        v-for="k in KINDS"
        :key="k.value"
        type="button"
        role="tab"
        class="tab u-press"
        :class="{ 'is-active': kind === k.value }"
        @click="kind = k.value; load(1)"
      >
        {{ k.label }}
      </button>
      <span class="count">{{ total }} 个文件</span>
    </div>

    <div v-if="loading && !items.length" class="grid">
      <span v-for="i in 6" :key="i" class="u-skeleton sk-card" />
    </div>

    <EmptyState
      v-else-if="empty"
      icon="image"
      title="媒体库是空的"
      description="上传图片或视频后，可以在写作台里直接插入文章。"
    />

    <div v-else class="grid">
      <figure v-for="item in items" :key="item.id" class="card">
        <div class="thumb">
          <img v-if="item.kind === 'image'" :src="item.variants?.[2]?.url || item.url || item.original" :alt="''" loading="lazy" />
          <video v-else-if="item.kind === 'video'" :src="item.url" muted preload="metadata" playsinline />
          <span v-else class="audio-mark"><BaseIcon name="rss" :size="20" /></span>
        </div>
        <figcaption class="meta">
          <span class="kind">{{ item.kind === 'image' ? '图片' : item.kind === 'video' ? '视频' : '音频' }}</span>
          <span>{{ humanSize(item.size) }}</span>
          <span v-if="item.width">{{ item.width }}×{{ item.height }}</span>
          <span>{{ formatDate(item.createdAt, { short: true }) }}</span>
        </figcaption>
        <div class="actions">
          <button type="button" class="mini u-press" @click="copy(item.url)">复制地址</button>
          <a :href="item.url" target="_blank" rel="noopener" class="mini u-press">打开</a>
          <button type="button" class="mini danger u-press" @click="remove(item)">删除</button>
        </div>
      </figure>
    </div>

    <div v-if="hasMore" class="more">
      <button type="button" class="mini u-press" @click="load(page + 1, true)">加载更多</button>
    </div>
  </div>
</template>

<style scoped>
.media-page {
  padding-top: clamp(2rem, 5vw, 3.5rem);
  max-width: 1100px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--rule);
}

.title {
  font-size: clamp(1.7rem, 1.3rem + 2vw, 2.3rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.lead {
  margin-top: 0.5rem;
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--ink-mid);
  max-width: 60ch;
}

.primary,
.mini {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}

.primary {
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
}

.primary:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.primary:disabled {
  opacity: 0.65;
  cursor: progress;
}

.dropzone {
  margin-top: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1.4rem;
  border-radius: var(--radius-md);
  border: 1px dashed var(--rule-strong);
  background: var(--paper-soft);
  color: var(--ink-mid);
  font-size: 0.86rem;
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.dropzone[data-active='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.drop-hint {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
}

.tabs {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
}

.tab {
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius-xs);
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.82rem;
  cursor: pointer;
}

.tab.is-active {
  border-color: var(--rule-strong);
  background: var(--paper-raised);
  color: var(--ink);
}

.count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-soft);
}

.grid {
  margin-top: 1.25rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.9rem;
}

.sk-card {
  height: 190px;
  border-radius: var(--radius-md);
}

.card {
  display: grid;
  gap: 0.5rem;
  padding: 0.6rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
}

.thumb {
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: var(--paper-soft);
  display: grid;
  place-items: center;
}

.thumb img,
.thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.audio-mark {
  color: var(--ink-soft);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  color: var(--ink-soft);
}

.kind {
  color: var(--accent);
}

.actions {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.mini {
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.74rem;
}

.mini:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.mini.danger:hover {
  background: var(--accent-soft);
}

.more {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
