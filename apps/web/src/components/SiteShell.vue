<!--
  站点外壳：单行导航（高度 68px 上限）+ 页脚 + 页面切换过渡。
  导航只保留 4 个目的地，登录后多一个「写文章」，避免出现两行。
-->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSiteStore } from '@/stores/site';
import { useTheme } from '@/composables/useTheme';
import BaseIcon from './BaseIcon.vue';
import UserAvatar from './UserAvatar.vue';
import ThemeSwitch from './ThemeSwitch.vue';
import BackgroundMusic from './BackgroundMusic.vue';
import ToastHost from './ToastHost.vue';

const route = useRoute();
const auth = useAuthStore();
const site = useSiteStore();
const { mode, theme, setMode } = useTheme();

/* 账号下拉：点击按钮切换、点击外部/按 Esc 关闭 */
const accountWrap = ref(null);
function onGlobalPointerDown(event) {
  if (!accountOpen.value) return;
  if (accountWrap.value && !accountWrap.value.contains(event.target)) accountOpen.value = false;
}
function onGlobalKeydown(event) {
  if (event.key === 'Escape') accountOpen.value = false;
}
onMounted(() => {
  document.addEventListener('pointerdown', onGlobalPointerDown, true);
  document.addEventListener('keydown', onGlobalKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onGlobalPointerDown, true);
  document.removeEventListener('keydown', onGlobalKeydown);
});

/** 主导航：固定页面 + 有内容的自定义类型（类型由作者在后台定义） */
const NAV = computed(() => {
  const base = [
    { to: '/', label: '首页' },
    { to: '/archive', label: '归档' },
    { to: '/collections', label: '合集' },
    { to: '/works', label: '作品' },
    { to: '/tags', label: '标签' },
    { to: '/search', label: '搜索' },
  ];
  const typeLinks = site.types
    .filter((t) => t.key !== 'article' && t.count > 0)
    .slice(0, 2)
    .map((t) => ({ to: `/${t.route}`, label: t.name }));
  return [...base, ...typeLinks, { to: '/about', label: '关于' }];
});

const menuOpen = ref(false);
const accountOpen = ref(false);
const scrolled = ref(false);

const isActive = (to) => (to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(`${to}/`));
const compact = computed(() => route.meta.compactLayout);

onMounted(() => {
  auth.restore();
  site.ensure();
});

async function signOut() {
  accountOpen.value = false;
  menuOpen.value = false;
  await auth.logout({ redirect: '/' });
}

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
    accountOpen.value = false;
  },
);
</script>

