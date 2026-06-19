import autocannon from "autocannon";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { endpointMetadata, loadLevels } from "./endpoints.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = path.join(root, "fastify.js");
const artifactsDir = path.join(root, "benchmark", "results");
const defaultPort = Number(process.env.PORT || 3002);

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

const port = Number(args.get("port") || defaultPort);
const baseUrl = args.get("base-url") || `http://127.0.0.1:${port}`;
const noStart = args.get("no-start") === "true";
const quick = args.get("quick") === "true";
const includeHigher = args.get("higher") !== "false";
const selectedLevels = quick
  ? [{ connections: 20, duration: 5 }]
  : loadLevels.map((level) => ({
      connections: Number(args.get("connections") || level.connections),
      duration: Number(args.get("duration") || level.duration),
    }));

const normalizePath = (routePath) =>
  routePath.replace(/:id/g, "123").replace(/:name/g, "john_doe");

async function discoverRoutes() {
  const source = await fs.readFile(sourceFile, "utf8");
  const routeRegex =
    /app\.(get|post|put|patch|delete)\s*\(\s*([`'"])(.*?)\2/gims;
  const routes = [];
  let match;
  while ((match = routeRegex.exec(source)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: match[3] });
  }
  return routes;
}

function sameRoute(a, b) {
  return a.method === b.method && a.path === b.path;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 5000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer() {
  const deadline = Date.now() + 20000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await request(`${baseUrl}/simple`);
      if (res.ok) return true;
      lastError = new Error(`GET /simple returned ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(500);
  }
  throw lastError || new Error("server did not become ready");
}

async function startServerIfNeeded() {
  try {
    const res = await request(`${baseUrl}/simple`, { timeout: 1000 });
    if (res.ok) return null;
  } catch {}

  if (noStart) throw new Error(`No running server at ${baseUrl}`);

  const child = spawn(process.execPath, ["fastify.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const log = [];
  child.stdout.on("data", (chunk) => log.push(chunk.toString()));
  child.stderr.on("data", (chunk) => log.push(chunk.toString()));
  child.on("exit", (code) => {
    if (code !== 0) console.error(log.join(""));
  });

  await waitForServer();
  return child;
}

async function warmData() {
  await request(`${baseUrl}/code-fast`, { method: "POST" }).catch(() => null);
  await request(`${baseUrl}/code`, { method: "POST" }).catch(() => null);
}

function buildRequest(endpoint) {
  const headers = {};
  const setup = {
    method: endpoint.method,
    url: `${baseUrl}${endpoint.benchmarkPath || normalizePath(endpoint.path)}`,
  };

  if (endpoint.body?.sample) {
    headers["Content-Type"] = endpoint.body.contentType || "application/json";
    setup.body = JSON.stringify(endpoint.body.sample);
  }

  if (Object.keys(headers).length > 0) setup.headers = headers;
  return setup;
}

async function runOne(endpoint, level) {
  const setup = buildRequest(endpoint);
  const command = [
    "npx autocannon",
    `-m ${endpoint.method}`,
    `--connections ${level.connections}`,
    `--duration ${level.duration}`,
    setup.headers ? `-H "Content-Type: ${setup.headers["Content-Type"]}"` : "",
    setup.body ? `-b '${setup.body}'` : "",
    `"${setup.url}"`,
  ]
    .filter(Boolean)
    .join(" ");

  const result = await autocannon({
    ...setup,
    connections: level.connections,
    duration: level.duration,
  });

  const total = result.requests.total || 0;
  const errors = result.errors || 0;
  const non2xx = result.non2xx || 0;
  const attempted = total + errors + non2xx;
  const latencyP95Ms =
    result.latency.p95 ?? result.latency.p97_5 ?? result.latency.p99;
  return {
    endpoint: `${endpoint.method} ${endpoint.path}`,
    method: endpoint.method,
    path: endpoint.path,
    url: setup.url,
    command,
    connections: level.connections,
    duration: level.duration,
    requestsPerSecond: result.requests.average,
    latencyAverageMs: result.latency.average,
    latencyP95Ms,
    latencyP95Source:
      result.latency.p95 === undefined && result.latency.p97_5 !== undefined
        ? "p97.5 fallback"
        : "p95",
    latencyP99Ms: result.latency.p99,
    throughputBytesSec: result.throughput.average,
    throughputMBSec: result.throughput.average / 1024 / 1024,
    errors,
    non2xx,
    errorRate: attempted === 0 ? 0 : errors / attempted,
    non2xxRate: attempted === 0 ? 0 : non2xx / attempted,
    statusCodeStats: result.statusCodeStats,
    totalRequests: total,
  };
}

function stable(result) {
  return (
    result.requestsPerSecond > 0 &&
    result.errorRate < 0.01 &&
    result.non2xxRate < 0.01
  );
}

function formatNumber(value, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value))
    return "n/a";
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function estimateMax(results, endpoint) {
  const ok = results.filter(
    (result) =>
      result.endpoint === `${endpoint.method} ${endpoint.path}` &&
      stable(result),
  );
  if (ok.length === 0) return "No stable successful level observed";
  const best = ok.toSorted(
    (a, b) => b.requestsPerSecond - a.requestsPerSecond,
  )[0];
  return `${formatNumber(best.requestsPerSecond)} req/sec at ${best.connections} connections`;
}

async function writeReport(discovered, results, startedServer) {
  const missingMetadata = discovered.filter(
    (route) => !endpointMetadata.some((endpoint) => sameRoute(endpoint, route)),
  );
  const staleMetadata = endpointMetadata.filter(
    (endpoint) => !discovered.some((route) => sameRoute(endpoint, route)),
  );
  const fastest = endpointMetadata
    .map((endpoint) => {
      const rows = results.filter(
        (result) => result.endpoint === `${endpoint.method} ${endpoint.path}`,
      );
      const best = rows.toSorted(
        (a, b) => b.requestsPerSecond - a.requestsPerSecond,
      )[0];
      return {
        endpoint: `${endpoint.method} ${endpoint.path}`,
        bestRps: best?.requestsPerSecond || 0,
      };
    })
    .toSorted((a, b) => b.bestRps - a.bestRps);

  const lines = [
    "# Benchmark Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Base URL: ${baseUrl}`,
    `Server started by runner: ${startedServer ? "yes" : "no; existing server was used"}`,
    "",
    "## Endpoint Inventory",
    "",
    "| Method | Path | Body | Query parameters | Auth | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...endpointMetadata
      .map((endpoint) =>
        [
          endpoint.method,
          endpoint.path,
          endpoint.body?.sample
            ? `JSON: \`${JSON.stringify(endpoint.body.sample)}\``
            : "None",
          endpoint.query.length ? endpoint.query.join(", ") : "None",
          endpoint.auth,
          endpoint.description,
        ]
          .map((cell) => String(cell).replace(/\|/g, "\\|"))
          .join(" | "),
      )
      .map((row) => `| ${row} |`),
    "",
    "## Discovery Check",
    "",
    `Routes discovered from \`fastify.js\`: ${discovered.map((route) => `\`${route.method} ${route.path}\``).join(", ")}`,
    missingMetadata.length
      ? `Missing metadata: ${missingMetadata.map((route) => `\`${route.method} ${route.path}\``).join(", ")}`
      : "Missing metadata: none",
    staleMetadata.length
      ? `Metadata without source route: ${staleMetadata.map((route) => `\`${route.method} ${route.path}\``).join(", ")}`
      : "Metadata without source route: none",
    "",
    "## Benchmark Commands Used",
    "",
    ...results.map((result) => `- \`${result.command}\``),
    "",
    "## Benchmark Results",
    "",
    "| Endpoint | Conn | Duration | Req/sec | Avg latency ms | P95 ms | P99 ms | Throughput MB/s | Errors | Non-2xx |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...results.map(
      (result) =>
        `| ${result.endpoint} | ${result.connections} | ${result.duration}s | ${formatNumber(result.requestsPerSecond)} | ${formatNumber(result.latencyAverageMs)} | ${formatNumber(result.latencyP95Ms)} | ${formatNumber(result.latencyP99Ms)} | ${formatNumber(result.throughputMBSec)} | ${result.errors} | ${result.non2xx} |`,
    ),
    "",
    "## Fastest To Slowest",
    "",
    "| Rank | Endpoint | Best stable req/sec |",
    "| ---: | --- | ---: |",
    ...fastest.map(
      (item, index) =>
        `| ${index + 1} | ${item.endpoint} | ${formatNumber(item.bestRps)} |`,
    ),
    "",
    "## Estimated Maximum Sustainable RPS",
    "",
    "| Endpoint | Estimate |",
    "| --- | --- |",
    ...endpointMetadata.map(
      (endpoint) =>
        `| ${endpoint.method} ${endpoint.path} | ${estimateMax(results, endpoint)} |`,
    ),
    "",
    "## Bottleneck Analysis",
    "",
    "Note: this Autocannon version exposes p97.5 rather than p95 in its programmatic latency object, so the P95 column uses p97.5 as a conservative fallback when exact p95 is unavailable.",
    "",
    ...endpointMetadata.map((endpoint) => {
      const rows = results.filter(
        (result) => result.endpoint === `${endpoint.method} ${endpoint.path}`,
      );
      const highest = rows.toSorted((a, b) => b.connections - a.connections)[0];
      const health = highest
        ? `${formatNumber(highest.requestsPerSecond)} req/sec, ${formatNumber(highest.latencyP99Ms)} ms p99, ${highest.errors} errors, ${highest.non2xx} non-2xx at ${highest.connections} connections`
        : "not measured";
      return `- \`${endpoint.method} ${endpoint.path}\`: likely pressure points are ${endpoint.bottleneckHints.join(", ")}. Highest measured level: ${health}.`;
    }),
    "",
    "## Optimization Recommendations",
    "",
    "- Replace `ORDER BY RANDOM()` in `/code-v1`; it forces expensive random sorting as table size grows.",
    "- Avoid `COUNT(*)` per request in `/code-v2`; cache counts or use a maintained sequence/max id.",
    "- `/code-v3` is better than `/code-v2`, but still performs two PostgreSQL round trips; cache max id similarly to the Redis helper.",
    "- `/code-v4` is fastest among PostgreSQL reads only when ids exist in the hard-coded range; otherwise 404s hide useful work and distort results.",
    "- Keep PostgreSQL pool size aligned with database capacity. At high HTTP concurrency, the current `max: 50` pool becomes the practical database concurrency limit.",
    "- Redis endpoints avoid PostgreSQL latency, but still pay for `crypto.randomBytes`, network round trips, and `HGETALL` response serialization.",
    "- The PATCH route is CPU/allocation heavy because it creates and serializes 100 history objects per request; add a response schema if this shape is stable.",
    "- Logging is mostly disabled in Fastify, but `console.error` in the global error handler can become expensive during failure storms.",
    "",
    "## Re-run",
    "",
    "- Full requested matrix: `npm run bench:all`",
    "- Quick smoke benchmark: `npm run bench:quick`",
    "- Use an already-running server: `node benchmark/run-autocannon.js --no-start --base-url=http://127.0.0.1:3002`",
    "",
  ];

  await fs.writeFile(
    path.join(root, "BENCHMARK_REPORT.md"),
    `${lines.join("\n")}\n`,
  );
}

