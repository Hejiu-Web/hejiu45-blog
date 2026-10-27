<!--
  背景音乐播放器。

  浏览器策略：页面在用户没有交互之前，不允许播放「带声音」的媒体
  （Chrome / Safari 的 autoplay policy）。因此流程是：
  先尝试播放 → 被拒绝就等第一次点击/按键再淡入，而不是假装能自动播放。
-->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useBgm } from '@/stores/bgm';
import { useSiteStore } from '@/stores/site';
import BaseIcon from './BaseIcon.vue';

const bgm = useBgm();
const site = useSiteStore();
const { title: bgmTitle, url: bgmUrl, muted: bgmMuted, volume: bgmVolume, playing: bgmPlaying, blocked: bgmBlocked, loop: bgmLoop, showControl: bgmShowControl, enabled: bgmEnabled } =
  storeToRefs(bgm);

const audioRef = ref(null);
const rootRef = ref(null);
const expanded = ref(false);
const progress = ref(0);
const failed = ref(false);

let fadeTimer = 0;
let gestureArmed = false;
let pendingPlayTimer = 0;

/** 控制条是否显示（音乐关闭或作者选择隐藏时不显示） */
const visible = computed(() => bgmEnabled.value && bgmShowControl.value);

const labelText = computed(() => {
  if (failed.value) return '音频加载失败';
  if (bgmPlaying.value) return '暂停背景音乐';
  if (bgmBlocked.value) return '点击播放背景音乐（浏览器要求先与页面交互）';
  return '播放背景音乐';
});

function readFlags() {
  try {
    return {
      paused: localStorage.getItem('hl:bgm-paused') === '1',
      muted: localStorage.getItem('hl:bgm-muted') === '1',
      volume: Number(localStorage.getItem('hl:bgm-volume')),
    };
  } catch {
    return { paused: false, muted: false, volume: NaN };
  }
}

function writeFlag(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* 隐私模式忽略 */
  }
}

function applyVolume() {
  const el = audioRef.value;
  if (!el) return;
  el.muted = bgmMuted.value;
  el.volume = bgmMuted.value ? 0 : bgmVolume.value;
}

/** 音量淡入：被策略拦截后首次播放时不要突然炸响 */
function fadeIn(target) {
  const el = audioRef.value;
  if (!el) return;
  clearInterval(fadeTimer);
  const from = el.volume;
  let step = 0;
  fadeTimer = window.setInterval(() => {
    step += 1;
    el.volume = Math.min(target, from + ((target - from) * step) / 20);
    if (step >= 20) clearInterval(fadeTimer);
  }, 40);
}

async function attemptPlay() {
  const el = audioRef.value;
  if (!el || !bgmUrl.value || !bgmEnabled.value) return false;
  try {
    el.volume = 0;
    await el.play();
    fadeIn(bgmMuted.value ? 0 : bgmVolume.value);
    return true;
  } catch (err) {
    if (err?.name === 'NotAllowedError') armGesture();
    else failed.value = true;
    return false;
  }
}

/** 等待用户第一次交互；只挂一次，触发后立即移除 */
function armGesture() {
  if (gestureArmed) return;
  gestureArmed = true;
  bgm.blocked = true;
  const onGesture = async () => {
    document.removeEventListener('pointerdown', onGesture, true);
    document.removeEventListener('keydown', onGesture, true);
    gestureArmed = false;
    if (readFlags().paused) return; // 用户主动暂停过，不打扰
    await attemptPlay();
  };
  document.addEventListener('pointerdown', onGesture, true);
  document.addEventListener('keydown', onGesture, true);
}

function schedulePlay() {
  clearTimeout(pendingPlayTimer);
  pendingPlayTimer = window.setTimeout(attemptPlay, 150);
}

async function toggle() {
  const el = audioRef.value;
  if (!el) return;
  if (bgmPlaying.value) {
    el.pause();
    writeFlag('hl:bgm-paused', '1');
    return;
  }
  writeFlag('hl:bgm-paused', null);
  failed.value = false;
  await attemptPlay();
}

function onMute() {
  bgmMuted.value = !bgmMuted.value;
  writeFlag('hl:bgm-muted', bgmMuted.value ? '1' : '0');
  applyVolume();
}

