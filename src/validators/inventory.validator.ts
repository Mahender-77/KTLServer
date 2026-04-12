import { z } from "zod";
import { objectIdString } from "./common";

export const patchInventoryThresholdSchema = z.object({
  params: z.object({ productId: objectIdString }),
  body: z
    .object({
      lowStockThreshold: z.number().min(0),
    })
    .strict(),
});
