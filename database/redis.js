import Redis from "ioredis";

const isCluster = process.env.REDIS_CLUSTER === "true";
const clusterStartupNodes = [{ host: "127.0.0.1", port: 7000 }];
const standaloneOptions = { host: "127.0.0.1", port: 6379 };

const redis = isCluster
  ? new Redis.Cluster(clusterStartupNodes)
  : new Redis(standaloneOptions);

const describeRedisConfig = () => {
  if (isCluster) {
    return `cluster startup nodes=${clusterStartupNodes
      .map((node) => `${node.host}:${node.port}`)
      .join(", ")}`;
  }

  return `standalone ${standaloneOptions.host}:${standaloneOptions.port}`;
};

const logRedisError = (err) => {
  const details = {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    errno: err?.errno,
    syscall: err?.syscall,
    address: err?.address,
    port: err?.port,
    stack: err?.stack,
  };

  console.error(`[redis] error (${describeRedisConfig()}):`, details);

  if (!err?.message) {
    console.error("[redis] raw error:", err);
  }
};

console.log(`[redis] connecting to ${describeRedisConfig()}`);

redis.on("ready", () => {
  if (isCluster) {
    console.log(
      `[redis] cluster ready. Total nodes ${redis.nodes().length} (masters: ${redis.nodes("master").length}, replicas: ${redis.nodes("slave").length})`,
    );
  } else {
    console.log("[redis] standalone ready.");
  }
});

redis.on("error", (err) => {
  logRedisError(err);
});

export { redis, logRedisError };
