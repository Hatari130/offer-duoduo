const {chromium}=require('C:/Users/Administrator.DESKTOP-1OBI06T/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');const path=require('node:path');const root=__dirname;
const save=(n,v)=>fs.writeFileSync(path.join(root,n),JSON.stringify(v,null,2));
(async()=>{const start=Date.now();const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const isList=r=>r.url().endsWith('/api/official/job/getJobList')&&r.request().method()==='POST';
const first=page.waitForResponse(isList);await page.goto('https://zhaopin.meituan.com/web/campus',{waitUntil:'domcontentloaded',timeout:45000});let response=await first;const pages=[];
for(let p=1;p<=100;p++){
 const json=await response.json();if(json.status!==1||json.data.page.pageNo!==p)throw Error('Invalid page '+p);const data={...json.data,collected_at:new Date().toISOString()};pages.push(data);save('raw-pages.json',pages);console.log('PAGE',p,'/',data.page.totalPage,'JOBS',data.list.length);
 if(p>=data.page.totalPage)break;
 const next=page.waitForResponse(isList);await page.locator('.mtd-pagination-next').click();response=await next;
}
const unique=[...new Map(pages.flatMap(x=>x.list).map(j=>[j.jobUnionId,j])).values()];save('raw-jobs.json',unique);save('collection.json',{started_at:new Date(start).toISOString(),finished_at:new Date().toISOString(),seconds:(Date.now()-start)/1000,pages:pages.length,expected:pages.at(-1).page.totalCount,unique:unique.length});
// Open an actual job card to discover the canonical detail URL and rendered field structure.
await page.getByText(pages.at(-1).list[0].name,{exact:true}).click();await page.waitForTimeout(1200);save('detail-sample.json',{url:page.url(),text:await page.locator('body').innerText()});console.log('DETAIL',page.url());await browser.close();if(unique.length!==pages.at(-1).page.totalCount)process.exitCode=2;
})().catch(e=>{console.error(e);process.exit(1)});
