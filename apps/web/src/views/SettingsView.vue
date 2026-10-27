<!-- 站点设置：站点名、标语、首页文案、作者信息、页脚，改完立即生效 -->
<script setup>
import { computed, onMounted, ref } from 'vue';
import BaseIcon from '@/components/BaseIcon.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import { api } from '@/api/client';
import { useSiteStore } from '@/stores/site';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/composables/useToast';

const site = useSiteStore();
const auth = useAuthStore();
const form = ref({});
const profile = ref({ displayName: auth.displayName || '', bio: auth.user?.bio || '', avatar: auth.user?.avatar || '' });
const avatarRef = ref(null);
const avatarUploading = ref(false);
const saving = ref(false);
const loading = ref(true);

const GROUPS = [
  {
    title: '站点',
    hint: '站点名会出现在导航、页脚、浏览器标题与所有默认文案里。',
    fields: [
      { key: 'siteName', label: '站点名', hint: '出现在导航、页脚与浏览器标题' },
      { key: 'siteTagline', label: '标语', hint: '一句话说明这个站点' },
      { key: 'siteDescription', label: '站点描述', hint: '用于 SEO 与分享卡片' },
    ],
  },
  {
    title: '首页巨幕',
    hint: '首页第一屏的大标题、副标题和按钮文字。',
    fields: [
      { key: 'heroTitle', label: '巨幕大标题', hint: '建议不超过 12 个字；超过 6 个字会自动断成两行', type: 'textarea', rows: 2 },
      { key: 'heroLead', label: '巨幕副标题', hint: '留空则自动使用最新文章摘要', type: 'textarea', rows: 3 },
      { key: 'heroKicker', label: '标题上方小标签', hint: '可选，例如「长期主义」' },
      { key: 'heroPrimaryLabel', label: '主按钮文字', hint: '默认「读最新一篇」' },
      { key: 'heroSecondaryLabel', label: '次按钮文字', hint: '默认「全部文章」' },
    ],
  },
  {
    title: '首页区块标题',
    fields: [
      { key: 'sectionRecentTitle', label: '精选区块标题', hint: '默认「读者最常停下来的几篇」' },
      { key: 'sectionRecentLead', label: '精选区块说明' },
      { key: 'sectionLatestTitle', label: '最新文章标题', hint: '默认「最近写的」' },
      { key: 'sectionLatestLead', label: '最新文章说明', hint: '可留空' },
    ],
  },
  {
    title: '作者',
    fields: [
      { key: 'authorName', label: '作者名', hint: '' },
      { key: 'authorBio', label: '作者简介', hint: '也会作为关于页的默认副标题' },
    ],
  },
  {
    title: '页脚',
    fields: [
      { key: 'footerText', label: '版权文案', hint: '留空自动生成「© 年份 站点名」' },
      { key: 'icp', label: '备案号', hint: '例如 粤ICP备xxxxxxxx号' },
      { key: 'rssTitle', label: 'RSS 标题', hint: '留空使用站点名' },
    ],
  },
];

/* ── 关于页 ── */
const ABOUT_FIELDS = [
  { key: 'aboutTitle', label: '页面标题', hint: '留空使用站点名' },
  { key: 'aboutLead', label: '一句话介绍', hint: '留空使用作者简介' },
  { key: 'aboutLocation', label: '坐标', hint: '如「中国 · 远程」，留空则不显示' },
  { key: 'aboutSince', label: '写于', hint: '如「自 2019 年起」，留空则不显示' },
  { key: 'aboutBody', label: '正文', type: 'textarea', rows: 6, hint: '空行分段；支持 **粗体**、`代码` 与 [链接](https://...)' },
  { key: 'aboutStats', label: '数字（每行「值|说明」）', type: 'textarea', rows: 4, hint: '例如：6 年|在前端行业' },
  { key: 'aboutStacks', label: '正在使用（每行「分组|条目」）', type: 'textarea', rows: 4, hint: '例如：写代码|Vue 3, Node.js' },
  { key: 'aboutCtaText', label: '底部引导语', hint: '留空使用默认文案' },
];

/* ─────────────── 背景音乐 ─────────────── */

const bgmFileRef = ref(null);
const bgmUploading = ref(false);
const bgmProgress = ref(0);
const previewRef = ref(null);

