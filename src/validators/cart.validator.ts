import { z } from "zod";
import { objectIdString } from "./common";

export const addToCartSchema = z.object({
  body: z.object({
    productId: objectIdString,
    variantId: objectIdString,
    quantity: z.number().int().min(1, "Quantity must be at least 1").max(999).optional().default(1),
  }),
});

export const removeFromCartSchema = z.object({
  body: z.object({
    productId: objectIdString,
    variantId: objectIdString,
  }),
});

export const updateCartItemSchema = z.object({
  body: z.object({
    productId: objectIdString,
    variantId: objectIdString,
    quantity: z.number().int().min(0, "Quantity must be 0 or positive").max(999),
  }),
});