function onVolume(event) {
  const value = Number(event.target.value);
  bgmVolume.value = value;
  writeFlag('hl:bgm-volume', String(value));
  if (bgmMuted.value && value > 0) {
    bgmMuted.value = false;
    writeFlag('hl:bgm-muted', '0');
  }
  applyVolume();
}

function onTimeUpdate() {
  const el = audioRef.value;
  if (!el || !el.duration || !Number.isFinite(el.duration)) return;
  progress.value = el.currentTime / el.duration;
}

function markPlaying() {
  bgm.playing = true;
  bgm.blocked = false;
}

function onOutside(event) {
  if (expanded.value && rootRef.value && !rootRef.value.contains(event.target)) expanded.value = false;
}

/** 把站点设置同步进播放器状态 */
function syncFromConfig() {
  const info = site.info || {};
  const raw = String(info.bgmLoop ?? '').trim();
  bgm.applyConfig({
    enabled: info.bgmEnabled,
    url: info.bgmUrl,
    title: info.bgmTitle,
    // 后端返回的是字符串 'true' / 'false'，布尔判断前必须显式解析：
    // 直接 `!== false` 会把字符串 'false' 当成真值。
    loop: !(raw === 'false' || raw === '0' || info.bgmLoop === false),
    volume: info.bgmVolume,
    showControl: !(String(info.bgmShowControl ?? '').trim() === 'false' || info.bgmShowControl === false),
  });
}
/**
 * 配置变化时：写 src、应用音量、按需播放。
 * 注意 <audio> 必须常驻在 DOM 里，否则配置到达时 ref 为空，什么都设置不上。
 */
function applyAudio() {
  const el = audioRef.value;
  if (!el) return;
  if (!bgmUrl.value || !bgmEnabled.value) return;
  if (el.getAttribute('src') !== bgmUrl.value) {
    el.src = bgmUrl.value;
    progress.value = 0;
  }
  el.loop = bgmLoop.value;
  applyVolume();
  if (!readFlags().paused) schedulePlay();
}

onMounted(() => {
  document.addEventListener('pointerdown', onOutside, true);
  const flags = readFlags();
  bgmMuted.value = flags.muted;
  if (Number.isFinite(flags.volume)) bgmVolume.value = flags.volume;
  syncFromConfig();
  applyAudio();
});

onBeforeUnmount(() => {
  clearInterval(fadeTimer);
  clearTimeout(pendingPlayTimer);
  document.removeEventListener('pointerdown', onOutside, true);
});

// 站点配置是异步到达的：任一字段变化都重新应用
watch(
  () => [site.info.bgmEnabled, site.info.bgmUrl, site.info.bgmTitle, site.info.bgmLoop, site.info.bgmVolume, site.info.bgmShowControl].join('|'),
  () => {
    syncFromConfig();
    applyAudio();
  },
);

watch(bgmLoop, (loop) => {
  if (audioRef.value) audioRef.value.loop = loop;
});
</script>

