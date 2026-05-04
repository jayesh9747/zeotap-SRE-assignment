import type { Queue } from "bullmq";
import type { PrismaClient } from "@prisma/client";

const counters = {
  accepted: 0,
  processed: 0,
  failedWrites: 0
};

export function markAccepted(count = 1) {
  counters.accepted += count;
}

export function markProcessed(count = 1) {
  counters.processed += count;
}

export function markFailedWrite(count = 1) {
  counters.failedWrites += count;
}

export function startThroughputLogger(queue: Queue, prisma: PrismaClient) {
  setInterval(async () => {
    const accepted = counters.accepted;
    const processed = counters.processed;
    const failedWrites = counters.failedWrites;
    counters.accepted = 0;
    counters.processed = 0;
    counters.failedWrites = 0;

    const [queueDepth, activeIncidents] = await Promise.all([
      queue.count().catch(() => -1),
      prisma.incident.count({ where: { status: { not: "CLOSED" } } }).catch(() => -1)
    ]);

    console.log(
      `[metrics] accepted=${accepted / 5}/sec processed=${processed / 5}/sec queueDepth=${queueDepth} failedWrites=${failedWrites} activeIncidents=${activeIncidents}`
    );
  }, 5000).unref();
}
