import { Pool } from "pg";

declare global {
  var __alibiPool: Pool | undefined;
}

export function hasDb() {
  return Boolean(process.env.DATABASE_URL);
}

export function db(): Pool {
  if (!globalThis.__alibiPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalThis.__alibiPool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return globalThis.__alibiPool;
}
