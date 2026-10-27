import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/client';

/**
 * 内容模型缓存：站点信息、文章类型、合集。
 * 这些数据变化很少，全站共用一份，避免每个页面重复请求。
 *
 * 注意：这里的字段只是「接口返回前的占位」，一律留空，
 * 避免把某个具体站点的名字写死在前端——真正的值全部来自后台设置。
 */
export const useSiteStore = defineStore('site', () => {
  const info = ref({
    siteName: '',
    siteTagline: '',
    siteDescription: '',
    heroTitle: '',
    heroLead: '',
    authorName: '',
    authorBio: '',
    footerText: '',
    rssTitle: '',
  });
  const types = ref([]);
  const collections = ref([]);
  const loaded = ref(false);
  const loading = ref(false);

  /** 首屏只拉一次；后台修改后调用 refresh 强制更新 */
  async function ensure(force = false) {
    if (loading.value) return;
    if (loaded.value && !force) return;
    loading.value = true;
    try {
      const [siteRes, typeRes, collRes] = await Promise.all([
        api.siteInfo().catch(() => null),
        api.types().catch(() => null),
        api.collections().catch(() => null),
      ]);
      if (siteRes?.site) info.value = { ...info.value, ...siteRes.site };
      if (typeRes?.types) types.value = typeRes.types;
      if (collRes?.collections) collections.value = collRes.collections;
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  const navTypes = computed(() => types.value.filter((t) => t.count > 0 || t.builtin));

  function typeOf(keyOrRoute) {
    return types.value.find((t) => t.key === keyOrRoute || t.route === keyOrRoute) || null;
  }

  function typeById(id) {
    return types.value.find((t) => t.id === id) || null;
  }

  return { info, types, collections, loaded, loading, navTypes, ensure, typeOf, typeById };
});
