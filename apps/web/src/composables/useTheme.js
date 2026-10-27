import { computed, ref, watch } from 'vue';

/**
 * 主题：三档 —— light / dark / system（跟随系统）。
 *
 * - 选择结果存 localStorage，刷新不闪白（index.html 里有一行首帧脚本同步设置）
 * - 「跟随系统」模式下，系统切换深浅色时页面实时跟随
 * - 同步更新 <meta name="theme-color">，移动端地址栏颜色跟页面一致
 */
const KEY = 'hl:theme';
const MODES = ['light', 'dark', 'system'];

function readStored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

/** 用户的选择 */
const mode = ref(MODES.includes(readStored()) ? readStored() : 'system');
/** 实际生效的深浅（system 模式由系统决定） */
const resolved = ref(mode.value === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode.value);

function apply() {
  resolved.value = mode.value === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode.value;
  const root = document.documentElement;
  root.dataset.theme = resolved.value;
  root.dataset.themeMode = mode.value;
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', resolved.value === 'dark' ? '#141414' : '#fbfbfa');
}

const sync = ref(false);
watch(mode, () => {
  try {
    localStorage.setItem(KEY, mode.value);
  } catch {
    /* 隐私模式忽略 */
  }
  apply();
});

systemDark.addEventListener('change', () => {
  if (mode.value === 'system') apply();
});

// 首次立即应用（与服务端渲染无关，纯前端）
sync.value = true;
apply();

export function useTheme() {
  /** 在「深色 / 浅色」之间直接切换：当前是浅色就切深色，深色就切浅色（system 则按当前结果取反） */
  function toggle() {
    mode.value = resolved.value === 'dark' ? 'light' : 'dark';
  }

  return {
    mode,
    theme: resolved,
    isDark: computed(() => resolved.value === 'dark'),
    setMode: (value) => {
      if (MODES.includes(value)) mode.value = value;
    },
    /** 三档轮换：浅色 → 深色 → 跟随系统 → 浅色 */
    cycle: () => {
      const order = ['light', 'dark', 'system'];
      const index = order.indexOf(mode.value);
      mode.value = order[(index + 1) % order.length];
    },
    toggle,
    set: (value) => {
      mode.value = value === 'dark' || value === 'light' ? value : 'system';
    },
  };
}
