import mongoose from "mongoose";
import { config } from "../config/env.js";

export const connectDatabase = async () => {
  if (!config.mongoUri) {
    throw new Error("MONGODB_URI is required to start the application");
  }

  await mongoose.connect(config.mongoUri);
  console.log("MongoDB connected.");
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
};
