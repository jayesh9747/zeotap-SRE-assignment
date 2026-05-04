import type { Prisma, PrismaClient } from "@prisma/client";
import type { Collection } from "mongodb";
import type { Redis } from "ioredis";
import { selectAlertStrategy } from "../alerting/strategies.js";
import { DashboardCache } from "../dashboard/cache.js";
import { incrementAggregation } from "../aggregations/service.js";
import type { IncidentStatus, RcaInput, SignalInput } from "../types.js";
import { validateTransition, WorkflowError } from "../workflow/state.js";

const DEBOUNCE_WINDOW_SECONDS = 10;

export class IncidentService {
  private readonly dashboard: DashboardCache;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly rawSignals: Collection,
    private readonly redis: Redis
  ) {
    this.dashboard = new DashboardCache(redis);
  }

  async processSignal(signal: SignalInput) {
    const timestamp = signal.timestamp instanceof Date ? signal.timestamp : new Date(signal.timestamp);
    const normalizedSignal = { ...signal, timestamp };
    const windowStart = Math.floor(timestamp.getTime() / (DEBOUNCE_WINDOW_SECONDS * 1000));
    const debounceKey = `${normalizedSignal.componentId}:${windowStart}`;
    const alert = selectAlertStrategy(normalizedSignal.componentType).decide(normalizedSignal);

    const incident = await this.prisma.incident.upsert({
      where: { debounceKey },
      update: {
        signalCount: { increment: 1 }
      },
      create: {
        componentId: normalizedSignal.componentId,
        componentType: normalizedSignal.componentType,
        severity: alert.severity,
        status: "OPEN",
        title: alert.title,
        firstSignalAt: timestamp,
        lastSignalAt: timestamp,
        signalCount: 1,
        responderGroup: alert.responderGroup,
        debounceKey
      }
    });

    await this.prisma.$executeRaw`
      UPDATE "Incident"
      SET
        "firstSignalAt" = LEAST("firstSignalAt", ${timestamp}),
        "lastSignalAt" = GREATEST("lastSignalAt", ${timestamp}),
        "updatedAt" = NOW()
      WHERE "id" = ${incident.id}
    `;

    const normalizedIncident = await this.prisma.incident.findUniqueOrThrow({
      where: { id: incident.id }
    });

    await this.rawSignals.insertOne({
      incidentId: normalizedIncident.id,
      componentId: normalizedSignal.componentId,
      componentType: normalizedSignal.componentType,
      timestamp,
      level: normalizedSignal.level,
      message: normalizedSignal.message,
      payload: normalizedSignal.payload
    });

    await Promise.all([
      incrementAggregation(this.prisma, {
        componentId: normalizedSignal.componentId,
        severity: normalizedIncident.severity,
        timestamp
      }),
      this.dashboard.upsertIncident(normalizedIncident)
    ]);

    return normalizedIncident;
  }

  async listIncidents() {
    const cached = await this.dashboard.listActive();
    if (cached.length > 0) return cached;

    const incidents = await this.prisma.incident.findMany({
      where: { status: { not: "CLOSED" } },
      orderBy: [{ severity: "asc" }, { lastSignalAt: "desc" }]
    });

    return incidents;
  }

  async getIncident(id: string) {
    return this.prisma.incident.findUnique({
      where: { id },
      include: { rca: true }
    });
  }

  async getSignals(id: string, page: number, pageSize: number) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(10, pageSize));
    const query = { incidentId: id };
    const [items, total] = await Promise.all([
      this.rawSignals
        .find(query)
        .sort({ timestamp: -1 })
        .skip((safePage - 1) * safePageSize)
        .limit(safePageSize)
        .toArray(),
      this.rawSignals.countDocuments(query)
    ]);

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize))
    };
  }

  async updateStatus(id: string, status: IncidentStatus) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: { rca: true }
    });

    if (!incident) return null;

    validateTransition(incident.status, status, incident.rca);

    const updated = await this.prisma.incident.update({
      where: { id },
      data: { status },
      include: { rca: true }
    });
    await this.dashboard.upsertIncident(updated);
    return updated;
  }

  async submitRca(id: string, rca: RcaInput) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) return null;

    const mttrSeconds = Math.max(0, Math.floor((rca.endTime.getTime() - incident.firstSignalAt.getTime()) / 1000));

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.rca.upsert({
        where: { incidentId: id },
        update: rca,
        create: {
          incidentId: id,
          ...rca
        }
      });

      return tx.incident.update({
        where: { id },
        data: { mttrSeconds },
        include: { rca: true }
      });
    });

    await this.dashboard.upsertIncident(updated);
    return updated;
  }

  async listAggregations() {
    return this.prisma.aggregationBucket.findMany({
      orderBy: { bucketStart: "desc" },
      take: 100
    });
  }
}

export function formatWorkflowError(error: unknown) {
  if (error instanceof WorkflowError) {
    return { statusCode: error.statusCode, body: { error: error.message } };
  }
  return null;
}
