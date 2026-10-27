<!--
  登录：微信扫码 + 作者账号密码两种方式。
  微信通道未配置时明确提示需要哪些环境变量，而不是给一个点不动的按钮。
-->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/composables/useToast';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const username = ref('');
const password = ref('');
const error = ref('');
const showPassword = ref(false);
const tab = ref('wechat');

const redirect = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/'));

/** 微信回调带回来的失败原因 */
const wechatError = computed(() => (typeof route.query.message === 'string' ? route.query.message : ''));
const wechatCode = computed(() => (typeof route.query.wechat === 'string' ? route.query.wechat : ''));

const wechat = computed(() => auth.wechat || {});

onMounted(async () => {
  // 有微信回调信息时先展示，不要被「已登录」直接跳走
  if (wechatError.value) {
    error.value = wechatError.value;
    toast(wechatError.value, { tone: 'error' });
  }
  await auth.restore();
  // 已登录直接回目标页；否则停留在扫码页签 —— 未配置时该页签会展示配置说明
  if (auth.isAuthed && !wechatError.value) router.replace(redirect.value);
});

async function submit() {
  error.value = '';
  if (!username.value.trim() || !password.value) {
    error.value = '请把账号和密码都填上';
    return;
  }
  try {
    await auth.login(username.value.trim(), password.value);
    toast('登录成功');
    router.replace(auth.isAuthor ? (redirect.value === '/' ? '/admin' : redirect.value) : redirect.value);
  } catch (err) {
    error.value = err.message || '登录失败';
  }
}

async function startWechat() {
  error.value = '';
  try {
    await auth.startWechat(redirect.value);
  } catch (err) {
    error.value = err.message || '无法发起微信登录';
  }
}

const SCENES = [
  {
    icon: 'check',
    title: '只拿必要的身份信息',
    text: '服务端只保存微信的 openid / unionid 与昵称头像，不保存手机号、地区等与登录无关的数据。',
  },
  {
    icon: 'link',
    title: '一次授权，换一次登录',
    text: '授权码在你的浏览器与服务器之间一次性使用，10 分钟内有效，用过即作废。',
  },
  {
    icon: 'signOut',
    title: '随时可以踢下线',
    text: '在「账号安全」里能看到所有登录设备，并一键让其他设备失效。',
  },
];
</script>

