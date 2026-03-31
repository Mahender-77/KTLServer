import { z } from "zod";

const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Invalid email format")
  .max(255, "Email too long");

/**
 * Strong password for privileged accounts (admins). Kept separate from public register
 * so mobile app signup can stay lighter until you align policies.
 */
export const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password too long")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

export const createAdminSchema = z.object({
  body: z
    .object({
      name: z.string().min(1, "Name is required").max(100, "Name too long").trim(),
      email: emailSchema,
      password: strongPasswordSchema,
    })
    .strict(),
});

export type CreateAdminBody = z.infer<typeof createAdminSchema>["body"];

const roleSchema = z.enum(["admin", "delivery", "user"]);

export const createUserSchema = z.object({
  body: z
    .object({
      name: z.string().min(1, "Name is required").max(100, "Name too long").trim(),
      email: emailSchema,
      password: strongPasswordSchema,
      role: roleSchema,
    })
    .strict(),
});

export type CreateUserBody = z.infer<typeof createUserSchema>["body"];
