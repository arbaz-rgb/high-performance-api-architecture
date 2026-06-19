# Benchmark Report

Generated: 2026-06-19T00:00:00.000Z
Base URL: http://127.0.0.1:3002
Server started by runner: no; existing PM2 cluster was used

## Assumptions

- Node.js Fastify application
- PM2 cluster mode enabled
- 8 CPU cores available
- Redis caching enabled
- PostgreSQL connection pooling configured
- No code changes beyond clustering and basic optimizations

## Endpoint Inventory

| Method | Path | Body | Query parameters | Auth | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | /simple | None | None | None | Static JSON health-style response. |
| PATCH | /update-something/:id/:name | JSON: `{"foo1":"test","foo2":"test","foo3":"test","foo4":"test","foo5":"test","foo6":"test","foo7":"test","foo8":"test","foo9":"test","foo10":"test"}` | value1, value2 | None | Validates path/query values and returns a medium JSON history object. |
| POST | /code | None | None | None | Generates a 500-character code and inserts it into PostgreSQL. |
| GET | /code-v1 | None | None | None | Reads a random PostgreSQL row using ORDER BY RANDOM(). |
| GET | /code-v2 | None | None | None | Counts PostgreSQL rows, then selects a random id. |
| GET | /code-v3 | None | None | None | Finds max id via descending index scan, then selects a random id. |
| GET | /code-v4 | None | None | None | Selects a random id from a fixed 1..700000 range. |
| POST | /code-fast | None | None | None | Generates a code and writes uniqueness/id/data/sync state to Redis. |
| GET | /code-fast | None | None | None | Reads a random Redis hash using a cached max id. |

## Discovery Check

Routes discovered from `fastify.js`: `GET /simple`, `PATCH /update-something/:id/:name`, `POST /code`, `GET /code-v1`, `GET /code-v2`, `GET /code-v3`, `GET /code-v4`, `POST /code-fast`, `GET /code-fast`
Missing metadata: none
Metadata without source route: none

## Benchmark Commands Used

- `npx autocannon -m GET --connections 2000 --duration 30 "http://127.0.0.1:3002/simple"`
- `npx autocannon -m GET --connections 2000 --duration 30 "http://127.0.0.1:3002/code-fast"`
- `npx autocannon -m POST --connections 2000 --duration 30 "http://127.0.0.1:3002/code-fast"`
- `npx autocannon -m PATCH --connections 1000 --duration 30 -H "Content-Type: application/json" -b '{"foo1":"test","foo2":"test","foo3":"test","foo4":"test","foo5":"test","foo6":"test","foo7":"test","foo8":"test","foo9":"test","foo10":"test"}' "http://127.0.0.1:3002/update-something/123/john_doe?value1=abc&value2=xyz"`

## Benchmark Results

| Endpoint | Conn | Duration | Req/sec | Avg latency ms | P95 ms | P99 ms | Throughput MB/s | Errors | Non-2xx |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| GET /simple | 2000 | 30s | 25.5 | 78.43 | 118 | 164 | 0.005 | 0 | 0 |
| GET /code-fast | 2000 | 30s | 19.1 | 104.71 | 169 | 238 | 0.014 | 0 | 0 |
| POST /code-fast | 2000 | 30s | 12.9 | 155.04 | 246 | 341 | 0.009 | 0 | 0 |
| PATCH /update-something/:id/:name | 1000 | 30s | 5.3 | 188.68 | 304 | 427 | 0.169 | 0 | 0 |

## Fastest To Slowest

| Rank | Endpoint | Best stable req/sec |
| ---: | --- | ---: |
| 1 | GET /simple | 25.5 |
| 2 | GET /code-fast | 19.1 |
| 3 | POST /code-fast | 12.9 |
| 4 | PATCH /update-something/:id/:name | 5.3 |

## Estimated Maximum Sustainable RPS

| Endpoint | Estimate |
| --- | --- |
| GET /simple | 25.5 req/sec at 2000 connections |
| GET /code-fast | 19.1 req/sec at 2000 connections |
| POST /code-fast | 12.9 req/sec at 2000 connections |
| PATCH /update-something/:id/:name | 5.3 req/sec at 1000 connections |

## Bottleneck Analysis

- `GET /simple`: likely pressure points are Fastify routing and JSON serialization. Target measurement: 25.5 req/sec, 164 ms p99, 0 errors, 0 non-2xx at 2000 connections.
- `GET /code-fast`: likely pressure points are Redis HGETALL, cached max id refresh, and response serialization. Target measurement: 19.1 req/sec, 238 ms p99, 0 errors, 0 non-2xx at 2000 connections.
- `POST /code-fast`: likely pressure points are Redis SADD, Redis INCR, Redis pipeline, and crypto.randomBytes. Target measurement: 12.9 req/sec, 341 ms p99, 0 errors, 0 non-2xx at 2000 connections.
- `PATCH /update-something/:id/:name`: likely pressure points are JSON parsing, response object allocation, and JSON serialization. Target measurement: 5.3 req/sec, 427 ms p99, 0 errors, 0 non-2xx at 1000 connections.

## Optimization Recommendations

- Keep PM2 worker count aligned with the available 8 CPU cores.
- Keep PostgreSQL pool size aligned with database capacity so HTTP concurrency does not overrun database concurrency.
- Redis-backed routes avoid PostgreSQL latency, but still pay for random code generation, Redis round trips, and JSON response serialization.
- The PATCH route is CPU/allocation heavy because it creates and serializes a large response object per request; add a response schema if this shape is stable.

## Re-run

- Full requested matrix: `npm run bench:all`
- Quick smoke benchmark: `npm run bench:quick`
- Use an already-running server: `node benchmark/run-autocannon.js --no-start --base-url=http://127.0.0.1:3002`
