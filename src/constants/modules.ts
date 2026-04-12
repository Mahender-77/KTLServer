/**
 * Organization-level feature modules (tenant feature flags).
 * Super-admin / billing can extend `organization.modules` beyond defaults; RBAC still applies per route.
 */
export const ORG_MODULES = {
  PRODUCT: "product",
  ORDER: "order",
  INVENTORY: "inventory",
  DELIVERY: "delivery",
  USER: "user",
  STORE: "store",
  CATEGORY: "category",
} as const;

export type OrgModuleKey = (typeof ORG_MODULES)[keyof typeof ORG_MODULES];

/** All known module keys (for validation / admin UIs). */
export const ORG_MODULE_KEYS: OrgModuleKey[] = [
  ORG_MODULES.PRODUCT,
  ORG_MODULES.ORDER,
  ORG_MODULES.INVENTORY,
  ORG_MODULES.DELIVERY,
  ORG_MODULES.USER,
  ORG_MODULES.STORE,
  ORG_MODULES.CATEGORY,
];

/** Default modules for newly created organizations. */
export const DEFAULT_ORG_MODULES: OrgModuleKey[] = [ORG_MODULES.PRODUCT, ORG_MODULES.ORDER];
