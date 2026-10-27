import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSiteStore } from '@/stores/site';

const routes = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
  { path: '/archive', name: 'archive', component: () => import('@/views/ArchiveView.vue') },
  { path: '/tags', name: 'tags', component: () => import('@/views/TagsView.vue') },
  {
    path: '/tags/:tag',
    name: 'tag',
    component: () => import('@/views/TagView.vue'),
    props: true,
  },
  { path: '/search', name: 'search', component: () => import('@/views/SearchView.vue') },
  { path: '/post/:slug', name: 'post', component: () => import('@/views/PostView.vue'), props: true },
  {
    path: '/collections',
    name: 'collections',
    component: () => import('@/views/CollectionsView.vue'),
  },
  {
    path: '/collections/:slug',
    name: 'collection',
    component: () => import('@/views/CollectionView.vue'),
    props: true,
  },
  { path: '/works', name: 'works', component: () => import('@/views/WorksView.vue') },
  { path: '/works/:slug', name: 'work', component: () => import('@/views/WorkDetailView.vue'), props: true },
  { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue') },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
  {
    path: '/account/security',
    name: 'security',
    component: () => import('@/views/SecurityView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/AdminView.vue'),
    meta: { requiresAuth: true, requiresAuthor: true },
  },
  {
    path: '/admin/structure',
    name: 'admin-structure',
    component: () => import('@/views/StructureView.vue'),
    meta: { requiresAuth: true, requiresAuthor: true },
  },
  {
    path: '/admin/media',
    name: 'admin-media',
    component: () => import('@/views/MediaLibraryView.vue'),
    meta: { requiresAuth: true, requiresAuthor: true },
  },
  {
    path: '/admin/tags',
    name: 'admin-tags',
    component: () => import('@/views/TagsAdminView.vue'),
    meta: { requiresAuth: true, requiresAuthor: true },
  },
  {
    path: '/admin/works',
    name: 'admin-works',
    component: () => import('@/views/WorksAdminView.vue'),
    meta: { requiresAuth: true, requiresAuthor: true },
  },
  {
    path: '/admin/settings',
    name: 'admin-settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { requiresAuth: true, requiresAuthor: true },
  },
  {
    path: '/admin/new',
    name: 'admin-new',
    component: () => import('@/views/EditorView.vue'),
    meta: { requiresAuth: true, requiresAuthor: true, compactLayout: true },
  },
  {
    path: '/admin/edit/:id',
    name: 'admin-edit',
    component: () => import('@/views/EditorView.vue'),
    props: true,
    meta: { requiresAuth: true, requiresAuthor: true, compactLayout: true },
  },
  /*
   * 文章类型由数据决定（作者可自定义），用一条带参数的路由兜住：
   * /posts、/notes、/videos … 交给 TypeView 按 slug 去后端查类型。
   * 放在所有固定路由之后、404 之前，避免抢占 /about、/login 等页面。
   */
  {
    path: '/:slug',
    name: 'type',
    component: () => import('@/views/TypeView.vue'),
    props: true,
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    if (to.path === from.path) return { top: 0 };
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;
  const auth = useAuthStore();
  await auth.restore();
  if (!auth.isAuthed) return { name: 'login', query: { redirect: to.fullPath } };
  // 微信登录的读者没有写作权限，引导到账号安全页而不是一个打不开的写作台
  if (to.meta.requiresAuthor && !auth.isAuthor) return { name: 'security' };
  return true;
});

router.afterEach((to) => {
  applyTitle(to);
  // 站点设置是异步加载的：拿到后重新计算一次标题，避免首屏显示兜底文案
  const site = useSiteStore();
  if (!site.loaded) {
    site.ensure().then(() => {
      if (router.currentRoute.value.fullPath === to.fullPath) applyTitle(router.currentRoute.value);
    });
  }
});

function applyTitle(to) {
  const titles = {
    home: '首页',
    archive: '归档',
    tags: '标签',
    tag: `标签 · ${to.params.tag}`,
    search: '搜索',
    about: '关于',
    login: '登录',
    security: '账号安全',
    admin: '写作台',
    'admin-structure': '内容结构',
    'admin-media': '媒体库',
    'admin-tags': '标签管理',
    'admin-settings': '站点设置',
    collections: '合集',
    collection: '合集',
    works: '作品',
    work: '作品',
    'admin-works': '作品集',
    type: '内容类型',
    'admin-new': '新文章',
    'admin-edit': '编辑文章',
    'not-found': '页面不存在',
  };
  const label = titles[to.name] || '文章';
  // 站点名来自后台设置；设置还没加载完时用兜底值，加载完会由守卫再次刷新
  const siteStore = useSiteStore();
  const siteName = siteStore.info.siteName || '博客';
  const tagline = siteStore.info.siteTagline || '';
  document.title =
    label === '首页'
      ? tagline
        ? `${siteName} · ${tagline}`
        : siteName
      : `${label} · ${siteName}`;
}

export default router;
