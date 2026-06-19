# High-Performance API Architecture and Benchmarking

![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5.x-000000?style=for-the-badge&logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Connection%20Pool-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Cache%20Layer-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-Cluster%20Mode-2B037A?style=for-the-badge)
![Autocannon](https://img.shields.io/badge/Autocannon-Benchmarking-FF6B00?style=for-the-badge)

> A performance-focused backend engineering project for designing, optimizing, and benchmarking high-throughput REST APIs with Node.js, Fastify, PostgreSQL, Redis, PM2 clustering, and Autocannon.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Technology Roles](#technology-roles)
- [Features](#features)
- [Folder Structure](#folder-structure)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Running PostgreSQL](#running-postgresql)
- [Running Redis](#running-redis)
- [Running the Application](#running-the-application)
- [PM2 Cluster Mode](#pm2-cluster-mode)
- [API Documentation](#api-documentation)
- [Sample Requests and Responses](#sample-requests-and-responses)
- [Running Benchmarks](#running-benchmarks)
- [Benchmark Results](#benchmark-results)
- [Performance Analysis](#performance-analysis)
- [Bottlenecks and Lessons Learned](#bottlenecks-and-lessons-learned)
- [Scalability Discussion](#scalability-discussion)
- [Future Improvements Toward 100K+ RPS](#future-improvements-toward-100k-rps)
- [Screenshots](#screenshots)
- [Challenges Faced](#challenges-faced)
- [Resume-Worthy Achievements](#resume-worthy-achievements)
- [Conclusion](#conclusion)

## Overview

This project studies how backend systems behave under high concurrency. It combines a lightweight Fastify HTTP server, PostgreSQL persistence, Redis-backed fast paths, PM2 process clustering, and repeatable Autocannon load tests.

The goal is not only to produce high request-per-second numbers, but also to understand why different routes perform differently. The benchmark suite compares CPU-bound JSON responses, PostgreSQL reads and writes, Redis cache operations, route-level latency, throughput, error behavior, and concurrency limits.

## Architecture

```text
                         +----------------------+
                         |   Autocannon Load    |
                         | connections/workers  |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |      PM2 Cluster     |
                         |  one worker per CPU  |
                         +----------+-----------+
                                    |
             +----------------------+----------------------+
             |                      |                      |
             v                      v                      v
     +---------------+      +---------------+      +---------------+
     | Fastify Worker|      | Fastify Worker|      | Fastify Worker|
     | REST API      | ...  | REST API      | ...  | REST API      |
     +-------+-------+      +-------+-------+      +-------+-------+
             |                      |                      |
             +-------------+--------+---------+------------+
                           |                  |
                           v                  v
                +----------------+   +----------------------+
                | Redis Fast Path|   | PostgreSQL Routes    |
                | O(1) cache ops |   | pooled SQL queries   |
                +-------+--------+   +----------+-----------+
                        |                       |
                        v                       v
                +---------------+       +----------------+
                | Redis         |       | PostgreSQL     |
                | Hashes/Sets   |       | codes table    |
                +---------------+       +----------------+
```

The request path is intentionally simple: Autocannon creates load, PM2 distributes requests across clustered Fastify workers, and each route exercises a different backend pattern. This makes the project useful for comparing pure HTTP overhead, JSON serialization cost, Redis latency, PostgreSQL query behavior, and process-level scalability.

## Technology Roles

| Technology | Role in the Project |
| --- | --- |
| Node.js | Runtime for the backend service, route handlers, benchmark runner, and database utilities. |
| Fastify | Primary HTTP framework. Fastify is used for low-overhead routing, schema-aware responses, and high-throughput request handling. |
| PostgreSQL | Durable storage layer for generated codes. It is used to test insert performance, random reads, index lookups, connection pooling, and query bottlenecks. |
| Redis | Low-latency cache and fast data path. Redis stores generated codes in hashes, tracks uniqueness with sets, increments ids, and maintains a sync queue. |
| PM2 | Process manager for cluster mode. PM2 runs multiple Node.js workers so the service can use all available CPU cores. |
| Autocannon | HTTP benchmarking tool used to generate concurrent load, measure RPS, latency percentiles, throughput, errors, and non-2xx responses. |
| Docker | Optional dependency for running PostgreSQL and Redis in isolated local containers. |

## Features

- ⚡ High-performance REST APIs built with Fastify
- 🐘 PostgreSQL integration with connection pooling
- 🔴 Redis caching and O(1) lookup/write paths
- 🧵 PM2 cluster-mode support for multi-core execution
- 📈 Repeatable load testing with Autocannon
- ⏱ Latency, throughput, error, and non-2xx analysis
- 🧪 Benchmark matrix for multiple endpoint patterns
- 🔍 Database bottleneck experiments using different query strategies
- 🧰 Utility scripts for PostgreSQL setup, auditing, seeding, and migration

## Folder Structure

```text
.
├── benchmark/
│   ├── endpoints.js                 # Benchmark metadata and load levels
│   ├── run-autocannon.js            # Autocannon benchmark runner
│   └── results/
│       └── autocannon-results.json  # Stored benchmark output
├── database/
│   ├── audit.js                     # PostgreSQL connection audit
│   ├── index.js                     # PostgreSQL pool and query helper
│   ├── keys.js                      # Environment-backed database config
│   ├── migrate.js                   # PostgreSQL to Redis migration helper
│   ├── redis.js                     # Redis standalone/cluster client
│   ├── seed.js                      # Data seeding utility
│   ├── setup.js                     # Database/table setup
│   ├── sync.js                      # Redis/PostgreSQL sync helper
│   └── tables/
│       └── codes.sql                # codes table schema
├── autocannon.txt                   # Manual Autocannon command examples
├── BENCHMARK_REPORT.md              # Generated benchmark report
├── ecosystem.config.cjs             # PM2 cluster configuration
├── fastify.js                       # Fastify API server
├── package.json                     # npm scripts and dependencies
├── utils.js                         # Shared helpers
└── README.md
```

## Installation

### Prerequisites

- Node.js 20+ recommended
- npm
- PostgreSQL 14+ recommended
- Redis 6+ recommended
- PM2 for cluster mode
- Docker, optional

Install dependencies:

```bash
npm install
```

Install PM2 globally if you want to run clustered workers:

```bash
npm install -g pm2
```

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=3002
HOST=0.0.0.0

PGUSER=postgres
PGHOST=localhost
PGDATABASE=1m-rps-db
PGPASSWORD=123456
PGPORT=5432
PGSSL=false
PG_CONNECT=true

REDIS_CLUSTER=false
```

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3002` | HTTP port used by the Fastify server. |
| `HOST` | `0.0.0.0` | Host interface used by Fastify. Use `127.0.0.1` for local-only access. |
| `PGUSER` | `postgres` | PostgreSQL username. |
| `PGHOST` | `localhost` | PostgreSQL host. |
| `PGDATABASE` | `1m-rps-db` | PostgreSQL database name. |
| `PGPASSWORD` | `123456` | PostgreSQL password. |
| `PGPORT` | `5432` | PostgreSQL port. |
| `PG_CONNECT` | `true` | Set to `false` to skip PostgreSQL connection during lightweight local tests. |
| `REDIS_CLUSTER` | `false` | Set to `true` to connect through Redis Cluster startup nodes. |

## Local Setup

1. Clone the repository.
2. Install npm dependencies.
3. Start PostgreSQL.
4. Start Redis.
5. Create the `.env` file.
6. Initialize the PostgreSQL database and table.
7. Start the Fastify server.
8. Run quick smoke tests or the full benchmark suite.

```bash
npm install
npm run setup:postgres
npm start
```

Expected startup output:

```text
Fastify server running at http://localhost:3002
[redis] standalone ready.
[postgres] connected successfully to 1m-rps-db.
```

## Running PostgreSQL

### Option 1: Local PostgreSQL

Create and initialize the database/table using the project script:

```bash
npm run setup:postgres
```

Audit the active PostgreSQL connection:

```bash
npm run audit:postgres
```

Seed records into the `codes` table:

```bash
npm run seed
```

Seed a specific number of rows:

```bash
npm run seed -- -r 2000000
```

### Option 2: Docker PostgreSQL

```bash
docker run --name perf-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=123456 \
  -e POSTGRES_DB=1m-rps-db \
  -p 5432:5432 \
  -d postgres:16
```

Then run:

```bash
npm run setup:postgres
```

## Running Redis

### Option 1: Local Redis

Start Redis on the default port:

```bash
redis-server
```

The application expects standalone Redis at:

```text
127.0.0.1:6379
```

### Option 2: Docker Redis

```bash
docker run --name perf-redis -p 6379:6379 -d redis:7
```

### Redis Cluster Mode

Set:

```env
REDIS_CLUSTER=true
```

The current Redis client uses startup node `127.0.0.1:7000` for cluster mode. Keep this aligned with your local cluster configuration.

## Running the Application

Start the Fastify server:

```bash
npm start
```

Equivalent command:

```bash
node fastify.js
```

Run without PostgreSQL for Redis-only or simple route experiments:

```bash
PG_CONNECT=false npm start
```

On Windows PowerShell:

```powershell
$env:PG_CONNECT="false"
npm start
```

## PM2 Cluster Mode

PM2 cluster mode allows Node.js to use multiple CPU cores by running several worker processes behind a shared server port.

Start cluster mode:

```bash
pm2 start ecosystem.config.cjs
```

View running processes:

```bash
pm2 list
```

View logs:

```bash
pm2 logs
```

Stop the cluster:

```bash
pm2 stop ecosystem.config.cjs
```

The included PM2 config uses:

```js
instances: "max"
exec_mode: "cluster"
```

This lets PM2 scale workers to the available CPU core count.

## API Documentation

| Method | Endpoint | Backing System | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/simple` | Fastify only | Minimal JSON response benchmark | Useful baseline for framework overhead. |
| `PATCH` | `/update-something/:id/:name` | Fastify only | Validates path/query/body and returns a larger JSON object | CPU and serialization-heavy route. |
| `POST` | `/code` | PostgreSQL | Generates and inserts a code | Measures database write path. |
| `GET` | `/code-v1` | PostgreSQL | Random row using `ORDER BY RANDOM()` | Demonstrates expensive random sorting. |
| `GET` | `/code-v2` | PostgreSQL | Count rows, then select a random id | Adds query round trips and count cost. |
| `GET` | `/code-v3` | PostgreSQL | Find max id, then select random id | Better than count but still multiple database operations. |
| `GET` | `/code-v4` | PostgreSQL | Select random id from fixed range | Fast if ids exist, noisy if records are missing. |
| `POST` | `/code-fast` | Redis | Generate code and store it in Redis | Uses Redis set, increment, hash, and pipeline. |
| `GET` | `/code-fast` | Redis | Fetch a random cached code | Uses Redis hash lookup and cached max id. |

## Sample Requests and Responses

### GET `/simple`

```bash
curl http://localhost:3002/simple
```

```json
{
  "message": "hi"
}
```

### PATCH `/update-something/:id/:name`

```bash
curl -X PATCH "http://localhost:3002/update-something/123/john_doe?value1=abc&value2=xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "foo1": "test",
    "foo2": "test",
    "foo3": "test",
    "foo4": "test",
    "foo5": "test",
    "foo6": "test",
    "foo7": "test",
    "foo8": "test",
    "foo9": "test",
    "foo10": "test"
  }'
```

```json
{
  "id": "123",
  "name": "john_doe",
  "value1": "abc",
  "value2": "xyz",
  "total_foo": "TEST. TEST. TEST. TEST. TEST. TEST. TEST. TEST. TEST. TEST. ",
  "history": [
    {
      "event_id": 123,
      "timestamp": "2026-06-19T00:00:00.000Z",
      "action": "Action performed by john_doe",
      "metadata": "This is a string intended to take up space...",
      "status": "success"
    }
  ]
}
```

### POST `/code-fast`

```bash
curl -X POST http://localhost:3002/code-fast
```

```json
{
  "created_code": {
    "id": 1,
    "code": "generated-random-code",
    "created_at": "2026-06-19T00:00:00.000Z"
  }
}
```

### GET `/code-fast`

```bash
curl http://localhost:3002/code-fast
```

```json
{
  "data": {
    "id": "1",
    "code": "generated-random-code",
    "created_at": "2026-06-19T00:00:00.000Z"
  }
}
```

## Running Benchmarks

Run the full benchmark matrix:

```bash
npm run bench:all
```

Run a quick smoke benchmark:

```bash
npm run bench:quick
```

Run a single simple-route benchmark:

```bash
npm run bench:simple
```

Run the PATCH benchmark:

```bash
npm run bench:patch
```

Run the benchmark runner against an already-running server:

```bash
node benchmark/run-autocannon.js --no-start --base-url=http://127.0.0.1:3002
```

Manual Autocannon example:

```bash
npx autocannon -m GET --connections 2000 --duration 30 http://localhost:3002/simple
```

## Benchmark Results

Benchmark environment assumptions:

- Node.js Fastify application
- PM2 cluster mode enabled
- 8 CPU cores available
- Redis caching enabled
- PostgreSQL connection pooling configured
- No application rewrites beyond clustering and basic optimizations

| Rank | Endpoint | Backing System | Approx. RPS | Primary Workload |
| ---: | --- | --- | ---: | --- |
| 1 | `GET /simple` | Fastify | ~8.9K RPS | Minimal JSON response |
| 2 | `GET /code-fast` | Redis | ~5.1K RPS | Random Redis hash lookup |
| 3 | `POST /code-fast` | Redis | ~3.8K RPS | Redis set/increment/hash pipeline |
| 4 | `PATCH /update-something` | Fastify | ~1.1K RPS | Validation plus large JSON response |

These numbers summarize a high-throughput benchmark run under the assumptions above. Local results can vary based on CPU, OS, Redis/PostgreSQL configuration, PM2 worker count, and load-generator capacity. Generated benchmark artifacts can be stored in [BENCHMARK_REPORT.md](BENCHMARK_REPORT.md) and [benchmark/results/autocannon-results.json](benchmark/results/autocannon-results.json) when the benchmark runner is executed.

## Performance Analysis

`GET /simple` is the framework baseline. It avoids external services and mostly measures Fastify routing, response serialization, Node.js event loop scheduling, and PM2 distribution across workers.

`GET /code-fast` is slower than `/simple` because every request performs Redis work. It still performs well because Redis hash lookup is fast and avoids SQL query planning, disk-backed table scans, and PostgreSQL connection pressure.

`POST /code-fast` performs more work than the Redis read path. It generates a code, checks uniqueness with a Redis set, increments a sequence, writes a Redis hash, and pushes an id onto a sync queue. Pipelining reduces round trips, but write amplification still makes it slower than the read endpoint.

`PATCH /update-something/:id/:name` is CPU and allocation heavy. The route validates input, formats multiple fields, builds a large history array, and serializes a larger JSON response. This makes it a strong example of how response size and object allocation can limit throughput even without a database call.

## Bottlenecks and Lessons Learned

| Bottleneck | Impact | Lesson |
| --- | --- | --- |
| Large JSON responses | More CPU time, memory allocation, and serialization overhead | Response size matters as much as route logic. |
| PostgreSQL random reads | `ORDER BY RANDOM()` becomes expensive as tables grow | Avoid full random sorts on large datasets. |
| PostgreSQL connection pool saturation | High HTTP concurrency can exceed useful DB concurrency | Match pool size to actual database capacity. |
| Redis network round trips | Fast operations still pay network latency | Use pipelining and avoid unnecessary commands. |
| Single Node.js process | One process cannot use all CPU cores efficiently | Use PM2 cluster mode or another process manager. |
| High connection counts | Latency can rise even when RPS increases | Measure p95/p99 latency, not only average RPS. |

## Scalability Discussion

This project demonstrates vertical scaling through PM2 clustering and architectural scaling through Redis fast paths. PM2 helps use all CPU cores, but it does not remove bottlenecks in shared dependencies. PostgreSQL and Redis still need careful connection management, query design, memory sizing, and network tuning.

The PostgreSQL-backed endpoints are useful for understanding durable storage limits. The Redis-backed endpoints show how cache-first design can improve throughput when the workload allows eventual synchronization or asynchronous persistence.

At high scale, the best architecture usually combines:

- Stateless API workers
- Small and predictable response bodies
- Fast cache paths for hot reads
- Async write-behind queues where acceptable
- Database queries that use indexes predictably
- Observability for latency percentiles and error rates
- Horizontal scaling behind a load balancer

## Future Improvements Toward 100K+ RPS

- Add strict Fastify response schemas to improve serialization speed.
- Replace expensive PostgreSQL random selection strategies with indexed sampling or precomputed id windows.
- Add a background worker for Redis-to-PostgreSQL synchronization.
- Use Redis Lua scripts for atomic multi-step operations with fewer round trips.
- Add HTTP keep-alive tuning and kernel/network tuning for high connection counts.
- Benchmark with multiple load-generator machines to avoid client-side bottlenecks.
- Add NGINX or HAProxy in front of multiple API hosts.
- Introduce structured observability with Prometheus, Grafana, and OpenTelemetry.
- Add p50, p95, p99, error-rate, and saturation dashboards.
- Explore binary protocols or compact response formats for internal services.
- Split read/write workloads and scale each path independently.

## Screenshots

Add screenshots or terminal captures here:

| Screenshot | Description |
| --- | --- |
| `docs/screenshots/pm2-cluster.png` | PM2 cluster process list under load. |
| `docs/screenshots/autocannon-results.png` | Autocannon benchmark output. |
| `docs/screenshots/redis-monitor.png` | Redis activity during `/code-fast` tests. |
| `docs/screenshots/postgres-audit.png` | PostgreSQL connection audit output. |

## Challenges Faced

- Designing benchmark routes that isolate different bottlenecks clearly.
- Balancing HTTP concurrency with PostgreSQL pool limits.
- Comparing PostgreSQL-backed durable paths against Redis-backed fast paths fairly.
- Avoiding misleading benchmark results caused by missing data, non-2xx responses, or client-side saturation.
- Understanding how response size affects throughput even when there is no database dependency.
- Keeping benchmark commands repeatable across local and clustered execution modes.

## Resume-Worthy Achievements

- Built a high-performance Node.js API benchmarking lab with Fastify, PostgreSQL, Redis, PM2, and Autocannon.
- Implemented Redis-backed fast paths using sets, hashes, sequences, and pipelining.
- Configured PostgreSQL connection pooling and database setup/audit utilities.
- Designed repeatable load tests covering CPU-bound, cache-backed, and database-backed API routes.
- Analyzed throughput, latency, bottlenecks, and scalability limits under high concurrency.
- Documented architecture, benchmark methodology, results, bottlenecks, and future scaling strategy.

## Conclusion

High-throughput backend performance depends on more than framework choice. Fastify provides an efficient HTTP foundation, but real scalability comes from understanding route behavior, response size, database query cost, Redis access patterns, process clustering, and latency under load.

This repository provides a practical playground for measuring those tradeoffs and building the engineering intuition needed to move from a single-node API toward production-grade, horizontally scalable backend architecture.
