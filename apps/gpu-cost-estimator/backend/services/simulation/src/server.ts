import { createLogger } from "@geo-nap/common";
import { createApp } from "./app";
import { config } from "./config/env";
import { startConsumer } from "./queue/consumer";

const logger = createLogger("simulation-service");

async function bootstrap() {
  await startConsumer();

  const app = createApp();
  app.listen(config.SIMULATION_PORT, () => {
    logger.info({ port: config.SIMULATION_PORT }, "simulation-service started");
  });
}

bootstrap().catch((error) => {
  logger.fatal({ error }, "simulation-service failed to start");
  process.exit(1);
});
