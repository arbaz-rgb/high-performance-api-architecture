export const endpointMetadata = [
  {
    method: "GET",
    path: "/simple",
    description: "Static JSON health-style response.",
    auth: "None",
    query: [],
    body: null,
    bottleneckHints: ["Fastify routing", "JSON serialization"],
  },
  {
    method: "PATCH",
    path: "/update-something/:id/:name",
    benchmarkPath: "/update-something/123/john_doe?value1=abc&value2=xyz",
    description:
      "Validates path/query values and returns a medium JSON history object.",
    auth: "None",
    query: ["value1", "value2"],
    body: {
      required: true,
      contentType: "application/json",
      sample: {
        foo1: "test",
        foo2: "test",
        foo3: "test",
        foo4: "test",
        foo5: "test",
        foo6: "test",
        foo7: "test",
        foo8: "test",
        foo9: "test",
        foo10: "test",
      },
    },
    bottleneckHints: [
      "JSON parsing",
      "response object allocation",
      "JSON serialization",
    ],
  },
  {
    method: "POST",
    path: "/code",
    description:
      "Generates a 500-character code and inserts it into PostgreSQL.",
    auth: "None",
    query: [],
    body: null,
    bottleneckHints: [
      "PostgreSQL INSERT",
      "unique index maintenance",
      "crypto.randomBytes",
    ],
  },
  {
    method: "GET",
    path: "/code-v1",
    description: "Reads a random PostgreSQL row using ORDER BY RANDOM().",
    auth: "None",
    query: [],
    body: null,
    bottleneckHints: [
      "PostgreSQL ORDER BY RANDOM()",
      "database CPU",
      "pool saturation",
    ],
  },
  {
    method: "GET",
    path: "/code-v2",
    description: "Counts PostgreSQL rows, then selects a random id.",
    auth: "None",
    query: [],
    body: null,
    bottleneckHints: [
      "PostgreSQL COUNT(*)",
      "extra database round trip",
      "pool saturation",
    ],
  },
  {
    method: "GET",
    path: "/code-v3",
    description:
      "Finds max id via descending index scan, then selects a random id.",
    auth: "None",
    query: [],
    body: null,
    bottleneckHints: ["two PostgreSQL queries", "pool saturation"],
  },
  {
    method: "GET",
    path: "/code-v4",
    description: "Selects a random id from a fixed 1..700000 range.",
    auth: "None",
    query: [],
    body: null,
    bottleneckHints: ["PostgreSQL index lookup", "404s if ids are missing"],
  },
  {
    method: "POST",
    path: "/code-fast",
    description:
      "Generates a code and writes uniqueness/id/data/sync state to Redis.",
    auth: "None",
    query: [],
    body: null,
    bottleneckHints: [
      "Redis SADD",
      "Redis INCR",
      "Redis pipeline",
      "crypto.randomBytes",
    ],
  },
  {
    method: "GET",
    path: "/code-fast",
    description: "Reads a random Redis hash using a cached max id.",
    auth: "None",
    query: [],
    body: null,
    bottleneckHints: [
      "Redis HGETALL",
      "cache refresh GET every 500ms",
      "404s if ids are missing",
    ],
  },
];

export const loadLevels = [
  { connections: 100, duration: 30 },
  { connections: 500, duration: 30 },
  { connections: 1000, duration: 30 },
];
