import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomId } from './crypto.js';
import { config } from '../config.js';
import { HttpError } from './http.js';
import { all, get, run } from '../db.js';

/**
 * 媒体处理。
 *
 * 图片：按文件头识别 → sharp 自动转正 → 生成三档 WebP 变体（hero/card/thumb），
 *       原图另存，前端用 <picture srcset> 按屏宽取最小可用尺寸。
 * 视频 / 音频：浏览器直接播放，服务端只校验容器格式；填了标题参数时生成一张
 *       排印式封面（避免引外部图床，也不依赖 ffmpeg）。
 * 所有文件名由服务器生成，客户端文件名一律丢弃。
 */

let sharpModule = null;
let sharpChecked = false;

async function getSharp() {
  if (sharpChecked) return sharpModule;
  sharpChecked = true;
  try {
    const mod = await import('sharp');
    sharpModule = mod.default || mod;
  } catch {
    sharpModule = null;
    console.warn('[media] sharp 不可用，图片将以原始尺寸保存（不生成缩略图）');
  }
  return sharpModule;
}

const MAX_BYTES = () => config.security.uploadMaxBytes;

export const IMAGE_SIGNATURES = [
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', ext: '.gif', test: (b) => b.length > 6 && b.subarray(0, 3).toString('latin1') === 'GIF' },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) =>
      b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    mime: 'image/avif',
    ext: '.avif',
    test: (b) =>
      b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' && /avi[fs]/.test(b.subarray(8, 12).toString('latin1')),
  },
];

export const VIDEO_SIGNATURES = [
  {
    mime: 'video/mp4',
    ext: '.mp4',
    test: (b) => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' && /isom|mp42|isom|avc1|M4V|dash/.test(b.subarray(8, 12).toString('latin1')),
  },
  {
    mime: 'video/webm',
    ext: '.webm',
    test: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && b.subarray(24, 28).toString('latin1') === 'webm',
  },
  {
    mime: 'video/quicktime',
    ext: '.mov',
    test: (b) => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' && b.subarray(8, 12).toString('latin1') === 'qt  ',
  },
];

export const AUDIO_SIGNATURES = [
  { mime: 'audio/mpeg', ext: '.mp3', test: (b) => b.length > 3 && b.subarray(0, 3).toString('latin1') === 'ID3' },
  {
    mime: 'audio/mp4',
    ext: '.m4a',
    test: (b) => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' && /M4A|mp42/.test(b.subarray(8, 12).toString('latin1')),
  },
  {
    mime: 'audio/ogg',
    ext: '.ogg',
    test: (b) => b.length > 4 && b.subarray(0, 4).toString('latin1') === 'OggS',
  },
  {
    mime: 'audio/wav',
    ext: '.wav',
    test: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE',
  },
  {
    mime: 'audio/flac',
    ext: '.flac',
    test: (b) => b.length > 4 && b.subarray(0, 4).toString('latin1') === 'fLaC',
  },
  {
    mime: 'audio/aac',
    ext: '.aac',
    test: (b) => b.length > 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0,
  },
];

export function detectKind(buffer) {
  if (IMAGE_SIGNATURES.some((s) => s.test(buffer))) return 'image';
  if (VIDEO_SIGNATURES.some((s) => s.test(buffer))) return 'video';
  if (AUDIO_SIGNATURES.some((s) => s.test(buffer))) return 'audio';
  return null;
}

