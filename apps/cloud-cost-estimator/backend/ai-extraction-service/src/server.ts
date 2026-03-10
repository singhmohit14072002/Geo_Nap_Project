import dotenv from "dotenv";
import app from "./app";
import logger from "./utils/logger";
import { connectMongoDB } from "./db/mongodb";

dotenv.config();

const port = Number(process.env.PORT ?? 4010);

connectMongoDB().then(() => {
  app.listen(port, () => {
    logger.info("Service started", {
      port,
      environment: process.env.NODE_ENV ?? "development"
    });
  });
});
