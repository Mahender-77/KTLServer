import { z } from "zod";
import { objectIdString } from "./common";
import { ORG_MODULE_KEYS } from "../constants/modules";
import { PRODUCT_FIELD_KEYS } from "../constants/productFields";

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