<template>
  <a class="skip-link" href="#main">跳到正文</a>
  <div class="u-grain" aria-hidden="true" />

  <header class="site-header" :data-scrolled="scrolled">
    <div class="u-container header-inner">
      <RouterLink to="/" class="brand" :aria-label="`${site.info.siteName}，返回首页`">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="1" y="1" width="30" height="30" rx="6" fill="none" stroke="currentColor" stroke-opacity="0.22" />
          <path d="M9 9v14M9 16h6.5M15.5 9v14" stroke="currentColor" stroke-width="2.1" stroke-linecap="square" />
          <circle cx="23" cy="20" r="3" fill="var(--accent)" />
        </svg>
        <span class="brand-text">
          <span class="brand-name">{{ site.info.siteName }}</span>
          <span class="brand-domain">hejiu45</span>
        </span>
      </RouterLink>

      <nav class="nav" aria-label="主导航">
        <RouterLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          class="nav-link u-press"
          :class="{ 'is-active': isActive(item.to) }"
          :aria-current="isActive(item.to) ? 'page' : undefined"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="header-actions">
        <ThemeSwitch />
        <template v-if="auth.isAuthed">
          <RouterLink v-if="auth.isAuthor" to="/admin/new" class="write-btn u-press" aria-label="写文章">
            <BaseIcon name="edit" :size="15" />
            <span>写文章</span>
          </RouterLink>
          <div ref="accountWrap" class="account-wrap">
            <button
              type="button"
              class="account-btn u-press"
              :aria-label="`账号：${auth.displayName}`"
              aria-haspopup="menu"
              :aria-expanded="accountOpen"
              @click="accountOpen = !accountOpen"
              @pointerdown.stop
            >
              <UserAvatar :src="auth.user?.avatar" :name="auth.displayName" :size="24" />
              <span class="account-name">{{ auth.displayName }}</span>
              <BaseIcon name="arrowDown" :size="12" class="account-caret" />
            </button>

            <Transition name="menu">
              <div v-if="accountOpen" class="account-menu" role="menu">
                <p class="account-meta">{{ auth.displayName }} · {{ auth.isAuthor ? '作者' : '读者' }}</p>
                <RouterLink to="/account/security" class="account-item" role="menuitem" @click="accountOpen = false">
                  <BaseIcon name="check" :size="14" />
                  账号安全
                </RouterLink>
                <RouterLink v-if="auth.isAuthor" to="/admin" class="account-item" role="menuitem" @click="accountOpen = false">
                  <BaseIcon name="bookmark" :size="14" />
                  写作台
                </RouterLink>
                <RouterLink v-if="auth.isAuthor" to="/admin/structure" class="account-item" role="menuitem" @click="accountOpen = false">
                  <BaseIcon name="tag" :size="14" />
                  内容结构
                </RouterLink>
                <RouterLink v-if="auth.isAuthor" to="/admin/media" class="account-item" role="menuitem" @click="accountOpen = false">
                  <BaseIcon name="image" :size="14" />
                  媒体库
                </RouterLink>
                <RouterLink v-if="auth.isAuthor" to="/admin/works" class="account-item" role="menuitem" @click="accountOpen = false">
                  <BaseIcon name="bookmark" :size="14" />
                  作品集
                </RouterLink>
                <RouterLink v-if="auth.isAuthor" to="/admin/tags" class="account-item" role="menuitem" @click="accountOpen = false">
                  <BaseIcon name="tag" :size="14" />
                  标签管理
                </RouterLink>
                <RouterLink v-if="auth.isAuthor" to="/admin/settings" class="account-item" role="menuitem" @click="accountOpen = false">
                  <BaseIcon name="edit" :size="14" />
                  站点设置
                </RouterLink>
                <button type="button" class="account-item" role="menuitem" @click="signOut">
                  <BaseIcon name="signOut" :size="14" />
                  退出登录
                </button>
              </div>
            </Transition>
          </div>
        </template>
        <RouterLink v-else to="/login" class="write-btn u-press" aria-label="登录">
          <BaseIcon name="signOut" :size="15" />
          <span>登录</span>
        </RouterLink>
        <button
          type="button"
          class="icon-btn menu-btn u-press"
          :aria-expanded="menuOpen"
          aria-label="打开菜单"
          @click="menuOpen = !menuOpen"
        >
          <BaseIcon :name="menuOpen ? 'close' : 'list'" :size="20" />
        </button>
      </div>
    </div>

    <Transition name="menu">
      <nav v-if="menuOpen" class="mobile-nav" aria-label="移动端导航">
        <RouterLink v-for="item in NAV" :key="item.to" :to="item.to" class="mobile-link">
          {{ item.label }}
          <BaseIcon name="arrowRight" :size="16" />
        </RouterLink>
        <RouterLink :to="auth.isAuthed ? '/account/security' : '/login'" class="mobile-link">
          {{ auth.isAuthed ? '账号安全' : '登录 / 微信扫码' }}
          <BaseIcon name="arrowRight" :size="16" />
        </RouterLink>
        <RouterLink v-if="auth.isAuthor" to="/admin" class="mobile-link">
          写作台
          <BaseIcon name="arrowRight" :size="16" />
        </RouterLink>
        <RouterLink v-if="auth.isAuthor" to="/admin/structure" class="mobile-link">
          内容结构
          <BaseIcon name="arrowRight" :size="16" />
        </RouterLink>
        <RouterLink v-if="auth.isAuthor" to="/admin/media" class="mobile-link">
          媒体库
          <BaseIcon name="arrowRight" :size="16" />
        </RouterLink>
        <RouterLink v-if="auth.isAuthor" to="/admin/works" class="mobile-link">
          作品集
          <BaseIcon name="arrowRight" :size="16" />
        </RouterLink>
        <RouterLink v-if="auth.isAuthor" to="/admin/tags" class="mobile-link">
          标签管理
          <BaseIcon name="arrowRight" :size="16" />
        </RouterLink>
        <RouterLink v-if="auth.isAuthor" to="/admin/settings" class="mobile-link">
          站点设置
          <BaseIcon name="arrowRight" :size="16" />
        </RouterLink>
        <button v-if="auth.isAuthed" type="button" class="mobile-link" @click="signOut">
          退出登录
          <BaseIcon name="signOut" :size="16" />
        </button>
        <div class="mobile-theme-row">
          <span class="mobile-theme-label">主题</span>
          <div class="segmented" role="group" aria-label="选择主题">
            <button type="button" :aria-pressed="mode === 'light'" :class="{ 'is-active': mode === 'light' }" @click="setMode('light')">
              浅色
            </button>
            <button type="button" :aria-pressed="mode === 'dark'" :class="{ 'is-active': mode === 'dark' }" @click="setMode('dark')">
              深色
            </button>
            <button type="button" :aria-pressed="mode === 'system'" :class="{ 'is-active': mode === 'system' }" @click="setMode('system')">
              跟随系统
            </button>
          </div>
        </div>
      </nav>
    </Transition>
  </header>

  <main id="main" :class="compact ? 'main compact' : 'main'">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>

  <footer class="site-footer">
    <div class="u-container footer-inner">
      <div class="footer-brand">
        <p class="footer-name">鹤酒 <span>hejiu45</span></p>
        <p class="footer-desc">写代码，也写生活里的留白。写作、设计、工程，都值得被慢慢打磨。</p>
      </div>
      <div class="footer-links">
        <RouterLink to="/archive" class="u-link-underline">归档</RouterLink>
        <RouterLink to="/collections" class="u-link-underline">合集</RouterLink>
        <RouterLink to="/tags" class="u-link-underline">标签</RouterLink>
        <RouterLink to="/about" class="u-link-underline">关于</RouterLink>
        <a href="/rss.xml" class="u-link-underline footer-rss">
          <BaseIcon name="rss" :size="14" /> RSS
        </a>
      </div>
      <div class="footer-meta">
        <p>{{ site.info.footerText }}</p>
        <p v-if="site.info.icp">{{ site.info.icp }}</p>
        <p>Built with Vue 3 · Node.js · SQLite</p>
      </div>
    </div>
  </footer>

  <ToastHost />
  <BackgroundMusic />
