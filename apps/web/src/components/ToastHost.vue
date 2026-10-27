<!-- 瞬时反馈：只出现在视口底部，礼让键盘焦点 -->
<script setup>
import { toasts, dismiss } from '@/composables/useToast';
import BaseIcon from './BaseIcon.vue';
</script>

<template>
  <div class="toast-host" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="item in toasts" :key="item.id" class="toast" :data-tone="item.tone">
        <BaseIcon :name="item.tone === 'error' ? 'warning' : 'check'" :size="15" />
        <span>{{ item.message }}</span>
        <button type="button" class="toast-close" aria-label="关闭提示" @click="dismiss(item.id)">
          <BaseIcon name="close" :size="13" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  z-index: 50;
  left: 50%;
  bottom: max(1.5rem, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: grid;
  gap: 0.5rem;
  justify-items: center;
  pointer-events: none;
  width: min(92vw, 420px);
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.6rem 0.65rem 0.6rem 0.9rem;
  border-radius: var(--radius-md);
  background: var(--ink);
  color: var(--paper);
  font-size: 0.85rem;
  box-shadow: var(--shadow-float);
  border: 1px solid color-mix(in oklab, var(--ink) 80%, var(--paper));
}

.toast[data-tone='error'] {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: transparent;
}

.toast-close {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-left: 0.35rem;
  border-radius: var(--radius-xs);
  color: inherit;
  opacity: 0.6;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.toast-close:hover {
  opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.24s ease, transform 0.34s var(--ease-out-expo);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
</style>
