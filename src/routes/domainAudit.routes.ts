import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { checkPermission } from "../middlewares/checkPermission.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { listDomainAuditLogs } from "../controllers/domainAudit.controller";

const router = express.Router();

router.use(protect);
/** Domain audit spans orders, catalog, inventory, etc. — gate on RBAC only, not a single module. */
router.get("/", checkPermission("audit.view"), asyncHandler(listDomainAuditLogs));

export default router;
