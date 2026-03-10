import amqp, { Channel, ChannelModel } from "amqplib";
import { QueueEvent } from "@geo-nap/common";
import { config } from "../config/env";

const EXCHANGE = "geo_nap.events";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function getChannel(): Promise<Channel> {
  if (channel) {
    return channel;
  }

  const conn = await amqp.connect(config.RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, "topic", { durable: true });

  connection = conn;
  channel = ch;
  return ch;
}

export async function publishEvent(routingKey: string, event: QueueEvent): Promise<void> {
  const ch = await getChannel();
  ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    contentType: "application/json"
  });
}
