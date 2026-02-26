import { z } from "zod";

const OBJECT_ID_REGEX = /^[a-f0-9]{24}$/i;

export const objectIdString = z
  .string()
  .min(1, "ID is required")
  .regex(OBJECT_ID_REGEX, "Invalid ID format");

export const objectIdParamSchema = z.object({
  id: objectIdString,
});

export const parentIdParamSchema = z.object({
  parentId: objectIdString,
});

/** Use with validate() for any route with params.id (e.g. GET /:id, DELETE /:id) */
export const idParamSchema = z.object({
  params: z.object({ id: objectIdString }),
});

/** For routes with params.parentId (e.g. GET /:parentId/subcategories) */
export const parentIdParamSchemaForRoute = z.object({
  params: parentIdParamSchema,
});
