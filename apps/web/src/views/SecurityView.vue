<!-- 账号安全：登录设备管理 + 微信绑定情况 + 最近的安全事件 -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BaseIcon from '@/components/BaseIcon.vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/composables/useToast';
import { relativeTime, formatDate } from '@/utils/format';

const auth = useAuthStore();
const router = useRouter();

const sessions = ref([]);
const identities = ref([]);
const loading = ref(true);
const error = ref('');
const busy = ref(false);

const sourceLabel = (source) => (source === 'wechat' ? '微信登录' : '账号密码');

const boundWechat = computed(() => identities.value.find((i) => i.channel));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [s, i] = await Promise.all([api.sessions(), api.identities()]);
    sessions.value = s.items;
    identities.value = i.wechat || [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function revokeAllOthers() {
  busy.value = true;
  try {
    await api.revokeOtherSessions();
    toast('其他设备已全部退出');
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    busy.value = false;
  }
}

async function logoutEverywhere() {
  busy.value = true;
  try {
    await api.revokeOtherSessions();
  } catch {
    /* 忽略，继续退出当前会话 */
  }
  await auth.logout({ redirect: '/' });
}

onMounted(async () => {
  await auth.restore();
  if (!auth.isAuthed) {
    router.replace('/login?redirect=/account/security');
    return;
  }
  await load();
});

/* ─────────────── 修改密码 ─────────────── */

const pw = ref({ current: '', next: '', confirm: '' });
const pwOpen = ref(false);
const pwSaving = ref(false);
const pwVisible = ref(false);

/** 密码至少 8 位；确认必须一致 */
const pwError = computed(() => {
  const { current, next, confirm } = pw.value;
  if (!current) return '请输入当前密码';
  if (!next) return '请输入新密码';
  if (next.length < 8) return '新密码至少 8 位';
  if (next === current) return '新密码不能与当前密码相同';
  if (next !== confirm) return '两次输入的新密码不一致';
  return '';
});

function openPw() {
  pw.value = { current: '', next: '', confirm: '' };
  pwOpen.value = true;
}

function closePw() {
  pwOpen.value = false;
  pwVisible.value = false;
  pw.value = { current: '', next: '', confirm: '' };
}

async function savePassword() {
  if (pwError.value) return;
  pwSaving.value = true;
  try {
    await api.changePassword(pw.value.current, pw.value.next);
    toast('密码已修改，其他设备已退出登录');
    closePw();
    await load();
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    pwSaving.value = false;
  }
}
</script>

<template>
  <div class="security u-container">
    <header class="head">
      <p class="eyebrow">账号安全</p>
      <h1 class="title">你的登录与授权</h1>
      <p class="lead">
        这里能看到当前账号的所有登录设备、微信绑定情况。发现陌生设备时，可以一键让它失效。
      </p>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <section class="block" aria-labelledby="identity-title">
      <h2 id="identity-title" class="block-title">身份</h2>
      <dl class="identity">
        <div>
          <dt>显示名</dt>
          <dd>{{ auth.user?.displayName || '—' }}</dd>
        </div>
        <div>
          <dt>角色</dt>
          <dd>{{ auth.isAuthor ? '作者（可写文章）' : '读者（仅登录）' }}</dd>
        </div>
        <div>
          <dt>微信绑定</dt>
          <dd>
            <template v-if="boundWechat">
              已绑定 · {{ boundWechat.nickname || '微信用户' }}
              <span class="muted">（{{ formatDate(boundWechat.createdAt) }}）</span>
            </template>
            <template v-else>未绑定</template>
          </dd>
        </div>
      </dl>
    </section>

    <!-- 修改密码 -->
    <section class="block" aria-labelledby="password-title">
      <div class="block-head">
        <h2 id="password-title" class="block-title">登录密码</h2>
        <button v-if="!pwOpen" type="button" class="ghost-btn u-press" @click="openPw">修改密码</button>
      </div>

      <p v-if="!pwOpen" class="block-lead">
        定期更换密码能降低账号被盗的风险。修改成功后，其他设备上的登录会自动失效。
      </p>

      <form v-else class="pw-form" @submit.prevent="savePassword">
        <div class="pw-fields">
          <label class="field">
            <span class="label">当前密码</span>
            <input
              v-model="pw.current"
              :type="pwVisible ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="输入当前使用的密码"
            />
          </label>
          <label class="field">
            <span class="label">新密码</span>
            <input
              v-model="pw.next"
              :type="pwVisible ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="至少 8 位"
            />
          </label>
          <label class="field">
            <span class="label">确认新密码</span>
            <input
              v-model="pw.confirm"
              :type="pwVisible ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="再输入一次"
              @keyup.enter="savePassword"
            />
          </label>
        </div>

        <label class="show-pw">
          <input v-model="pwVisible" type="checkbox" />
          <span>显示密码</span>
        </label>

        <p v-if="pwError && (pw.current || pw.next || pw.confirm)" class="pw-hint" role="status">{{ pwError }}</p>

        <div class="pw-actions">
          <button type="button" class="ghost-btn u-press" @click="closePw">取消</button>
          <button type="submit" class="primary-btn u-press" :disabled="pwSaving || Boolean(pwError)">
            {{ pwSaving ? '保存中…' : '保存新密码' }}
          </button>
        </div>
      </form>
    </section>

    <section class="block" aria-labelledby="sessions-title">
      <div class="block-head">
        <h2 id="sessions-title" class="block-title">登录设备</h2>
        <button v-if="sessions.length > 1" type="button" class="danger-btn u-press" :disabled="busy" @click="revokeAllOthers">
          让其他设备退出
        </button>
      </div>

      <div v-if="loading" class="skeleton-list" aria-hidden="true">
        <span v-for="i in 2" :key="i" class="u-skeleton sk-row" />
      </div>

      <ul v-else class="sessions">
        <li v-for="item in sessions" :key="item.id" class="session" :data-current="item.current">
          <span class="session-icon" aria-hidden="true">
            <BaseIcon :name="item.source === 'wechat' ? 'check' : 'signOut'" :size="14" />
          </span>
          <div class="session-main">
            <p class="session-device">
              {{ item.device }}
              <span v-if="item.current" class="badge">当前设备</span>
            </p>
            <p class="session-meta">
              {{ sourceLabel(item.source) }} · 最近活跃 {{ relativeTime(item.lastSeenAt) }} · 登录于 {{ formatDate(item.createdAt) }}
            </p>
          </div>
          <button
            v-if="!item.current"
            type="button"
            class="mini-btn u-press"
            :disabled="busy"
            @click="api.revokeSession(item.id).then(load)"
          >
            退出
          </button>
        </li>
      </ul>

      <p class="hint">
        会话保存在服务端的 HttpOnly Cookie 里，JavaScript 读不到；
        退出或过期后会立刻失效，不会像 JWT 那样一直有效到过期时间。
      </p>
    </section>

    <section class="block">
      <h2 class="block-title">全部退出</h2>
      <p class="hint">退出后需要重新登录。如果怀疑账号被他人使用，请先修改服务器上的 ADMIN_PASSWORD 再重新登录。</p>
      <button type="button" class="logout-all u-press" :disabled="busy" @click="logoutEverywhere">
        <BaseIcon name="signOut" :size="15" />
        退出所有设备
      </button>
    </section>
  </div>
</template>

<style scoped>
.security {
  max-width: 760px;
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.head {
  display: grid;
  gap: 0.7rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--rule);
}

.eyebrow {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}

.title {
  font-size: clamp(1.7rem, 1.3rem + 2vw, 2.4rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.lead {
  font-size: 0.95rem;
  line-height: 1.8;
  color: var(--ink-mid);
  max-width: 52ch;
}

.block {
  display: grid;
  gap: 0.9rem;
  padding-block: 1.75rem;
  border-bottom: 1px solid var(--rule);
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.block-title {
  font-size: 1.1rem;
  font-weight: 620;
  color: var(--ink);
}

.identity {
  display: grid;
  gap: 0.6rem;
}

.identity > div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.88rem;
}

.identity dt {
  color: var(--ink-soft);
}

.identity dd {
  color: var(--ink);
  text-align: right;
}

.muted {
  color: var(--ink-soft);
}

.sessions {
  list-style: none;
  display: grid;
  border-top: 1px solid var(--rule);
}

.session {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--rule);
}

.session-icon {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--rule);
  color: var(--ink-soft);
  flex-shrink: 0;
}

.session-main {
  flex: 1;
  min-width: 0;
}

.session-device {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 540;
  color: var(--ink);
}

.badge {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--accent);
}

