import Fastify from "fastify";
import crypto from "crypto";
import { DB } from "./database/index.js";
import { redis } from "./database/redis.js";
import { generateCode, getMaxId } from "./utils.js";

const app = Fastify({
  bodyLimit: 1024 * 1024,
  logger: false,
});

process.title = "node-fastify";

app.get(
  `/simple`,
  {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
      },
    },
  },
  (req, res) => {
    res.send({ message: "hi" });
  },
);

app.patch(`/update-something/:id/:name`, (req, res) => {
  const { id, name } = req.params;
  const { value1, value2 } = req.query;

  // Validate id and name
  if (isNaN(Number(id))) {
    return res.status(400).send({ error: "id must be a number" });
  } else if (!name || name.length < 3) {
    return res
      .status(400)
      .send({ error: "name is required and must be at least 3 characters" });
  }

  const formattedFooValues = [];

  for (let i = 1; i <= 10; i++) {
    const val = req.body?.[`foo${i}`];
    const formattedVal = typeof val === "string" ? `${val}. ` : val;
    formattedFooValues.push(formattedVal);
  }

  // Adding all the formatted foo values together
  const totalFoo = formattedFooValues.join("");

  // Generating a few kilobytes of dummy data
  const dummyHistory = Array.from({ length: 100 }).map((_, i) => ({
    event_id: Number(id) + i,
    timestamp: new Date().toISOString(),
    action: `Action performed by ${name}`,
    metadata:
      "This is a string intended to take up space to simulate a medium-sized production API response object.".repeat(
        2,
      ),
    status: i % 2 === 0 ? "success" : "pending",
  }));

  res.send({
    id,
    name,
    value1,
    value2,
    total_foo: String(totalFoo).toUpperCase(),
    history: dummyHistory,
  });
});

// Inserts a simple record to the database through Redis for super fast O(1) operations
app.post("/code-fast", async (req, res) => {
  const code = generateCode();

  // Check uniqueness (O(1))
  // SADD returns 1 if added (new), 0 if exists (duplicate)
  const isNew = await redis.sadd("codes:unique", code);

  if (isNew === 0) {
    return res.status(409).send({ error: "Code already exists." });
  }

  // Generate ID (Incrementing Sequence O(1))
  const id = await redis.incr("codes:seq");
  const created_at = new Date().toISOString();

  // Pipeline these for speed (1 network round trip instead of 2)
  const pipeline = redis.pipeline();
  // Store Data (O(1) Hash Set)
  pipeline.hset(`code:${id}`, { id, code, created_at });

  // We will add the ids to a queue so that later a background worker can sync to Postgres
  pipeline.lpush("codes:sync_queue", id);

  await pipeline.exec();

  res.status(201).send({
    created_code: { id, code, created_at },
  });
});

// Gets a code but through Redis for super fast O(1) lookups
app.get("/code-fast", async (req, res) => {
  // Get max ID
  const maxId = await getMaxId();
  if (maxId === 0) return res.status(404).send({ error: "No codes found." });

  // Generating a random ID
  const randomId = crypto.randomInt(1, maxId + 1);

  // Fetch the code (O(1) Hash Lookup)
  const result = await redis.hgetall(`code:${randomId}`);

  if (Object.keys(result).length === 0) {
    return res.status(404).send({ error: "record not found" });
  }

  res.send({ data: result });
});

app.setErrorHandler((err, req, res) => {
  console.error("Unhandled error:", err);
  res.status(500).send({ error: "Internal Server Error" });
});

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Fastify server running at http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
