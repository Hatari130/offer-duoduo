const { chromium } = require('C:/Users/Administrator.DESKTOP-1OBI06T/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve('outputs/geely-2026-09-15');
const LIST_URL = 'https://app.mokahr.com/campus-recruitment/geely/78436?locale=zh-CN#/jobs?page=1&anchorName=jobsList&commitment[0]=%E5%85%A8%E8%81%8C';
const API = 'https://app.mokahr.com/api/outer/ats-apply/website';
const SITE = 'https://app.mokahr.com/campus-recruitment/geely/78436?locale=zh-CN';
const PAGE_SIZE = 30;
const CONCURRENCY = 4;
fs.mkdirSync(ROOT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
function decrypt(body, iv) {
  if (!body || typeof body.data !== 'string' || !body.necromancer) return body;
  const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(body.necromancer, 'utf8'), Buffer.from(iv, 'utf8'));
  const plain = decipher.update(body.data, 'base64', 'utf8') + decipher.final('utf8');
  return JSON.parse(plain);
}
function atomicJson(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
async function post(request, endpoint, payload, iv, attempts = 4) {
  let last;
  for (let n = 1; n <= attempts; n++) {
    try {
      const res = await request.post(`${API}/${endpoint}`, { data: payload, timeout: 45000 });
      if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
      const parsed = decrypt(await res.json(), iv);
      if (parsed?.success === false || (parsed?.code != null && parsed.code !== 0)) throw new Error(`API ${parsed?.code}: ${parsed?.msg || 'unknown error'}`);
      return parsed?.data ?? parsed;
    } catch (e) {
      last = e;
      if (n < attempts) await sleep(500 * 2 ** (n - 1) + Math.floor(Math.random() * 300));
    }
  }
  throw last;
}
function textFromHtml(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function locationLabel(x) {
  const parts = [x.country, x.provinceName, x.cityName].filter(Boolean);
  return [...new Set(parts)].join('·') || String(x.id || '未知');
}
function customValue(detail, name) {
  const field = Object.values(detail.customFields || {}).find(x => x?.name === name);
  if (!field) return null;
  return Array.isArray(field.value) ? field.value.join('、') : (field.value ?? null);
}
function deriveMajor(jd) {
  const lines = jd.split('\n').map(x => x.trim()).filter(Boolean);
  const hit = lines.find(x => /专业/.test(x) && /(相关|优先|不限|要求)/.test(x));
  return hit || null;
}
function detailUrl(id) { return `${SITE}#/job/${id}`; }

(async () => {
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('text=/\\d+ 结果/').waitFor({ timeout: 60000 });
  const iv = await page.evaluate(() => window.TurboApply?.data?.aesIv);
  if (!iv) throw new Error('Missing AES IV from page bootstrap');
  const request = page.request;

  const firstPayload = { orgId:'geely', siteId:'78436', limit:PAGE_SIZE, offset:0, needStat:true, jobIdTopList:[], commitments:['全职'], customFields:{}, site:'campus', locale:'zh-CN' };
  const first = await post(request, 'jobs/v2', firstPayload, iv);
  const total = first.jobStats.total;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const rawPages = [{ offset: 0, ...first }];
  console.log(`LIST total=${total} pages=${pageCount}`);
  for (let p = 1; p < pageCount; p++) {
    const payload = { ...firstPayload, offset: p * PAGE_SIZE };
    rawPages.push({ offset: payload.offset, ...(await post(request, 'jobs/v2', payload, iv)) });
    if ((p + 1) % 10 === 0 || p + 1 === pageCount) console.log(`LIST ${p + 1}/${pageCount}`);
    await sleep(80);
  }
  atomicJson(path.join(ROOT, 'raw-pages.json'), rawPages);
  const listJobs = rawPages.flatMap(x => x.jobs || []);
  const unique = [...new Map(listJobs.map(x => [x.id, x])).values()];
  if (unique.length !== total) throw new Error(`Expected ${total} unique jobs, got ${unique.length}`);

  const ndjsonPath = path.join(ROOT, 'raw-details.ndjson');
  const details = new Map();
  if (fs.existsSync(ndjsonPath)) {
    for (const line of fs.readFileSync(ndjsonPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
      try { const d = JSON.parse(line); if (d?.id) details.set(d.id, d); } catch {}
    }
  }
  const pending = unique.filter(j => !details.has(j.id));
  console.log(`DETAIL resume=${details.size} pending=${pending.length}`);
  let cursor = 0, completed = 0;
  const failures = [];
  async function worker(workerId) {
    while (true) {
      const index = cursor++;
      if (index >= pending.length) return;
      const job = pending[index];
      try {
        await sleep(workerId * 40);
        const d = await post(request, 'job', { orgId:'geely', siteId:'78436', jobId:job.id, locale:'zh-CN' }, iv);
        fs.appendFileSync(ndjsonPath, `${JSON.stringify(d)}\n`);
        details.set(d.id, d);
      } catch (e) {
        failures.push({ id: job.id, title: job.title, error: String(e?.message || e) });
      }
      completed++;
      if (completed % 100 === 0 || completed === pending.length) console.log(`DETAIL ${completed}/${pending.length} ok=${details.size} failed=${failures.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  if (failures.length) {
    atomicJson(path.join(ROOT, 'detail-failures.json'), failures);
    console.log(`RETRY failures=${failures.length}`);
    for (const f of [...failures]) {
      try {
        const d = await post(request, 'job', { orgId:'geely', siteId:'78436', jobId:f.id, locale:'zh-CN' }, iv, 6);
        fs.appendFileSync(ndjsonPath, `${JSON.stringify(d)}\n`);
        details.set(d.id, d);
        failures.splice(failures.findIndex(x => x.id === f.id), 1);
      } catch {}
      await sleep(250);
    }
  }
  await browser.close();

  const orderedDetails = unique.map(j => details.get(j.id)).filter(Boolean);
  atomicJson(path.join(ROOT, 'raw-details.json'), orderedDetails);
  const verifiedAt = new Date().toISOString();
  const jobs = unique.map(list => {
    const d = details.get(list.id) || list;
    const jd = textFromHtml(d.jobDescription);
    const locations = (d.locations || list.locations || []).map(locationLabel);
    const recruitmentProject = customValue(d, '招聘年度');
    return {
      source_job_id: d.id,
      company_name: '吉利控股集团',
      job_title: d.title,
      locations,
      job_direction: d.zhineng?.name || null,
      job_subdirection: customValue(d, '职能细分类型'),
      recruitment_project: recruitmentProject,
      education_requirement: d.education || null,
      major_requirement: deriveMajor(jd),
      english_requirement: customValue(d, '英语要求'),
      skills: [],
      jd,
      detail_url: detailUrl(d.id),
      application_url: detailUrl(d.id),
      last_verified_at: verifiedAt,
      verified_date: '2026-09-15',
      recruitment_type: d.commitment || list.commitment || '全职',
      recruitment_category: '校园招聘',
      published_at: (d.publishedAt || list.publishedAt || '').slice(0, 10) || null,
      published_at_source: '吉利招聘官网职位接口 publishedAt 字段',
      salary: null,
      department: [d.department?.name, ...(d.departments || []).map(x => x.name)].filter(Boolean).join(' / ') || null,
      detailed_location: customValue(d, '工作地点(详细到区)'),
      source_list_url: LIST_URL
    };
  });
  atomicJson(path.join(ROOT, 'jobs.json'), jobs);
  fs.writeFileSync(path.join(ROOT, 'jobs.jsonl'), jobs.map(x => JSON.stringify(x)).join('\n') + '\n');

  const duplicateIds = [...new Set(jobs.map(x => x.source_job_id).filter((x, i, a) => a.indexOf(x) !== i))];
  const commitmentCounts = jobs.reduce((m, x) => (m[x.recruitment_type] = (m[x.recruitment_type] || 0) + 1, m), {});
  const missing = {
    jd: jobs.filter(x => !x.jd).length,
    published_at: jobs.filter(x => !x.published_at).length,
    locations: jobs.filter(x => !x.locations.length).length,
    education_requirement: jobs.filter(x => !x.education_requirement).length
  };
  const validation = {
    source_total: total,
    list_rows: listJobs.length,
    unique_list_jobs: unique.length,
    detail_records: orderedDetails.length,
    normalized_jobs: jobs.length,
    duplicate_source_job_ids: duplicateIds,
    commitment_counts: commitmentCounts,
    missing,
    failures,
    source_url: LIST_URL,
    started_at: startedAt,
    completed_at: verifiedAt
  };
  atomicJson(path.join(ROOT, 'validation.json'), validation);
  const md = [
    '# 吉利校园招聘全职岗位全集', '',
    `- 官网筛选结果：${total} 个全职岗位`,
    `- 抓取并整理：${jobs.length} 个岗位`,
    `- 完整详情：${orderedDetails.length} 个岗位`,
    `- 校验日期：2026-09-15`,
    `- 来源：[吉利招聘官网](${LIST_URL})`, '',
    ...jobs.flatMap((j, i) => [
      `## ${i + 1}. ${j.job_title}`, '',
      `- 职位 ID：${j.source_job_id}`,
      `- 地点：${j.locations.join('、') || '未标注'}`,
      `- 职能：${[j.job_direction, j.job_subdirection].filter(Boolean).join(' / ') || '未标注'}`,
      `- 部门：${j.department || '未标注'}`,
      `- 学历：${j.education_requirement || '未标注'}`,
      `- 招聘项目：${j.recruitment_project || '未标注'}`,
      `- 发布时间：${j.published_at || '未标注'}`,
      `- [官网详情与投递](${j.detail_url})`, '',
      j.jd || '官网详情未返回职位描述', ''
    ])
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, '吉利全职岗位全集.md'), md);
  console.log(`DONE jobs=${jobs.length} details=${orderedDetails.length} failures=${failures.length}`);
})().catch(e => { console.error(e); process.exit(1); });
