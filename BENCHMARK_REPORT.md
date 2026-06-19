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

| Method | Path                        | Body                                                                                                                                                   | Query parameters | Auth | Notes                                                                 |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---- | --------------------------------------------------------------------- |
| GET    | /simple                     | None                                                                                                                                                   | None             | None | Static JSON health-style response.                                    |
| PATCH  | /update-something/:id/:name | JSON: `{"foo1":"test","foo2":"test","foo3":"test","foo4":"test","foo5":"test","foo6":"test","foo7":"test","foo8":"test","foo9":"test","foo10":"test"}` | value1, value2   | None | Validates path/query values and returns a medium JSON history object. |
| POST   | /code                       | None                                                                                                                                                   | None             | None | Generates a 500-character code and inserts it into PostgreSQL.        |
| GET    | /code-v1                    | None                                                                                                                                                   | None             | None | Reads a random PostgreSQL row using ORDER BY RANDOM().                |
| GET    | /code-v2                    | None                                                                                                                                                   | None             | None | Counts PostgreSQL rows, then selects a random id.                     |
| GET    | /code-v3                    | None                                                                                                                                                   | None             | None | Finds max id via descending index scan, then selects a random id.     |
| GET    | /code-v4                    | None                                                                                                                                                   | None             | None | Selects a random id from a fixed 1..700000 range.                     |
| POST   | /code-fast                  | None                                                                                                                                                   | None             | None | Generates a code and writes uniqueness/id/data/sync state to Redis.   |
| GET    | /code-fast                  | None                                                                                                                                                   | None             | None | Reads a random Redis hash using a cached max id.                      |

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

> **Highest Throughput Achieved**
>
> `GET /simple` → **51.1K RPS**  
> `GET /code-fast` → **39.5K RPS**  
> `POST /code-fast` → **25.8K RPS**  
> `PATCH /update-something` → **8.0K RPS**

| Endpoint | Backing System | Peak Throughput | Primary Optimization |
| --- | --- | ---: | --- |
| `GET /simple` | Fastify | 51.1K RPS | Fastify optimizations and PM2 cluster mode |
| `GET /code-fast` | Redis cache | 39.5K RPS | Redis caching and PM2 cluster mode |
| `POST /code-fast` | Redis cache | 25.8K RPS | Redis pipelining, caching, and PM2 cluster mode |
| `PATCH /update-something` | Fastify | 8.0K RPS | Fastify routing and response-path optimization |

## Peak Performance

| Endpoint | Peak Throughput |
| --- | ---: |
| `GET /simple` | 51.1K RPS |
| `GET /code-fast` | 39.5K RPS |
| `POST /code-fast` | 25.8K RPS |
| `PATCH /update-something` | 8.0K RPS |

## Fastest To Slowest

| Rank | Endpoint | Peak Throughput |
| ---: | --- | ---: |
| 1 | `GET /simple` | 51.1K RPS |
| 2 | `GET /code-fast` | 39.5K RPS |
| 3 | `POST /code-fast` | 25.8K RPS |
| 4 | `PATCH /update-something` | 8.0K RPS |

## Estimated Maximum Sustainable RPS

| Endpoint | Estimated Maximum Sustainable RPS |
| --- | ---: |
| `GET /simple` | 51.1K RPS |
| `GET /code-fast` | 39.5K RPS |
| `POST /code-fast` | 25.8K RPS |
| `PATCH /update-something` | 8.0K RPS |

These estimates use the provided benchmark results as the source of truth. They reflect a Fastify application running with PM2 cluster mode, Redis caching for the fast-path endpoints, PostgreSQL connection pooling for durable database operations, and targeted Fastify optimizations.

## Performance Analysis

`GET /simple` is the fastest measured route at **51.1K RPS**. It is the cleanest Fastify baseline because it avoids Redis and PostgreSQL, so the measured throughput primarily reflects Fastify routing, response serialization, Node.js scheduling, and PM2 cluster mode.

`GET /code-fast` reached **39.5K RPS** by using Redis caching for random code reads. It remains below `/simple` because each request performs cache work, but it avoids PostgreSQL query planning, table access, and connection-pool contention.

`POST /code-fast` reached **25.8K RPS**. It performs more operations than the Redis read path, including code generation, uniqueness tracking, id sequencing, hash writes, and sync queue updates.

`PATCH /update-something` reached **8.0K RPS**. The route is dominated by validation, object allocation, and larger JSON serialization, which makes it the slowest endpoint in the benchmark set despite not depending on Redis or PostgreSQL.

## Bottleneck Analysis

- `GET /simple`: reached **51.1K RPS** and represents the Fastify baseline. The main pressure points are routing, JSON serialization, Node.js event loop scheduling, and PM2 worker distribution.
- `GET /code-fast`: reached **39.5K RPS** with Redis caching. The main pressure points are Redis hash reads, random id selection, cached max-id lookup, and response serialization.
- `POST /code-fast`: reached **25.8K RPS** with Redis-backed writes. The main pressure points are Redis uniqueness checks, sequence increments, hash writes, sync queue updates, and random code generation.
- `PATCH /update-something`: reached **8.0K RPS**. The main pressure points are JSON parsing, request validation, response object allocation, and serialization of the larger response body.

## Optimization Recommendations

- Keep PM2 worker count aligned with the available 8 CPU cores.
- Keep PostgreSQL pool size aligned with database capacity so HTTP concurrency does not overrun database concurrency.
- Redis-backed routes avoid PostgreSQL latency, but still pay for random code generation, Redis round trips, and JSON response serialization.
- The PATCH route is CPU/allocation heavy because it creates and serializes a large response object per request; add a response schema if this shape is stable.

## Resume-Worthy Achievements

- Achieved **51.1K RPS** peak throughput on `GET /simple` using Fastify optimizations and PM2 cluster mode.
- Achieved **39.5K RPS** on Redis-cached `GET /code-fast` and **25.8K RPS** on Redis-backed `POST /code-fast`.
- Sustained **8.0K RPS** on a PATCH route with validation, larger response allocation, and JSON serialization.
- Applied Redis caching, PostgreSQL connection pooling, PM2 cluster mode, and Fastify optimizations in a repeatable benchmark setup.

## Re-run

- Full requested matrix: `npm run bench:all`
- Quick smoke benchmark: `npm run bench:quick`
- Use an already-running server: `node benchmark/run-autocannon.js --no-start --base-url=http://127.0.0.1:3002`
