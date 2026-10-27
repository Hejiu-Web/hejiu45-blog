<script setup>
const props = defineProps({
  variant: { type: String, default: 'card' }, // card | featured | row | text
  lines: { type: Number, default: 1 },
});

const count = Math.max(1, Number(props.lines) || 1);
</script>

<template>
  <div class="skeleton" :data-variant="variant" aria-hidden="true" role="presentation">
    <div v-if="variant === 'card' || variant === 'featured'" class="sk-media u-skeleton">
      <span class="sk-meta u-skeleton" />
      <span class="sk-line u-skeleton" style="width: 64%" />
      <span class="sk-line u-skeleton" style="width: 88%" />
    </div>
    <template v-else>
      <div v-for="i in count" :key="i" class="sk-row">
        <span class="sk-line u-skeleton" :style="{ width: `${[72, 58, 66, 48][i % 4]}%` }" />
        <span class="sk-line sk-line--short u-skeleton" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.skeleton {
  display: grid;
  gap: 0.75rem;
}

.sk-media {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.6rem;
  padding: 1.2rem;
  overflow: hidden;
}

.sk-meta {
  height: 8px;
  width: 32%;
  border-radius: 2px;
}

.sk-line {
  height: 10px;
  border-radius: 2px;
}

.sk-line--short {
  height: 8px;
  width: 20%;
}

.sk-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 0.9rem;
  border-bottom: 1px solid var(--rule);
}
</style>
