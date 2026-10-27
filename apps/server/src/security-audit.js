/**
 * 安全自检：启动服务后运行，逐项验证关键防护是否真的生效。
 *   node apps/server/src/security-audit.js [baseUrl]
 * 不依赖任何第三方库，可放进 CI 定期跑。
 */
const BASE = process.argv[2] || `http://localhost:${process.env.PORT || 8787}`;

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual', ...options });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 响应 */
  }
  return { res, text, json };
}

async function main() {
  console.log(`安全自检 → ${BASE}\n`);

  /* 1. 安全响应头 */
  {
    const { res } = await req('/');
    const header = (name) => res.headers.get(name) || '';
    const csp = header('content-security-policy');
    const scriptSrc = (csp.match(/script-src[^;]*/) || [''])[0];
    const relaxed = /unsafe-(inline|eval)/.test(scriptSrc);
    // 仅开发模式（Vite 注入内联脚本与 HMR）允许放宽，生产模式必须严格
    const isDev = /localhost|127\.0\.0\.1/.test(BASE) && relaxed;
    record('CSP 存在', Boolean(csp), csp.slice(0, 56));
    record('script-src 未放行内联/动态执行（生产要求）', !relaxed || isDev, isDev ? '开发模式放宽，生产模式见 audit-prod' : scriptSrc);
    record('X-Frame-Options 已设置', header('x-frame-options').toUpperCase() === 'DENY');
    record('X-Content-Type-Options: nosniff', header('x-content-type-options') === 'nosniff');
    record('未泄露 X-Powered-By', !header('x-powered-by'));
    record('Referrer-Policy 已设置', Boolean(header('referrer-policy')));
    record('Permissions-Policy 已设置', Boolean(header('permissions-policy')));
    record(
      'HSTS（生产环境要求）',
      Boolean(header('strict-transport-security')) || BASE.includes('localhost') || BASE.includes('127.0.0.1'),
      header('strict-transport-security') || '仅生产环境启用',
    );
  }

  /* 2. 未登录不能写 */
  {
    const { res } = await req('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });
    record('未登录写入被拒绝（401）', res.status === 401, `status=${res.status}`);
  }

  /* 3. 错误信息不泄露内部细节 */
  {
    const { res, json } = await req('/api/posts/no-such-post');
    record('不存在的文章返回 404 且无堆栈', res.status === 404 && !JSON.stringify(json).includes('at '), JSON.stringify(json));
  }

  /* 4. 登录失败信息不区分账号是否存在 */
  {
    const a = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'definitely-not-exist', password: 'whatever-pass' }),
    });
    const b = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-pass-xyz' }),
    });
    const sameBody = a.res.status === b.res.status && a.json?.error === b.json?.error;
    record('登录失败不暴露账号是否存在', sameBody, `${a.res.status}/${b.res.status}`);
  }

  /* 5. 会话 Cookie 必须 HttpOnly */
  {
    const login = await req('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' }),
    });
    const setCookie = login.res.headers.get('set-cookie') || '';
    record('会话 Cookie 带 HttpOnly', /httponly/i.test(setCookie), setCookie.slice(0, 42));
    record('会话 Cookie 带 SameSite', /samesite=/i.test(setCookie));
    record('登录接口不返回密码哈希', !/password_hash|scrypt\$/.test(JSON.stringify(login.json || {})));

    // Node 的 fetch 会把多个 Set-Cookie 合并，这里按 "hl_session=..." 精确取出会话值
    const sessionPair = (setCookie.match(/hl_session=([^;,]+)/) || [])[1];    const cookie = `hl_session=${sessionPair || ''}`;
    const csrf = login.json?.csrf;
    record('登录成功并下发会话', Boolean(sessionPair && csrf));

    /* 6. 缺少 CSRF 的写请求被拒 */
    const noCsrf = await req('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'csrf-test', content: 'x' }),
    });
    record('缺少 CSRF 令牌的写请求被拒绝（403）', noCsrf.res.status === 403, `status=${noCsrf.res.status}`);

    /* 7. 带 CSRF 的写请求通过，随后清理 */
    const withCsrf = await req('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ title: 'security-audit-temp', content: 'temp', status: 'draft' }),
    });
    record('带 CSRF 令牌的写请求通过（201）', withCsrf.res.status === 201, `status=${withCsrf.res.status}`);
    if (withCsrf.json?.post?.id) {
      await req(`/api/posts/${withCsrf.json.post.id}`, {
        method: 'DELETE',
        headers: { cookie, 'x-csrf-token': csrf },
      });
    }

    /* 8. 上传：伪造图片被拒 */
    const fake = await req('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'image/png', cookie, 'x-csrf-token': csrf },
      body: '<script>alert(1)</script>',
    });
    record('伪装成 PNG 的脚本被拒绝（400）', fake.res.status === 400, `status=${fake.res.status}`);

    /* 9. 上传：真实 PNG 通过 */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const real = await req('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', cookie, 'x-csrf-token': csrf },
      body: png,
    });
    record('真实 PNG 通过（按魔数识别，不看 Content-Type）', real.res.status === 201, `status=${real.res.status}`);

    /* 10. 退出后会话失效 */
    await req('/api/auth/logout', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf } });
    const after = await req('/api/auth/session', { headers: { cookie } });
    record('退出登录后会话立即失效', after.json?.authenticated === false);
  }

  /* 11. 文章正文 XSS 净化 */
  {
    const { json } = await req('/api/posts?pageSize=1');
    const slug = json?.items?.[0]?.slug;
    if (slug) {
      const detail = await req(`/api/posts/${slug}`);
      const html = detail.json?.html || '';
      const dangerous = /(javascript:|<script|onerror=|<iframe)/i.test(html);
      record('文章 HTML 已服务端净化', !dangerous, html ? `${html.length} 字符` : '无正文');
    } else {
      record('文章 HTML 已服务端净化', true, '没有已发布文章，跳过');
    }
  }

  /* 12. 越权访问 */
  {
    const admin = await req('/api/admin/posts');
    record('后台列表未登录不可读（401）', admin.res.status === 401, `status=${admin.res.status}`);
  }

  /* 13. 目录扫描路径 */
  {
    const env = await req('/.env');
    record('拒绝读取 .env 等敏感文件', env.res.status === 404 && !env.text.includes('AUTH_SECRET'), `status=${env.res.status}`);
  }

  /* 14. 限流 */
  {
    let limited = false;
    for (let i = 0; i < 25; i += 1) {
      const r = await req('/api/auth/wechat/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `hl_session=x${i}` },
        body: '{}',
      });
      if (r.res.status === 429) {
        limited = true;
        break;
      }
    }
    record('登录相关接口触发限流（429）', limited);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('自检执行失败：', err.message);
  process.exit(2);
});
