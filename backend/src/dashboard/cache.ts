import type { Redis } from "ioredis";
import type { Incident } from "@prisma/client";

const DASHBOARD_KEY = "dashboard:active-incidents";
const severityRank = { P0: 4, P1: 3, P2: 2, P3: 1 };

export type DashboardIncident = Pick<
  Incident,
  | "id"
  | "componentId"
  | "componentType"
  | "severity"
  | "status"
  | "title"
  | "firstSignalAt"
  | "lastSignalAt"
  | "signalCount"
  | "responderGroup"
  | "mttrSeconds"
  | "createdAt"
  | "updatedAt"
>;

export class DashboardCache {
  constructor(private readonly redis: Redis) {}

  async upsertIncident(incident: DashboardIncident) {
    if (incident.status === "CLOSED") {
      await this.redis.hdel(DASHBOARD_KEY, incident.id);
      return;
    }

    await this.redis.hset(DASHBOARD_KEY, incident.id, JSON.stringify(incident));
  }

  async listActive(): Promise<DashboardIncident[]> {
    const values = await this.redis.hvals(DASHBOARD_KEY);
    return values
      .map((value: string) => JSON.parse(value) as DashboardIncident)
      .sort((a, b) => {
        const severityDiff = severityRank[b.severity] - severityRank[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.lastSignalAt).getTime() - new Date(a.lastSignalAt).getTime();
      });
  }
}
