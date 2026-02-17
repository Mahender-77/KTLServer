import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI as string);

    console.log("🟢 MongoDB Connected Successfully");
    console.log(`📦 Database: ${conn.connection.name}`);
    console.log(`🌍 Host: ${conn.connection.host}`);
  } catch (error) {
    console.error("🔴 MongoDB Connection Failed");
    console.error(error);
    process.exit(1); // stop server if DB fails
  }
};