async function main() {
  await fs.mkdir(artifactsDir, { recursive: true });
  const discovered = await discoverRoutes();
  const missingMetadata = discovered.filter(
    (route) => !endpointMetadata.some((endpoint) => sameRoute(endpoint, route)),
  );
  if (missingMetadata.length) {
    throw new Error(
      `Route metadata is missing for: ${missingMetadata.map((route) => `${route.method} ${route.path}`).join(", ")}`,
    );
  }

  const server = await startServerIfNeeded();
  try {
    await warmData();
    const results = [];
    for (const endpoint of endpointMetadata) {
      for (const level of selectedLevels) {
        console.log(
          `Running ${endpoint.method} ${endpoint.path} at ${level.connections} connections for ${level.duration}s`,
        );
        const result = await runOne(endpoint, level);
        results.push(result);
      }

      const last = results
        .filter(
          (result) => result.endpoint === `${endpoint.method} ${endpoint.path}`,
        )
        .at(-1);
      if (
        !quick &&
        includeHigher &&
        last?.connections === 1000 &&
        stable(last)
      ) {
        console.log(
          `Running ${endpoint.method} ${endpoint.path} at 2000 connections for 30s`,
        );
        results.push(
          await runOne(endpoint, { connections: 2000, duration: 30 }),
        );
      }
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      discovered,
      results,
    };
    await fs.writeFile(
      path.join(artifactsDir, "autocannon-results.json"),
      JSON.stringify(payload, null, 2),
    );
    await writeReport(discovered, results, Boolean(server));
    console.log(`Wrote ${path.join(root, "BENCHMARK_REPORT.md")}`);
  } finally {
    if (server) server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
