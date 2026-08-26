import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  MemoryStore,
  type PersistedStoreState,
  type StoredUser
} from "./memory-store.ts";
import type { OfferFlowStore } from "./store.ts";

const { Pool } = pg;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MUTATING_METHODS = new Set([
  "createUser",
  "createConversation",
  "deleteConversation",
  "appendUserMessage",
  "beginAssistantMessage",
  "completeAssistantMessage",
  "replaceOpportunityFeed",
  "createInterviewRecord",
  "completeInterviewRecord",
  "failInterviewRecord",
  "createApplication",
  "updateApplication",
  "deleteApplication",
  "syncApplications",
  "createTailorTask",
  "updateResumeVersion"
]);

type GenericMethod = (...args: unknown[]) => unknown;

export type PostgresStore = OfferFlowStore & {
  ready(): Promise<void>;
  close(): Promise<void>;
};

function initialState(users: StoredUser[]): PersistedStoreState {
  return {
    version: 1,
    users,
    usersByEmail: Object.fromEntries(
      users
        .filter((user) => user.email)
        .map((user) => [user.email.trim().toLowerCase(), user.id])
    ),
    conversations: [],
    messages: {},
    applications: [],
    resumeVersions: [],
    tailorTasks: [],
    interviewRecords: [],
    appliedChanges: {},
    syncLog: [],
    sequence: 0,
    opportunityFeed: { opportunities: [] }
  };
}

export function createPostgresStore(connectionString: string): PostgresStore {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  });

  let memory: MemoryStore | undefined;
  let writeQueue: Promise<void> = Promise.resolve();

  async function persistState(state: PersistedStoreState): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
          INSERT INTO api_state (
            singleton,
            version,
            payload,
            updated_at
          )
          VALUES (true, 1, $1::jsonb, now())
          ON CONFLICT (singleton)
          DO UPDATE SET
            version = EXCLUDED.version,
            payload = EXCLUDED.payload,
            updated_at = now()
        `,
        [state]
      );

      for (const user of state.users) {
        const candidateId = UUID_PATTERN.test(user.id)
          ? user.id
          : randomUUID();

        const saved = await client.query<{ id: string }>(
          `
            INSERT INTO users (
              id,
              external_auth_id,
              email,
              display_name,
              deleted_at
            )
            VALUES ($1, $2, $3, $4, NULL)
            ON CONFLICT (external_auth_id)
            DO UPDATE SET
              email = EXCLUDED.email,
              display_name = EXCLUDED.display_name,
              deleted_at = NULL
            RETURNING id
          `,
          [
            candidateId,
            user.id,
            user.email,
            user.displayName
          ]
        );

        const databaseUserId = saved.rows[0].id;

        await client.query(
          `
            INSERT INTO auth_credentials (
              user_id,
              password_hash,
              password_salt,
              updated_at
            )
            VALUES ($1, $2, $3, now())
            ON CONFLICT (user_id)
            DO UPDATE SET
              password_hash = EXCLUDED.password_hash,
              password_salt = EXCLUDED.password_salt,
              updated_at = now()
          `,
          [
            databaseUserId,
            user.passwordHash,
            user.passwordSalt
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function initialize(): Promise<void> {
    const stored = await pool.query<{ payload: PersistedStoreState }>(
      `
        SELECT payload
        FROM api_state
        WHERE singleton = true
      `
    );

    let state: PersistedStoreState;

    if (stored.rows[0]?.payload) {
      state = stored.rows[0].payload;
    } else {
      const result = await pool.query<{
        id: string;
        email: string | null;
        display_name: string | null;
        password_hash: string;
        password_salt: string;
      }>(
        `
          SELECT
            u.external_auth_id AS id,
            u.email,
            u.display_name,
            c.password_hash,
            c.password_salt
          FROM users u
          JOIN auth_credentials c
            ON c.user_id = u.id
          WHERE u.deleted_at IS NULL
          ORDER BY u.created_at
        `
      );

      const users: StoredUser[] = result.rows.map((row) => ({
        id: row.id,
        email: row.email ?? "",
        displayName: row.display_name ?? row.email ?? row.id,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt
      }));

      state = initialState(users);
    }

    memory = new MemoryStore({
      persistence: false,
      initialState: state
    });

    if (!stored.rows[0]?.payload) {
      await persistState(memory.snapshot());
    }
  }

  const readyPromise = initialize();

  return new Proxy({} as PostgresStore, {
    get(_target, property) {
      if (property === "then") return undefined;

      if (property === "ready") {
        return async () => {
          await readyPromise;
        };
      }

      if (property === "close") {
        return async () => {
          await readyPromise.catch(() => undefined);
          await writeQueue.catch(() => undefined);
          await pool.end();
        };
      }

      if (typeof property !== "string") return undefined;

      return async (...args: unknown[]) => {
        await readyPromise;

        if (!memory) {
          throw new Error("PostgreSQL store is not initialized");
        }

        const member = (
          memory as unknown as Record<string, unknown>
        )[property];

        if (typeof member !== "function") {
          return member;
        }

        const method = member as GenericMethod;

        if (!MUTATING_METHODS.has(property)) {
          await writeQueue;
          return await method.apply(memory, args);
        }

        const run = writeQueue.then(async () => {
          if (!memory) {
            throw new Error("PostgreSQL store is not initialized");
          }

          const before = memory.snapshot();

          try {
            const result = await method.apply(memory, args);
            await persistState(memory.snapshot());
            return result;
          } catch (error) {
            memory.replaceState(before);
            throw error;
          }
        });

        writeQueue = run.then(
          () => undefined,
          () => undefined
        );

        return await run;
      };
    }
  });
}
