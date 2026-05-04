# Incident Management System Summary

## What This Project Does

This project is an Incident Management System for SRE/Infrastructure teams.

When production systems fail, many error signals can arrive at once. This system collects those signals, groups repeated failures into incidents, shows them on a dashboard, and forces a proper RCA before the incident can be closed.

## Complete Flow

1. A system fails.

   Example:

   ```text
   database connection pool exhausted
   cache latency spike
   MCP host failure
   queue timeout
   ```

2. The failing system sends signals to the backend.

   ```text
   POST /api/signals
   POST /api/signals/batch
   ```

3. The backend validates the signal and puts it into Redis/BullMQ queue.

   The API does not write directly to the database. This helps with backpressure.

4. The async worker processes signals from the queue.

   It writes:

   ```text
   raw signal payloads -> MongoDB
   incident records -> Postgres
   dashboard state -> Redis
   aggregation buckets -> Postgres
   ```

5. Debouncing groups noisy signals.

   Example:

   ```text
   100 signals from RDBMS_PRIMARY_01 in 10 seconds
   => 1 incident
   => 100 raw signals linked to that incident
   ```

6. Severity is assigned automatically.

   ```text
   RDBMS    -> P0
   MCP_HOST -> P1
   CACHE    -> P2
   QUEUE    -> P1/P2
   default  -> P3
   ```

7. The React dashboard shows active incidents.

   The live feed polls the backend every 5 seconds:

   ```text
   GET /api/incidents
   ```

   Backend serves this from Redis hot cache.

8. Operator investigates the incident.

   The UI shows:

   ```text
   severity
   status
   responder group
   signal count
   first signal time
   last signal time
   raw signal evidence
   ```

9. Operator moves the workflow.

   ```text
   OPEN -> INVESTIGATING -> RESOLVED -> CLOSED
   ```

10. RCA is mandatory before closure.

    RCA needs:

    ```text
    incident start
    incident end
    root cause category
    fix applied
    prevention steps
    ```

11. MTTR is calculated when RCA is submitted.

    ```text
    MTTR = RCA end time - first signal time
    ```

12. Incident can be closed only after RCA exists.

## Producer Flow

In this project, the producer is simulated by backend scripts. These scripts act like real production systems sending failure events.

Run normal failure simulation:

```bash
docker compose exec -T backend npm run simulate:failure
```

Run high-volume burst simulation:

```bash
docker compose exec -T backend npm run simulate:burst
```

The producer scripts live here:

```text
backend/scripts/simulate-failure.ts
backend/scripts/simulate-burst.ts
```

`simulate:failure` generates sample failures for:

```text
RDBMS_PRIMARY_01
MCP_HOST_17
CACHE_CLUSTER_01
```

It sends a batch request to:

```text
POST http://localhost:4000/api/signals/batch
```

The backend returns:

```text
{ accepted: 240 }
```

This means the ingestion API accepted 240 signals and pushed them into the queue.

## What A Signal Looks Like

Example signal:

```json
{
  "componentId": "RDBMS_PRIMARY_01",
  "componentType": "RDBMS",
  "timestamp": "2026-05-04T15:00:00.000Z",
  "level": "ERROR",
  "message": "primary database connection pool exhausted",
  "payload": {
    "errorCode": "CONNECTION_POOL_EXHAUSTED",
    "latencyMs": 2500
  }
}
```

Important fields:

- `componentId`: exact failing system/component.
- `componentType`: used to decide severity.
- `timestamp`: used for debounce window and MTTR.
- `message`: human-readable failure.
- `payload`: raw debugging context.

## Ingestion And Queue Flow

When producer sends signals:

```text
producer script
  -> POST /api/signals/batch
  -> Fastify validates request
  -> rate limiter checks request
  -> BullMQ adds each signal as a Redis queue job
  -> API returns 202 Accepted
```

The important point:

```text
The API only enqueues.
The API does not wait for MongoDB/Postgres writes.
```

This gives backpressure protection. If databases are slow, the queue grows, but the API does not immediately crash.

## Worker Computation Flow