const bgmOn = computed(() => form.value.bgmEnabled === 'true');
const bgmLoopOn = computed(() => form.value.bgmLoop !== 'false');
const bgmShowOn = computed(() => form.value.bgmShowControl !== 'false');
const bgmVolumeValue = computed(() => Number(form.value.bgmVolume ?? 0.35));

async function uploadBgm(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  bgmUploading.value = true;
  bgmProgress.value = 0;
  try {
    const { media } = await api.uploadWithProgress('/media', file, (p) => (bgmProgress.value = p));
    form.value.bgmUrl = media.url;
    form.value.bgmTitle = form.value.bgmTitle || file.name.replace(/\.[^.]+$/, '').slice(0, 40);
    form.value.bgmEnabled = 'true';
    toast('音乐已上传，记得点保存');
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    bgmUploading.value = false;
    bgmProgress.value = 0;
  }
}

function preview() {
  const el = previewRef.value;
  if (!el || !form.value.bgmUrl) return;
  el.volume = Math.min(1, Math.max(0, bgmVolumeValue.value));
  el.loop = bgmLoopOn.value;
  if (el.paused) el.play().catch(() => toast('浏览器拦截了自动播放，请再点一次', { tone: 'error' }));
  else el.pause();
}

function setToggle(key, value) {
  form.value[key] = value ? 'true' : 'false';
}

async function load() {
  loading.value = true;
  try {
    const res = await api.settings();
    form.value = { ...res.settings };
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const res = await api.saveSettings(form.value);
    form.value = { ...res.settings };
    await site.ensure(true);
    toast('设置已保存');
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    saving.value = false;
  }
}

