import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import {
  CloudProvider,
  QueueEvent,
  SimulationCompletedEvent,
  SimulationFailedEvent,
  createLogger
} from "@geo-nap/common";
import { config } from "../config/env";
import { getPlanResultLimit, saveRecommendationBundle, updatePlanStatus } from "../db/recommendations.repository";
import { rankRecommendations } from "./ranking";

const logger = createLogger("recommendation-service");
const SUPPORTED_PROVIDERS: CloudProvider[] = ["aws", "azure", "gcp", "vast"];

const EXCHANGE = "geo_nap.events";
const SIM_COMPLETED_QUEUE = "geo_nap.simulation.completed";
const SIM_FAILED_QUEUE = "geo_nap.simulation.failed";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

async function handleSimulationCompleted(event: SimulationCompletedEvent): Promise<void> {
  const { planId, batchId, results, availability } = event.payload;
  const resultLimit = await getPlanResultLimit(planId, config.DEFAULT_RESULT_LIMIT);

  const resultsByProvider = SUPPORTED_PROVIDERS.reduce<Record<CloudProvider, number>>((acc, provider) => {
    acc[provider] = results.filter((result) => result.provider === provider).length;
    return acc;
  }, { aws: 0, azure: 0, gcp: 0, vast: 0 });

  const bundle = rankRecommendations(results, availability, resultLimit);

  await saveRecommendationBundle(planId, batchId, bundle);
  await updatePlanStatus(planId, "recommended");

  logger.info(
    { planId, batchId, ranked: bundle.rankedAlternatives.length, resultsByProvider, resultLimit },
    "recommendations computed"
  );

  for (const provider of SUPPORTED_PROVIDERS) {
    if (resultsByProvider[provider] === 0) {
      logger.warn({ planId, batchId, provider }, "provider absent from simulation results before ranking");
    }
  }
}

async function handleSimulationFailed(event: SimulationFailedEvent): Promise<void> {
  const { planId, error } = event.payload;
  await updatePlanStatus(planId, "failed", error);
  logger.warn({ planId, error }, "simulation failed event applied");
}

async function onMessage(message: ConsumeMessage | null): Promise<void> {
  if (!message || !channel) {
    return;
  }

  try {
    const event = JSON.parse(message.content.toString("utf-8")) as QueueEvent;

    if (event.eventType === "simulation.completed") {
      await handleSimulationCompleted(event);
    } else if (event.eventType === "simulation.failed") {
      await handleSimulationFailed(event);
    }

    channel.ack(message);
  } catch (error) {
    logger.error({ error }, "failed to process recommendation message");
    channel.nack(message, false, false);
  }
}

export async function startConsumer(): Promise<void> {
  const conn = await amqp.connect(config.RABBITMQ_URL);
  const ch = await conn.createChannel();
  connection = conn;
  channel = ch;

  await ch.assertExchange(EXCHANGE, "topic", { durable: true });

  await ch.assertQueue(SIM_COMPLETED_QUEUE, { durable: true });
  await ch.bindQueue(SIM_COMPLETED_QUEUE, EXCHANGE, "simulation.completed");

  await ch.assertQueue(SIM_FAILED_QUEUE, { durable: true });
  await ch.bindQueue(SIM_FAILED_QUEUE, EXCHANGE, "simulation.failed");

  await ch.consume(SIM_COMPLETED_QUEUE, (msg: ConsumeMessage | null) => {
    void onMessage(msg);
  });
  await ch.consume(SIM_FAILED_QUEUE, (msg: ConsumeMessage | null) => {
    void onMessage(msg);
  });

  logger.info("recommendation consumer started");
}
