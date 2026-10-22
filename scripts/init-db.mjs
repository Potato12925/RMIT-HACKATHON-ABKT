import { existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { resolve, dirname } from "node:path";
if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:"))
  throw new Error("Set DATABASE_URL to a SQLite file URL in .env");
const path = resolve("prisma", url.slice(5));
mkdirSync(dirname(path), { recursive: true });
// Prisma 6's Windows schema engine can fail silently when the SQLite file is absent.
// Append mode creates it without truncating an existing database.
closeSync(openSync(path, "a"));
