import { createLogger } from "@geo-nap/common";
import { createApp } from "./app";
import { config } from "./config/env";
import { startConsumer } from "./queue/consumer";

const logger = createLogger("recommendation-service");

async function bootstrap() {
  await startConsumer();

  const app = createApp();
  app.listen(config.RECOMMENDATION_PORT, () => {
    logger.info({ port: config.RECOMMENDATION_PORT }, "recommendation-service started");
  });
}

bootstrap().catch((error) => {
  logger.fatal({ error }, "recommendation-service failed to start");
  process.exit(1);
});
