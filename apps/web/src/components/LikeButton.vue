<!--
  点赞按钮：心形填充状态 + 失败回滚 + 计数数字滚动。
  所有动画只走 transform / opacity，且尊重 reduced-motion。
-->
<script setup>
import { computed } from 'vue';
import BaseIcon from './BaseIcon.vue';
import { useReaction } from '@/composables/useReaction';
import { api } from '@/api/client';
import { usePosts } from '@/stores/posts';
import { toast } from '@/composables/useToast';

const props = defineProps({
  post: { type: Object, required: true },
  liked: { type: Boolean, default: false },
  size: { type: String, default: 'md' }, // sm | md
});

const emit = defineEmits(['change']);
const store = usePosts();
const postRef = computed(() => props.post);
const { state, bind, toggle } = useReaction(postRef);
bind({ liked: props.liked, likeCount: props.post.likeCount || 0 });

const label = computed(() => (state.liked ? '取消喜欢' : '喜欢这篇文章'));

async function hit() {
  await toggle(api.react);
  if (state.phase === 'added') {
    store.patchLike(props.post.id, state.count);
    emit('change', { liked: true, likeCount: state.count });
    toast('已加入喜欢');
  } else if (state.phase === 'removed') {
    store.patchLike(props.post.id, state.count);
    emit('change', { liked: false, likeCount: state.count });
  } else if (state.phase === 'failed') {
    toast('操作失败，请稍后再试', { tone: 'error' });
  }
}

defineExpose({ state });
</script>

<template>
  <button
    type="button"
    class="like-btn u-press"
    :data-size="size"
    :data-liked="state.liked"
    :data-phase="state.phase"
    :aria-pressed="state.liked"
    :aria-label="label"
    :title="label"
    @click="hit"
  >
    <span class="like-icon" aria-hidden="true">
      <BaseIcon name="heart" :size="size === 'sm' ? 15 : 18" :weight="state.liked ? 'fill' : 'regular'" />
      <span v-if="state.phase === 'added'" class="like-burst" />
    </span>
    <span class="like-count">{{ state.count }}</span>
  </button>
</template>

<style scoped>
.like-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink-mid);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  cursor: pointer;
}

.like-btn[data-size='sm'] {
  padding: 0.3rem 0.6rem;
  font-size: 0.72rem;
  gap: 0.35rem;
}

.like-btn:hover {
  color: var(--ink);
  border-color: var(--ink-soft);
}

.like-btn[data-liked='true'] {
  color: var(--accent);
  border-color: color-mix(in oklab, var(--accent) 55%, transparent);
  background: var(--accent-soft);
}

.like-icon {
  position: relative;
  display: inline-grid;
  place-items: center;
}

.like-btn[data-phase='added'] .like-icon :deep(svg) {
  animation: heart-pop 0.55s var(--ease-spring);
}

.like-btn[data-phase='removed'] .like-icon :deep(svg) {
  animation: heart-drop 0.3s var(--ease-out-expo);
}

.like-btn[data-phase='failed'] {
  animation: shake 0.4s ease;
  border-color: var(--accent);
}

.like-burst {
  position: absolute;
  inset: -8px;
  border-radius: 999px;
  border: 1.5px solid var(--accent);
  animation: burst 0.6s var(--ease-out-expo) forwards;
  pointer-events: none;
}

.like-count {
  font-variant-numeric: tabular-nums;
  min-width: 1.2ch;
}

@keyframes heart-pop {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.28);
  }
  70% {
    transform: scale(0.94);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes heart-drop {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(0.82);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes burst {
  from {
    transform: scale(0.6);
    opacity: 0.9;
  }
  to {
    transform: scale(1.9);
    opacity: 0;
  }
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-3px);
  }
  75% {
    transform: translateX(3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .like-burst {
    display: none;
  }
}
</style>
