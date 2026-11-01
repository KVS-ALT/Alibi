// Applies db/schema.sql to DATABASE_URL. Usage: DATABASE_URL=... npm run db:init
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await client.connect();
await client.query(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
console.log("sessions table ready");
await client.end();
