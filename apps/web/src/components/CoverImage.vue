<!--
  封面：有图就用图，没图就用「排印式封面」（标题首字 + 标签 + 序号）。
  外部图片加载失败时自动退化为排印封面，保证离线 / 网络受限时版面依然成立。
-->
<script setup>
import { computed, ref, watch } from 'vue';
import { useTheme } from '@/composables/useTheme';

const props = defineProps({
  src: { type: String, default: '' },
  title: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
  seed: { type: [String, Number], default: 0 },
  ratio: { type: String, default: 'none' }, // none | 16/10 | 4/3 | 16/8
  priority: { type: Boolean, default: false },
});

const { theme } = useTheme();
const failed = ref(false);
const loaded = ref(false);

watch(
  () => props.src,
  () => {
    failed.value = false;
    loaded.value = false;
  },
);

/** 服务端生成了 xxx-dark.svg 的封面时，深色模式自动换用 */
const visibleSrc = computed(() => {
  if (!props.src || failed.value) return '';
  if (theme.value === 'dark' && props.src.endsWith('.svg')) {
    return props.src.replace(/\.svg$/, '-dark.svg');
  }
  return props.src;
});

const initial = computed(() => (props.title || '久').trim().charAt(0));
const pattern = computed(() => ['grid', 'lines', 'dots', 'arc'][Number(props.seed) % 4]);
</script>

<template>
  <div class="cover" :data-ratio="ratio" :data-pattern="pattern">
    <img
      v-if="visibleSrc"
      :key="visibleSrc"
      :src="visibleSrc"
      :alt="`${title} 的封面`"
      :loading="priority ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : 'auto'"
      decoding="async"
      :class="{ 'is-loaded': loaded }"
      @load="loaded = true"
      @error="failed = true"
    />
    <div v-else class="cover-type" aria-hidden="true">
      <span class="type-initial">{{ initial }}</span>
      <span class="type-tags">
        <span v-for="tag in tags.slice(0, 2)" :key="tag">{{ tag }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.cover {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--paper-soft);
}

.cover[data-ratio='16/10'] {
  aspect-ratio: 16 / 10;
}

.cover[data-ratio='4/3'] {
  aspect-ratio: 4 / 3;
}

.cover[data-ratio='16/8'] {
  aspect-ratio: 16 / 8;
}

.cover img {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  filter: saturate(0.86) contrast(1.02);
  transition: opacity 0.5s ease, transform 1s var(--ease-out-expo), filter 0.6s ease;
}

.cover img.is-loaded {
  opacity: 1;
}

.cover-type {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: clamp(0.9rem, 3vw, 1.6rem);
  background-color: var(--paper-soft);
  color: var(--ink);
  overflow: hidden;
}

.type-initial {
  font-family: var(--font-serif);
  font-size: clamp(4rem, 16cqi, 9rem);
  line-height: 0.8;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: color-mix(in oklab, var(--ink) 82%, var(--paper));
  position: relative;
  z-index: 1;
}

.type-tags {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.3rem;
  position: relative;
  z-index: 1;
}

.type-tags span {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  border-top: 1px solid var(--rule-strong);
  padding-top: 0.25rem;
}

/* 四种几何底纹：只用 CSS 叠加，不用外部资源 */
.cover[data-pattern='grid'] .cover-type::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--rule) 1px, transparent 1px),
    linear-gradient(to bottom, var(--rule) 1px, transparent 1px);
  background-size: 22px 22px;
  opacity: 0.9;
}

.cover[data-pattern='lines'] .cover-type::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    -32deg,
    transparent 0 13px,
    color-mix(in oklab, var(--ink) 7%, transparent) 13px 14px
  );
}

.cover[data-pattern='dots'] .cover-type::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(color-mix(in oklab, var(--ink) 18%, transparent) 1px, transparent 1px);
  background-size: 14px 14px;
}

.cover[data-pattern='arc'] .cover-type::before {
  content: '';
  position: absolute;
  width: 62%;
  aspect-ratio: 1;
  right: -14%;
  top: -22%;
  border-radius: 50%;
  border: 1px solid var(--rule-strong);
  box-shadow:
    0 0 0 18px color-mix(in oklab, var(--accent) 6%, transparent),
    0 0 0 19px var(--rule);
}

.cover[data-pattern='arc'] .cover-type::after {
  content: '';
  position: absolute;
  width: 16%;
  aspect-ratio: 1;
  right: 12%;
  top: 16%;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.85;
}
</style>