The async worker consumes jobs from the Redis/BullMQ queue.

For every signal, worker does this:

```text
1. normalize timestamp
2. compute debounce key
3. choose alert strategy
4. upsert incident in Postgres
5. insert raw signal in MongoDB
6. increment aggregation bucket in Postgres
7. update Redis dashboard cache
```

Debounce key calculation:

```text
componentId + floor(timestamp / 10 seconds)
```

Example:

```text
RDBMS_PRIMARY_01:177790126
```

If another signal comes with the same debounce key:

```text
do not create new incident
increment signalCount
link raw signal to existing incident
```

## Storage Flow

The same signal is separated into different storage systems based on purpose:

```text
MongoDB
  stores raw signal payloads
  used for audit/debug evidence

Postgres
  stores incident work items
  stores RCA records
  stores MTTR
  stores aggregation buckets

Redis
  stores queue jobs
  stores active dashboard state
```

This separation is important because raw signal volume can be high, while workflow data needs strong consistency.

## How To Check Producer And Processing

Start logs:

```bash
docker compose logs -f backend
```

Run producer:

```bash
docker compose exec -T backend npm run simulate:failure
```

Expected producer output:

```text
{ accepted: 240 }
```

Expected backend logs:

```text
POST /api/signals/batch
statusCode: 202
[metrics] accepted=48/sec processed=48/sec queueDepth=0 failedWrites=0 activeIncidents=10
```

Metrics meaning:

```text
accepted      signals accepted by ingestion API
processed     signals processed by worker
queueDepth    pending jobs in Redis queue
failedWrites  failed DB writes
activeIncidents open/resolved incidents shown in dashboard
```

Check active incidents:

```bash
curl http://localhost:4000/api/incidents
```

Check raw signals for one incident:

```bash
curl "http://localhost:4000/api/incidents/<incident-id>/signals?page=1&pageSize=25"
```

Use Swagger:

```text
http://localhost:4000/api-docs
```

Use dashboard:

```text
http://localhost:5173
```

## Why This Helps

This system helps SRE teams by:

- preventing alert noise,
- handling burst traffic safely,
- keeping raw evidence for audit/debugging,
- tracking incident ownership and workflow,
- forcing proper RCA,
- calculating MTTR,
- giving a dashboard for live incident management.

## How This Maps To The Assignment

Implemented requirements:

- Dockerized full-stack app.
- `/backend` and `/frontend` in one repository.
- Async processing with Redis/BullMQ.
- Backpressure support.
- Debouncing logic.
- MongoDB raw signal data lake.
- Postgres source of truth.
- Redis hot-path dashboard cache.
- Timeseries aggregation buckets.
- Alert Strategy Pattern.
- Workflow State Pattern.
- Mandatory RCA.
- MTTR calculation.
- Rate limiting.
- `/health` endpoint.
- Throughput metrics every 5 seconds.
- Swagger API documentation.
- Responsive dashboard.
- Sample failure simulation.
- README and implementation docs.

## Demo Steps

Start the app:

```bash
docker compose up --build -d
```

Open dashboard:

```text
http://localhost:5173
```

Open Swagger:

```text
http://localhost:4000/api-docs
```

Generate sample incidents:

```bash
docker compose exec -T backend npm run simulate:failure
```

Demo in UI:

1. Show Live Feed.
2. Click an incident.
3. Show incident summary.
4. Show raw paginated signals.
5. Move `OPEN -> INVESTIGATING`.
6. Move `INVESTIGATING -> RESOLVED`.
7. Fill RCA form.
8. Submit RCA.
9. Close incident.

## Simple Explanation

I built a Dockerized Incident Management System for SRE teams. It ingests high-volume signals asynchronously through Redis/BullMQ, stores raw payloads in MongoDB, stores incident workflow and RCA in Postgres, uses Redis for live dashboard cache, debounces repeated component failures, and enforces RCA before closure. The dashboard lets an operator inspect incidents, raw signals, and submit RCA. Swagger documents all APIs, and Docker Compose runs the complete stack in one command.
