/**
 * Application roles. Centralize here for RBAC evolution (permissions per role later).
 */
export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  DELIVERY: "delivery",
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_VALUES: AppRole[] = [
  ROLES.USER,
  ROLES.ADMIN,
  ROLES.DELIVERY,
];
