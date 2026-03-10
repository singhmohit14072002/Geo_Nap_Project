import mongoose from "mongoose";
import logger from "../utils/logger";

const MONGODB_URI = process.env.MONGODB_URL || "mongodb://root:examplepassword@localhost:27017/geo_nap?authSource=admin";

export async function connectMongoDB(): Promise<void> {
    try {
        await mongoose.connect(MONGODB_URI);
        logger.info("Connected to MongoDB for raw extraction persistence");
    } catch (error) {
        logger.error("Failed to connect to MongoDB", { error });
        process.exit(1);
    }
}
