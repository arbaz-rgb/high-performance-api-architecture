import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import keys from "./keys.js";

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

async function createDatabaseIfMissing() {
  const adminPool = new Pool({
    user: keys.dbUser,
    host: keys.dbHost,
    database: "postgres",
    password: keys.dbPassword,
    port: keys.dbPort,
  });

  try {
    const result = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [keys.dbDatabase],
    );

    if (result.rowCount === 0) {
      await adminPool.query(
        `CREATE DATABASE ${quoteIdentifier(keys.dbDatabase)};`,
      );
      console.log(`[postgres] created database: ${keys.dbDatabase}`);
    } else {
      console.log(`[postgres] database already exists: ${keys.dbDatabase}`);
    }
  } finally {
    await adminPool.end();
  }
}

async function createTablesIfMissing() {
  const appPool = new Pool({
    user: keys.dbUser,
    host: keys.dbHost,
    database: keys.dbDatabase,
    password: keys.dbPassword,
    port: keys.dbPort,
  });

  const databasePath = path.dirname(fileURLToPath(import.meta.url));
  const codesTableSQL = fs
    .readFileSync(path.join(databasePath, "./tables/codes.sql"))
    .toString();

  try {
    await appPool.query(codesTableSQL);
    console.log("[postgres] ensured codes table exists.");
  } finally {
    await appPool.end();
  }
}

async function main() {
  await createDatabaseIfMissing();
  await createTablesIfMissing();
}

main().catch((err) => {
  console.error("[postgres] setup failed.");
  console.error(err);
  process.exit(1);
});
