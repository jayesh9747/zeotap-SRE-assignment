import type { PrismaClient, Severity } from "@prisma/client";

export async function incrementAggregation(
  prisma: PrismaClient,
  input: { componentId: string; severity: Severity; timestamp: Date }
) {
  const bucketStart = new Date(input.timestamp);
  bucketStart.setSeconds(0, 0);

  await prisma.aggregationBucket.upsert({
    where: {
      componentId_severity_bucketStart_bucketSize: {
        componentId: input.componentId,
        severity: input.severity,
        bucketStart,
        bucketSize: "1m"
      }
    },
    update: {
      signalCount: { increment: 1 }
    },
    create: {
      componentId: input.componentId,
      severity: input.severity,
      bucketStart,
      bucketSize: "1m",
      signalCount: 1
    }
  });
}
