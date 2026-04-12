import multer from "multer";
import cloudinary from "../config/cloudinary";

// v2.x exports a factory function (not a class constructor).
const cloudinaryStorage = require("multer-storage-cloudinary") as (
  options: Record<string, unknown>
) => any;

const storage = cloudinaryStorage({
  cloudinary,
  params: {
    folder: "ktl_products",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  } as any,
});

export const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});