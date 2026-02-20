import express from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
} from "../controllers/address.controller";

const router = express.Router();

// All address routes are protected — user must be logged in
router.use(protect);

router.get("/", getAddresses); // GET    /api/addresses
router.post("/", createAddress); // POST   /api/addresses
router.put("/:id", updateAddress); // PUT    /api/addresses/:id
router.delete("/:id", deleteAddress); // DELETE /api/addresses/:id

export default router;

