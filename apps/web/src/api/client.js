/**
 * 极小的 fetch 封装。
 *
 * 会话认证改用服务端 Session + HttpOnly Cookie：
 *  - 浏览器自动携带 Cookie，前端不再存储任何令牌
 *  - 写操作带上内存里的 CSRF 令牌（X-CSRF-Token），令牌只活在 JS 变量里
 *  - 因此 localStorage 里没有任何可被 XSS 偷走的东西
 */
import { HttpError } from '@/api/errors';

const state = {
  csrf: '',
  onUnauthorized: null,
};

export function setCsrf(token) {
  state.csrf = token || '';
}

export function getCsrf() {
  return state.csrf;
}

export function onUnauthorized(handler) {
  state.onUnauthorized = handler;
}

export { HttpError };

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function request(path, { method = 'GET', body, headers = {}, signal, public: isPublic = false } = {}) {
  const init = {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(WRITE_METHODS.has(method) && state.csrf ? { 'X-CSRF-Token': state.csrf } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new HttpError(0, '网络连接失败，请检查网络后重试', 'NETWORK');
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    // 会话失效：通知上层清空登录态，但不在这里做跳转，保持职责单一
    if (res.status === 401 && !isPublic && state.onUnauthorized) state.onUnauthorized(data);
    throw new HttpError(res.status, data.error || `请求失败（${res.status}）`, data.code);
  }
  return data;
}

const qs = (params = {}) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};

/** 二进制上传：进度条由 XHR 提供（fetch 无法读上传进度） */
function uploadBinary(path, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    if (state.csrf) xhr.setRequestHeader('X-CSRF-Token', state.csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* 空响应 */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new HttpError(xhr.status, data.error || '上传失败', data.code));
    };
    xhr.onerror = () => reject(new HttpError(0, '网络连接失败', 'NETWORK'));
    xhr.send(file);
  });
}

export const api = {
  listPosts: (params) => request(`/posts${qs(params)}`),
  featured: () => request('/posts/featured'),
  getPost: (slug, opts) => request(`/posts/${encodeURIComponent(slug)}${qs(opts?.query)}`, opts),
  tags: () => request('/tags'),
  react: (id, kind = 'like') => request(`/posts/${id}/react`, { method: 'POST', body: { kind }, public: true }),

  session: () => request('/auth/session', { public: true }),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password }, public: true }),
  logout: () => request('/auth/logout', { method: 'POST', public: true }),
  me: () => request('/auth/me'),
  sessions: () => request('/auth/sessions'),
  revokeSession: (id) => request(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  revokeOtherSessions: () => request('/auth/sessions/revoke-others', { method: 'POST' }),
  identities: () => request('/auth/identities'),

  wechatStart: (redirect) => request('/auth/wechat/start', { method: 'POST', body: { redirect }, public: true }),
  updateProfile: (patch) => request('/auth/profile', { method: 'PUT', body: patch }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', { method: 'PUT', body: { currentPassword, newPassword } }),

  siteInfo: () => request('/site', { public: true }),
  types: () => request('/types', { public: true }),
  typePosts: (route, params) => request(`/types/${encodeURIComponent(route)}/posts${qs(params)}`, { public: true }),
  collections: () => request('/collections', { public: true }),
  collection: (slug) => request(`/collections/${encodeURIComponent(slug)}`, { public: true }),
  search: (params) => request(`/search${qs(params)}`, { public: true }),
  suggest: (q) => request(`/search/suggest${qs({ q })}`, { public: true }),

  /* 作品集 */
  works: (params) => request(`/works${qs(params)}`, { public: true }),
  work: (slug) => request(`/works/${encodeURIComponent(slug)}`, { public: true }),
  adminWorks: () => request('/admin/works'),
  createWork: (payload) => request('/admin/works', { method: 'POST', body: payload }),
  updateWork: (id, payload) => request(`/admin/works/${id}`, { method: 'PUT', body: payload }),
  deleteWork: (id) => request(`/admin/works/${id}`, { method: 'DELETE' }),
  reorderWorks: (ids) => request('/admin/works/reorder', { method: 'POST', body: { ids } }),
  bulkWorks: (action, ids) => request('/admin/works/bulk', { method: 'POST', body: { action, ids } }),
  duplicateWork: (id) => request(`/admin/works/${id}/duplicate`, { method: 'POST' }),

  createType: (payload) => request('/admin/types', { method: 'POST', body: payload }),
  updateType: (id, payload) => request(`/admin/types/${id}`, { method: 'PUT', body: payload }),
  deleteType: (id) => request(`/admin/types/${id}`, { method: 'DELETE' }),

  /* 标签管理 */
  adminTags: () => request('/admin/tags'),
  updateTag: (name, payload) => request(`/admin/tags/${encodeURIComponent(name)}`, { method: 'PUT', body: payload }),
  renameTag: (name, to) => request(`/admin/tags/${encodeURIComponent(name)}/rename`, { method: 'POST', body: { to } }),
  mergeTag: (name, into) => request(`/admin/tags/${encodeURIComponent(name)}/merge`, { method: 'POST', body: { into } }),
  deleteTag: (name) => request(`/admin/tags/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  createCollection: (payload) => request('/admin/collections', { method: 'POST', body: payload }),
  updateCollection: (id, payload) => request(`/admin/collections/${id}`, { method: 'PUT', body: payload }),
  deleteCollection: (id) => request(`/admin/collections/${id}`, { method: 'DELETE' }),
  collectionItems: (id) => request(`/admin/collections/${id}/items`),
  setCollectionItems: (id, postIds) => request(`/admin/collections/${id}/items`, { method: 'PUT', body: { postIds } }),
  toggleCollectionItem: (id, postId) => request(`/admin/collections/${id}/toggle`, { method: 'POST', body: { postId } }),
  settings: () => request('/admin/settings'),
  saveSettings: (payload) => request('/admin/settings', { method: 'PUT', body: payload }),

  mediaList: (params) => request(`/media${qs(params)}`),
  deleteMedia: (id) => request(`/media/${id}`, { method: 'DELETE' }),
  uploadMedia: (file) => uploadBinary('/media', file),
  uploadWithProgress: (path, file, onProgress) => uploadBinary(path, file, onProgress),
  uploadAvatar: (file) => uploadBinary('/avatar', file),

  adminPosts: () => request('/admin/posts'),
  preview: (content) => request('/preview', { method: 'POST', body: { content } }),
  createPost: (payload) => request('/posts', { method: 'POST', body: payload }),
  updatePost: (id, payload) => request(`/posts/${id}`, { method: 'PUT', body: payload }),
  deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
  createCover: (payload) => request('/covers', { method: 'POST', body: payload }),

  upload: async (file) => {
    const res = await fetch('/api/upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-CSRF-Token': state.csrf },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status, data.error || '上传失败', data.code);
    return data;
  },
};
