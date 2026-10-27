import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { randomId } from '../lib/crypto.js';
import { requireAuthor } from '../middleware/auth.js';
import { config } from '../config.js';
import { bad, HttpError } from '../lib/http.js';
import { limiters } from '../lib/rate-limit.js';

const router = Router();

/**
 * 图片校验：只信任文件头（魔数），不信任 Content-Type。
 * 客户端发来的 MIME 可以被随意伪造，用 Content-Type 判断等于没校验；
 * 而按魔数识别后，我们再用「识别结果」决定扩展名，攻击者就没法把
 * HTML / SVG / 脚本文件伪装成图片塞进上传目录。
 */
const SIGNATURES = [
  { mime: 'image/png', ext: '.png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', ext: '.gif', test: (b) => b.length > 6 && b.subarray(0, 3).toString('latin1') === 'GIF' },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    mime: 'image/avif',
    ext: '.avif',
    test: (b) => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' && /avi[fs]/.test(b.subarray(8, 12).toString('latin1')),
  },
];

function detectImage(buffer) {
  return SIGNATURES.find((sig) => sig.test(buffer)) || null;
}

/** 读取原始二进制体，超限立刻中断，避免把内存打满 */
function rawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.off('data', onData);
        req.resume(); // 丢弃剩余数据，保持连接可用
        reject(new HttpError(413, `图片不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`, 'PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

router.post('/upload', limiters.upload, requireAuthor, async (req, res) => {
  if (!config.security.uploadsEnabled) {
    throw new HttpError(503, '上传功能已关闭', 'UPLOADS_DISABLED');
  }

  const max = config.security.uploadMaxBytes;
  const declared = Number(req.get('content-length') || 0);
  if (declared > max) throw new HttpError(413, `图片不能超过 ${Math.round(max / 1024 / 1024)}MB`, 'PAYLOAD_TOO_LARGE');

  const buffer = await rawBody(req, max);
  if (!buffer.length) throw bad('上传内容为空', 'EMPTY_UPLOAD');

  const kind = detectImage(buffer);
  if (!kind) throw bad('只支持 PNG / JPG / WebP / GIF / AVIF 图片', 'INVALID_IMAGE');

  // 文件名为服务器生成，绝不使用客户端提供的名字，杜绝路径穿越
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const name = `${new Date().toISOString().slice(0, 7).replace('-', '')}-${randomId()}${kind.ext}`;
  const target = path.join(config.uploadDir, name);

  // 二次确认：解析后的路径必须仍在 uploads 目录内
  if (!path.resolve(target).startsWith(path.resolve(config.uploadDir) + path.sep)) {
    throw bad('非法的文件路径', 'BAD_PATH');
  }

  fs.writeFileSync(target, buffer, { mode: 0o644 });
  res.status(201).json({ url: `/uploads/${name}`, size: buffer.length, mime: kind.mime });
});

export default router;
