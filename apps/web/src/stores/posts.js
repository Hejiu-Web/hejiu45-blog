import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/client';

/**
 * 全站文章索引缓存：首页、归档、标签、搜索共用同一份数据，
 * 落笔后写回缓存而不是整页重刷。
 */
export const usePosts = defineStore('posts', () => {
  const all = ref([]);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref(null);

  const published = computed(() => all.value.filter((p) => p.status === 'published'));

  async function ensure(force = false) {
    if (loading.value) return all.value;
    if (loaded.value && !force) return all.value;
    loading.value = true;
    error.value = null;
    try {
      const items = [];
      for (let page = 1; page <= 10; page += 1) {
        const res = await api.listPosts({ page, pageSize: 50 });
        items.push(...res.items);
        if (!res.hasMore) break;
      }
      all.value = items;
      loaded.value = true;
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
    return all.value;
  }

  function upsert(post) {
    const idx = all.value.findIndex((p) => p.id === post.id);
    if (post.status !== 'published') {
      if (idx >= 0) all.value.splice(idx, 1);
      return;
    }
    if (idx >= 0) all.value[idx] = post;
    else all.value.unshift(post);
  }

  function remove(id) {
    all.value = all.value.filter((p) => p.id !== id);
  }

  function patchLike(id, likeCount) {
    const post = all.value.find((p) => p.id === id);
    if (post) post.likeCount = likeCount;
  }

  return { all, published, loaded, loading, error, ensure, upsert, remove, patchLike };
});
