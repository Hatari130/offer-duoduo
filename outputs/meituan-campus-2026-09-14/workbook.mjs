import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const jobs=JSON.parse(await fs.readFile(path.join(root,'jobs.json'),'utf8'));
const wb=Workbook.create(),s=wb.worksheets.add('岗位列表');
const headers=['岗位ID','岗位名称','工作地点','方向','子方向','招聘项目','状态','学历要求','专业要求','技能关键词（非穷尽）','毕业要求（原句）','官网详情与投递入口','最近核验（北京时间）','首次采集（北京时间）','公司','招聘类型','部门','团队','薪资','官网发布时间','截止时间','岗位 JD'];
const date=v=>(Date.parse(v)+8*3600000)/86400000+25569;
const rows=jobs.map(j=>[j.source_job_id,j.job_title,j.locations.join('、'),j.job_direction,j.job_subdirection,j.recruitment_project,j.status,j.education_requirement,j.major_requirement,j.skills.join('、'),j.graduation_requirement,j.detail_url,date(j.last_verified_at),date(j.first_seen_at),j.company_name,j.recruitment_type,j.department,j.team,j.salary,j.published_at?date(j.published_at):null,j.deadline_at?date(j.deadline_at):null,j.jd.replace(/\n+/g,' ')]);
const widths=[12,62,24,12,24,24,10,22,65,48,65,75,27,27,14,14,20,20,20,22,22,240];
const end=rows.length+6;
s.getRange(`A1:V${end}`).format.font={name:'Arial',size:10,color:'#222222'};
s.getRange('B2').values=[['美团校园招聘']];s.getRange('B2').format.font={size:16,bold:true};
s.getRange('B3').values=[[`2026-09-14 采集，共 ${jobs.length} 个岗位。每个岗位一行，完整岗位 JD 在最后一列。`]];
s.getRange('B4').values=[['空白表示未结构化确认。技能仅为资格原文中的关键词，不表示均为必需项。']];
s.getRange('B5').values=[['来源：https://zhaopin.meituan.com/web/campus']];
s.getRange(`A6:V${end}`).values=[headers,...rows];
const t=s.tables.add(`A6:V${end}`,true,'CampusJobs');t.showFilterButton=true;
s.getRange(`A7:V${end}`).format.wrapText=true;s.getRange(`A7:V${end}`).format.verticalAlignment='top';
s.getRange('A6:V6').format={fill:'#765900',font:{color:'#FFFFFF',bold:true,size:10},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:32};
widths.forEach((w,i)=>s.getRangeByIndexes(0,i,end,1).format.columnWidth=w);
s.getRange(`M7:N${end}`).setNumberFormat('yyyy-mm-dd hh:mm:ss');
s.getRange(`A7:A${end}`).setNumberFormat('@');
s.getRange('T7:U599').setNumberFormat('yyyy-mm-dd hh:mm:ss');
const weighted=t=>Array.from(String(t??'')).reduce((n,c)=>n+(/[^\x00-\xff]/.test(c)?2:1),0);
rows.forEach((row,i)=>{const lines=Math.max(...row.map((v,k)=>String(v??'').split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(weighted(l)/(widths[k]-3))),0)));s.getRangeByIndexes(i+6,0,1,22).format.rowHeight=Math.max(42,lines*15+12);});
s.freezePanes.freezeRows(6);s.freezePanes.freezeColumns(2);s.showGridLines=false;s.tabColor='#765900';
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'岗位列表!A6:G10',include:'values',tableMaxRows:5,tableMaxCols:7,maxChars:1800})).ndjson);
for(const [sheetName,range,name]of [['岗位列表','A1:G10','preview-list.png'],['岗位列表','H6:J9','preview-clean-fields.png'],['岗位列表','U6:V7','preview-jd.png']]){
 const image=await wb.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(path.join(root,name),new Uint8Array(await image.arrayBuffer()));
}
const out=await SpreadsheetFile.exportXlsx(wb);await out.save(path.join(root,'美团校招岗位.xlsx'));
console.log(JSON.stringify({jobs:jobs.length,jd_fields:jobs.length,output:'美团校招岗位.xlsx'}));