</template>

<style scoped>
.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 100;
  padding: 0.6rem 1rem;
  background: var(--ink);
  color: var(--paper);
  border-radius: var(--radius-sm);
  transform: translateY(-160%);
  transition: transform 0.2s var(--ease-out-expo);
}

.skip-link:focus-visible {
  transform: none;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: color-mix(in oklab, var(--paper) 88%, transparent);
  backdrop-filter: blur(14px) saturate(140%);
  border-bottom: 1px solid var(--rule);
  transition: border-color 0.3s ease;
}

.header-inner {
  display: flex;
  align-items: center;
  gap: clamp(1rem, 3vw, 2.5rem);
  min-height: var(--header-h);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--ink);
  text-decoration: none;
  flex-shrink: 0;
}

.brand-mark {
  width: 30px;
  height: 30px;
  transition: transform 0.5s var(--ease-out-expo);
}

.brand:hover .brand-mark {
  transform: rotate(-6deg);
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.brand-name {
  font-weight: 700;
  font-size: 1.0625rem;
  letter-spacing: 0.04em;
}

.brand-domain {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--ink-soft);
  letter-spacing: 0.04em;
}

.nav {
  display: none;
  align-items: center;
  gap: 0.25rem;
  margin-right: auto;
}

.nav-link {
  position: relative;
  padding: 0.45rem 0.8rem;
  font-size: 0.9rem;
  color: var(--ink-mid);
  border-radius: var(--radius-sm);
  text-decoration: none;
  white-space: nowrap;
}

.nav-link:hover {
  color: var(--ink);
  background: var(--paper-soft);
}

.nav-link.is-active {
  color: var(--ink);
}

.nav-link.is-active::after {
  content: '';
  position: absolute;
  left: 0.8rem;
  right: 0.8rem;
  bottom: 0.1rem;
  height: 1.5px;
  background: var(--accent);
  transform-origin: left;
  animation: nav-underline 0.45s var(--ease-out-expo) both;
}

@keyframes nav-underline {
  from {
    transform: scaleX(0);
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

/**
 * 账号菜单的定位锚点是头像按钮本身（.account-wrap 同时包住按钮与菜单），
 * 这样 `right: 0` 才会精确对齐头像右边缘。
 * 之前锚点挂在 .header-actions 上，会以「写文章」+ 头像整块区域为基准，菜单向右溢出视口。
 */
.account-wrap {
  position: relative;
  display: inline-flex;
}

/* 账号菜单：点击头像展开，纯 CSS 过渡 */
.account-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.6rem 0.3rem 0.3rem;
  border-radius: 999px;
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-mid);
  cursor: pointer;
  font-size: 0.82rem;
  max-width: 11rem;
}