<template>
  <div class="login u-container">
    <div class="login-grid">
      <div class="login-aside">
        <p class="aside-mark" aria-hidden="true">和</p>
        <h1 class="aside-title">用微信，或者账号登录。</h1>
        <p class="aside-text">
          微信登录后是一个普通读者账号：可以登录、查看自己的登录设备。
          写文章仍然需要作者账号，两者可以绑定在同一个身份下。
        </p>

        <ul class="scenes">
          <li v-for="scene in SCENES" :key="scene.title">
            <span class="scene-icon"><BaseIcon :name="scene.icon" :size="14" /></span>
            <div>
              <p class="scene-title">{{ scene.title }}</p>
              <p class="scene-text">{{ scene.text }}</p>
            </div>
          </li>
        </ul>
      </div>

      <div class="login-card">
        <div class="tabs" role="tablist" aria-label="登录方式">
          <button
            type="button"
            role="tab"
            class="tab u-press"
            :class="{ 'is-active': tab === 'wechat' }"
            :aria-selected="tab === 'wechat'"
            @click="tab = 'wechat'"
          >
            <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8.7 4C4.9 4 2 6.4 2 9.4c0 1.7.9 3.2 2.4 4.2l-.6 1.8 2.1-1.1c.7.2 1.5.3 2.3.3h.5a5 5 0 0 1-.2-1.4c0-3 2.9-5.4 6.5-5.4h.4C15.1 5.7 12.2 4 8.7 4Zm-2.3 3.1a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"
              />
              <path
                fill="currentColor"
                d="M22 13.2c0-2.5-2.4-4.5-5.4-4.5s-5.4 2-5.4 4.5 2.4 4.5 5.4 4.5c.6 0 1.3-.1 1.9-.3l1.8.9-.5-1.5c1.4-.9 2.2-2.2 2.2-3.6Zm-7.2-1.2a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm3.6 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z"
              />
            </svg>
            微信扫码
          </button>
          <button
            type="button"
            role="tab"
            class="tab u-press"
            :class="{ 'is-active': tab === 'password' }"
            :aria-selected="tab === 'password'"
            @click="tab = 'password'"
          >
            <BaseIcon name="signOut" :size="14" />
            账号密码
          </button>
        </div>

        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <!-- 微信扫码 -->
        <div v-if="tab === 'wechat'" class="pane-wechat">
          <div v-if="wechat.enabled" class="qr-box">
            <button type="button" class="qr-trigger u-press" :disabled="auth.pending" @click="startWechat">
              <span class="qr-frame" aria-hidden="true">
                <svg viewBox="0 0 24 24" class="qr-glyph">
                  <rect x="2" y="2" width="7" height="7" rx="1.5" />
                  <rect x="15" y="2" width="7" height="7" rx="1.5" />
                  <rect x="2" y="15" width="7" height="7" rx="1.5" />
                  <path d="M15 15h3v3h-3zM20 20h2v2h-2zM20 15h2v2h-2zM15 20h2v2h-2z" />
                </svg>
              </span>
              <span class="qr-label">{{ auth.pending ? '正在前往微信…' : '点击生成登录二维码' }}</span>
            </button>
            <p class="qr-hint">
              点击后跳转到微信官方授权页，用手机微信扫码并确认即可登录。
              跳转域名是 open.weixin.qq.com，不会经过任何第三方。
            </p>
          </div>

          <div v-else class="qr-disabled">
            <BaseIcon name="warning" :size="18" />
            <div>
              <p class="qr-disabled-title">微信登录尚未配置</p>
              <p class="qr-disabled-text">
                管理员需要在 <code>.env</code> 中填写 WECHAT_CHANNEL、WECHAT_APP_ID、WECHAT_APP_SECRET，
                并把授权回调域名设为本站域名下的 <code>/api/auth/wechat/callback</code>。
              </p>
              <p v-if="wechat.reason" class="qr-disabled-reason">当前状态：{{ wechat.reason }}</p>
              <p v-if="wechatCode" class="qr-disabled-reason">回调码：{{ wechatCode }}</p>
            </div>
          </div>

          <button type="button" class="switch u-press" @click="tab = 'password'">
            使用作者账号密码登录
            <BaseIcon name="arrowRight" :size="14" />
          </button>
        </div>

        <!-- 账号密码 -->
        <form v-else class="pane-password" novalidate @submit.prevent="submit">
          <div class="field">
            <label for="username">账号</label>
            <input
              id="username"
              v-model="username"
              type="text"
              autocomplete="username"
              placeholder="作者账号"
              required
            />
          </div>

          <div class="field">
            <label for="password">密码</label>
            <div class="password-wrap">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="输入密码"
                required
              />
              <button
                type="button"
                class="toggle u-press"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <BaseIcon :name="showPassword ? 'eye' : 'close'" :size="15" />
              </button>
            </div>
            <p class="helper">
              连续失败 5 次将锁定 15 分钟。账号由管理员在服务器 <code>.env</code> 中配置。
            </p>
          </div>

          <button type="submit" class="submit u-press" :disabled="auth.pending">
            <span v-if="auth.pending" class="spin" aria-hidden="true"><BaseIcon name="spinner" :size="15" /></span>
            {{ auth.pending ? '登录中' : '登录' }}
          </button>
        </form>

        <p class="privacy">
          继续即表示同意本站仅将登录信息用于身份识别。我们不收集与登录无关的个人数据。
        </p>

        <ul class="security-notes" aria-label="登录安全说明">
          <li>会话保存在 HttpOnly Cookie 中，脚本无法读取</li>
          <li>每次登录都会生成独立会话，可随时在账号安全页踢下线</li>
          <li>连续失败会自动锁定，登录请求按 IP 限流</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login {
  padding-top: clamp(2.5rem, 6vw, 4.5rem);
}

.login-grid {
  display: grid;
  gap: 2.5rem;
  max-width: 980px;
}

.aside-mark {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--ink);
  color: var(--paper);
  font-weight: 700;
  margin-bottom: 1.5rem;
}

.aside-title {
  font-size: clamp(1.7rem, 1.25rem + 2vw, 2.5rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.2;
  color: var(--ink);
}

.aside-text {
  margin-top: 1rem;
  font-size: 0.95rem;
  line-height: 1.8;
  color: var(--ink-mid);
  max-width: 44ch;
}

.scenes {
  list-style: none;
  display: grid;
  gap: 1rem;
  margin-top: 1.75rem;
  max-width: 46ch;
}

.scenes li {
  display: flex;
  gap: 0.7rem;
}

.scene-icon {
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid var(--rule);
  color: var(--accent);
  margin-top: 0.1rem;
}

.scene-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink);
}

