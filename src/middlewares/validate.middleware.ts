import { Request, Response, NextFunction } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { z } from "zod";
import { AppError } from "../utils/AppError";

type SchemaWithBody = z.ZodObject<{ body: z.ZodTypeAny }>;
type SchemaWithParams = z.ZodObject<{ params: z.ZodTypeAny }>;
type SchemaWithBoth = z.ZodObject<{ body?: z.ZodTypeAny; params?: z.ZodTypeAny }>;
/** Accepts ZodObject or ZodEffects (e.g. .superRefine/.refine) wrapping a body/params schema */
export type ValidatableSchema =
  | SchemaWithBody
  | SchemaWithParams
  | SchemaWithBoth
  | z.ZodEffects<z.ZodObject<Record<string, z.ZodTypeAny>>>;

function getShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | undefined {
  if ("shape" in schema && typeof (schema as z.ZodObject<any>).shape === "object")
    return (schema as z.ZodObject<any>).shape;
  const def = (schema as { _def?: { schema?: z.ZodTypeAny } })._def;
  if (def?.schema) return getShape(def.schema);
  return undefined;
}

/**
 * Validates req.body and/or req.params against a Zod schema.
 * On success, assigns parsed values back to req.body / req.params.
 * On failure, passes AppError to next(err) for centralized error response.
 */
export function validate(schema: ValidatableSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const input: Record<string, unknown> = {};
    const shape = getShape(schema as z.ZodTypeAny);
    if (shape?.body) input.body = req.body;
    if (shape?.params) input.params = req.params;

    const result = (schema as z.ZodTypeAny).safeParse(input);

    if (!result.success) {
      const flattened = result.error.flatten();
      return next(new AppError("Validation failed", 400, "VALIDATION_ERROR", { errors: flattened.fieldErrors }));
    }

    const data = result.data as { body?: unknown; params?: ParamsDictionary | null };
    if (data.body !== undefined) req.body = data.body;
    if (data.params !== undefined && data.params !== null) req.params = data.params;
    next();
  };
}
