import { config } from "./config.js";
import { buildApp } from "./app.js";
import { connectStorage, rawSignalsCollection, prisma, redis, closeStorage } from "./storage/clients.js";
import { IncidentService } from "./incidents/service.js";
import { createSignalQueue, startSignalWorker } from "./ingestion/queue.js";
import { startThroughputLogger } from "./metrics/throughput.js";

await connectStorage();

const incidentService = new IncidentService(prisma, rawSignalsCollection(), redis);
const signalQueue = createSignalQueue(redis);
const worker = startSignalWorker(redis, incidentService, config.workerConcurrency);
const app = await buildApp(signalQueue, incidentService);

startThroughputLogger(signalQueue, prisma);

const shutdown = async () => {
  await app.close();
  await worker.close();
  await signalQueue.close();
  await closeStorage();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: "0.0.0.0" });
