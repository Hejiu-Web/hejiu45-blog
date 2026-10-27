<!--
  关于：人物信息 + 数字 + 正在使用的东西；版式上采用「侧栏标签 + 正文」的非对称结构。
  所有文案都来自站点设置（/admin/settings →「关于页」），管理员不需要改代码。
-->
<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import { useSiteStore } from '@/stores/site';
import { useAuthStore } from '@/stores/auth';

const site = useSiteStore();
const auth = useAuthStore();

/** 「值|说明」每行一条 */
function parsePairs(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, label = ''] = line.split('|').map((s) => s.trim());
      return { value, label };
    });
}

const title = computed(() => site.info.aboutTitle || site.info.siteName || '关于');
const lead = computed(() => site.info.aboutLead || site.info.authorBio || site.info.siteDescription || '');
const initial = computed(() => String(site.info.authorName || title.value || '·').trim().charAt(0));

/**
 * 头像：优先用登录用户的头像；
 * 但头像地址可能失效（旧文件被删、外链过期），所以加载失败要回退到文字首字。
 */
const avatarSrc = computed(() => auth.user?.avatar || '');
const avatarBroken = ref(false);
watch(avatarSrc, () => (avatarBroken.value = false));
const showAvatar = computed(() => Boolean(avatarSrc.value) && !avatarBroken.value);

const stats = computed(() => {
  const parsed = parsePairs(site.info.aboutStats);
  return parsed.length ? parsed : [];
});
/** 数字网格列数跟随条目数量，避免不满一行时留出大片空白 */
const statsColumns = computed(() => Math.min(4, Math.max(1, stats.value.length)));

const stacks = computed(() => {
  const lines = String(site.info.aboutStacks || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const [name, items = ''] = line.split('|').map((s) => s.trim());
    return {
      name,
      items: items
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
  });
});

/** 正文按空行分段，支持极简 Markdown（**粗体**、`代码`、链接） */
const paragraphs = computed(() =>
  String(site.info.aboutBody || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean),
);

function inlineHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>')
    .replace(/\n/g, '<br>');
}

const ctaText = computed(() => site.info.aboutCtaText || '如果这些文字对你有用，欢迎从一篇文章开始。');
</script>

