import express from "express";
import { registerUser, loginUser, getCurrentUser } from "../controllers/auth.controller";
import { protect } from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", protect, getCurrentUser);

export default router;