.account-btn:hover {
  border-color: var(--rule-strong);
  color: var(--ink);
}

.account-avatar {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--paper);
  font-size: 0.72rem;
  font-weight: 600;
  flex-shrink: 0;
}

.account-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-caret {
  color: var(--ink-soft);
  flex-shrink: 0;
  transition: transform 0.25s var(--ease-out-expo);
}

.account-btn[aria-expanded='true'] .account-caret {
  transform: rotate(180deg);
}

.account-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 45;
  display: grid;
  gap: 0.15rem;
  min-width: 190px;
  padding: 0.45rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  box-shadow: var(--shadow-float);
  /* 窄屏时避免菜单被挤出屏幕 */
  max-width: calc(100vw - 2rem);
}

.account-meta {
  padding: 0.35rem 0.55rem 0.45rem;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--rule);
  margin-bottom: 0.2rem;
}

.account-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.84rem;
  font-family: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.account-item:hover {
  background: var(--paper-soft);
  color: var(--ink);
}

@media (max-width: 520px) {
  .account-name {
    display: none;
  }

  .account-btn {
    padding: 0.3rem;
  }

  .write-btn span {
    display: none;
  }

  .write-btn {
    width: 36px;
    height: 36px;
    padding: 0;
    justify-content: center;
  }
}

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  color: var(--ink-mid);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
}

.icon-btn:hover {
  color: var(--ink);
  border-color: var(--rule);
  background: var(--paper-soft);
}

.write-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.48rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--ink);
  color: var(--paper);
  font-size: 0.85rem;
  text-decoration: none;
  white-space: nowrap;
}

.write-btn:hover {
  background: var(--accent);
  color: var(--accent-ink);
}

.menu-btn {
  display: inline-grid;
}

.mobile-nav {
  display: grid;
  gap: 0.15rem;
  padding: 0.5rem clamp(1.25rem, 4vw, 3.5rem) 1.1rem;
  border-top: 1px solid var(--rule);
}

.mobile-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 0.25rem;
  color: var(--ink);
  text-decoration: none;
  font-size: 1rem;
  border-bottom: 1px solid var(--rule);
  background: transparent;
  border-left: 0;
  border-right: 0;
  font-family: inherit;
  cursor: pointer;
}

.mobile-theme {
  border-bottom: 0;
}

.mobile-theme-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0.25rem 0.4rem;
}

.mobile-theme-label {
  font-size: 0.84rem;
  color: var(--ink-soft);
}

.segmented {
  display: inline-flex;
  padding: 0.2rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
}

.segmented button {
  padding: 0.3rem 0.6rem;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.76rem;
  font-family: inherit;
  cursor: pointer;
}

.segmented button.is-active {
  background: var(--paper-raised);
  color: var(--ink);
  box-shadow: var(--shadow-lift);
}

.menu-enter-active,
.menu-leave-active {
  transition: opacity 0.25s ease, transform 0.3s var(--ease-out-expo);
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.main {
  min-height: 62dvh;
}

.site-footer {
  margin-top: clamp(4rem, 10vw, 8rem);
  border-top: 1px solid var(--rule);
  background: var(--paper-soft);
}

.footer-inner {
  display: grid;
  gap: 2rem;
  padding-block: clamp(2.5rem, 6vw, 4rem);
}

.footer-name {
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: 0.04em;
}

.footer-name span {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--ink-soft);
  margin-left: 0.4rem;
  letter-spacing: 0.04em;
}

.footer-desc {
  margin-top: 0.7rem;
  max-width: 34ch;
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--ink-soft);
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 1.4rem;
  font-size: 0.88rem;
}

.footer-links a {
  color: var(--ink-mid);
  text-decoration: none;
}

.footer-links a:hover {
  color: var(--ink);
}

.footer-rss {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.footer-meta {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
  line-height: 2;
}

@media (min-width: 860px) {
  .nav {
    display: flex;
  }

  .menu-btn,
  .mobile-nav {
    display: none;
  }

  .footer-inner {
    grid-template-columns: 1.4fr 1fr auto;
    align-items: start;
  }

  .footer-meta {
    text-align: right;
  }
}
</style>
