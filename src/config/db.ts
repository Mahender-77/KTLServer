import { logger } from '../utils/logger';
import mongoose from "mongoose";
import { getMongoUri } from "./env";
import { bootstrapTenantData } from "../migrations/organizationBootstrap";
import { bootstrapSuperAdminUsers } from "../migrations/superAdminBootstrap";

export const connectDB = async (): Promise<void> => {
  try {
    const uri = getMongoUri();
    const conn = await mongoose.connect(uri);

    logger.log("🟢 MongoDB Connected Successfully");
    logger.log(`📦 Database: ${conn.connection.name}`);
    logger.log(`🌍 Host: ${conn.connection.host}`);

    await bootstrapTenantData();
    await bootstrapSuperAdminUsers();
  } catch (error) {
    logger.error("🔴 MongoDB Connection Failed");
    logger.error("DB error details", error);
    process.exit(1);
  }
};
