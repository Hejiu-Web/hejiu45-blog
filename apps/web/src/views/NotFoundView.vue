<!-- 404 / 失效链接 -->
<script setup>
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
</script>

<template>
  <div class="notfound u-container">
    <p class="code" aria-hidden="true">404</p>
    <h1 class="title">这一页没有内容</h1>
    <p class="text">也许是链接过期了，也许是我还没有写到它。回到首页重新开始吧。</p>
    <div class="actions">
      <RouterLink to="/" class="primary u-press">
        回到首页
        <BaseIcon name="arrowRight" :size="15" />
      </RouterLink>
      <RouterLink to="/archive" class="ghost u-press">浏览归档</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.notfound {
  padding-block: clamp(4rem, 14vw, 9rem);
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  max-width: 640px;
}

.code {
  font-family: var(--font-mono);
  font-size: clamp(3rem, 10vw, 6rem);
  line-height: 1;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: -0.04em;
}

.title {
  font-size: clamp(1.5rem, 1.2rem + 1.4vw, 2rem);
  font-weight: 660;
  letter-spacing: -0.025em;
  color: var(--ink);
}

.text {
  font-size: 0.95rem;
  line-height: 1.8;
  color: var(--ink-mid);
  max-width: 42ch;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.25rem;
}

.primary,
.ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.62rem 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  text-decoration: none;
  white-space: nowrap;
}

.primary {
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
}

.primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.ghost {
  border: 1px solid var(--rule-strong);
  color: var(--ink);
}

.ghost:hover {
  border-color: var(--ink-soft);
}
</style>
