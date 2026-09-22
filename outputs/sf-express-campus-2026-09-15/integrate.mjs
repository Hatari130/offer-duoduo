import fs from 'fs';
import path from 'path';

const TARGET_PATH = 'apps/web/src/previews/job-discovery/jobs.json';
const TMP_PATH = 'apps/web/src/previews/job-discovery/jobs.tmp.json';
const SF_JOBS_PATH = 'outputs/sf-express-campus-2026-09-15/jobs.json';

const existing = JSON.parse(fs.readFileSync(TARGET_PATH, 'utf8'));
const sfJobs = JSON.parse(fs.readFileSync(SF_JOBS_PATH, 'utf8'));

console.log('Existing jobs count:', existing.length);
console.log('SF Express jobs to integrate:', sfJobs.length);

// Keep all jobs from other companies, and idempotently upsert SF Express jobs
const existingNonSF = existing.filter(j => j.company_name !== '顺丰');
const merged = [...existingNonSF, ...sfJobs];

console.log('Merged jobs count:', merged.length);

// Ensure no duplicate company + source_job_id
const seen = new Set();
for (const j of merged) {
  const key = `${j.company_name}:${j.source_job_id}`;
  if (seen.has(key)) {
    throw new Error(`Duplicate job key found: ${key}`);
  }
  seen.add(key);
}

// Write to tmp first
fs.writeFileSync(TMP_PATH, JSON.stringify(merged, null, 2), 'utf8');

// Verify tmp file exists and is valid JSON
const parsedTmp = JSON.parse(fs.readFileSync(TMP_PATH, 'utf8'));
if (parsedTmp.length !== merged.length) {
  throw new Error('Tmp file validation failed!');
}

// Replace target atomically
fs.renameSync(TMP_PATH, TARGET_PATH);
console.log('Successfully integrated SF Express jobs into jobs.json!');
