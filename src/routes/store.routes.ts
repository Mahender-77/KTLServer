import express from "express";
import { protect, adminOnly } from "../middlewares/auth.middleware";
import {
  createStore,
  getStores,
  deleteStore,
} from "../controllers/store.controller";

const router = express.Router();

router.post("/", protect, adminOnly, createStore);
router.get("/", protect, adminOnly, getStores);
router.delete("/:id", protect, adminOnly, deleteStore);

export default router;
