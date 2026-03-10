import { createLogger } from "@geo-nap/common";
import { createApp } from "./app";
import { config } from "./config/env";

const logger = createLogger("requirement-normalizer-service");

const app = createApp();
app.listen(config.REQUIREMENT_NORMALIZER_PORT, () => {
  logger.info({ port: config.REQUIREMENT_NORMALIZER_PORT }, "requirement-normalizer-service started");
});
