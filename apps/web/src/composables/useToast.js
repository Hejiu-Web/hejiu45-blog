import { ref, readonly } from 'vue';

/**
 * 轻量 toast：一个全局数组 + 自动清理。
 * 只用于「瞬时」反馈，表单错误一律内联展示。
 */
export const toasts = ref([]);
let seq = 0;

export function toast(message, { tone = 'default', duration = 2600 } = {}) {
  const id = ++seq;
  toasts.value.push({ id, message, tone });
  window.setTimeout(() => dismiss(id), duration);
  return id;
}

export function dismiss(id) {
  const idx = toasts.value.findIndex((t) => t.id === id);
  if (idx >= 0) toasts.value.splice(idx, 1);
}

export const useToast = () => ({ toasts: readonly(toasts), toast, dismiss });
