import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("缺少 DATABASE_URL");

const migrationDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/db/migrations");
const pool = new Pool({ connectionString, max: 1 });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("SELECT pg_advisory_lock(hashtext('offerflow-schema-migrations'))");
  const applied = new Set((await pool.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((row) => row.name));
  const files = (await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const source = await readFile(resolve(migrationDirectory, file), "utf8");
    const sql = source.replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
    console.log(`applied ${file}`);
  }
  console.log("database migrations are up to date");
} finally {
  await pool.query("SELECT pg_advisory_unlock(hashtext('offerflow-schema-migrations'))").catch(() => undefined);
  await pool.end();
}
