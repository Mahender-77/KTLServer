import { z } from "zod";
import { objectIdString } from "./common.js";

const orderItemSchema = z.object({
  product: objectIdString,
  variant: objectIdString,
  quantity: z.number().positive("Quantity must be greater than 0"),
  price: z.number().min(0, "Price must be non-negative"),
});

const addressSchema = z.object({
  name: z.string().min(1, "Address name is required").max(100).trim(),
  phone: z.string().min(1, "Phone is required").max(20).trim(),
  address: z.string().min(1, "Street address is required").max(300).trim(),
  city: z.string().min(1, "City is required").max(100).trim(),
  pincode: z.string().min(1, "Pincode is required").max(20).trim(),
  landmark: z.string().max(100).trim().optional(),
});

export const createOrderSchema = z.object({
  body: z.object({
    items: z.array(orderItemSchema).min(1, "Cart is empty"),
    totalAmount: z.number().positive("Invalid total amount"),
    address: addressSchema,
    paymentMethod: z.enum(["online", "cod", "pending"]).optional(),
  }),
});

export const updateOrderStatusSchema = z.object({
  body: z.object({
    status: z.enum(["confirmed", "out_for_delivery", "delivered", "cancelled"]),
  }),
});

