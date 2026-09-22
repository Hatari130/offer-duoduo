import json,re,pathlib,datetime,collections,hashlib
root=pathlib.Path(__file__).parent
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
raw=load(root/'raw-jobs.json');pages=load(root/'raw-pages.json')
clean=lambda s:'\n'.join(re.sub(r'^\s*(?:\d{1,2}[、.．)）]\s*|[-•]\s+)','',l) for l in (s or '').splitlines()).strip()
def fields(q):
 ed=[];ma=[]
 for line in clean(q).splitlines():
  for c in re.split('[，,；;。]',line):
   c=c.strip()
   e=re.search(r'(本科|硕士研究生|硕士|博士|研究生|大专)(?:及以上|或以上|以上)?(?:学历)?',c)
   if e and not re.search('论文|发表|团队|导师',c):
    val=e[0].replace('学历','').replace('或以上','及以上')
    if '在读' in c:val+='（在读）'
    if re.search(r'(本科|硕士|博士)(?:及以上)?(?:学历)?优先',c):val+='（优先）'
    ed.append(val)
   m=re.match(r'^(.{2,130}?)(等泛理工科相关专业|等相关专业|相关专业|等专业|专业)(.*)',c)
   if m:
    n=m[1]
    if re.search('熟悉|具备|扎实|基础|知识|能力|英文|阅读|学历|不限|经验|证书|相关的|强烈',n):continue
    ma.append(n+m[2]+('（优先）' if '优先' in m[3] else ''))
 e='；'.join(dict.fromkeys(ed)) or None;m='；'.join(dict.fromkeys(ma)) or None
 if re.search('专业不限|不限专业',q):m='不限'+('；'+m if m else '')
 return e,m
jobs=[];variants_total=0
skills=['C++','Python','Java','JavaScript','TypeScript','SQL','Linux','PyTorch','TensorFlow','CUDA','TensorRT','vLLM','Excel','PowerPoint','FPGA','ARM','DSP','MATLAB','Simulink','ROS','OpenCV','C#','Go']
for r in raw:
 d=load(root/'details'/(r['id']+'.json'));v=d['variants'];variants_total+=len(v)
 parts=[];eds=[];majors=[];req=[];deps=[]
 for vi,item in enumerate(v):
  x=item['data'];e,m=fields(x['postRequire']);eds.append(e);majors.append(m);req.append(x['postRequire']);deps.extend(t['name'] for t in item['departments'])
  if len(v)>1:parts.append('岗位方向：'+(x['techDire'] or '官网未注明'))
  parts.extend(['工作地点：'+(x['workPlace'] or '官网未注明'),'招聘部门：'+'、'.join(t['name'] for t in item['departments']),'工作职责\n'+clean(x['postContent']),'任职资格\n'+clean(x['postRequire'])])
  for key in ['remark','specialNotes']:
   if x.get(key):parts.append('岗位说明\n'+clean(x[key]))
 # Keep matching department descriptions once after all variants.
 seen=set()
 for item in v:
  for dep in item['departments']:
   if dep['description'] and dep['id'] not in seen:parts.append('部门介绍：'+dep['name']+'\n'+clean(dep['description']));seen.add(dep['id'])
 def merged(values):
  vals=list(dict.fromkeys(x for x in values if x))
  return '；'.join(vals)+('（不同方向要求详见 JD）' if len(vals)>1 else '') if vals else None
 q='\n'.join(req);jd='\n\n'.join(parts)
 jobs.append(dict(source_job_id=r['id'],company_name='海康威视',job_title=r['batchPositionName'],locations=r['workPlaceList'],job_direction=r['postAdSn'],job_subdirection=r['techDire'] or None,recruitment_category='校招',recruitment_type='校招',recruitment_project=r['batchName'],education_requirement=merged(eds),major_requirement=merged(majors),skills=[s for s in skills if re.search(r'(?<![A-Za-z])'+re.escape(s)+r'(?![A-Za-z])',q,re.I)],jd=jd,salary=None,department='、'.join(dict.fromkeys(deps)) or None,published_at=None,published_at_source='官网详情及列表未披露发布时间；createTime/updateTime 未作为发布日期',last_verified_at=d['verified_at'],verified_date=d['verified_at'][:10],detail_url=d['detail_url'],application_url=d['detail_url'],source_list_url='https://campushr.hikvision.com/school?schoolType=nozxf&activeTab=0',collection_method='官网公开接口分页及全部方向详情采集',raw_record_ref='details/'+r['id']+'.json',content_hash=hashlib.sha256(jd.encode()).hexdigest()))
assert len(jobs)==168 and len({j['source_job_id'] for j in jobs})==168
(root/'jobs.json').write_text(json.dumps(jobs,ensure_ascii=False,indent=2),encoding='utf-8');(root/'jobs.jsonl').write_text('\n'.join(json.dumps(j,ensure_ascii=False) for j in jobs)+'\n',encoding='utf-8')
report=dict(source=jobs[0]['source_list_url'],scope='用户链接 activeTab=0 应届生入口，2027校园招聘；不含实习生标签',started_at=pages[0]['observed_at'],finished_at=max(j['last_verified_at'] for j in jobs),method='程序化官方接口',expected=pages[-1]['total'],pages=len(pages),list_count=sum(len(p['list']) for p in pages),unique=len(jobs),detail_verified=len(jobs),variant_count=variants_total,failures=[],published_known=0,published_unknown=len(jobs),counts_by_type={'校招':len(jobs)},raw_evidence=['raw-pages.json','raw-jobs.json','details/'])
(root/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
md='# 海康威视2027校园招聘岗位全集\n\n168 个官网职位，合并职位的各方向保留在同一条 JD 中。范围为用户链接的应届生标签。官网未披露发布时间，均保留为空。\n'
for j in jobs:md+='\n## '+j['job_title']+'\n\n- ID：'+j['source_job_id']+'\n- 招聘类型：校招\n- 发布时间：未公布\n- [官网详情]('+j['detail_url']+')\n\n'+j['jd']+'\n'
(root/'海康威视校招岗位全集.md').write_text(md,encoding='utf-8')
print(json.dumps(report,ensure_ascii=True))
