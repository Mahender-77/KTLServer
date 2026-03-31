import { v2 as cloudinary } from "cloudinary";
import { getCloudinaryConfig } from "./env";

const cfg = getCloudinaryConfig();
if (cfg) {
  cloudinary.config(cfg);
} else {
  console.warn(
    "[config] Cloudinary credentials not set (CLOUDINARY_*). Product image uploads will fail until configured."
  );
}

export default cloudinary;
