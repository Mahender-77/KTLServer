import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { checkSuperAdmin } from "../middlewares/superAdmin.middleware";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import {
  patchOrgModulesSchema,
  patchOrgStatusSchema,
  createPlanSchema,
  patchOrganizationPlanSchema,
  createOrganizationFullSchema,
} from "../validators/superAdmin.validator";
import {
  listOrganizations,
  patchOrganizationModules,
  patchOrganizationStatus,
  createPlan,
  listPlans,
  patchOrganizationPlan,
  createOrganizationFull,
} from "../controllers/superAdmin.controller";

const router = express.Router();

router.use(protect);
router.use(checkSuperAdmin);

router.get("/organizations", asyncHandler(listOrganizations));
router.patch(
  "/organizations/:id/modules",
  validate(patchOrgModulesSchema),
  asyncHandler(patchOrganizationModules)
);
router.patch(
  "/organizations/:id/status",
  validate(patchOrgStatusSchema),
  asyncHandler(patchOrganizationStatus)
);

router.post("/plans", validate(createPlanSchema), asyncHandler(createPlan));
router.get("/plans", asyncHandler(listPlans));
router.patch(
  "/organizations/:id/plan",
  validate(patchOrganizationPlanSchema),
  asyncHandler(patchOrganizationPlan)
);
router.post(
  "/create-organization-full",
  validate(createOrganizationFullSchema),
  asyncHandler(createOrganizationFull)
);

export default router;
