<!--
  分享：弹层里包含系统分享、复制链接、微博 / X / 豆瓣。
  弹层用 <dialog>，天然带焦点陷阱与 Esc 关闭，不额外引入焦点管理库。
-->
<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import BaseIcon from './BaseIcon.vue';
import { sharePost, shareTargets } from '@/composables/useReaction';
import { toast } from '@/composables/useToast';

const props = defineProps({
  post: { type: Object, required: true },
  align: { type: String, default: 'right' },
});

const dialog = ref(null);
const open = ref(false);
const copied = ref(false);
const shareUrl = computed(() =>
  typeof window === 'undefined' ? '' : `${window.location.origin}/post/${props.post.slug}`,
);
const targets = computed(() => shareTargets(props.post, shareUrl.value));

async function show() {
  open.value = true;
  await nextTick();
  dialog.value?.showModal();
}

function hide() {
  dialog.value?.close();
}

watch(open, (v) => {
  if (!v) copied.value = false;
});

async function nativeShare() {
  const res = await sharePost(props.post, { url: shareUrl.value });
  if (res.method === 'native') {
    toast('已唤起系统分享');
    hide();
  } else if (res.ok) {
    copied.value = true;
    toast('链接已复制');
  }
}

async function copy() {
  await nativeShare();
}

function onBackdrop(event) {
  if (event.target === dialog.value) hide();
}
</script>

<template>
  <div class="share-wrap">
    <button
      type="button"
      class="share-trigger u-press"
      aria-haspopup="dialog"
      :aria-label="'分享《' + post.title + '》'"
      @click="show"
    >
      <BaseIcon name="share" :size="17" />
      <span>分享</span>
    </button>

    <dialog ref="dialog" class="share-dialog" :data-align="align" @close="open = false" @click="onBackdrop">
      <div class="share-panel">
        <header class="share-head">
          <p class="share-title">分享这篇文章</p>
          <button type="button" class="share-close u-press" aria-label="关闭" @click="hide">
            <BaseIcon name="close" :size="16" />
          </button>
        </header>

        <p class="share-post">{{ post.title }}</p>

        <div class="share-actions">
          <button type="button" class="share-primary u-press" @click="nativeShare">
            <BaseIcon name="share" :size="16" />
            系统分享
          </button>
          <button type="button" class="share-secondary u-press" @click="copy">
            <BaseIcon :name="copied ? 'check' : 'link'" :size="16" />
            {{ copied ? '已复制' : '复制链接' }}
          </button>
        </div>

        <label class="share-url">
          <span class="sr-only">文章链接</span>
          <BaseIcon name="link" :size="14" />
          <input :value="shareUrl" readonly @focus="$event.target.select()" />
        </label>

        <ul class="share-social">
          <li v-for="target in targets" :key="target.id">
            <a
              :href="target.href"
              target="_blank"
              rel="noopener noreferrer"
              class="social-link u-press"
              @click="hide"
            >
              {{ target.label }}
              <BaseIcon name="arrowUpRight" :size="13" />
            </a>
          </li>
        </ul>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.share-wrap {
  display: inline-flex;
}

.share-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.82rem;
  cursor: pointer;
}

.share-trigger:hover {
  color: var(--ink);
  border-color: var(--ink-soft);
  background: var(--paper-soft);
}

.share-dialog {
  /* 用 fixed + inset + margin:auto 居中：<dialog> 的默认居中依赖 UA 的 margin，
     这里显式声明，避免被 inherit 的 grid/margin 覆盖后跑到角落 */
  position: fixed;
  inset: 0;
  margin: auto;
  max-height: calc(100dvh - 2rem);
  overflow: auto;
  padding: 0;
  border: 0;
  background: transparent;
  width: min(92vw, 420px);
  color: var(--ink);
}

.share-dialog::backdrop {
  background: color-mix(in oklab, var(--ink) 46%, transparent);
  backdrop-filter: blur(3px);
}

.share-dialog[open] {
  animation: dialog-in 0.32s var(--ease-out-expo);
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
}

.share-panel {
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-float);
  padding: 1.15rem;
  display: grid;
  gap: 0.9rem;
}

.share-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.share-title {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.share-close {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-mid);
  cursor: pointer;
}

.share-close:hover {
  border-color: var(--rule);
  color: var(--ink);
}

.share-post {
  font-size: 1rem;
  font-weight: 580;
  line-height: 1.5;
  color: var(--ink);
}

.share-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.share-primary,
.share-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.62rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
}

.share-primary {
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
}

.share-primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.share-secondary {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--rule-strong);
}

.share-secondary:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.share-url {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.7rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
  color: var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.share-url input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--ink-mid);
  font-family: inherit;
  font-size: inherit;
  outline: none;
  text-overflow: ellipsis;
}

.share-social {
  display: flex;
  gap: 0.4rem;
  list-style: none;
  flex-wrap: wrap;
}

.social-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.6rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  font-size: 0.76rem;
  color: var(--ink-mid);
  text-decoration: none;
}

.social-link:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .share-dialog[open] {
    animation: none;
  }
}
</style>
