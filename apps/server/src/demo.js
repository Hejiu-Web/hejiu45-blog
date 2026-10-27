/** 示例文章：既是首屏内容，也是写作格式的参考样本 */
export const demoPosts = [
  {
    slug: 'why-fast-matters',
    title: '速度为读者而做',
    tags: ['性能', '前端工程'],
    excerpt: '页面多等一秒，读者就少一分耐心。把性能当成排版的一部分来做。',
    views: 417,
    likes: 31,
    content: `## 一个被忽略的排版问题

排版讨论行高、字距、留白，却很少讨论**加载的那一秒**。可它同样决定读者读不读得下去。

## 三个习惯

- 首屏只加载首屏需要的东西，其余按需
- 图片永远写死宽高，别让版面跳一下
- 第三方脚本进去之前，先问它值不值那几十毫秒

## 一次真实的重构

把全站字体从网络加载换成系统字体后，首屏文字提前了 400 毫秒出现。没有人会为这件事鼓掌，但每一个打开页面的人都受益了。

> 最快的交互，是读者根本察觉不到的交互。
`,
  },
  {
    slug: 'a-quiet-web',
    title: '把网页做轻：一次关于克制的实践',
    tags: ['前端工程', '性能', '设计'],
    excerpt: '我们习惯用更多依赖换取更少的思考。这篇文章记录一次反向尝试：用最少的工具，把首屏压进 60KB。',
    featured: true,
    views: 1284,
    likes: 96,
    content: `## 起点

去年冬天，我把自己站点的构建产物打印出来，盯着那份依赖树看了很久。一个只需要读文章的地方，装下了整套前端生态。

于是有了这次重置：**去掉一切能自己去实现的抽象**，只留下浏览器原生能力和一个足够小的框架。

## 三条约束

1. 首屏 JavaScript 不超过 60KB（gzip 后）
2. 不引入运行时样式方案，样式全部是静态 CSS
3. 每个交互动画都必须能在 16ms 内完成一帧

> 性能不是优化的结果，而是约束的副产品。

## 关于动画

最容易失控的部分是动画。我的做法是先写下这句判断：

- **它能解释什么？** 如果答案只是"看起来更酷"，就删掉。

下面是最终保留下来的进入动画，只有一个属性在动：

\`\`\`js
const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.dataset.visible = 'true';
      io.unobserve(entry.target);
    }
  },
  { rootMargin: '-10% 0px' },
);

document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
\`\`\`

配合 CSS，滚动回调一次都不需要写：

\`\`\`css
[data-reveal] {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

[data-reveal][data-visible='true'] {
  opacity: 1;
  transform: none;
}
\`\`\`

## 结果

| 指标 | 改造前 | 改造后 |
| --- | --- | --- |
| 首屏 JS | 312 KB | 58 KB |
| LCP | 3.1 s | 1.2 s |
| 构建耗时 | 42 s | 3 s |

数字本身不重要，重要的是**每一次新增依赖，都重新需要回答一次"为什么"**。
`,
  },
  {
    slug: 'typography-without-noise',
    title: '中文排版里的留白，不只是间距',
    tags: ['设计', '排版'],
    views: 862,
    likes: 71,
    content: `排版常被误解为字体选择。真正决定阅读感受的，是**行高、字距、以及字与容器之间的呼吸**。

## 行宽

中文正文的最佳行长大约在 30 到 40 个字之间。再宽，眼睛回溯的路径就变得太远；再窄，换行过于频繁，节奏被打碎。

\`\`\`css
.prose {
  max-width: 66ch;
  font-size: 1.0625rem;
  line-height: 1.8;
}
\`\`\`

## 字距

中文不需要 \`letter-spacing\`，这一点和西文不同。在标题上稍微收紧，在标签上稍微放开，就够了。

## 段落间距

段落之间用 \`em\` 而不是固定像素，行高随字号一起呼吸，小屏和演示投屏都不会失衡。

> 留白不是空，它是节奏。`,
  },
  {
    slug: 'state-without-libraries',
    title: '用组合式函数替代半个状态库',
    tags: ['Vue', '前端工程'],
    views: 941,
    likes: 63,
    content: `当项目只有一两个跨组件状态时，引入完整的状态库往往得不偿失。Vue 的组合式函数已经提供了足够的能力。

## 一个带缓存的请求

\`\`\`js
import { ref, shallowRef } from 'vue';

export function useResource(fetcher, { key } = {}) {
  const data = shallowRef(null);
  const pending = ref(false);
  const error = ref(null);
  let inflight = null;

  async function load(params) {
    const id = key ? key(params) : JSON.stringify(params);
    if (inflight === id) return data.value;
    inflight = id;
    pending.value = true;
    error.value = null;
    try {
      data.value = await fetcher(params);
    } catch (err) {
      error.value = err;
    } finally {
      if (inflight === id) {
        pending.value = false;
        inflight = null;
      }
    }
    return data.value;
  }

  return { data, pending, error, load };
}
\`\`\`

这段代码带来了去重、竞态保护和错误态，代价是 30 行。

## 什么时候该用 Pinia

- 状态跨越三处以上的远程组件
- 需要 DevTools 时间旅行
- 需要持久化策略

除此之外，组合式函数往往更直接。`,
  },
  {
    slug: 'motion-that-explains',
    title: '动效的唯一职责：解释变化',
    tags: ['动画', '设计'],
    views: 1107,
    likes: 84,
    content: `动效不是装饰。它存在的理由只有四个：

1. **层级**：把注意力引向该看的地方
2. **叙事**：按顺序揭示内容
3. **反馈**：确认用户的操作
4. **状态迁移**：说明某件事发生了变化

## 一条评价标准

如果删掉这个动画后，用户依然能准确理解界面发生了什么，它就值得删掉。

## 缓动

\`\`\`css
:root {
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
\`\`\`

进入用 expo，离开用更快的曲线，弹性只留给真正"弹"的东西。

## 尊重系统设置

\`\`\`css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
\`\`\`

这一小段代码，是很多产品至今都没做的事。`,
  },
  {
    slug: 'sqlite-is-enough',
    title: '一个博客，SQLite 就够了',
    tags: ['后端', 'Node.js'],
    views: 735,
    likes: 58,
    content: `**SQLite 不是玩具。** 它是被部署最广泛的数据库引擎，处理一个个人博客的读写绰绰有余。

## 为什么

- 零运维：一个文件就是全部
- 备份：\`cp blog.db backup.db\`
- 延迟：本地文件读取，无需网络往返
- WAL 模式下读写可以并行

## 迁移到 Postgres 的时机

当出现下面任一情况时再考虑：

- 需要多写节点并发
- 需要复杂的全文检索
- 需要跨地域读取

在那之前，**先让内容变多，再让机器变多**。

\`\`\`js
db.pragma('journal_mode = WAL');
db.prepare('SELECT * FROM posts WHERE status = ?').all('published');
\`\`\``,
  },
  {
    slug: 'notes-on-writing-daily',
    title: '写作是另一种重构',
    tags: ['随笔'],
    type: 'note',
    fields: { mood: '平静', location: '书桌前' },
    views: 612,
    likes: 44,
    content: `写代码和写文章，共享同一套动作：

**先跑通，再优化。**

第一稿永远很糟。它的作用不是被保存，而是被修改。程序员对此应该非常熟悉——先让测试通过，再让代码变好。

## 我的流程

1. 用一句话写下这篇文章要解决的问题
2. 不查资料，直接写完
3. 隔一天再读，删掉三分之一
4. 朗读一遍，卡住的地方就是需要改的地方

## 关于公开

公开写作最大的收益不是被阅读，而是**被迫想清楚**。

> 想不清楚的地方，写出来一定读不懂。`,
  },
];
