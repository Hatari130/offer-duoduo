import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { Pool, type PoolClient } from "pg";
import { sanitizeResumeTemplate, sanitizeResumeVersionRecord, sanitizeTailorTask } from "@offerflow/contracts";

// Fixed identifiers only. Never log payloads, account IDs, or connection strings.
const targets = [
  { table: "resume_templates", sanitize: sanitizeResumeTemplate },
  { table: "resume_versions", sanitize: sanitizeResumeVersionRecord },
  { table: "tailor_tasks", sanitize: sanitizeTailorTask }
] as const;

export async function sanitizeHistory(client: Pick<PoolClient, "query">, apply = false) {
  const counts: Record<string, { scanned: number; changed: number }> = {};
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  try {
    for (const target of targets) {
      const count = counts[target.table] = { scanned: 0, changed: 0 };
      // A cursor bounds memory; apply locks each fetched row against concurrent writes.
      await client.query(`DECLARE privacy_rows NO SCROLL CURSOR FOR SELECT id,user_id,payload FROM ${target.table}${apply ? " FOR UPDATE" : ""}`);
      while (true) {
        const result = await client.query("FETCH FORWARD 100 FROM privacy_rows");
        if (!result.rows.length) break;
        for (const row of result.rows) {
          count.scanned++;
          const safe = target.sanitize(row.payload);
          if (isDeepStrictEqual(row.payload, safe)) continue;
          count.changed++;
          if (apply) await client.query(`UPDATE ${target.table} SET payload=$3::jsonb WHERE id=$1 AND user_id=$2`, [row.id, row.user_id, JSON.stringify(safe)]);
        }
      }
      await client.query("CLOSE privacy_rows");
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--apply", "--backup-confirmed"].includes(arg))) throw new Error("Usage: db:sanitize-resumes [--apply --backup-confirmed]");
  const apply = args.includes("--apply");
  if (apply && !args.includes("--backup-confirmed")) throw new Error("Create and verify a restricted-access backup before using --apply --backup-confirmed");
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const client = await pool.connect();
    try { console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", counts: await sanitizeHistory(client, apply) })); }
    finally { client.release(); }
  } catch {
    console.error("Resume history sanitization failed; transaction rolled back. No payloads logged.");
    process.exitCode = 1;
  } finally { await pool.end(); }
}
