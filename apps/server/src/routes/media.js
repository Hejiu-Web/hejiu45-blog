import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireAuthor } from '../middleware/auth.js';
import { limiters } from '../lib/rate-limit.js';
import { readUpload } from '../lib/body.js';
import { HttpError } from '../lib/http.js';
import { saveImage, saveAv, deleteMedia, mediaById, listMedia, detectKind } from '../lib/media.js';
import { audit } from '../lib/sessions.js';
import { runHook } from '../extensions.js';

const router = Router();

/**
 * 上传入口。
 * 请求体直接是二进制，Content-Type 只作为提示，真正的判定全部按文件头魔数。
 * 图片走 saveImage（生成多尺寸），音视频走 saveAv（浏览器直接播放）。
 */
router.post('/media', limiters.upload, requireAuthor, async (req, res) => {
  if (!config.security.uploadsEnabled) throw new HttpError(503, '上传功能已关闭', 'UPLOADS_DISABLED');

  const buffer = await readUpload(req, config.security.uploadMaxBytes);
  const kind = detectKind(buffer);
  if (!kind) throw new HttpError(400, '只支持图片、视频与音频文件', 'UNSUPPORTED_TYPE');

  const media = kind === 'image' ? await saveImage(buffer, { userId: req.auth.user.id }) : await saveAv(buffer, { userId: req.auth.user.id });
  audit('media.upload', { userId: req.auth.user.id, req, detail: `${kind} ${media.url}` });
  runHook('onMediaUploaded', media, req);
  res.status(201).json({ media });
});

/** 头像：只接受图片，生成正方形 WebP */
router.post('/avatar', limiters.upload, requireAuth, async (req, res) => {
  const buffer = await readUpload(req, Math.min(config.security.uploadMaxBytes, 5 * 1024 * 1024));
  if (detectKind(buffer) !== 'image') throw new HttpError(400, '头像必须是图片', 'INVALID_IMAGE');
  const media = await saveImage(buffer, { userId: req.auth.user.id });
  audit('avatar.upload', { userId: req.auth.user.id, req });
  res.status(201).json({ media });
});

router.get('/media', limiters.read, requireAuthor, (req, res) => {
  res.json(
    listMedia({
      kind: ['image', 'video', 'audio'].includes(req.query.kind) ? req.query.kind : '',
      page: req.query.page,
      pageSize: req.query.pageSize,
    }),
  );
});

router.get('/media/:id', limiters.read, requireAuthor, (req, res) => {
  const media = mediaById(req.params.id);
  if (!media) throw new HttpError(404, '文件不存在', 'NOT_FOUND');
  res.json({ media });
});

router.delete('/media/:id', limiters.write, requireAuthor, async (req, res) => {
  const media = await deleteMedia(req.params.id);
  audit('media.delete', { userId: req.auth.user.id, req, detail: media.url });
  res.json({ ok: true });
});

export default router;
