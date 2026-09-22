import { readdir, readFile, writeFile } from 'node:fs/promises';

const sourceListUrl = 'https://xiaomi.jobs.f.mioffice.cn/campus/?spread=J7NS6YR';
const verifiedAt = new Date().toISOString();
const verifiedDate = verifiedAt.slice(0, 10);
const files = (await readdir('.')).filter((name) => /^raw-dokobot-page-\d+\.md$/.test(name));
const detailFiles = (await readdir('.')).filter((name) => /^raw-detail-\d+\.md$/.test(name));

const detailData = new Map();
for (const file of detailFiles) {
  const id = file.match(/(\d+)\.md$/)[1];
  const text = await readFile(file, 'utf8');
  const description = text.match(/\*\*职位描述\*\*\s*(?:---\s*)?([\s\S]*?)(?=\s*\*\*职位要求\*\*)/)?.[1] ?? '';
  const requirements = text.match(/\*\*职位要求\*\*\s*(?:---\s*)?([\s\S]*?)(?=\s*(?:---\s*)?(?:>\s*)?投递|$)/)?.[1] ?? '';
  const jd = [description && `职位描述\n${cleanJd(description)}`, requirements && `职位要求\n${cleanJd(requirements)}`].filter(Boolean).join('\n\n');
  const metaLine = text.match(/\r?\n([^\r\n]*\s校招\s+(?:正式|实习|全职)\s+[^\r\n]*20\d{2}届[^\r\n]*计划[^\r\n]*)\r?\n/)?.[1] ?? '';
  detailData.set(id, { jd, meta: parseMeta(metaLine) });
}

function parseMeta(meta) {
  const cleaned = meta.replace(/\s*\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(.*?)\s+(校招|社招|实习)\s+(正式|实习|全职)?\s*(.*?)\s+(20\d{2}届.+?计划)$/);
  if (!match) return { locations: [], recruitment_category: null, recruitment_type: null, job_direction: null, recruitment_project: null };
  return {
    locations: match[1].split(/[、,/]/).map((item) => item.trim()).filter(Boolean),
    recruitment_category: match[2] === '校招' ? '校招' : match[2] === '社招' ? '社招' : '实习',
    recruitment_type: match[3] || match[2],
    job_direction: match[4] || null,
    recruitment_project: match[5],
  };
}

function cleanJd(text) {
  return text
    .replace(/\s*\[\d+\]/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const jobs = [];
const rawRecords = [];
for (const file of files) {
  const page = Number(file.match(/(\d+)\.md$/)[1]);
  const text = await readFile(file, 'utf8');
  const links = new Map([...text.matchAll(/^\[(\d+)\]\s+(https:\/\/xiaomi\.jobs\.f\.mioffice\.cn\/campus\/position\/([^/]+)\/detail\?[^\s]+)$/gm)].map((match) => [match[1], { url: match[2], id: match[3] }]));
  const blocks = [...text.matchAll(/^\*\*(.+?)\s+\[(\d+)\]\*\*\r?\n([\s\S]*?)(?=\r?\n---)/gm)];
  for (const block of blocks) {
    const [, jobTitle, index, blockText] = block;
    const link = links.get(index);
    if (!link) continue;
    const [metaLine = '', ...jdLines] = blockText.split(/\r?\n/);
    const detail = detailData.get(link.id);
    const parsedMeta = parseMeta(metaLine);
    const meta = parsedMeta.recruitment_category ? parsedMeta : (detail?.meta.recruitment_category ? detail.meta : parsedMeta);
    const jd = detail?.jd || cleanJd(jdLines.join('\n')) || '';
    if (!jd) continue;
    const job = {
      source_job_id: link.id,
      company_name: '小米科技',
      job_title: jobTitle.trim(),
      locations: meta.locations,
      job_direction: meta.job_direction,
      job_subdirection: null,
      recruitment_category: meta.recruitment_category,
      recruitment_type: meta.recruitment_type,
      recruitment_project: meta.recruitment_project,
      education_requirement: null,
      major_requirement: null,
      skills: [],
      jd,
      salary: null,
      department: null,
      published_at: null,
      published_at_source: '官网职位列表未披露发布时间',
      last_verified_at: verifiedAt,
      verified_date: verifiedDate,
      source_list_url: sourceListUrl,
      detail_url: link.url,
      application_url: link.url,
      collection_method: 'dokobot-local',
      raw_record_ref: file,
    };
    jobs.push(job);
    rawRecords.push({ page, index, meta_line: metaLine, job });
  }
}

const byId = new Map(jobs.map((job) => [job.source_job_id, job]));
const deduped = [...byId.values()];
await writeFile('jobs.json', `${JSON.stringify(deduped, null, 2)}\n`);
await writeFile('jobs.jsonl', `${deduped.map((job) => JSON.stringify(job)).join('\n')}\n`);
await writeFile('parsed-raw-records.json', `${JSON.stringify(rawRecords, null, 2)}\n`);
console.log(JSON.stringify({ pages: files.length, parsed: jobs.length, unique: deduped.length }));
