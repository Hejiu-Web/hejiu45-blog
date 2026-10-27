/**
 * ═══════════════════════════════════════════════════════════════
 *  站点配置（二次开发入口 · 第一层）
 * ═══════════════════════════════════════════════════════════════
 *
 * 改这里不需要动任何组件代码。运行时的站点名、标语、首页文案等
 * 可以在后台「站点设置」里改（存在数据库里，优先级高于本文件），
 * 这里是仓库里的默认值与主题级配置。
 */

export const site = {
  // 站点名与身份
  name: '鹤酒',
  domain: 'hejiu45',
  tagline: '写代码，也写生活里的留白',
  description: '一个关于前端工程、视觉设计与长期主义的个人空间。',

  // 首页首屏
  heroTitle: ['把想法', '写下来。'],
  heroLead: '一个关于前端工程、视觉设计与长期主义的个人空间。',

  // 导航（label 与 path；path 可以是静态页面，也可以是某个文章类型的 route）
  nav: [
    { label: '首页', to: '/' },
    { label: '归档', to: '/archive' },
    { label: '合集', to: '/collections' },
    { label: '标签', to: '/tags' },
    { label: '搜索', to: '/search' },
    { label: '关于', to: '/about' },
  ],

  // 页脚
  footerLinks: [
    { label: '归档', to: '/archive' },
    { label: '合集', to: '/collections' },
    { label: '标签', to: '/tags' },
    { label: '关于', to: '/about' },
  ],

  // 社交/外链（可留空）
  social: [],

  // 主题偏好
  // 头像加载失败或未设置时，用名字首字作为占位
  avatarFallback: '首字',
};
