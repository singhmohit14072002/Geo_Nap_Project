import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import {
  CloudProvider,
  PlanCreatedEvent,
  QueueEvent,
  SimulationCompletedEvent,
  SimulationFailedEvent,
  SimulationRequestedEvent,
  SimulationResultEvent,
  SimulationResultFailedEvent,
  SimulationScenario,
  createLogger
} from "@geo-nap/common";
import { v4 as uuidv4 } from "uuid";
import { fetchGpuOffers } from "../clients/pricingClient";
import { config } from "../config/env";
import {
  computeAndStoreAvailabilityScores,
  createBatch,
  getBatchProgress,
  getSuccessfulResults,
  hasOpenBatch,
  insertPricingSnapshots,
  insertSimulationFailure,
  insertSimulationResult,
  lockBatchCompletion,
  setPlanStatus
} from "../db/intelligence.repository";

const logger = createLogger("intelligence-service");
const SUPPORTED_PROVIDERS: CloudProvider[] = ["aws", "azure", "gcp", "vast"];

const EXCHANGE = "geo_nap.events";
const PLAN_CREATED_QUEUE = "geo_nap.intelligence.plan.created";
const SIM_RESULT_QUEUE = "geo_nap.intelligence.simulation.result";
const SIM_RESULT_FAILED_QUEUE = "geo_nap.intelligence.simulation.result.failed";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

async function publishEvent(routingKey: string, event: QueueEvent): Promise<void> {
  if (!channel) {
    throw new Error("RabbitMQ channel not initialized");
  }

  channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    contentType: "application/json"
  });
}

function buildScenarios(planId: string, offers: Awaited<ReturnType<typeof fetchGpuOffers>>): {
  batchId: string;
  scenarios: SimulationScenario[];
} {
  const batchId = uuidv4();
  const unique = new Map<string, SimulationScenario>();
  for (const offer of offers) {
    const key = `${offer.provider}:${offer.region}:${offer.sku}`;
    if (!unique.has(key)) {
      unique.set(key, {
        scenarioId: uuidv4(),
        provider: offer.provider,
        region: offer.region,
        sku: offer.sku
      });
    }
  }
  const scenarios = [...unique.values()];

  return { batchId, scenarios };
}

async function maybeCompleteBatch(batchId: string, planId: string): Promise<void> {
  const progress = await getBatchProgress(batchId);
  if (progress.expected === 0 || progress.received < progress.expected) {
    return;
  }

  const lock = await lockBatchCompletion(batchId);
  if (!lock) {
    return;
  }

  const successfulResults = await getSuccessfulResults(batchId);
  const availability = await computeAndStoreAvailabilityScores(batchId, config.AVAILABILITY_WINDOW);

  if (successfulResults.length === 0) {
    const failedEvent: SimulationFailedEvent = {
      eventType: "simulation.failed",
      payload: {
        planId,
        batchId,
        error: "All simulation scenarios failed"
      }
    };
    await publishEvent("simulation.failed", failedEvent);
    await setPlanStatus(planId, "failed", "All simulation scenarios failed");
    return;
  }

  const completedEvent: SimulationCompletedEvent = {
    eventType: "simulation.completed",
    payload: {
      planId,
      batchId,
      results: successfulResults,
      availability
    }
  };

  await publishEvent("simulation.completed", completedEvent);
  logger.info({ planId, batchId, successful: successfulResults.length }, "batch completed and published");
}

