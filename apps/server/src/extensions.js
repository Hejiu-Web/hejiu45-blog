/**
 * ═══════════════════════════════════════════════════════════════
 *  扩展入口（二次开发入口 · 第二层）
 * ═══════════════════════════════════════════════════════════════
 *
 * 不改框架源码就能扩展行为的方式有四种，按「从轻到重」排列：
 *
 * 1) 后台配置 —— 站点名、标语、首页文案、文章类型、合集、自定义字段
 *    全部存数据库，在 /admin 里点点鼠标即可，不需要改代码。
 *
 * 2) 本文档的 hooks —— 在指定时机调用你自己的函数。
 *    每个 hook 都是「可选的」，没实现就跳过，不会报错。
 *
 * 3) 自定义路由 —— 新建 apps/server/src/routes/my-route.js，
 *    然后在 apps/server/src/index.js 里 `app.use('/api', myRoute)`。
 *
 * 4) 替换前端页面 —— apps/web/src/views/ 下的任何页面都可以改写；
 *    新增页面后到 apps/web/src/router/index.js 注册即可。
 *
 * 所有 hook 都必须是同步且快速的；如果要做重活（比如调用外部接口），
 * 请自行放进 setImmediate / 队列，避免拖慢请求。
 */

/**
 * @typedef {Object} Hooks
 * @property {(post: object, req: object) => void} [onPostCreated]
 *   文章创建后调用。post 是已保存到数据库的记录。
 * @property {(post: object, req: object) => void} [onPostUpdated]
 *   文章更新后调用（含草稿转发布）。
 * @property {(postId: string, req: object) => void} [onPostDeleted]
 *   文章删除后调用。
 * @property {(user: object, source: string, req: object) => void} [onUserLogin]
 *   登录成功后调用，source 为 'password' 或 'wechat'。
 * @property {(user: object) => void} [onUserRegistered]
 *   微信首次登录自动创建账号后调用。
 * @property {(media: object, req: object) => void} [onMediaUploaded]
 *   媒体上传完成后调用，可用于生成缩略图、送审、同步到对象存储。
 * @property {(payload: object) => object} [transformSiteInfo]
 *   返回站点信息前做最后一次加工（例如注入自定义埋点 ID）。
 */

/** @type {Hooks} */
export const hooks = {
  // 示例：文章发布时在服务器控制台打一行日志，便于确认扩展点接对了
  // onPostUpdated(post) {
  //   if (post.status === 'published') console.log('[hook] 新文章发布:', post.title);
  // },
};

/** 安全地调用 hook：单个 hook 抛错不会影响主流程 */
export function runHook(name, ...args) {
  const fn = hooks[name];
  if (typeof fn !== 'function') return undefined;
  try {
    return fn(...args);
  } catch (err) {
    console.warn(`[hook] ${name} 执行失败:`, err.message);
    return undefined;
  }
}

/**
 * 允许用环境变量额外加载一个扩展文件：
 *   EXTENSIONS_FILE=./my-extensions.js
 * 文件需要 `export default { hooks: {...}, routes: (app) => {} }`
 * 这样可以在不修改仓库的情况下接入自己的逻辑。
 */
export async function loadExtensions() {
  const file = process.env.EXTENSIONS_FILE;
  if (!file) return null;
  try {
    const mod = await import(new URL(file, `file://${process.cwd()}/`).href);
    const ext = mod.default || mod;
    if (ext.hooks) Object.assign(hooks, ext.hooks);
    console.log(`[ext] 已加载扩展：${file}`);
    return ext;
  } catch (err) {
    console.warn(`[ext] 扩展加载失败（${file}）：${err.message}`);
    return null;
  }
}
