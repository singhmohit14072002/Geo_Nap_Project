import { createLogger } from "@geo-nap/common";
import { createApp } from "./app";
import { config } from "./config/env";
import { startConsumer } from "./queue/consumer";

const logger = createLogger("intelligence-service");

async function bootstrap() {
  await startConsumer();

  const app = createApp();
  app.listen(config.INTELLIGENCE_PORT, () => {
    logger.info({ port: config.INTELLIGENCE_PORT }, "intelligence-service started");
  });
}

bootstrap().catch((error) => {
  logger.fatal({ error }, "intelligence-service failed to start");
  process.exit(1);
});