.scene-text {
  margin-top: 0.2rem;
  font-size: 0.82rem;
  line-height: 1.65;
  color: var(--ink-soft);
}

.login-card {
  display: grid;
  gap: 1.1rem;
  align-content: start;
  padding: clamp(1.25rem, 3vw, 1.75rem);
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  box-shadow: var(--shadow-lift);
  width: 100%;
  max-width: 420px;
}

.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
  padding: 0.22rem;
  border-radius: var(--radius-sm);
  background: var(--paper-soft);
  border: 1px solid var(--rule);
}

.tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 0.4rem;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.84rem;
  cursor: pointer;
}

.tab.is-active {
  background: var(--paper-raised);
  color: var(--ink);
  box-shadow: var(--shadow-lift);
}

.tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tab-icon {
  width: 15px;
  height: 15px;
}

.pane-wechat {
  display: grid;
  gap: 0.9rem;
}

.qr-box {
  display: grid;
  gap: 0.75rem;
}

.qr-trigger {
  display: grid;
  place-items: center;
  gap: 0.7rem;
  padding: 1.35rem 1rem;
  border-radius: var(--radius-md);
  border: 1px dashed var(--rule-strong);
  background: var(--paper);
  color: var(--ink-mid);
  cursor: pointer;
  transition: border-color 0.25s ease, background-color 0.25s ease, color 0.25s ease;
}

.qr-trigger:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.qr-trigger:disabled {
  cursor: progress;
}

.qr-frame {
  display: grid;
  place-items: center;
  width: 118px;
  height: 118px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
}

.qr-glyph {
  width: 62px;
  height: 62px;
  fill: currentColor;
  opacity: 0.8;
}

.qr-label {
  font-size: 0.86rem;
  font-weight: 560;
}

.qr-hint {
  font-size: 0.75rem;
  line-height: 1.65;
  color: var(--ink-soft);
}

.qr-disabled {
  display: flex;
  gap: 0.7rem;
  padding: 0.9rem;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in oklab, var(--accent) 35%, transparent);
  background: var(--accent-soft);
  color: var(--ink-mid);
}

.qr-disabled svg {
  color: var(--accent);
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.qr-disabled-title {
  font-size: 0.88rem;
  font-weight: 620;
  color: var(--ink);
}

.qr-disabled-text,
.qr-disabled-reason {
  margin-top: 0.35rem;
  font-size: 0.78rem;
  line-height: 1.65;
}

.qr-disabled-reason {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-soft);
}

.switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.45rem;
  border: 0;
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.8rem;
  cursor: pointer;
}

.switch:hover {
  color: var(--accent);
}

.pane-password {
  display: grid;
  gap: 1rem;
}

.field {
  display: grid;
  gap: 0.4rem;
}

.field label {
  font-size: 0.82rem;
  font-weight: 560;
  color: var(--ink);
}

.field input {
  width: 100%;
  padding: 0.62rem 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  color: var(--ink);
  font-size: 0.92rem;
  font-family: inherit;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.field input::placeholder {
  color: var(--ink-soft);
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.password-wrap {
  position: relative;
}

.password-wrap input {
  padding-right: 2.4rem;
}

.toggle {
  position: absolute;
  right: 0.35rem;
  top: 50%;
  transform: translateY(-50%);
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-xs);
  border: 0;
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
}

.toggle:hover {
  color: var(--ink);
}

.helper {
  font-size: 0.74rem;
  line-height: 1.6;
  color: var(--ink-soft);
}

.helper code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  color: var(--ink-mid);
}

.error {
  font-size: 0.82rem;
  color: var(--accent);
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  border-left: 2px solid var(--accent);
}

.submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  font-size: 0.92rem;
  cursor: pointer;
}

.submit:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.submit:disabled {
  opacity: 0.7;
  cursor: progress;
}

.spin {
  display: inline-grid;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.privacy {
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--ink-soft);
  border-top: 1px solid var(--rule);
  padding-top: 0.8rem;
}

.security-notes {
  list-style: none;
  display: grid;
  gap: 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  line-height: 1.6;
  color: var(--ink-soft);
}

.security-notes li {
  position: relative;
  padding-left: 0.9rem;
}

.security-notes li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.62em;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.7;
}

@media (min-width: 900px) {
  .login-grid {
    grid-template-columns: minmax(0, 1fr) 420px;
    gap: 4rem;
    align-items: start;
  }

  .login-card {
    position: sticky;
    top: calc(var(--header-h) + 2rem);
  }
}
</style>
