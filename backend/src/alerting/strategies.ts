import type { ComponentType, Severity, SignalInput } from "../types.js";

export type AlertDecision = {
  severity: Severity;
  responderGroup: string;
  title: string;
};

export interface AlertStrategy {
  decide(signal: SignalInput): AlertDecision;
}

class RdbmsAlertStrategy implements AlertStrategy {
  decide(signal: SignalInput): AlertDecision {
    return {
      severity: "P0",
      responderGroup: "database-oncall",
      title: `P0 RDBMS failure on ${signal.componentId}`
    };
  }
}

class McpHostAlertStrategy implements AlertStrategy {
  decide(signal: SignalInput): AlertDecision {
    return {
      severity: "P1",
      responderGroup: "platform-oncall",
      title: `P1 MCP host failure on ${signal.componentId}`
    };
  }
}

class CacheAlertStrategy implements AlertStrategy {
  decide(signal: SignalInput): AlertDecision {
    return {
      severity: "P2",
      responderGroup: "cache-oncall",
      title: `P2 cache degradation on ${signal.componentId}`
    };
  }
}

class QueueAlertStrategy implements AlertStrategy {
  decide(signal: SignalInput): AlertDecision {
    const timeout = String(signal.payload["errorCode"] ?? signal.message).toLowerCase().includes("timeout");
    return {
      severity: timeout ? "P1" : "P2",
      responderGroup: "async-platform-oncall",
      title: `${timeout ? "P1" : "P2"} queue failure on ${signal.componentId}`
    };
  }
}

class DefaultAlertStrategy implements AlertStrategy {
  decide(signal: SignalInput): AlertDecision {
    return {
      severity: "P3",
      responderGroup: "service-oncall",
      title: `P3 incident on ${signal.componentId}`
    };
  }
}

const strategies: Partial<Record<ComponentType, AlertStrategy>> = {
  RDBMS: new RdbmsAlertStrategy(),
  MCP_HOST: new McpHostAlertStrategy(),
  CACHE: new CacheAlertStrategy(),
  QUEUE: new QueueAlertStrategy()
};

const defaultStrategy = new DefaultAlertStrategy();

export function selectAlertStrategy(componentType: ComponentType): AlertStrategy {
  return strategies[componentType] ?? defaultStrategy;
}
