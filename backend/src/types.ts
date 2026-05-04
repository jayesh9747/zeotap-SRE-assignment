import { z } from "zod";

export const componentTypes = ["RDBMS", "MCP_HOST", "CACHE", "QUEUE", "API", "NOSQL"] as const;
export const incidentStatuses = ["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"] as const;
export const severities = ["P0", "P1", "P2", "P3"] as const;

export const signalSchema = z.object({
  componentId: z.string().min(1),
  componentType: z.enum(componentTypes),
  timestamp: z.coerce.date().default(() => new Date()),
  level: z.enum(["ERROR", "WARN", "INFO"]).default("ERROR"),
  message: z.string().min(1),
  payload: z.record(z.unknown()).default({})
});

export const batchSignalSchema = z.object({
  signals: z.array(signalSchema).min(1).max(5000)
});

export const statusUpdateSchema = z.object({
  status: z.enum(incidentStatuses)
});

export const rcaSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  rootCauseCategory: z.string().min(1),
  fixApplied: z.string().min(5),
  preventionSteps: z.string().min(5)
}).refine((value) => value.endTime >= value.startTime, {
  message: "endTime must be after startTime",
  path: ["endTime"]
});

export type SignalInput = z.infer<typeof signalSchema>;
export type RcaInput = z.infer<typeof rcaSchema>;
export type IncidentStatus = typeof incidentStatuses[number];
export type Severity = typeof severities[number];
export type ComponentType = typeof componentTypes[number];
