"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectMongoDB = connectMongoDB;
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = __importDefault(require("../utils/logger"));
const MONGODB_URI = process.env.MONGODB_URL || "mongodb://root:examplepassword@localhost:27017/geo_nap?authSource=admin";
async function connectMongoDB() {
    try {
        await mongoose_1.default.connect(MONGODB_URI);
        logger_1.default.info("Connected to MongoDB for raw extraction persistence");
    }
    catch (error) {
        logger_1.default.error("Failed to connect to MongoDB", { error });
        process.exit(1);
    }
}
