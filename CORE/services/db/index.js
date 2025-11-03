import mongoose from "mongoose";
import { config } from "@/config";

const mongoUri = config.db.MONGO_URI;

export const connectDB = async () => {
  try {
    await mongoose.connect(mongoUri);
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

export default mongoose;
