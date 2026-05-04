const API_BASE = process.env.API_BASE ?? "http://localhost:4000";

const now = Date.now();

const signals = [
  ...Array.from({ length: 120 }, (_, index) => ({
    componentId: "RDBMS_PRIMARY_01",
    componentType: "RDBMS",
    timestamp: new Date(now + index * 20).toISOString(),
    level: "ERROR",
    message: "primary database connection pool exhausted",
    payload: { errorCode: "CONNECTION_POOL_EXHAUSTED", latencyMs: 2400 + index }
  })),
  ...Array.from({ length: 40 }, (_, index) => ({
    componentId: "MCP_HOST_17",
    componentType: "MCP_HOST",
    timestamp: new Date(now + 3000 + index * 50).toISOString(),
    level: "ERROR",
    message: "mcp host unable to reach tool runtime",
    payload: { errorCode: "TOOL_RUNTIME_UNAVAILABLE" }
  })),
  ...Array.from({ length: 80 }, (_, index) => ({
    componentId: "CACHE_CLUSTER_01",
    componentType: "CACHE",
    timestamp: new Date(now + 5000 + index * 25).toISOString(),
    level: "WARN",
    message: "cache read latency spike",
    payload: { latencyMs: 900 + index }
  }))
];

const response = await fetch(`${API_BASE}/api/signals/batch`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ signals })
});

console.log(await response.json());
