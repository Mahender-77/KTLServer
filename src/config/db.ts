import mongoose from "mongoose";
import { getMongoUri } from "./env";
import { bootstrapTenantData } from "../migrations/organizationBootstrap";
import { bootstrapSuperAdminUsers } from "../migrations/superAdminBootstrap";

export const connectDB = async (): Promise<void> => {
  try {
    const uri = getMongoUri();
    const conn = await mongoose.connect(uri);

    console.log("🟢 MongoDB Connected Successfully");
    console.log(`📦 Database: ${conn.connection.name}`);
    console.log(`🌍 Host: ${conn.connection.host}`);

    await bootstrapTenantData();
    await bootstrapSuperAdminUsers();
  } catch (error) {
    console.error("🔴 MongoDB Connection Failed");
    console.error(error);
    process.exit(1);
  }
};
