<!-- 单个标签下的文章列表 -->
<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import PostCard from '@/components/PostCard.vue';
import PostSkeleton from '@/components/PostSkeleton.vue';
import EmptyState from '@/components/EmptyState.vue';
import { usePosts } from '@/stores/posts';
import { useReveal } from '@/composables/useReveal';

const props = defineProps({ tag: { type: String, required: true } });
const store = usePosts();
const router = useRouter();
const root = ref(null);
const { observe } = useReveal(root, { stagger: 60 });

const posts = computed(() => store.published.filter((p) => p.tags?.includes(props.tag)));

onMounted(async () => {
  await store.ensure();
  requestAnimationFrame(observe);
});

watch(posts, () => requestAnimationFrame(observe), { flush: 'post' });
</script>

<template>
  <div ref="root" class="tag-page u-container">
    <header class="tag-head">
      <button type="button" class="back u-press" @click="router.push('/tags')">
        全部标签
      </button>
      <h1 class="page-title">
        <span class="hash" aria-hidden="true">#</span>{{ tag }}
      </h1>
      <p class="page-lead">{{ posts.length }} 篇文章归在这个标签下。</p>
    </header>

    <div v-if="store.loading && !store.loaded" class="grid">
      <PostSkeleton v-for="i in 3" :key="i" variant="card" />
    </div>

    <EmptyState v-else-if="!posts.length" icon="tag" title="这个标签下还没有文章" description="换个标签看看，或者回到首页。" >
      <RouterLink to="/tags" class="back-btn u-press">浏览全部标签</RouterLink>
    </EmptyState>

    <div v-else class="grid">
      <PostCard v-for="(post, i) in posts" :key="post.id" :post="post" :index="i" />
    </div>
  </div>
</template>

<style scoped>
.tag-page {
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.tag-head {
  display: grid;
  gap: 0.8rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--rule);
}

.back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  cursor: pointer;
}

.back:hover {
  color: var(--accent);
}

.page-title {
  font-size: clamp(1.8rem, 1.3rem + 2.2vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
}

.hash {
  color: var(--accent);
  font-weight: 400;
}

.page-lead {
  font-size: 0.95rem;
  color: var(--ink-mid);
}

.grid {
  margin-top: 2rem;
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

.back-btn {
  display: inline-flex;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  font-size: 0.85rem;
  text-decoration: none;
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