/** 资料保存后同步到全局登录态，导航头像会立刻更新 */
async function saveProfile(patch) {
  try {
    const res = await api.updateProfile(patch);
    auth.user = res.user;
    profile.value = { displayName: res.user.displayName, bio: res.user.bio, avatar: res.user.avatar };
    toast('资料已更新');
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

async function uploadAvatar(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  avatarUploading.value = true;
  try {
    const { media } = await api.uploadAvatar(file);
    await saveProfile({ avatar: media.variants?.[2]?.url || media.url });
  } catch (err) {
    toast(err.message, { tone: 'error' });
  } finally {
    avatarUploading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="settings u-container">
    <header class="head">
      <div>
        <h1 class="title">站点设置</h1>
        <p class="lead">这些内容存在数据库里，改完立刻生效，不需要重新构建。</p>
      </div>
      <button type="button" class="primary u-press" :disabled="saving || loading" @click="save">
        <BaseIcon name="check" :size="15" />
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </header>

    <!-- 个人资料与头像 -->
    <section class="group profile">
      <h2 class="group-title">我的资料</h2>
      <div class="profile-row">
        <UserAvatar :src="profile.avatar" :name="profile.displayName" :size="72" shape="circle" />
        <div class="profile-actions">
          <p class="profile-name">{{ profile.displayName || '未命名' }}</p>
          <p class="profile-hint">
            微信登录的用户默认使用微信头像。
            未设置头像时显示名字首字。
          </p>
          <div class="profile-buttons">
            <button type="button" class="primary small u-press" :disabled="avatarUploading" @click="avatarRef.click()">
              <BaseIcon name="upload" :size="14" />
              {{ avatarUploading ? '上传中…' : '更换头像' }}
            </button>
            <button v-if="profile.avatar" type="button" class="ghost u-press" @click="saveProfile({ avatar: '' })">
              清除
            </button>
          </div>
          <input ref="avatarRef" type="file" accept="image/png,image/jpeg,image/webp,image/avif" class="sr-only" @change="uploadAvatar" />
        </div>
      </div>
      <div class="fields">
        <label class="field">
          <span class="label">显示名</span>
          <input v-model="profile.displayName" type="text" maxlength="24" @change="saveProfile({ displayName: profile.displayName })" />
          <span class="hint">最多 24 个字</span>
        </label>
        <label class="field">
          <span class="label">个人简介</span>
          <input v-model="profile.bio" type="text" maxlength="160" placeholder="一句话介绍自己" @change="saveProfile({ bio: profile.bio })" />
          <span class="hint">最多 160 个字</span>
        </label>
      </div>
    </section>

    <div v-if="loading" class="loading">
      <span v-for="i in 5" :key="i" class="u-skeleton sk-row" />
    </div>

    <form v-else class="groups" @submit.prevent="save">
      <section v-for="group in GROUPS" :key="group.title" class="group">
        <h2 class="group-title">{{ group.title }}</h2>
        <p v-if="group.hint" class="group-hint">{{ group.hint }}</p>
        <div class="fields">
          <label v-for="field in group.fields" :key="field.key" class="field" :class="{ 'field-wide': field.type === 'textarea' }">
            <span class="label">{{ field.label }}</span>
            <textarea v-if="field.type === 'textarea'" v-model="form[field.key]" :rows="field.rows || 4" :placeholder="field.hint" />
            <input v-else v-model="form[field.key]" type="text" :placeholder="field.hint" />
            <span v-if="field.hint" class="hint">{{ field.hint }}</span>
          </label>
        </div>
      </section>

      <!-- 关于页 -->
      <section class="group">
        <h2 class="group-title">关于页</h2>
        <p class="group-hint">
          关于页的全部内容都在这里编辑，留空的项不显示。<a href="/about" target="_blank" rel="noopener">在新窗口预览 →</a>
        </p>
        <div class="fields">
          <label v-for="field in ABOUT_FIELDS" :key="field.key" class="field" :class="{ 'field-wide': field.type === 'textarea' }">
            <span class="label">{{ field.label }}</span>
            <textarea v-if="field.type === 'textarea'" v-model="form[field.key]" :rows="field.rows || 4" :placeholder="field.hint" />
            <input v-else v-model="form[field.key]" type="text" :placeholder="field.hint" />
            <span v-if="field.hint" class="hint">{{ field.hint }}</span>
          </label>
        </div>
      </section>

      <!-- 背景音乐 -->
      <section class="group">
        <h2 class="group-title">背景音乐</h2>
        <p class="group-hint">
          上传一首音乐作为全站背景音。浏览器不允许「没有任何交互就播放带声音的音频」，
          所以访客第一次点击页面后才会真正出声；右下角始终有播放控制条可以随时停止。
        </p>

        <div class="bgm-settings">
          <div class="bgm-upload">
            <div class="bgm-current">
              <BaseIcon name="rss" :size="16" />
              <span class="bgm-name">{{ form.bgmTitle || (form.bgmUrl ? '未命名音乐' : '还没有设置音乐') }}</span>
              <span v-if="form.bgmUrl" class="bgm-url">{{ form.bgmUrl }}</span>
            </div>
            <div class="bgm-buttons">
              <button type="button" class="primary small u-press" :disabled="bgmUploading" @click="bgmFileRef.click()">
                <BaseIcon name="upload" :size="14" />
                {{ bgmUploading ? `上传中 ${bgmProgress}%` : '上传音乐' }}
              </button>
              <button v-if="form.bgmUrl" type="button" class="ghost u-press" @click="preview">
                试听
              </button>
              <button v-if="form.bgmUrl" type="button" class="ghost u-press" @click="form.bgmUrl = ''; form.bgmEnabled = 'false'">
                移除
              </button>
            </div>
            <input
              ref="bgmFileRef"
              type="file"
              accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/flac,audio/aac"
              class="sr-only"
              @change="uploadBgm"
            />
            <audio ref="previewRef" :src="form.bgmUrl || undefined" preload="none" class="sr-only" />
          </div>

          <label class="field">
            <span class="label">音乐标题</span>
            <input v-model="form.bgmTitle" type="text" maxlength="60" placeholder="显示在播放面板里" />
          </label>

          <label class="field">
            <span class="label">音乐地址</span>
            <input v-model="form.bgmUrl" type="url" placeholder="也可以直接填 https 外链" />
            <span class="hint">支持 MP3 / M4A / OGG / WAV / FLAC / AAC</span>
          </label>

          <label class="field">
            <span class="label">默认音量 {{ Math.round(bgmVolumeValue * 100) }}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="bgmVolumeValue"
              @input="form.bgmVolume = $event.target.value"
            />
            <span class="hint">访客可以在播放面板里自行调节，本地选择会覆盖这里的默认值</span>
          </label>

          <div class="toggles">
            <label class="switch">
              <input type="checkbox" :checked="bgmOn" @change="setToggle('bgmEnabled', $event.target.checked)" />
              <span>启用背景音乐</span>
            </label>
            <label class="switch">
              <input type="checkbox" :checked="bgmLoopOn" @change="setToggle('bgmLoop', $event.target.checked)" />
              <span>循环播放</span>
            </label>
            <label class="switch">
              <input type="checkbox" :checked="form.bgmAutoplay !== 'false'" @change="setToggle('bgmAutoplay', $event.target.checked)" />
              <span>进入页面后尝试自动播放</span>
            </label>
            <label class="switch">
              <input type="checkbox" :checked="bgmShowOn" @change="setToggle('bgmShowControl', $event.target.checked)" />
              <span>显示右下角播放控制条</span>
            </label>
          </div>
        </div>
      </section>

      <div class="actions">
        <button type="submit" class="primary u-press" :disabled="saving">
          {{ saving ? '保存中…' : '保存全部' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.settings {
  padding-top: clamp(2rem, 5vw, 3.5rem);
  max-width: 880px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--rule);
}

.title {
  font-size: clamp(1.7rem, 1.3rem + 2vw, 2.3rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--ink);
}

.lead {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: var(--ink-mid);
}

.primary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  font-size: 0.85rem;
  cursor: pointer;
}

.primary:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.primary:disabled {
  opacity: 0.6;
  cursor: progress;
}

.loading {
  display: grid;
  gap: 0.6rem;
  margin-top: 1.5rem;
}

.sk-row {
  height: 46px;
  border-radius: var(--radius-sm);
}

.groups {
  display: grid;
  gap: 1.75rem;
  margin-top: 1.5rem;
}

.group {
  display: grid;
  gap: 0.9rem;
}

.group-title {
  font-size: 0.95rem;
  font-weight: 620;
  color: var(--ink);
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--rule);
}

.fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.9rem;
}

.field {
  display: grid;
  gap: 0.3rem;
}

.label {
  font-size: 0.8rem;
  color: var(--ink);
  font-weight: 540;
}

.field input {
  padding: 0.55rem 0.7rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 0.88rem;
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.hint {
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.actions {
  display: flex;
  justify-content: flex-end;
}

/* 背景音乐设置 */
.group-hint {
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--ink-soft);
  max-width: 62ch;
}

.group-hint a {
  color: var(--accent);
  text-underline-offset: 0.2em;
}

.fields .field-wide {
  grid-column: 1 / -1;
}

.field textarea {
  font-family: var(--font-body, inherit);
  line-height: 1.7;
  resize: vertical;
  min-height: 3rem;
}

.bgm-settings {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: var(--radius-md);
  border: 1px dashed var(--rule-strong);
  background: var(--paper-soft);
}

.bgm-upload {
  display: grid;
  gap: 0.6rem;
}

.bgm-current {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  color: var(--ink-mid);
}

.bgm-name {
  font-size: 0.88rem;
  font-weight: 560;
  color: var(--ink);
}

.bgm-url {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--ink-soft);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bgm-buttons {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.primary.small {
  padding: 0.42rem 0.8rem;
  font-size: 0.8rem;
}

.toggles {
  display: grid;
  gap: 0.5rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--rule);
}

.switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.84rem;
  color: var(--ink-mid);
  cursor: pointer;
}

.switch input {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
}

.field input[type='range'] {
  padding: 0;
  accent-color: var(--accent);
}

/* 个人资料 */
.profile {
  margin-top: 1.5rem;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  flex-wrap: wrap;
}

.profile-actions {
  display: grid;
  gap: 0.35rem;
}

.profile-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink);
}

.profile-hint {
  font-size: 0.76rem;
  line-height: 1.6;
  color: var(--ink-soft);
  max-width: 46ch;
}

.profile-buttons {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.2rem;
}

.primary.small {
  padding: 0.38rem 0.75rem;
  font-size: 0.8rem;
}

.ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.38rem 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule-strong);
  background: transparent;
  color: var(--ink-mid);
  font-size: 0.8rem;
  cursor: pointer;
}

.ghost:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (min-width: 720px) {
  .fields {
    grid-template-columns: 1fr 1fr;
  }

  .field:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
}
</style>
