import { createLogger } from "@geo-nap/common";
import { createApp } from "./app";
import { config } from "./config/env";

const logger = createLogger("planner-service");

const app = createApp();
app.listen(config.PLANNER_PORT, () => {
  logger.info({ port: config.PLANNER_PORT }, "planner-service started");
});
