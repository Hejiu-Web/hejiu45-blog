<!-- 文章类型页：由类型配置的 route 决定地址（/posts、/notes、/videos…） -->
<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PostCard from '@/components/PostCard.vue';
import PostSkeleton from '@/components/PostSkeleton.vue';
import EmptyState from '@/components/EmptyState.vue';
import BaseIcon from '@/components/BaseIcon.vue';
import { api } from '@/api/client';
import { useSiteStore } from '@/stores/site';
import { useReveal } from '@/composables/useReveal';

const route = useRoute();
const site = useSiteStore();

const type = ref(null);
const posts = ref([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const page = ref(1);
const hasMore = ref(false);
const root = ref(null);
const { observe } = useReveal(root, { stagger: 60 });

const slug = computed(() => String(route.params.slug || ''));
const typeName = computed(() => type.value?.name || slug.value);

async function load(routeKey, nextPage = 1) {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.typePosts(routeKey, { page: nextPage, pageSize: 12 });
    type.value = res.type;
    total.value = res.total;
    hasMore.value = res.hasMore;
    page.value = res.page;
    posts.value = nextPage === 1 ? res.items : [...posts.value, ...res.items];
    document.title = `${res.type.name} · 鹤酒`;
  } catch (err) {
    error.value = err.message || '加载失败';
  } finally {
    loading.value = false;
    requestAnimationFrame(observe);
  }
}

onMounted(async () => {
  await site.ensure();
  await load(slug.value);
});

watch(slug, (value) => value && load(value));
</script>

<template>
  <div ref="root" class="type-page u-container">
    <header class="head">
      <p class="kicker">
        <BaseIcon :name="type?.icon || 'bookmark'" :size="13" />
        内容类型
      </p>
      <h1 class="title">{{ typeName }}</h1>
      <p v-if="type?.description" class="lead">{{ type.description }}</p>
      <p v-else-if="type" class="lead">共 {{ total }} 篇。</p>
    </header>

    <div v-if="loading && !posts.length" class="grid">
      <PostSkeleton v-for="i in 3" :key="i" variant="card" />
    </div>

    <EmptyState
      v-else-if="error"
      icon="warning"
      title="这个类型没能加载"
      :description="error"
    />

    <EmptyState
      v-else-if="!posts.length"
      icon="edit"
      title="这个类型下还没有文章"
      description="在写作台新建文章时选择这个类型，发布后就会出现在这里。"
    />

    <div v-else class="grid">
      <PostCard v-for="(post, i) in posts" :key="post.id" :post="post" :index="i" data-reveal />
    </div>

    <div v-if="hasMore" class="more">
      <button type="button" class="more-btn u-press" :disabled="loading" @click="load(slug, page + 1)">
        加载更多（共 {{ total }} 篇）
      </button>
    </div>
  </div>
</template>

<style scoped>
.type-page {
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.head {
  display: grid;
  gap: 0.6rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--rule);
}

.kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.title {
  font-size: clamp(1.9rem, 1.4rem + 2.2vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.lead {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--ink-mid);
  max-width: 52ch;
}

.grid {
  margin-top: 2rem;
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

.more {
  display: flex;
  justify-content: center;
  margin-top: 2rem;
}

.more-btn {
  padding: 0.6rem 1.1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink);
  font-size: 0.86rem;
  cursor: pointer;
}

.more-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

@media (min-width: 700px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1080px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
