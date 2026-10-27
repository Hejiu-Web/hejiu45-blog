import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setCsrf, onUnauthorized } from '@/api/client';
import { toast } from '@/composables/useToast';

/**
 * 登录态。
 *
 * 令牌不再存 localStorage：会话在 HttpOnly Cookie 里，页面刷新时
 * 调用 /auth/session 恢复用户信息与 CSRF 令牌（CSRF 只保存在内存）。
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const ready = ref(false);
  const pending = ref(false);
  const wechat = ref({ enabled: false, channel: null, reason: '' });

  const isAuthed = computed(() => Boolean(user.value));
  const isAuthor = computed(() => ['author', 'admin'].includes(user.value?.role));
  const displayName = computed(() => user.value?.displayName || '');

  function applySession(payload) {
    user.value = payload.user || null;
    setCsrf(payload.csrf || '');
    if (payload.wechat) wechat.value = payload.wechat;
  }

  async function restore() {
    if (ready.value) return user.value;
    try {
      const payload = await api.session();
      applySession(payload);
    } catch {
      user.value = null;
      setCsrf('');
    } finally {
      ready.value = true;
    }
    return user.value;
  }

  async function login(username, password) {
    pending.value = true;
    try {
      const res = await api.login(username, password);
      applySession(res);
      return res.user;
    } finally {
      pending.value = false;
    }
  }

  async function logout({ redirect } = {}) {
    try {
      await api.logout();
    } catch {
      /* 网络失败也要清本地状态 */
    }
    user.value = null;
    setCsrf('');
    toast('已退出登录');
    if (redirect) window.location.assign(redirect);
  }

  /** 微信登录：拿到授权地址后整页跳转，由微信渲染二维码 */
  async function startWechat(redirectTo = '/') {
    pending.value = true;
    try {
      const { url } = await api.wechatStart(redirectTo);
      window.location.assign(url);
      return url;
    } finally {
      pending.value = false;
    }
  }

  // 任一请求返回 401，立刻清空本地登录态
  onUnauthorized(() => {
    user.value = null;
    setCsrf('');
  });

  return { user, ready, pending, wechat, isAuthed, isAuthor, displayName, restore, login, logout, startWechat };
});
