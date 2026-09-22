import fs from 'node:fs';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const file=path.join(root,'build.mjs');let s=fs.readFileSync(file,'utf8');
const marker='const countBy=values=>';
if(!s.includes('jobs.forEach(j=>{'))s=s.replace(marker,`jobs.forEach(j=>{
 const d=read('dom/'+j.source_job_id+'.json');
 j.jd=cleanJD(d);
 Object.assign(j,cleanRequirements(d.qualifications,j.source_job_id));
 delete j.responsibilities;delete j.qualifications;
 j.content_hash_fields=j.content_hash_fields.filter(k=>!['responsibilities','qualifications'].includes(k)).concat(['jd','education_requirement','major_requirement']);
 j.content_hash=crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(j.content_hash_fields.map(k=>[k,j[k]])))).digest('hex');
 j.extraction_version='xiaohongshu-campus-dom-v2.0.0';
});
`+marker);
s=s.replace('!j.responsibilities||!j.qualifications','!j.jd');
s=s.replace('学历和专业摘录不作额外推断','学历和专业已清洗，保留优先、不限等条件；未提及的字段留空');
s=s.replace('学历、专业与毕业要求以完整原句保留','学历和专业为简洁规范值；jd为合并后的完整岗位描述（去除行首序号），不再拆成职责和资格字段；毕业要求保留原句');
s=s.replace('### 工作职责\\n\\n${j.responsibilities}\\n\\n### 任职资格\\n\\n${j.qualifications}', '学历要求：${j.education_requirement??"未注明"}\\n\\n专业要求：${j.major_requirement??"未注明"}\\n\\n### 岗位 JD\\n\\n${j.jd}');
fs.writeFileSync(file,s);
const wfile=path.join(root,'workbook.mjs');let w=fs.readFileSync(wfile,'utf8');
if(w.includes("d=wb.worksheets.add('职责与资格全文')")){
 w=w.replace(",d=wb.worksheets.add('职责与资格全文')",'');
 w=w.replace('学历要求（原句）','学历要求').replace('专业要求（原句）','专业要求');
 w=w.replace("'截止时间'];","'截止时间','岗位 JD'];");
 w=w.replace('j.published_at,j.deadline_at]);',"j.published_at,j.deadline_at,j.jd.replace(/\\n+/g,' ')]);");
 w=w.replace('const widths=[12,62,24,12,24,24,10,65,65,48,65,75,27,27,14,14,20,20,20,22,22];','const widths=[12,62,24,12,24,24,10,22,65,48,65,75,27,27,14,14,20,20,20,22,22,220];');
 w=w.replaceAll(':U${end}',':V${end}').replaceAll('A6:U6','A6:V6').replace('i+6,0,1,21','i+6,0,1,22');
 w=w.replace('职责与任职资格全文在第二张表，按岗位ID筛选。','每个岗位一行，完整岗位 JD 在最后一列。');
 const a=w.indexOf('const fragments=[];'),b=w.indexOf('wb.recalculate();',a);w=w.slice(0,a)+w.slice(b);
 w=w.replace("['职责与资格全文','A1:E10','preview-detail.png']","['岗位列表','H6:J9','preview-clean-fields.png'],['岗位列表','U6:V7','preview-jd.png']");
 w=w.replace('fulltext_rows:fragments.length,',"jd_fields:jobs.length,");
 fs.writeFileSync(wfile,w);
}
