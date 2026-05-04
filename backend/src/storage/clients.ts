import { PrismaClient } from "@prisma/client";
import { MongoClient } from "mongodb";
import { Redis } from "ioredis";
import { config } from "../config.js";

export const prisma = new PrismaClient();
export const mongoClient = new MongoClient(config.mongoUrl);
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null
});

export async function connectStorage() {
  await mongoClient.connect();
  await prisma.$connect();
  await ensureMongoIndexes();
}

export async function closeStorage() {
  await Promise.allSettled([
    prisma.$disconnect(),
    mongoClient.close(),
    redis.quit()
  ]);
}

export function rawSignalsCollection() {
  return mongoClient.db().collection("raw_signals");
}

async function ensureMongoIndexes() {
  const collection = rawSignalsCollection();
  await Promise.all([
    collection.createIndex({ incidentId: 1, timestamp: -1 }),
    collection.createIndex({ componentId: 1, timestamp: -1 }),
    collection.createIndex({ timestamp: -1 })
  ]);
}
