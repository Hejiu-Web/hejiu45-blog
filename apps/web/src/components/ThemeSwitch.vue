<!--
  主题切换：浅色 / 深色 / 跟随系统 三档。
  未登录的人也能用，所以放在导航里而不是账号菜单里。
-->
<script setup>
import { onClickOutside } from '@/composables/useClickOutside';
import { useTheme } from '@/composables/useTheme';
import BaseIcon from './BaseIcon.vue';
import { ref } from 'vue';

const { mode, theme, setMode } = useTheme();
const open = ref(false);
const root = ref(null);

onClickOutside(root, () => (open.value = false));

const OPTIONS = [
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '跟随系统', icon: 'check' },
];

function choose(value) {
  setMode(value);
  open.value = false;
}

/** 快捷切换：在深浅之间来回（system 下按当前结果取反） */
function quickToggle() {
  setMode(theme.value === 'dark' ? 'light' : 'dark');
}
</script>

<template>
  <div ref="root" class="theme-switch">
    <button
      type="button"
      class="icon-btn u-press"
      :aria-label="`切换主题，当前：${theme === 'dark' ? '深色' : '浅色'}${mode === 'system' ? '（跟随系统）' : ''}`"
      :title="`主题：${mode === 'system' ? '跟随系统' : theme === 'dark' ? '深色' : '浅色'}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
      @dblclick="quickToggle"
    >
      <BaseIcon :name="theme === 'dark' ? 'moon' : 'sun'" :size="18" />
    </button>

    <Transition name="theme-pop">
      <div v-if="open" class="theme-menu" role="menu" aria-label="选择主题">
        <p class="theme-label">主题</p>
        <button
          v-for="option in OPTIONS"
          :key="option.value"
          type="button"
          role="menuitemradio"
          :aria-checked="mode === option.value"
          class="theme-option"
          :class="{ 'is-active': mode === option.value }"
          @click="choose(option.value)"
        >
          <BaseIcon :name="option.icon" :size="14" />
          <span>{{ option.label }}</span>
          <BaseIcon v-if="mode === option.value" name="check" :size="13" class="check" />
        </button>
        <p class="theme-hint">双击按钮可快速在深浅之间切换</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.theme-switch {
  position: relative;
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
  transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.icon-btn:hover {
  color: var(--ink);
  border-color: var(--rule);
  background: var(--paper-soft);
}

.theme-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 45;
  min-width: 168px;
  padding: 0.4rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  box-shadow: var(--shadow-float);
  display: grid;
  gap: 0.1rem;
}

.theme-label {
  padding: 0.3rem 0.55rem 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.42rem 0.55rem;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.84rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.theme-option:hover {
  background: var(--paper-soft);
  color: var(--ink);
}

.theme-option.is-active {
  color: var(--accent);
}

.theme-option .check {
  margin-left: auto;
}

.theme-hint {
  margin-top: 0.2rem;
  padding: 0.35rem 0.55rem 0.15rem;
  border-top: 1px solid var(--rule);
  font-size: 0.68rem;
  line-height: 1.5;
  color: var(--ink-soft);
}

.theme-pop-enter-active,
.theme-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.24s var(--ease-out-expo);
}

.theme-pop-enter-from,
.theme-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