function signatureFor(kind, buffer) {
  const list = kind === 'image' ? IMAGE_SIGNATURES : kind === 'video' ? VIDEO_SIGNATURES : AUDIO_SIGNATURES;
  return list.find((s) => s.test(buffer)) || null;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/** 按扩展名与尺寸校验上传的类型上限 */
export function assertUploadAllowed({ kind, size }) {
  if (!config.security.uploadsEnabled) {
    throw new HttpError(503, '上传功能已关闭', 'UPLOADS_DISABLED');
  }
  if (size > MAX_BYTES()) {
    const mb = Math.round(MAX_BYTES() / 1024 / 1024);
    throw new HttpError(413, `文件不能超过 ${mb}MB`, 'PAYLOAD_TOO_LARGE');
  }
  if (!['image', 'video', 'audio'].includes(kind)) {
    throw new HttpError(400, '不支持的文件类型', 'UNSUPPORTED_TYPE');
  }
}

/**
 * 保存图片：原图 + 三档 WebP。
 * 返回 { url, width, height, variants }
 */
export async function saveImage(buffer, { userId = null, kind = 'image' } = {}) {
  const sig = signatureFor('image', buffer);
  if (!sig) throw new HttpError(400, '只支持 PNG / JPG / WebP / GIF / AVIF 图片', 'INVALID_IMAGE');

  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const dir = await ensureDir(path.join(config.uploadDir, month));
  const base = `${month}-${randomId()}`;

  // 原图始终落地：转换失败也不丢用户内容
  const originalName = `${base}${sig.ext}`;
  await fsp.writeFile(path.join(dir, originalName), buffer, { mode: 0o644 });

  const variantUrls = [];
  let width = null;
  let height = null;
  const sharp = await getSharp();

  if (sharp) {
    try {
      const pipeline = sharp(buffer, { failOn: 'error' }).rotate(); // 手机拍照方向自动转正
      const meta = await pipeline.metadata();
      width = meta.width || null;
      height = meta.height || null;

      for (const [suffix, size] of [
        ['hero', 1600],
        ['card', 800],
        ['thumb', 320],
      ]) {
        const out = await sharp(buffer, { failOn: 'error' })
          .rotate()
          .resize({ width: size, withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toBuffer();
        const name = `${base}-${suffix}.webp`;
        await fsp.writeFile(path.join(dir, name), out, { mode: 0o644 });
        variantUrls.push({ w: size, url: `/uploads/${month}/${name}` });
      }
    } catch (err) {
      console.warn('[media] 图片处理失败，保留原图', err.message);
    }
  }

  const url = `/uploads/${month}/${originalName}`;
  const id = randomId('m_');
  run(
    `INSERT INTO media (id, user_id, kind, mime, size, width, height, duration, variants, url, original, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      id,
      userId,
      kind,
      sig.mime,
      buffer.length,
      width,
      height,
      JSON.stringify(variantUrls),
      variantUrls[0]?.url || url,
      url,
      Date.now(),
    ],
  );

  // kind 必须一起返回：前端靠它区分「插入正文」还是「加入媒体列表」
  return { id, kind, url, original: url, variants: variantUrls, width, height, mime: sig.mime, size: buffer.length };
}

/** 处理后的媒体统一序列化 */
export function serializeMedia(row) {
  if (!row) return null;
  let variants = [];
  try {
    variants = JSON.parse(row.variants || '[]');
  } catch {
    variants = [];
  }
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    duration: row.duration,
    url: row.url,
    original: row.original || row.url,
    variants,
    createdAt: row.created_at,
  };
}

/**
 * 保存视频/音频：先按文件头校验容器，再落盘。
 * 不依赖 ffmpeg：播放交给浏览器，占位封面由调用方决定（生成排印封面或用户自传）。
 */
export async function saveAv(buffer, { userId = null } = {}) {
  const kind = detectKind(buffer);
  if (!kind || kind === 'image') throw new HttpError(400, '不是有效的音视频文件', 'INVALID_MEDIA');
  const sig = signatureFor(kind, buffer);
  if (!sig) throw new HttpError(400, '不支持该容器格式', 'UNSUPPORTED_TYPE');

  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const dir = await ensureDir(path.join(config.uploadDir, 'media', month));
  const name = `${month}-${randomId()}${sig.ext}`;
  await fsp.writeFile(path.join(dir, name), buffer, { mode: 0o644 });

  const url = `/uploads/media/${month}/${name}`;
  const id = randomId('m_');
  run(
    `INSERT INTO media (id, user_id, kind, mime, size, width, height, duration, variants, url, original, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, '[]', ?, ?, ?)`,
    [id, userId, kind, sig.mime, buffer.length, url, url, Date.now()],
  );
  return { id, url, original: url, variants: [], mime: sig.mime, size: buffer.length, kind };
}

export function listMedia({ kind = '', page = 1, pageSize = 24 } = {}) {
  const size = Math.min(60, Math.max(1, Number(pageSize) || 24));
  const offset = (Math.max(1, Number(page) || 1) - 1) * size;
  const where = kind ? 'WHERE kind = ?' : '';
  const params = kind ? [kind] : [];
  const rows = all(`SELECT * FROM media ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, size, offset]);
  const total = get(`SELECT COUNT(*) AS n FROM media ${where}`, params).n;
  return { items: rows.map(serializeMedia), total, hasMore: offset + size < total };
}
/** 删除媒体：同时清理磁盘文件与变体 */
export async function deleteMedia(id) {
  const row = get('SELECT * FROM media WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, '文件不存在', 'NOT_FOUND');
  const media = serializeMedia(row);
  const files = new Set([row.url, media.original, ...media.variants.map((v) => v.url)]);
  for (const file of files) {
    if (!file || !file.startsWith('/uploads/')) continue;
    const rel = file.replace('/uploads/', '');
    const abs = path.resolve(config.uploadDir, rel);
    if (!abs.startsWith(path.resolve(config.uploadDir) + path.sep)) continue; // 防越界
    await fsp.rm(abs, { force: true }).catch(() => {});
  }
  run('DELETE FROM media WHERE id = ?', [id]);
  return media;
}

export function mediaById(id) {
  return serializeMedia(get('SELECT * FROM media WHERE id = ?', [id]));
}

export { fs };
