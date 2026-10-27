import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 背景音乐的共享状态。
 *
 * 播放器是一个常驻组件（放在站点外壳里），路由切换不会卸载它，
 * 所以音乐可以跨页面连续播放。这里只维护「是否在播 / 音量 / 是否被拦截」等状态，
 * 真正的声音由 BackgroundMusic 里的 <audio> 负责。
 */
export const useBgm = defineStore('bgm', () => {
  const enabled = ref(false);
  const url = ref('');
  const title = ref('');
  const loop = ref(true);
  const showControl = ref(true);
  const volume = ref(0.35);
  const muted = ref(false);
  const playing = ref(false);
  /** 被浏览器的自动播放策略拦住了（需要用户先与页面交互） */
  const blocked = ref(false);

  const truthy = (value, fallback = true) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return !['false', '0'].includes(String(value).trim());
  };

  function applyConfig(config) {
    if (!config) return;
    enabled.value = truthy(config.enabled, false) && Boolean(config.url);
    url.value = config.url || '';
    title.value = config.title || '背景音乐';
    // 后端以字符串 'true'/'false' 存储，这里统一解析为布尔
    loop.value = truthy(config.loop, true);
    showControl.value = truthy(config.showControl, true);
    const v = Number(config.volume);
    if (Number.isFinite(v)) volume.value = Math.min(1, Math.max(0, v));
  }

  return { enabled, url, title, loop, showControl, volume, muted, playing, blocked, applyConfig };
});