.session-meta {
  margin-top: 0.15rem;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-soft);
}

.mini-btn,
.danger-btn,
.logout-all {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
}

.mini-btn:hover,
.logout-all:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.danger-btn {
  border-color: color-mix(in oklab, var(--accent) 45%, transparent);
  color: var(--accent);
}

.danger-btn:hover {
  background: var(--accent-soft);
}

.logout-all {
  justify-self: start;
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
}

.hint {
  font-size: 0.78rem;
  line-height: 1.7;
  color: var(--ink-soft);
}

/* 修改密码 */
.block-lead {
  font-size: 0.86rem;
  line-height: 1.7;
  color: var(--ink-mid);
  max-width: 60ch;
}

.ghost-btn,
.primary-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.7rem;
  border-radius: var(--radius-xs);
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
}

.ghost-btn {
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink-mid);
}

.ghost-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.primary-btn {
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
}

.primary-btn:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.pw-form {
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--rule);
  background: var(--paper-soft);
}

.pw-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.7rem;
}

.field {
  display: grid;
  gap: 0.3rem;
}

.label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.field input {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--paper-raised);
  color: var(--ink);
  font-family: inherit;
  font-size: 0.86rem;
}

.field input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.show-pw {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--ink-mid);
  cursor: pointer;
}

.show-pw input {
  accent-color: var(--accent);
}

.pw-hint {
  font-size: 0.78rem;
  color: var(--accent);
}

.pw-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}

.error {
  margin-top: 1rem;
  font-size: 0.82rem;
  color: var(--accent);
  padding: 0.5rem 0.7rem;
  border-left: 2px solid var(--accent);
  background: var(--accent-soft);
}

.skeleton-list {
  display: grid;
  gap: 0.6rem;
}

.sk-row {
  height: 52px;
  border-radius: var(--radius-sm);
}
</style>
