import { Queue, Worker, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";
import type { IncidentService } from "../incidents/service.js";
import type { SignalInput } from "../types.js";
import { markFailedWrite, markProcessed } from "../metrics/throughput.js";
import { withRetry } from "../lib/retry.js";

export const SIGNAL_QUEUE = "signals";

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 250
  },
  removeOnComplete: 5000,
  removeOnFail: 10000
};

export function createSignalQueue(redis: Redis) {
  return new Queue<SignalInput>(SIGNAL_QUEUE, {
    connection: redis,
    defaultJobOptions
  });
}

export function startSignalWorker(redis: Redis, incidentService: IncidentService, concurrency: number) {
  const worker = new Worker<SignalInput>(
    SIGNAL_QUEUE,
    async (job) => {
      await withRetry(() => incidentService.processSignal(job.data), {
        attempts: 3,
        baseDelayMs: 100,
        label: "signal persistence"
      });
      markProcessed();
    },
    { connection: redis, concurrency }
  );

  worker.on("failed", (job, error) => {
    markFailedWrite();
    console.error(`[worker] job=${job?.id ?? "unknown"} failed`, error);
  });

  return worker;
}