<template>
  <div class="about u-container">
    <header class="about-head">
      <div class="portrait" aria-hidden="true">
        <img v-if="showAvatar" :src="avatarSrc" alt="" @error="avatarBroken = true" />
        <span v-else>{{ initial }}</span>
      </div>
      <div class="head-copy">
        <h1 class="page-title">{{ title }}</h1>
        <p v-if="lead" class="page-lead">{{ lead }}</p>
      </div>
    </header>

    <div class="about-body">
      <aside class="side">
        <template v-if="site.info.aboutLocation">
          <p class="u-mono-label">坐标</p>
          <p class="side-text">{{ site.info.aboutLocation }}</p>
        </template>
        <template v-if="site.info.aboutSince">
          <p class="u-mono-label side-gap">写于</p>
          <p class="side-text">{{ site.info.aboutSince }}</p>
        </template>
      </aside>

      <div class="main-col">
        <section v-if="paragraphs.length" class="block">
          <h2 class="block-title">这个站点</h2>
          <p v-for="(p, i) in paragraphs" :key="i" class="block-text" v-html="inlineHtml(p)" />
        </section>

        <section v-if="site.info.aboutStats" class="block">
          <h2 class="block-title">数字</h2>
          <ul class="stats" :style="{ '--stat-cols': statsColumns }">
            <li v-for="stat in stats" :key="`${stat.value}-${stat.label}`">
              <span class="stat-value">{{ stat.value }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </li>
          </ul>
        </section>

        <section v-if="stacks.length" class="block">
          <h2 class="block-title">正在使用</h2>
          <div class="stack-grid">
            <div v-for="group in stacks" :key="group.name" class="stack-group">
              <p class="stack-title">{{ group.name }}</p>
              <ul class="stack-list">
                <li v-for="item in group.items" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="block block-cta">
          <p class="cta-text">{{ ctaText }}</p>
          <div class="cta-row">
            <RouterLink to="/archive" class="cta-primary u-press">
              浏览文章
              <BaseIcon name="arrowRight" :size="16" />
            </RouterLink>
            <a href="/rss.xml" class="cta-ghost u-press">
              <BaseIcon name="rss" :size="15" />
              订阅 RSS
            </a>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about {
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.about-head {
  display: flex;
  align-items: flex-start;
  gap: clamp(1.25rem, 3vw, 2.25rem);
  padding-bottom: 2.5rem;
  border-bottom: 1px solid var(--rule);
}

.portrait {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: clamp(64px, 12vw, 92px);
  height: clamp(64px, 12vw, 92px);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--ink);
  color: var(--paper);
  font-size: clamp(1.5rem, 4vw, 2.1rem);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.page-title {
  font-size: clamp(1.9rem, 1.3rem + 2.4vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.page-lead {
  margin-top: 0.75rem;
  font-size: var(--text-lead);
  line-height: 1.78;
  color: var(--ink-mid);
  max-width: 46ch;
}

.about-body {
  margin-top: 2.5rem;
  display: grid;
  gap: 2.5rem;
}

.side {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 0.5rem;
}

.side-gap {
  margin-left: 1rem;
}

.side-text {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--ink-mid);
}

.main-col {
  display: grid;
  gap: 3rem;
  max-width: 62ch;
}

.block {
  display: grid;
  gap: 0.9rem;
}

.block-title {
  font-size: 1.2rem;
  font-weight: 620;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.block-text {
  font-size: 0.98rem;
  line-height: 1.85;
  color: var(--ink-mid);
}

.block-text :deep(strong) {
  color: var(--ink);
  font-weight: 600;
}

.block-text :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.88em;
  padding: 0.1em 0.35em;
  border-radius: var(--radius-xs);
  background: var(--paper-soft);
  border: 1px solid var(--rule);
}

.block-text :deep(a) {
  color: var(--accent);
  text-underline-offset: 0.2em;
}

.stats {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(var(--stat-cols, 2), minmax(0, 1fr));
  gap: 1px;
  background: var(--rule);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.stats li {
  display: grid;
  gap: 0.1rem;
  padding: 1.1rem 1rem;
  background: var(--paper);
}

.stat-value {
  font-size: 1.45rem;
  font-weight: 640;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.stat-label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.stack-grid {
  display: grid;
  gap: 1.25rem;
}

.stack-title {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 0.55rem;
}

.stack-list {
  list-style: none;
  display: grid;
  gap: 0.35rem;
  font-size: 0.92rem;
  color: var(--ink-mid);
}

.stack-list li {
  padding-left: 0.9rem;
  position: relative;
  line-height: 1.6;
}

.stack-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.7em;
  width: 5px;
  height: 1px;
  background: var(--ink-soft);
}

.block-cta {
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
}

.cta-text {
  font-size: 0.98rem;
  line-height: 1.7;
  color: var(--ink);
}

.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.3rem;
}

.cta-primary,
.cta-ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  text-decoration: none;
  white-space: nowrap;
}

.cta-primary {
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
}

.cta-primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.cta-ghost {
  border: 1px solid var(--rule-strong);
  color: var(--ink);
}

.cta-ghost:hover {
  border-color: var(--accent);
  color: var(--accent);
}

@media (min-width: 768px) {
  .stack-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.5rem;
  }

  /* 桌面端最多 4 列，但不超过条目总数，避免空槽位 */
  .stats {
    grid-template-columns: repeat(min(var(--stat-cols, 4), 4), minmax(0, 1fr));
  }
}

@media (min-width: 1000px) {
  .about-body {
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 3.5rem;
  }

  .side {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
    position: sticky;
    top: calc(var(--header-h) + 2rem);
    align-self: start;
  }

  .side-gap {
    margin-left: 0;
    margin-top: 1.2rem;
  }
}
</style>
