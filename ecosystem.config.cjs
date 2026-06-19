module.exports = {
  apps: [
    {
      // Specify F like this: F=fastify pm2 start ecosystem.config.cjs
      name: process.env.F || "fastify",
      script: `./${process.env.F || "fastify"}.js`,
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        REDIS_CLUSTER: "false", // Set to "true" to enable Redis Cluster, otherwise it will use a single Redis instance
        PG_CONNECT: "true", // Set to "true" to enable PostgreSQL connection
      },
    },
  ],
};
