import dotenv from "dotenv";
import app from "./app";
import logger from "./utils/logger";

dotenv.config();

const port = Number(process.env.PORT ?? 4030);

app.listen(port, () => {
  logger.info("Service started", {
    port,
    environment: process.env.NODE_ENV ?? "development"
  });
});
