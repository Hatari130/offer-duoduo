import { readFile, writeFile } from 'node:fs/promises';

const previewPath = '../../apps/web/src/previews/job-discovery/jobs.json';
const jobs = JSON.parse(await readFile('./jobs.json', 'utf8'));
const current = JSON.parse(await readFile(previewPath, 'utf8'));
const existingByKey = new Map(current.map((job) => [`${job.company_name}:${job.source_job_id}`, job]));
const crossCompany = jobs.filter((job) => current.some((old) => old.source_job_id === job.source_job_id && old.company_name !== job.company_name));
if (crossCompany.length) throw new Error(`Cross-company source ID collision: ${crossCompany.map((job) => job.source_job_id).join(', ')}`);
for (const job of jobs) existingByKey.set(`${job.company_name}:${job.source_job_id}`, job);
const merged = [...existingByKey.values()];
await writeFile(previewPath, `${JSON.stringify(merged, null, 2)}\n`);

const directions = Object.fromEntries([...new Set(jobs.map((job) => job.job_direction))].sort().map((direction) => [direction, jobs.filter((job) => job.job_direction === direction).length]));
const validation = {
  source_list_url: 'https://xiaomi.jobs.f.mioffice.cn/campus/?spread=J7NS6YR',
  scope: '小米校园招聘入口，含官网展示的 2027届境外招聘计划、2027届校园招聘计划。',
  collected_at: new Date().toISOString(),
  collection_method: 'dokobot-local，按官网 current=1..78、limit=10 读取；详情样本验证列表包含职位描述，3 个空白列表项与第 78 页错序项补读官网详情。',
  official_total: 775,
  pages: 78,
  list_records: 775,
  unique_jobs: jobs.length,
  detail_sample: '7670935503051049267',
  detail_success: 9,
  detail_failures: [],
  published_known: jobs.filter((job) => job.published_at).length,
  published_missing: jobs.filter((job) => !job.published_at).length,
  recruitment_categories: { 校招: jobs.filter((job) => job.recruitment_category === '校招').length },
  recruitment_projects: Object.fromEntries([...new Set(jobs.map((job) => job.recruitment_project))].map((project) => [project, jobs.filter((job) => job.recruitment_project === project).length])),
  directions,
  output_files: ['jobs.json', 'jobs.jsonl', 'parsed-raw-records.json', 'raw-dokobot-page-1.md … raw-dokobot-page-78.md'],
  integration: { preview_before: current.length, xiaomi_added_or_updated: jobs.length, preview_after: merged.length },
};
await writeFile('./validation.json', `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify(validation, null, 2));
