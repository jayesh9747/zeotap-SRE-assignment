const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const size = Number(process.env.BURST_SIZE ?? 10000);
const now = Date.now();

for (let offset = 0; offset < size; offset += 500) {
  const signals = Array.from({ length: Math.min(500, size - offset) }, (_, index) => ({
    componentId: "CACHE_CLUSTER_01",
    componentType: "CACHE",
    timestamp: new Date(now + (offset + index)).toISOString(),
    level: "ERROR",
    message: "cache timeout during burst",
    payload: { errorCode: "CACHE_TIMEOUT", sample: offset + index }
  }));

  const response = await fetch(`${API_BASE}/api/signals/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signals })
  });

  if (!response.ok) {
    console.error(`batch ${offset} failed`, response.status, await response.text());
  }
}

console.log(`submitted ${size} burst signals`);
