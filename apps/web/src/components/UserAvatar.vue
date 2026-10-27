<!--
  头像：有图显示图，加载失败或没有图时显示名字首字。
  微信登录的用户默认使用微信头像（后端已校验域名）。
-->
<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: Number, default: 34 },
  shape: { type: String, default: 'circle' }, // circle | square
});

const broken = ref(false);
watch(
  () => props.src,
  () => (broken.value = false),
);

const initial = computed(() => (props.name || '我').trim().charAt(0));
const showImage = computed(() => Boolean(props.src) && !broken.value);
</script>

<template>
  <span
    class="avatar"
    :data-shape="shape"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(11, Math.round(size * 0.4))}px` }"
    :aria-label="name ? `${name} 的头像` : '头像'"
    role="img"
  >
    <img v-if="showImage" :src="src" alt="" loading="lazy" decoding="async" @error="broken = true" />
    <span v-else aria-hidden="true">{{ initial }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--ink);
  color: var(--paper);
  font-weight: 600;
  line-height: 1;
  user-select: none;
}

.avatar[data-shape='circle'] {
  border-radius: 999px;
}

.avatar[data-shape='square'] {
  border-radius: var(--radius-sm);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
