import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import type { IncidentService } from "./incidents/service.js";
import { formatWorkflowError } from "./incidents/service.js";
import {
  batchSignalBodySchema,
  errorSchema,
  incidentSchema,
  rawSignalSchema,
  rcaBodySchema,
  signalBodySchema,
  statusBodySchema
} from "./openapi.js";
import { batchSignalSchema, rcaSchema, signalSchema, statusUpdateSchema, type SignalInput } from "./types.js";
import { markAccepted } from "./metrics/throughput.js";

export function registerRoutes(app: FastifyInstance, signalQueue: Queue<SignalInput>, incidents: IncidentService) {
  app.get("/health", {
    schema: {
      tags: ["Health"],
      summary: "Check backend health",
      description: "Returns a lightweight health response used by Docker/local checks.",
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            timestamp: { type: "string", format: "date-time" }
          }
        }
      }
    }
  }, async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  app.post("/api/signals", {
    schema: {
      tags: ["Signals"],
      summary: "Ingest one operational signal",
      description: "Validates one signal and enqueues it for async worker processing. Returns 202 after queueing, not after persistence.",
      body: signalBodySchema,
      response: {
        202: {
          type: "object",
          properties: { accepted: { type: "number" } }
        },
        400: errorSchema
      }
    }
  }, async (request, reply) => {
    const parsed = signalSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    await signalQueue.add("signal", parsed.data);
    markAccepted();
    return reply.status(202).send({ accepted: 1 });
  });

  app.post("/api/signals/batch", {
    schema: {
      tags: ["Signals"],
      summary: "Ingest a batch of operational signals",
      description: "Accepts up to 5000 signals per request and enqueues every signal into BullMQ for async processing.",
      body: batchSignalBodySchema,
      response: {
        202: {
          type: "object",
          properties: { accepted: { type: "number" } }
        },
        400: errorSchema
      }
    }
  }, async (request, reply) => {
    const parsed = batchSignalSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    await signalQueue.addBulk(parsed.data.signals.map((signal) => ({ name: "signal", data: signal })));
    markAccepted(parsed.data.signals.length);
    return reply.status(202).send({ accepted: parsed.data.signals.length });
  });

  app.get("/api/incidents", {
    schema: {
      tags: ["Incidents"],
      summary: "List active incidents",
      description: "Returns active incidents from Redis dashboard cache, falling back to Postgres when the cache is empty.",
      response: {
        200: {
          type: "array",
          items: incidentSchema
        }
      }
    }
  }, async () => incidents.listIncidents());

  app.get("/api/incidents/:id", {
    schema: {
      tags: ["Incidents"],
      summary: "Get incident detail",
      description: "Returns one incident, including RCA when present.",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } }
      },
      response: {
        200: incidentSchema,
        404: errorSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const incident = await incidents.getIncident(id);
    if (!incident) return reply.status(404).send({ error: "Incident not found" });
    return incident;
  });

  app.get("/api/incidents/:id/signals", {
    schema: {
      tags: ["Incidents"],
      summary: "Get paginated raw signals for an incident",
      description: "Reads raw signal evidence from MongoDB. Pagination keeps the UI stable for large incidents.",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } }
      },
      querystring: {
        type: "object",
        properties: {
          page: { type: "number", default: 1 },
          pageSize: { type: "number", default: 25, maximum: 100 }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            items: { type: "array", items: rawSignalSchema },
            total: { type: "number" },
            page: { type: "number" },
            pageSize: { type: "number" },
            totalPages: { type: "number" }
          }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    return incidents.getSignals(id, Number(query.page ?? 1), Number(query.pageSize ?? 25));
  });

  app.patch("/api/incidents/:id/status", {
    schema: {
      tags: ["Incidents"],
      summary: "Transition incident status",
      description: "Moves an incident through OPEN -> INVESTIGATING -> RESOLVED -> CLOSED. Closing requires complete RCA.",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } }
      },
      body: statusBodySchema,
      response: {
        200: incidentSchema,
        400: errorSchema,
        404: errorSchema,
        409: errorSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = statusUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    try {
      const incident = await incidents.updateStatus(id, parsed.data.status);
      if (!incident) return reply.status(404).send({ error: "Incident not found" });
      return incident;
    } catch (error) {
      const workflowError = formatWorkflowError(error);
      if (workflowError) return reply.status(workflowError.statusCode).send(workflowError.body);
      throw error;
    }
  });

  app.post("/api/incidents/:id/rca", {
    schema: {
      tags: ["RCA"],
      summary: "Submit or update RCA",
      description: "Stores the RCA transactionally in Postgres and calculates MTTR from first signal time to RCA end time.",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } }
      },
      body: rcaBodySchema,
      response: {
        200: incidentSchema,
        400: errorSchema,
        404: errorSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = rcaSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const incident = await incidents.submitRca(id, parsed.data);
    if (!incident) return reply.status(404).send({ error: "Incident not found" });
    return incident;
  });

  app.get("/api/metrics/aggregations", {
    schema: {
      tags: ["Metrics"],
      summary: "List recent aggregation buckets",
      description: "Returns recent 1-minute signal-count buckets used for timeseries-style reporting.",
      response: {
        200: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              componentId: { type: "string" },
              severity: { type: "string" },
              bucketStart: { type: "string", format: "date-time" },
              bucketSize: { type: "string" },
              signalCount: { type: "number" }
            }
          }
        }
      }
    }
  }, async () => incidents.listAggregations());
}
