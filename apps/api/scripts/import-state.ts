import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("缺少 DATABASE_URL");
const stateFile = resolve(process.argv[2] || process.env.OFFERFLOW_DATA_FILE || ".offerflow-data/state.json");
const state = JSON.parse(await readFile(stateFile, "utf8")) as Record<string, any>;
if (state.version !== 1) throw new Error("只支持 version=1 的 OfferFlow 状态文件");
const sourceHash = createHash("sha256").update(JSON.stringify(state)).digest("hex");

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const json = (value: unknown) => JSON.stringify(value);
const userIds = new Map<string, string>();
let transactionStarted = false;

try {
  const previousImport = await client.query("SELECT 1 FROM audit_logs WHERE action='legacy_state_imported' AND metadata->>'sourceHash'=$1", [sourceHash]);
  if (previousImport.rowCount) throw new Error("这个状态文件已经导入过，已停止重复写入");
  await client.query("BEGIN");
  transactionStarted = true;
  for (const user of state.users || []) {
    const email = String(user.email || "").trim().toLowerCase();
    const externalAuthId = email ? `password:${email}` : `legacy:${String(user.id)}`;
    const existing = email
      ? await client.query(
          "SELECT id FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL FOR UPDATE",
          [email]
        )
      : await client.query(
          "SELECT id FROM users WHERE external_auth_id=$1 AND deleted_at IS NULL FOR UPDATE",
          [externalAuthId]
        );

    let actualUserId = existing.rows[0]?.id as string | undefined;
    if (actualUserId) {
      await client.query(
        "UPDATE users SET display_name=$2, deleted_at=NULL WHERE id=$1",
        [actualUserId, user.displayName]
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO users (id,external_auth_id,email,display_name) VALUES ($1,$2,$3,$4)
         ON CONFLICT (external_auth_id) DO UPDATE
         SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,deleted_at=NULL
         RETURNING id`,
        [isUuid(user.id) ? user.id : randomUUID(), externalAuthId, email || null, user.displayName]
      );
      actualUserId = inserted.rows[0].id;
    }
    if (!actualUserId) throw new Error(`无法为旧用户 ${String(user.id)} 建立数据库映射`);
    userIds.set(user.id, actualUserId);
    await client.query(
      `INSERT INTO auth_credentials (user_id,password_hash,password_salt) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,password_salt=EXCLUDED.password_salt`,
      [actualUserId, user.passwordHash, user.passwordSalt]
    );
  }
  for (const stored of state.conversations || []) {
    const userId = userIds.get(stored.userId);
    if (!userId) continue;
    const item = stored.conversation;
    await client.query(
      `INSERT INTO conversations (id,user_id,title,payload,created_at,updated_at,deleted_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [item.id,userId,item.title,json(item),item.createdAt,item.updatedAt,stored.deletedAt||null]
    );
    for (const message of state.messages?.[item.id] || []) {
      await client.query(
        `INSERT INTO messages (id,conversation_id,user_id,role,status,content,attachments,payload,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) ON CONFLICT (id) DO NOTHING`,
        [message.id,item.id,userId,message.role,message.status,message.content,json(message.attachments||[]),json(message),message.createdAt]
      );
    }
  }
  for (const stored of state.applications || []) {
    const userId = userIds.get(stored.userId);
    if (!userId) continue;
    const item = stored.item;
    const app = item.application;
    await client.query(
      `INSERT INTO applications
       (id,user_id,stage,external_stage,company_name_snapshot,position_snapshot,department_snapshot,city_snapshot,job_type_snapshot,
        source_url,source_host,summary_snapshot,responsibilities_snapshot,requirements_snapshot,raw_excerpt_snapshot,is_favorite,
        applied_at,deadline_at,next_action,revision,created_at,updated_at,deleted_at,identity_aliases,payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25::jsonb)
       ON CONFLICT (user_id, id) DO NOTHING`,
      [app.id,userId,app.stage,app.externalStage||null,app.company,app.position,app.department||null,app.city||null,app.jobType||null,app.sourceUrl,app.sourceHost,app.summary||null,json(app.responsibilities||[]),json(app.requirements||[]),app.rawExcerpt||null,app.isFavorite??false,app.appliedAt||null,app.deadline||null,app.nextAction||null,item.revision,app.createdAt,app.updatedAt,item.deletedAt||null,json(app.identityAliases||[]),json(app)]
    );
    await client.query(
      "INSERT INTO sync_changes (user_id,entity_type,entity_id,operation,revision,payload,created_at) VALUES ($1,'application',$2,$3,$4,$5::jsonb,$6)",
      [userId,app.id,item.deletedAt ? "delete" : "upsert",item.revision,json(item),app.updatedAt]
    );
  }
  for (const stored of state.tailorTasks || []) {
    const userId = userIds.get(stored.userId);
    if (userId) await client.query("INSERT INTO tailor_tasks (id,user_id,payload,created_at,updated_at) VALUES ($1,$2,$3::jsonb,$4,$5) ON CONFLICT (id) DO NOTHING", [stored.task.id,userId,json(stored.task),stored.task.createdAt,stored.task.updatedAt]);
  }
  for (const stored of state.resumeVersions || []) {
    const userId = userIds.get(stored.userId);
    const item = stored.item;
    if (userId) await client.query("INSERT INTO resume_versions (id,user_id,tailor_task_id,revision,payload,created_at,updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT (id) DO NOTHING", [item.version.id,userId,item.version.tailorTaskId,item.revision,json(item),item.version.createdAt,item.version.updatedAt]);
  }
  for (const stored of state.interviewRecords || []) {
    const userId = userIds.get(stored.userId);
    const item = stored.record;
    if (userId) await client.query(`INSERT INTO interview_records (id,user_id,application_id,title,source_type,status,transcript,error,payload,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) ON CONFLICT (id) DO NOTHING`, [item.id,userId,item.applicationId,item.title,item.sourceType,item.status,item.transcript,item.error||null,json(item),item.createdAt,item.updatedAt]);
  }
  if (state.opportunityFeed) {
    await client.query(`INSERT INTO opportunity_feed_snapshots (singleton,payload) VALUES (true,$1::jsonb) ON CONFLICT (singleton) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`, [json(state.opportunityFeed)]);
  }
  await client.query("INSERT INTO audit_logs (action,metadata) VALUES ('legacy_state_imported',$1::jsonb)", [json({ sourceHash, users: userIds.size, importedAt: new Date().toISOString() })]);
  await client.query("COMMIT");
  transactionStarted = false;
  console.log(`imported ${userIds.size} users from ${stateFile}; existing browser sessions were intentionally not migrated`);
} catch (error) {
  if (transactionStarted) await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
