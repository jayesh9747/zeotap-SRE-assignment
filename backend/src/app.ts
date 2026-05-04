import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { Queue } from "bullmq";
import type { IncidentService } from "./incidents/service.js";
import { config } from "./config.js";
import { registerOpenApi } from "./openapi.js";
import { registerRoutes } from "./routes.js";
import type { SignalInput } from "./types.js";

export async function buildApp(signalQueue: Queue<SignalInput>, incidents: IncidentService) {
  const app = Fastify({
    logger: {
      transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" }
    }
  });

  await app.register(cors, {
    origin: config.frontendOrigin
  });

  await app.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
    redis: undefined
  });

  await registerOpenApi(app);
  registerRoutes(app, signalQueue, incidents);
  return app;
}
