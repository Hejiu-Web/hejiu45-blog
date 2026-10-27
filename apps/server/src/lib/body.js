import { HttpError } from './http.js';

/** 读取原始二进制体：超过上限立即中断，避免把内存打满 */
export function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.off('data', onData);
        req.resume();
        reject(new HttpError(413, `文件不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`, 'PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** 带大小预检的读取：先看 Content-Length，再看流式累计 */
export async function readUpload(req, maxBytes) {
  const declared = Number(req.get('content-length') || 0);
  if (declared > maxBytes) {
    throw new HttpError(413, `文件不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`, 'PAYLOAD_TOO_LARGE');
  }
  const buffer = await readRawBody(req, maxBytes);
  if (!buffer.length) throw new HttpError(400, '上传内容为空', 'EMPTY_UPLOAD');
  return buffer;
}
