import json,pathlib
p=pathlib.Path('apps/web/src/previews/job-discovery');out=pathlib.Path('outputs/hikvision-2026-09-15')
old=json.loads((p/'jobs.json').read_text(encoding='utf-8-sig'));new=json.loads((out/'jobs.json').read_text(encoding='utf-8-sig'))
backup=out/'page-data-before.json'
if not backup.exists():backup.write_text(json.dumps(old,ensure_ascii=False,indent=2),encoding='utf-8')
m={(j['company_name'],j['source_job_id']):j for j in old}
for j in new:m[(j['company_name'],j['source_job_id'])]=j
rows=list(m.values());assert len(rows)==1011 and len({j['source_job_id'] for j in rows})==1011
stage=p/'jobs.pending.json';stage.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8');json.loads(stage.read_text(encoding='utf-8'));stage.replace(p/'jobs.json')
s=(p/'main.tsx').read_text(encoding='utf-8-sig')
s=s.replace("j.company_name==='汽车之家'?'autohome-logo':''", "j.company_name==='汽车之家'?'autohome-logo':j.company_name==='海康威视'?'hikvision-logo':''")
s=s.replace("job.company_name==='小红书'?'2027 校园招聘':job.company_name==='美团'?'校园招聘与实习':'校招、实习与全职招聘'", "[...new Set(source.filter(j=>j.company_name===job.company_name).map(j=>j.recruitment_type))].join('、')+'招聘'")
(p/'main.tsx').write_text(s,encoding='utf-8')
with (p/'style.css').open('a',encoding='utf-8') as f:f.write('\n.xhs-logo.hikvision-logo{background:#cf2339;color:#fff;font-size:9px;letter-spacing:-.5px}.xhs-logo.hikvision-logo.large{font-size:11px}\n')
print('Integrated',len(new),'total',len(rows))