<template>
  <div class="bgm-host">
    <!-- audio 常驻 DOM（用 v-show 隐藏），保证配置异步到达时依然能拿到元素 -->
    <audio
      v-show="visible"
      ref="audioRef"
      :loop="bgmLoop"
      preload="metadata"
      @volumechange="applyVolume"
      @play="markPlaying"
      @pause="bgm.playing = false"
      @timeupdate="onTimeUpdate"
      @error="failed = true"
    />

    <div v-show="visible" ref="rootRef" class="bgm" :data-expanded="expanded">
      <Transition name="bgm-panel">
        <div v-if="expanded" class="bgm-panel">
          <p class="bgm-title">{{ bgmTitle || '背景音乐' }}</p>
          <p v-if="failed" class="bgm-error">音频加载失败，请检查文件地址或格式</p>
          <p v-else-if="bgmBlocked && !bgmPlaying" class="bgm-hint">
            浏览器要求先与页面交互才能播放，点一下左侧按钮即可开始。
          </p>

          <div class="bgm-progress" aria-hidden="true">
            <span :style="{ transform: `scaleX(${bgmLoop ? 1 : progress})` }" />
          </div>

          <div class="bgm-row">
            <button type="button" class="bgm-mini u-press" :aria-label="bgmMuted ? '取消静音' : '静音'" @click="onMute">
              <BaseIcon :name="bgmMuted ? 'close' : 'rss'" :size="14" />
            </button>
            <label class="bgm-volume">
              <span class="sr-only">音量</span>
              <input type="range" min="0" max="1" step="0.01" :value="bgmVolume" @input="onVolume" />
            </label>
            <span class="bgm-meta">{{ Math.round(bgmVolume * 100) }}%</span>
          </div>
        </div>
      </Transition>

      <div class="bgm-controls">
        <button type="button" class="bgm-toggle u-press" :aria-label="labelText" :title="labelText" :aria-pressed="bgmPlaying" @click="toggle">
          <span v-if="bgmPlaying" class="bars" aria-hidden="true"><i /><i /><i /></span>
          <BaseIcon v-else name="rss" :size="16" />
        </button>
        <button
          type="button"
          class="bgm-more u-press"
          :aria-label="expanded ? '收起音乐面板' : '展开音乐面板'"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          <BaseIcon :name="expanded ? 'arrowDown' : 'arrowUp'" :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bgm-host {
  position: relative;
}

.bgm {
  position: fixed;
  z-index: 46;
  right: clamp(0.9rem, 2.5vw, 1.8rem);
  bottom: clamp(0.9rem, 2.5vw, 1.8rem);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.bgm-controls {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.28rem;
  border-radius: 999px;
  border: 1px solid var(--rule-strong);
  background: color-mix(in oklab, var(--paper-raised) 88%, transparent);
  backdrop-filter: blur(12px) saturate(150%);
  box-shadow: var(--shadow-float);
}

.bgm-toggle,
.bgm-more {
  display: inline-grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--ink-mid);
  cursor: pointer;
}

.bgm-toggle {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--paper);
}

.bgm-toggle:hover,
.bgm-toggle[aria-pressed='true'] {
  background: var(--accent);
  color: var(--accent-ink);
}

.bgm-more {
  width: 24px;
  height: 40px;
  border-radius: 999px;
}

.bgm-more:hover {
  color: var(--ink);
}

.bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.bars i {
  display: block;
  width: 3px;
  background: currentColor;
  border-radius: 2px;
  animation: bgm-bar 1s ease-in-out infinite;
}

.bars i:nth-child(1) {
  height: 60%;
}

.bars i:nth-child(2) {
  height: 100%;
  animation-delay: 160ms;
}

.bars i:nth-child(3) {
  height: 45%;
  animation-delay: 320ms;
}

@keyframes bgm-bar {
  0%,
  100% {
    transform: scaleY(0.45);
  }
  50% {
    transform: scaleY(1);
  }
}

.bgm-panel {
  width: 232px;
  padding: 0.8rem 0.85rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  box-shadow: var(--shadow-float);
  display: grid;
  gap: 0.55rem;
}

.bgm-title {
  font-size: 0.82rem;
  font-weight: 580;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bgm-hint,
.bgm-error {
  font-size: 0.72rem;
  line-height: 1.55;
  color: var(--ink-soft);
}

.bgm-error {
  color: var(--accent);
}

.bgm-progress {
  height: 3px;
  border-radius: 999px;
  background: var(--paper-soft);
  overflow: hidden;
}

.bgm-progress span {
  display: block;
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform 0.35s linear;
}

.bgm-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bgm-mini {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-mid);
  cursor: pointer;
}

.bgm-mini:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.bgm-volume {
  flex: 1;
}

.bgm-volume input {
  width: 100%;
  accent-color: var(--accent);
}

.bgm-meta {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  color: var(--ink-soft);
  min-width: 3ch;
  text-align: right;
}

.bgm-panel-enter-active,
.bgm-panel-leave-active {
  transition: opacity 0.2s ease, transform 0.26s var(--ease-out-expo);
}

.bgm-panel-enter-from,
.bgm-panel-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 520px) {
  .bgm {
    right: 0.7rem;
    bottom: 0.7rem;
  }

  .bgm-panel {
    width: 200px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bars i {
    animation: none;
    transform: scaleY(0.7);
  }
}
</style>
