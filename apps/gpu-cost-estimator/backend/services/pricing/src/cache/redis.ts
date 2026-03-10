import Redis from "ioredis";
import { config } from "../config/env";
import { createLogger } from "@geo-nap/common";

const logger = createLogger("pricing-service");
let redis: Redis | null = null;

export async function getRedisClient(): Promise<Redis | null> {
  if (redis) {
    return redis;
  }

  try {
    redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
    await redis.ping();
    logger.info({ redisUrl: config.REDIS_URL }, "redis connected");
    return redis;
  } catch (error) {
    logger.warn({ error }, "redis unavailable; proceeding without distributed cache");
    redis = null;
    return null;
  }
}
