import { reactive, readonly, onUnmounted } from 'vue';

/**
 * 滚动展开：用 IntersectionObserver 给元素打上 data-visible，
 * 动画本身交给 CSS。不注册 scroll 监听，不触发重渲染。
 */
export function useReveal(rootRef, { stagger = 80, threshold = 0.16 } = {}) {
  let observer = null;

  function observe() {
    const root = rootRef.value;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.querySelectorAll('[data-reveal]').forEach((el) => {
        el.dataset.visible = 'true';
      });
      return;
    }
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        const batch = entries.filter((e) => e.isIntersecting);
        batch.forEach((entry, i) => {
          entry.target.style.setProperty('--reveal-delay', `${Math.min(i, 6) * stagger}ms`);
          entry.target.dataset.visible = 'true';
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold },
    );
    root.querySelectorAll('[data-reveal]:not([data-visible])').forEach((el) => observer.observe(el));
  }

  onUnmounted(() => observer?.disconnect());

  return {
    observe,
    revealNow(selector = '[data-reveal]') {
      rootRef.value?.querySelectorAll(selector).forEach((el) => {
        el.dataset.visible = 'true';
      });
    },
  };
}

/** 指针视差：用 CSS 变量驱动，不触发组件重渲染，只在支持 hover 的设备上启用 */
export function usePointerParallax(targetRef, { strength = 18 } = {}) {
  const state = reactive({ active: false });
  let frame = 0;

  function onMove(event) {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const el = targetRef.value;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      el.style.setProperty('--px', `${(x * strength).toFixed(2)}px`);
      el.style.setProperty('--py', `${(y * strength).toFixed(2)}px`);
    });
  }

  function enable() {
    state.active = true;
    window.addEventListener('pointermove', onMove, { passive: true });
  }

  function disable() {
    state.active = false;
    window.removeEventListener('pointermove', onMove);
  }

  onUnmounted(disable);
  return { state: readonly(state), enable, disable };
}
