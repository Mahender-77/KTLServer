import { z } from "zod";
import { objectIdString } from "./common.js";
import { ORG_MODULE_KEYS } from "../constants/modules.js";
import { PRODUCT_FIELD_KEYS } from "../constants/productFields.js";

const moduleKeySchema = z.string().refine(
  (m) => (ORG_MODULE_KEYS as readonly string[]).includes(m),
  { message: "Invalid module key" }
);

export const patchOrgModulesSchema = z.object({
  params: z.object({ id: objectIdString }),
  body: z
    .object({
      modules: z.array(moduleKeySchema),
    })
    .strict(),
});

export const patchOrgStatusSchema = z.object({
  params: z.object({ id: objectIdString }),
  body: z
    .object({
      isActive: z.boolean(),
    })
    .strict(),
});

export const createPlanSchema = z.object({
  body: z
    .object({
      name: z.string().min(1).max(100).trim(),
      price: z.number().min(0),
      modules: z.array(moduleKeySchema).min(1),
      isActive: z.boolean().optional(),
    })
    .strict(),
});

export const patchOrganizationPlanSchema = z.object({
  params: z.object({ id: objectIdString }),
  body: z
    .object({
      planId: objectIdString,
    })
    .strict(),
});

const productFieldsSchema = z.object(
  Object.fromEntries(
    PRODUCT_FIELD_KEYS.map((k) => [k, z.boolean().optional()])
  ) as Record<(typeof PRODUCT_FIELD_KEYS)[number], z.ZodOptional<z.ZodBoolean>>
);

/** Parse `req.query` in controller (validate middleware does not support query yet). */
export const superAdminUserListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    tenantId: objectIdString.optional(),
    role: z.enum(["user", "admin", "delivery"]).optional(),
  })
  .strict();

export const patchSuperAdminUserSchema = z.object({
  params: z.object({ id: objectIdString }),
  body: z
    .object({
      roleId: objectIdString.optional(),
      isSuspended: z.boolean().optional(),
    })
    .strict()
    .refine((b) => b.roleId !== undefined || b.isSuspended !== undefined, {
      message: "Provide roleId and/or isSuspended",
    }),
});

export const orgRolesParamSchema = z.object({
  params: z.object({ id: objectIdString }),
});

export const createOrganizationFullSchema = z.object({
  body: z
    .object({
      organization: z
        .object({
          name: z.string().min(1).max(120).trim(),
        })
        .strict(),
      admin: z
        .object({
          name: z.string().min(1).max(120).trim(),
          email: z.string().email(),
          password: z.string().min(6).max(128),
        })
        .strict(),
      modules: z.array(moduleKeySchema).default([]),
      productFields: productFieldsSchema.optional(),
    })
    .strict(),
});