async function handlePlanCreated(event: PlanCreatedEvent): Promise<void> {
  const { planId, request } = event.payload;
  if (await hasOpenBatch(planId)) {
    logger.warn({ planId }, "ignoring duplicate plan.created while batch is still open");
    return;
  }

  await setPlanStatus(planId, "coordinating");

  const offers = await fetchGpuOffers();
  const loadedByProvider = SUPPORTED_PROVIDERS.reduce<Record<CloudProvider, number>>((acc, provider) => {
    acc[provider] = offers.filter((offer) => offer.provider === provider).length;
    return acc;
  }, { aws: 0, azure: 0, gcp: 0, vast: 0 });
  logger.info({ planId, loadedByProvider, totalOffers: offers.length }, "offers fetched for simulation batch");

  for (const provider of SUPPORTED_PROVIDERS) {
    if (loadedByProvider[provider] === 0) {
      logger.warn({ planId, provider }, "no pricing offers found for provider before simulation");
    }
  }

  const { batchId, scenarios } = buildScenarios(planId, offers);
  const scenariosByProvider = SUPPORTED_PROVIDERS.reduce<Record<CloudProvider, number>>((acc, provider) => {
    acc[provider] = scenarios.filter((scenario) => scenario.provider === provider).length;
    return acc;
  }, { aws: 0, azure: 0, gcp: 0, vast: 0 });

  await createBatch(batchId, planId, scenarios.length);
  await insertPricingSnapshots(batchId, planId, offers);

  if (scenarios.length === 0) {
    await publishEvent("simulation.failed", {
      eventType: "simulation.failed",
      payload: {
        planId,
        batchId,
        error: "No GPU scenarios available after deterministic filtering"
      }
    });
    await setPlanStatus(planId, "failed", "No GPU scenarios available after deterministic filtering");
    return;
  }

  await setPlanStatus(planId, "simulating");

  for (const scenario of scenarios) {
    const requestedEvent: SimulationRequestedEvent = {
      eventType: "simulation.requested",
      payload: {
        planId,
        batchId,
        request,
        scenario
      }
    };

    await publishEvent("simulation.requested", requestedEvent);
  }

  logger.info({ planId, batchId, scenarios: scenarios.length, scenariosByProvider }, "published simulation scenarios");
  for (const provider of SUPPORTED_PROVIDERS) {
    if (scenariosByProvider[provider] === 0) {
      logger.warn({ planId, batchId, provider }, "provider has zero simulation scenarios in this batch");
    }
  }
}

async function handleSimulationResult(event: SimulationResultEvent): Promise<void> {
  const { planId, batchId, scenario, result, completedAt } = event.payload;
  await insertSimulationResult(batchId, planId, scenario, result, completedAt);
  await maybeCompleteBatch(batchId, planId);
}

async function handleSimulationResultFailed(event: SimulationResultFailedEvent): Promise<void> {
  const { planId, batchId, scenario, error, completedAt } = event.payload;
  await insertSimulationFailure(batchId, planId, scenario, error, completedAt);
  await maybeCompleteBatch(batchId, planId);
}

async function onMessage(message: ConsumeMessage | null): Promise<void> {
  if (!message || !channel) {
    return;
  }

  try {
    const event = JSON.parse(message.content.toString("utf-8")) as QueueEvent;

    if (event.eventType === "plan.created") {
      await handlePlanCreated(event);
    } else if (event.eventType === "simulation.result") {
      await handleSimulationResult(event);
    } else if (event.eventType === "simulation.result.failed") {
      await handleSimulationResultFailed(event);
    }

    channel.ack(message);
  } catch (error) {
    logger.error({ error }, "intelligence message processing failed");
    channel.nack(message, false, false);
  }
}

export async function startConsumer(): Promise<void> {
  const conn = await amqp.connect(config.RABBITMQ_URL);
  const ch = await conn.createChannel();
  connection = conn;
  channel = ch;

  await ch.assertExchange(EXCHANGE, "topic", { durable: true });

  await ch.assertQueue(PLAN_CREATED_QUEUE, { durable: true });
  await ch.bindQueue(PLAN_CREATED_QUEUE, EXCHANGE, "plan.created");

  await ch.assertQueue(SIM_RESULT_QUEUE, { durable: true });
  await ch.bindQueue(SIM_RESULT_QUEUE, EXCHANGE, "simulation.result");

  await ch.assertQueue(SIM_RESULT_FAILED_QUEUE, { durable: true });
  await ch.bindQueue(SIM_RESULT_FAILED_QUEUE, EXCHANGE, "simulation.result.failed");

  await ch.consume(PLAN_CREATED_QUEUE, (msg: ConsumeMessage | null) => {
    void onMessage(msg);
  });
  await ch.consume(SIM_RESULT_QUEUE, (msg: ConsumeMessage | null) => {
    void onMessage(msg);
  });
  await ch.consume(SIM_RESULT_FAILED_QUEUE, (msg: ConsumeMessage | null) => {
    void onMessage(msg);
  });

  logger.info("intelligence consumer started");
}
