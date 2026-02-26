import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";

const isProduction = process.env.NODE_ENV === "production";

export interface ErrorResponse {
  success: false;
  message: string;
  errorCode?: string;
  detail?: unknown;
}

/**
 * Global error middleware. Must be registered after all routes.
 * Uses next(err) from asyncHandler or manual next(err) in sync code.
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const errorCode = err instanceof AppError ? err.errorCode : undefined;
  const detail = err instanceof AppError ? err.detail : undefined;

  let message: string;
  if (err instanceof AppError) {
    message = err.message;
  } else if (statusCode === 500 && isProduction) {
    message = "Internal server error";
  } else {
    message = err.message || "Internal server error";
  }

  const payload: ErrorResponse = {
    success: false,
    message,
    ...(errorCode && { errorCode }),
    ...(detail !== undefined && { detail }),
  };

  const logContext = {
    method: req.method,
    path: req.path,
    statusCode,
    message: err.message,
  };

  if (statusCode >= 500) {
    console.error("[Error]", logContext, err.stack);
  } else {
    console.warn("[Error]", logContext);
  }

  if (res.headersSent) {
    return;
  }

  res.status(statusCode).json(payload);
}
