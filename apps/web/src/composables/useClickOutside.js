import { onBeforeUnmount, onMounted } from 'vue';

/**
 * 点击外部关闭：用于下拉菜单与弹层。
 * 用 pointerdown 捕获阶段监听，先于内部点击触发，避免「打开即关闭」。
 */
export function onClickOutside(targetRef, handler) {
  function onPointerDown(event) {
    const el = targetRef.value;
    if (el && !el.contains(event.target)) handler(event);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') handler(event);
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeydown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeydown);
  });
}
