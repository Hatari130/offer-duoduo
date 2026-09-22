import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {cleanRequirements,cleanJD} from './clean-fields.mjs';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const inventory=read('inventory.json'),pages=read('list-pages.json');
const missing=inventory.filter(j=>!fs.existsSync(path.join(root,'dom',j.id+'.json'))).map(j=>j.id);
if(missing.length){console.log(JSON.stringify({missing_count:missing.length,missing}));process.exit(2);}
const skills=['TypeScript','JavaScript','React','Vue','Node.js','Java','Go','Python','C++','C#','SQL','Linux','Kubernetes','Docker','Redis','MySQL','Kafka','Spark','Flink','Hadoop','PyTorch','TensorFlow','CUDA','Triton','LLM','Agent','Prompt','AIGC','RAG','SRE','DevOps','TCP/IP','BGP','OSPF','CCIE','HCIE','Figma','Photoshop','Excel','PowerPoint','Tableau','Power BI','Swift','Kotlin','Android','iOS','Unity','Unreal','Doris','Elasticsearch','Rust','Golang','Git'];
function derived(q){
 const lines=q.split(/\n/).map(s=>s.trim()).filter(Boolean);
 const education=lines.filter(s=>/学历|本科|硕士|博士|大专|学士|研究生/.test(s));
 const majors=lines.filter(s=>/专业/.test(s));
 const graduation=lines.filter(s=>/毕业|202[6-9]\s*届|届.*(本科|硕士|博士)/.test(s));
 const matches=skills.filter(s=>new RegExp('(?<![A-Za-z])'+s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![A-Za-z])','i').test(q));
 return {education_requirement:education.length?education.join('\n'):null,major_requirement:majors.length?majors.join('\n'):null,graduation_requirement:graduation.length?graduation.join('\n'):null,skills:matches,skills_extraction_method:'显式词表匹配；仅表示任职资格中提及，不区分必需与加分项；可能不穷尽。'};
}
const jobs=inventory.map(j=>{
 const d=read('dom/'+j.id+'.json');
 const get=(label)=>d.meta.find(t=>t.startsWith(label+'：'))?.slice(label.length+1).trim()||null;
 const rawFile=path.join(root,'raw',j.id+'.md');const dokobot=fs.existsSync(rawFile)?fs.readFileSync(rawFile,'utf8'):null;
 const core={job_title:d.title,locations:(get('工作地点')||'').split(/[，、,]/).map(s=>s.trim()).filter(Boolean),recruitment_project:get('项目'),job_direction:get('职位方向'),job_subdirection:get('子方向'),responsibilities:d.responsibilities.trim(),qualifications:d.qualifications.trim()};
 if(d.url!==j.url||d.title!==j.title||!core.locations.length||core.qualifications.length<6||core.responsibilities.length<6)throw Error('Invalid '+j.id);
 const hash=crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex');
 return {company_id:'xiaohongshu',company_name:'小红书',source_job_id:j.id,dedupe_key:'job.xiaohongshu.com:'+j.id,...core,recruitment_type:'校招',cohort_year:2027,department:null,team:null,...derived(core.qualifications),graduation_date_start:null,graduation_date_end:null,salary:null,published_at:null,deadline_at:null,detail_url:j.url,application_url:j.url,application_url_kind:'详情页含投递按钮；未触发投递流程',source_site:'job.xiaohongshu.com',source_list_url:'https://job.xiaohongshu.com/campus/position',first_seen_at:j.first_seen_at,last_verified_at:d.verified_at,status:'在招',status_evidence:'本次采集在官网列表中出现，详情页职责与任职资格成功读取',content_hash:hash,content_hash_algorithm:'sha256',content_hash_fields:Object.keys(core),extraction_version:'xiaohongshu-campus-dom-v1.0.0',raw_text:d.raw_text,raw_dokobot_text:dokobot,collection_method:'浏览器逐页列举 + dokobot local详情读取 + DOM分栏核验',field_notes:'部门、团队、薪资、发布日期、截止日期、精确毕业时间窗口未结构化确认，保留null；不代表官网全站未披露。first_seen_at是此次首次采集时间，不是职位发布时间。'};
});
jobs.forEach(j=>{
 const d=read('dom/'+j.source_job_id+'.json');
 j.jd=cleanJD(d);
 Object.assign(j,cleanRequirements(d.qualifications,j.source_job_id));
 delete j.responsibilities;delete j.qualifications;
 j.content_hash_fields=j.content_hash_fields.filter(k=>!['responsibilities','qualifications'].includes(k)).concat(['jd','education_requirement','major_requirement']);
 j.content_hash=crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(j.content_hash_fields.map(k=>[k,j[k]])))).digest('hex');
 j.extraction_version='xiaohongshu-campus-dom-v2.0.0';
});
const countBy=values=>Object.fromEntries([...values.reduce((m,x)=>m.set(x,(m.get(x)||0)+1),new Map())].sort((a,b)=>b[1]-a[1]));
const report={source:'https://job.xiaohongshu.com/campus/position',scope:'所给入口下2027校园招聘全部岗位；不含REDstar、Ace和其他实习入口',list_started_at:pages[0].observed_at,list_finished_at:pages.at(-1).observed_at,detail_finished_at:jobs.map(j=>j.last_verified_at).sort().at(-1),expected_count:pages.at(-1).total,collected_count:jobs.length,unique_count:new Set(jobs.map(j=>j.dedupe_key)).size,pages:pages.length,page_sizes:pages.map(p=>p.jobs.length),detail_fields_verified:jobs.length,missing_required_fields:jobs.filter(j=>!j.job_title||!j.job_direction||!j.job_subdirection||!j.recruitment_project||!j.jd||!j.locations.length).map(j=>j.source_job_id),counts_by_direction:countBy(jobs.map(j=>j.job_direction)),counts_by_city:countBy(jobs.flatMap(j=>j.locations)),city_count_note:'同一岗位多个城市分别计数，城市合计可能大于岗位总数',dokobot_files:jobs.filter(j=>j.raw_dokobot_text).length,dokobot_title_present:jobs.filter(j=>j.raw_dokobot_text?.includes(j.job_title)).length,optional_fields_policy:'缺少明确结构化证据时留null；完整原文始终保留。',timing:fs.existsSync(path.join(root,'timing.json'))?read('timing.json'):null};
if(report.expected_count!==report.collected_count||report.unique_count!==report.collected_count||report.missing_required_fields.length)throw Error('Coverage validation failed');
fs.writeFileSync(path.join(root,'jobs.json'),JSON.stringify(jobs,null,2));
fs.writeFileSync(path.join(root,'jobs.jsonl'),jobs.map(j=>JSON.stringify(j)).join('\n')+'\n');
fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify(report,null,2));
let md=`# 小红书2027校园招聘岗位全集\n\n来源：[小红书校招官网](${report.source})\n\n采集日期：2026-09-13；共 **${jobs.length} 个岗位**，已核对 ${pages.length} 页。全部岗位职责及任职资格已逐条读取核验。多城市岗位只计一条。\n\n## 岗位方向\n\n`;
for(const [k,v]of Object.entries(report.counts_by_direction))md+=`- ${k}：${v} 个\n`;
md+='\n## 数据说明\n\n本文件包含全部原始职责和任职资格（含加分项）。官网分栏文本是最终字段依据，dokobot原始读取另保存在JSON中。精确毕业时间窗口、薪资、部门、发布日期等没有明确结构化证据时留空；学历和专业已清洗，保留优先、不限等条件；未提及的字段留空。首次发现时间是此次采集时间。状态仅代表核验时可见。\n\n## 岗位索引\n\n';
for(const j of jobs)md+=`- [${j.job_title}](#job-${j.source_job_id}) · ${j.locations.join('、')} · ${j.job_direction}/${j.job_subdirection}\n`;
for(const j of jobs)md+=`\n<a id="job-${j.source_job_id}"></a>\n\n## ${j.job_title}\n\n- 岗位 ID：${j.source_job_id}\n- 工作地点：${j.locations.join('、')}\n- 招聘项目：${j.recruitment_project}\n- 方向：${j.job_direction} / ${j.job_subdirection}\n- 状态：${j.status}\n- [官网详情与投递入口](${j.detail_url})\n- 最近核验：${j.last_verified_at}\n\n学历要求：${j.education_requirement??"未注明"}\n\n专业要求：${j.major_requirement??"未注明"}\n\n### 岗位 JD\n\n${j.jd}\n`;
fs.writeFileSync(path.join(root,'小红书校招岗位全集.md'),md);
fs.writeFileSync(path.join(root,'README.md'),`# 小红书校招采集交付\n\n- jobs.json：完整结构化数组，包括原文、来源、字段提取说明和哈希。\n- jobs.jsonl：每行一条岗位，适合导入。\n- 小红书校招岗位全集.md：可读全文和索引。\n- validation.json：149条覆盖核验、分类统计和详情读取计时。\n- inventory.json / list-pages.json：逐页列表证据。\n- raw/：dokobot本地模式读取的原始文本，可能含占位符或乱序，最终字段以dom/为准。\n- dom/：每条岗位详情的页面分栏原文，包含核验时间。\n\n范围：${report.scope}。\n\n字段规则：null表示未结构化确认；skills是资格原文中的显式关键词，不穷尽、不表示均为硬性要求。学历和专业为简洁规范值；jd为合并后的完整岗位描述（去除行首序号），不再拆成职责和资格字段；毕业要求保留原句。部门/团队不从岗位名猜测。application_url复用详情页，不表示独立表单地址。首次发现不等于发布。content_hash只对content_hash_fields列出的稳定内容字段计算，不包含采集时间。\n`);
console.log(JSON.stringify({...report,timing:report.timing?{elapsed_seconds:report.timing.elapsed_seconds}:null},null,2));
