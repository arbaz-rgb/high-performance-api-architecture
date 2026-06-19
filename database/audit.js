import { Pool } from "pg";
import keys from "./keys.js";

function redactConfig() {
  return {
    user: keys.dbUser,
    host: keys.dbHost,
    database: keys.dbDatabase,
    password: "<redacted>",
    port: keys.dbPort,
  };
}

async function main() {
  console.log("[postgres] resolved config:", JSON.stringify(redactConfig()));

  const adminPool = new Pool({
    user: keys.dbUser,
    host: keys.dbHost,
    database: "postgres",
    password: keys.dbPassword,
    port: keys.dbPort,
  });

  try {
    const databaseResult = await adminPool.query(
      "SELECT datname FROM pg_database WHERE datname = $1",
      [keys.dbDatabase],
    );

    console.log(
      `[postgres] database ${keys.dbDatabase} exists: ${
        databaseResult.rowCount === 1
      }`,
    );
  } finally {
    await adminPool.end();
  }

  const appPool = new Pool({
    user: keys.dbUser,
    host: keys.dbHost,
    database: keys.dbDatabase,
    password: keys.dbPassword,
    port: keys.dbPort,
  });

  try {
    const identityResult = await appPool.query(`
      SELECT
        current_user AS user_name,
        current_database() AS database_name,
        inet_server_addr() AS server_addr,
        inet_server_port() AS server_port
    `);

    console.log(
      "[postgres] connection identity:",
      JSON.stringify(identityResult.rows[0]),
    );

    const tableResult = await appPool.query(
      "SELECT to_regclass('public.codes') AS codes_table",
    );

    console.log(
      `[postgres] codes table exists: ${tableResult.rows[0].codes_table !== null}`,
    );
  } finally {
    await appPool.end();
  }
}

main().catch((err) => {
  console.error("[postgres] audit failed.");
  console.error(err);
  process.exit(1);
});
