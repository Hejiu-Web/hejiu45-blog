<script setup>
import BaseIcon from './BaseIcon.vue';

defineProps({
  icon: { type: String, default: 'bookmark' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
});
</script>

<template>
  <div class="empty">
    <span class="empty-icon" aria-hidden="true">
      <BaseIcon :name="icon" :size="22" />
    </span>
    <p class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <div class="empty-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: grid;
  justify-items: center;
  gap: 0.55rem;
  text-align: center;
  padding: clamp(2.5rem, 8vw, 5rem) 1.5rem;
  border: 1px dashed var(--rule-strong);
  border-radius: var(--radius-lg);
  background: color-mix(in oklab, var(--paper-soft) 60%, transparent);
}

.empty-icon {
  display: inline-grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 999px;
  border: 1px solid var(--rule);
  color: var(--ink-soft);
  margin-bottom: 0.35rem;
}

.empty-title {
  font-size: 1.05rem;
  font-weight: 620;
  color: var(--ink);
}

.empty-desc {
  font-size: 0.9rem;
  color: var(--ink-soft);
  max-width: 38ch;
  line-height: 1.7;
}

.empty-actions:not(:empty) {
  margin-top: 0.9rem;
}
</style>
