import { reactive, onUnmounted } from 'vue';

const LEVELS = ['idle', 'added', 'removed', 'failed'];

/**
 * 点赞的统一「乐观更新 + 失败回滚 + 轻抖动反馈」。
 * 动画由 CSS 的 [data-pulse] 属性变化驱动，组件不持有动画逻辑。
 */
export function useReaction(postRef) {
  const state = reactive({ liked: false, count: 0, busy: false, phase: 'idle' });

  function bind({ liked, likeCount }) {
    state.liked = Boolean(liked);
    state.count = likeCount ?? 0;
  }

  async function toggle(reactFn) {
    if (state.busy) return;
    state.busy = true;
    const optimistic = !state.liked;
    state.liked = optimistic;
    state.count += optimistic ? 1 : -1;
    state.phase = optimistic ? 'added' : 'removed';
    try {
      const res = await reactFn(postRef.value.id, 'like');
      state.liked = res.liked;
      state.count = res.likeCount;
    } catch {
      state.liked = !optimistic;
      state.count += optimistic ? -1 : 1;
      state.phase = 'failed';
    } finally {
      state.busy = false;
      setTimeout(() => {
        state.phase = 'idle';
      }, 620);
    }
  }

  return { state, bind, toggle, LEVELS };
}

/** 分享：Web Share API 优先，降级为复制链接 / 复制到系统剪贴板 */
export async function sharePost(post, { url } = {}) {
  const link = url || `${window.location.origin}/post/${post.slug}`;
  const payload = { title: post.title, text: post.excerpt, url: link };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return { ok: true, method: 'native' };
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: false, method: 'aborted' };
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    return { ok: true, method: 'clipboard', link };
  } catch {
    window.prompt('复制这个链接', link);
    return { ok: false, method: 'manual', link };
  }
}

const SOCIAL = (post, link, title) => [
  {
    id: 'weibo',
    label: '微博',
    href: `https://service.weibo.com/share/share.php?url=${encodeURIComponent(link)}&title=${encodeURIComponent(
      `${title} ${link}`,
    )}`,
  },
  {
    id: 'x',
    label: 'X',
    href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent(title)}`,
  },
  {
    id: 'douban',
    label: '豆瓣',
    href: `https://www.douban.com/share/service?href=${encodeURIComponent(link)}&name=${encodeURIComponent(title)}`,
  },
];

export function shareTargets(post, link) {
  return SOCIAL(post, link, post.title);
}

export function useCopyFeedback(timeout = 1800) {
  const state = reactive({ copied: false });
  let timer = 0;
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('复制', text);
    }
    state.copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (state.copied = false), timeout);
  }
  onUnmounted(() => clearTimeout(timer));
  return { state, copy };
}
