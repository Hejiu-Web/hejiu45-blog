/** 统一的接口错误对象：带 HTTP 状态与业务错误码，便于界面精确提示 */
export class HttpError extends Error {
  constructor(status, message, code = 'ERROR') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
