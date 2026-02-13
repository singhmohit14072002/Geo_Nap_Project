import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import {
  QueueEvent,
  SimulationRequestedEvent,
  SimulationResultEvent,
  SimulationResultFailedEvent,
  createLogger
} from "@geo-nap/common";
import { requestScenarioSimulation } from "../clients/pricingClient";
import { config } from "../config/env";

const logger = createLogger("simulation-service");

const EXCHANGE = "geo_nap.events";
const SIM_REQUESTED_QUEUE = "geo_nap.simulation.requested";
const SIM_REQUESTED_ROUTING_KEY = "simulation.requested";

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

async function handleSimulationRequested(event: SimulationRequestedEvent): Promise<void> {
  const { planId, batchId, request, scenario } = event.payload;

  try {
    const results = await requestScenarioSimulation(planId, batchId, scenario, request);
    const selected = results[0];

    if (!selected) {
      throw new Error("No deterministic simulation result returned for scenario");
    }

    const simulationEvent: SimulationResultEvent = {
      eventType: "simulation.result",
      payload: {
        planId,
        batchId,
        scenario,
        result: selected,
        completedAt: new Date().toISOString()
      }
    };

    await publishEvent("simulation.result", simulationEvent);

    logger.info(
      {
        planId,
        batchId,
        scenarioId: scenario.scenarioId,
        provider: scenario.provider,
        region: scenario.region,
        sku: scenario.sku
      },
      "simulation scenario completed"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown simulation error";
    const failureEvent: SimulationResultFailedEvent = {
      eventType: "simulation.result.failed",
      payload: {
        planId,
        batchId,
        scenario,
        error: message,
        completedAt: new Date().toISOString()
      }
    };

    await publishEvent("simulation.result.failed", failureEvent);

    logger.error({ planId, batchId, scenarioId: scenario.scenarioId, error }, "simulation scenario failed");
  }
}

async function onMessage(message: ConsumeMessage | null): Promise<void> {
  if (!message || !channel) {
    return;
  }

  try {
    const event = JSON.parse(message.content.toString("utf-8")) as QueueEvent;

    if (event.eventType === "simulation.requested") {
      await handleSimulationRequested(event);
    }

    channel.ack(message);
  } catch (error) {
    logger.error({ error }, "message processing failed");
    channel.nack(message, false, false);
  }
}

export async function startConsumer(): Promise<void> {
  const conn = await amqp.connect(config.RABBITMQ_URL);
  const ch = await conn.createChannel();
  connection = conn;
  channel = ch;

  await ch.assertExchange(EXCHANGE, "topic", { durable: true });
  await ch.assertQueue(SIM_REQUESTED_QUEUE, { durable: true });
  await ch.bindQueue(SIM_REQUESTED_QUEUE, EXCHANGE, SIM_REQUESTED_ROUTING_KEY);
  await ch.consume(SIM_REQUESTED_QUEUE, (msg: ConsumeMessage | null) => {
    void onMessage(msg);
  });

  logger.info("simulation consumer started");
}
