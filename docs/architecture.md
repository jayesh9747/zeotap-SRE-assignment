# IMS Architecture Notes

## Ingestion

Signals enter through Fastify endpoints:

- `POST /api/signals`
- `POST /api/signals/batch`

The API validates payloads and enqueues them into Redis/BullMQ. Persistence happens in the worker so high-volume bursts do not crash the request path when databases are slow.

Swagger/OpenAPI documentation is served by the backend at `/api-docs`, with route descriptions and request/response schemas for every public API.

## Debouncing

The worker derives a debounce key:

```text
componentId + floor(timestamp / 10 seconds)
```

Postgres has a unique `debounceKey` on incidents. `upsert` makes this concurrency-safe: the first signal creates the incident, and later signals in the same component/window increment `signalCount`.

All raw signals are still inserted into MongoDB with the resolved `incidentId`.

## Workflow

The lifecycle is implemented with state classes:

```text
OPEN -> INVESTIGATING -> RESOLVED -> CLOSED
```

`RESOLVED -> CLOSED` requires an RCA. Invalid transitions return conflict errors.

## Alerting

Alerting is implemented with strategy classes selected by component type:

- RDBMS: P0, database on-call
- MCP host: P1, platform on-call
- Cache: P2, cache on-call
- Queue: P1 for timeout-like failures, otherwise P2
- Default: P3

## Dashboard Hot Path

Active incidents are cached in Redis. The UI refreshes frequently, so reads hit Redis first and avoid repeated source-of-truth scans.

## MTTR

MTTR is computed when RCA is submitted:

```text
RCA end time - first signal time
```

The value is stored on the incident as `mttrSeconds`.
