import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export async function registerOpenApi(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Incident Management System API",
        description: "APIs for signal ingestion, incident workflow, RCA submission, raw signal lookup, and metrics.",
        version: "1.0.0"
      },
      servers: [
        {
          url: "http://localhost:4000",
          description: "Local Docker Compose backend"
        }
      ],
      tags: [
        { name: "Health", description: "Service readiness checks" },
        { name: "Signals", description: "High-volume signal ingestion endpoints" },
        { name: "Incidents", description: "Incident list, detail, raw signal evidence, and status transitions" },
        { name: "RCA", description: "Root Cause Analysis submission and MTTR calculation" },
        { name: "Metrics", description: "Timeseries aggregation reads" }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/api-docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    }
  });
}

export const signalBodySchema = {
  type: "object",
  required: ["componentId", "componentType", "message"],
  properties: {
    componentId: { type: "string" },
    componentType: { type: "string", enum: ["RDBMS", "MCP_HOST", "CACHE", "QUEUE", "API", "NOSQL"] },
    timestamp: { type: "string", format: "date-time" },
    level: { type: "string", enum: ["ERROR", "WARN", "INFO"] },
    message: { type: "string" },
    payload: {
      type: "object",
      additionalProperties: true
    }
  }
} as const;

export const batchSignalBodySchema = {
  type: "object",
  required: ["signals"],
  properties: {
    signals: {
      type: "array",
      minItems: 1,
      maxItems: 5000,
      items: signalBodySchema
    }
  }
} as const;

export const statusBodySchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"] }
  }
} as const;

export const rcaBodySchema = {
  type: "object",
  required: ["startTime", "endTime", "rootCauseCategory", "fixApplied", "preventionSteps"],
  properties: {
    startTime: { type: "string", format: "date-time" },
    endTime: { type: "string", format: "date-time" },
    rootCauseCategory: { type: "string" },
    fixApplied: { type: "string" },
    preventionSteps: { type: "string" }
  }
} as const;

export const incidentSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    componentId: { type: "string" },
    componentType: { type: "string" },
    severity: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
    status: { type: "string", enum: ["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"] },
    title: { type: "string" },
    firstSignalAt: { type: "string", format: "date-time" },
    lastSignalAt: { type: "string", format: "date-time" },
    signalCount: { type: "number" },
    responderGroup: { type: "string" },
    mttrSeconds: { type: "number", nullable: true }
  }
} as const;

export const rawSignalSchema = {
  type: "object",
  properties: {
    _id: { type: "string" },
    incidentId: { type: "string" },
    componentId: { type: "string" },
    componentType: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    level: { type: "string" },
    message: { type: "string" },
    payload: { type: "object", additionalProperties: true }
  }
} as const;

export const errorSchema = {
  type: "object",
  additionalProperties: true
} as const;
