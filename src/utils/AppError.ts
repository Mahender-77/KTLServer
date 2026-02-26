/**
 * Application error for controlled HTTP responses.
 * Error middleware uses statusCode, errorCode, and optional detail to format the response.
 */
export class AppError extends Error {
  statusCode: number;
  errorCode?: string;
  detail?: unknown;

  constructor(message: string, statusCode: number = 500, errorCode?: string, detail?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.detail = detail;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace?.(this, this.constructor);
  }
}
