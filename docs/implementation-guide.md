# Complete Implementation Guide

## Goal

The system solves a production-style incident workflow problem:

- ingest many operational signals,
- avoid losing raw evidence,
- group noisy repeated failures,
- assign severity and responders,
- let operators investigate and resolve,
- require RCA before closure,
- calculate MTTR.

## Runtime Components

The app runs through Docker Compose:

- `frontend`: React/Vite dashboard on port `5173`
- `backend`: Fastify API and BullMQ worker on port `4000`
- `postgres`: transactional source of truth
- `mongo`: raw signal data lake
- `redis`: queue, cache, and hot dashboard state

## Backend Flow

Swagger UI is exposed at:

```text
http://localhost:4000/api-docs
```

The raw OpenAPI document is exposed at:

```text
http://localhost:4000/api-docs/json
```

### 1. Signal Ingestion

Clients call:

```text
POST /api/signals
POST /api/signals/batch
```

The backend validates the payload using Zod. Valid signals are enqueued into BullMQ and the API returns `202 Accepted`.

The API does not wait for Postgres or MongoDB writes. That is the main backpressure decision.

### 2. Async Worker

The worker consumes BullMQ jobs with configurable concurrency.

For each signal it:

1. normalizes the timestamp,
2. selects the alert strategy,
3. computes the 10-second debounce key,
4. upserts the Postgres incident,
5. writes the raw signal to MongoDB,
6. increments aggregation buckets,
7. updates the Redis dashboard cache.

### 3. Debounce

Debounce is implemented through a unique Postgres `debounceKey`.

```text
componentId:floor(timestamp / 10 seconds)
```

Because the key is unique, concurrent workers safely converge on one incident for the same component/window.

### 4. Storage

MongoDB stores raw payloads because those records are high-volume and schema-flexible.

Postgres stores incidents and RCA because workflow state must be transactional and consistent.

Redis stores active incident summaries because the UI refreshes frequently.

### 5. Workflow State

The workflow state classes enforce:

```text
OPEN -> INVESTIGATING -> RESOLVED -> CLOSED
```

`RESOLVED -> CLOSED` checks for a complete RCA. This keeps closure policy out of the frontend and inside backend business logic.

### 6. Alert Strategy

Alert severity is selected by component type:

- RDBMS: P0, database on-call
- MCP host: P1, platform on-call
- Cache: P2, cache on-call
- Queue: P1 for timeout-like failures, otherwise P2
- Default: P3

This uses the Strategy Pattern so component-specific alert rules can be changed independently.

## Frontend Flow

The dashboard has three main areas:

1. Live feed: active incidents sorted by severity.
2. Incident summary: status, responder, component, signal count, timestamps, MTTR.
3. Investigation workspace: paginated raw signals and RCA form.

The live feed uses polling:

```text
GET /api/incidents every 5 seconds
```

Raw signals use pagination:

```text
GET /api/incidents/:id/signals?page=1&pageSize=25
```

This prevents the browser from rendering hundreds or thousands of large JSON cards.

## RCA And MTTR

The RCA form submits:

- incident start,
- incident end,
- root cause category,
- fix applied,
- prevention steps.

When RCA is saved, backend calculates:

```text
MTTR = RCA end time - first signal time
```

The incident can then move from `RESOLVED` to `CLOSED`.

## Resilience

Implemented resilience features:

- async queue between API and databases,
- rate limiting on ingestion,
- retry logic for worker persistence,
- Redis dashboard cache,
- MongoDB indexes for raw-signal lookup,
- paginated raw-signal API,
- health endpoint,
- throughput logs every 5 seconds.

## Testing

Current automated tests cover:

- RCA validation,
- blocked close without RCA,
- valid close with RCA,
- invalid state transitions,
- alert severity mapping.

Run:

```bash
npm test
```

## Demo Flow

Start:

```bash
docker compose up --build -d
```

Seed incidents:

```bash
docker compose exec -T backend npm run simulate:failure
```

Open:

```text
http://localhost:5173
```

Use the dashboard:

1. select an incident from Live Feed,
2. inspect summary and raw signals,
3. move `OPEN -> INVESTIGATING`,
4. move `INVESTIGATING -> RESOLVED`,
5. fill RCA,
6. close the incident.
