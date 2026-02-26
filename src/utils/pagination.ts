import { Request } from "express";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Parses and sanitizes page/limit from req.query.
 * Enforces max limit to prevent large responses.
 * Used for backward compatibility: missing params => first page with default limit.
 */
export function getPaginationParams(
  req: Request,
  options: { defaultLimit?: number; maxLimit?: number } = {}
): PaginationParams {
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = options.maxLimit ?? MAX_LIMIT;

  const pageRaw = req.query.page;
  const limitRaw = req.query.limit;

  let page = DEFAULT_PAGE;
  if (pageRaw !== undefined && pageRaw !== "") {
    const p = parseInt(String(pageRaw), 10);
    if (!Number.isNaN(p) && p >= 1) page = p;
  }

  let limit = defaultLimit;
  if (limitRaw !== undefined && limitRaw !== "") {
    const l = parseInt(String(limitRaw), 10);
    if (!Number.isNaN(l) && l >= 1) limit = Math.min(l, maxLimit);
  } else {
    limit = Math.min(limit, maxLimit);
  }

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export function paginated<T>(data: T[], total: number, page: number, limit: number): PaginatedResponse<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data,
    total,
    page,
    totalPages,
  };
}
