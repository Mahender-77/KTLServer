import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { checkSuperAdmin } from "../middlewares/superAdmin.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { listAuditLogs } from "../controllers/audit.controller";

const router = express.Router();

router.use(protect);
router.use(checkSuperAdmin);

router.get("/", asyncHandler(listAuditLogs));

export default router;
