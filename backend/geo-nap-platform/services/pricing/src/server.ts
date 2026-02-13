import { createLogger } from "@geo-nap/common";
import { createApp } from "./app";
import { config } from "./config/env";

const logger = createLogger("pricing-service");

const app = createApp();
app.listen(config.PRICING_PORT, () => {
  logger.info({ port: config.PRICING_PORT }, "pricing-service started");
});
