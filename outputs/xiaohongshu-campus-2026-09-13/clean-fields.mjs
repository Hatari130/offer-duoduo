export function cleanRequirements(q,id){
 let education=null;
 if(/本科(?:学历)?及以上|本科及以上学历|本硕博/.test(q))education='本科及以上';
 else if(/研究生及以上/.test(q))education='研究生及以上';
 else if(/硕士及以上/.test(q))education='硕士及以上';
 else if(/博士/.test(q))education='博士';
 if(education&&/本科及以上(?:学历)?在读/.test(q))education+='（在读）';
 const clauses=q.split(/[，,；;。\n]/).map(x=>x.replace(/^\s*(?:\d{1,2}[、.．)）]|[-•])\s*/,'').trim());
 const parts=[];
 for(let clause of clauses){
  if(!/(专业|相关.*背景)/.test(clause))continue;
  clause=clause.replace(/^主修于/,'');
  const m=clause.match(/^(.+?)(?:等相关专业|或相关专业|相关专业|等专业|专业|等相关教育背景|等相关背景|等相关交叉学科背景|或相关交叉学科背景|等相关背景)(?:方向)?(优先)?/);
  if(!m||!/(计算机|软件|通信|网络|机电|数学|统计|人工智能|数据|电子|设计|交互|媒体|图形|信息|物理|自动|工程|学|摄影|影像|插画|金融|经济|商科|声学)/.test(m[1]))continue;
  if(/具备|扎实|熟练|基础知识|认知|不限|背景如何|来自什么/.test(m[1]))continue;
  let names=m[1].replace(/或|和|\//g,'、');
  parts.push(names+'等相关专业'+(m[2]?'（优先）':''));
 }
 let major=[...new Set(parts)].join('；')||null;
 if(/专业不限|不限专业|专业、学校均不设限|无论你的专业背景如何/.test(q))major='不限'+(major?'；'+major:'');
 const overrides={
  '21999':'不限；计算机、人工智能、数据科学、人机交互、法学、社会学、传播学等相关背景加分',
  '21001':'计算机、人工智能、电子信息、自动化、软件、数学等相关专业',
  '22033':'计算机、软件、通信、机电等专业；网络工程优先',
  '22219':'计算机、信息安全、人工智能、软件工程等相关专业；其他专业具备相关实践能力也可',
  '22038':'计算机、信息安全、人工智能、软件工程等相关专业；其他专业具备相关实践能力也可',
  '22150':'计算机科学、统计学、数学等相关专业优先；文理兼修优先（文学、社会学、哲学、心理学等）',
  '22179':'交互设计、体验设计等设计类专业',
  '22001':'计算机、人工智能、数据科学、统计学、信息管理、管理科学、社会科学、心理学、设计、人机交互等相关背景优先',
  '22157':'艺术设计、平面设计、数字媒体等相关专业（优先）',
  '22024':'计算机相关专业；其他专业具备计算机基础与工程实践能力也可',
  '22023':'计算机相关专业；其他专业具备计算机基础与项目实践能力也可',
  '22198':'计算机、人工智能、电子工程等理工科，或金融、经济、商科等相关专业（优先）',
  '22197':'心理学、社会学、统计学、人因工程、人机交互、数据科学等相关专业（优先）',
  '22191':'艺术设计、平面设计等相关专业（优先）',
  '22067':'计算机、人工智能、软件工程或相关交叉学科（优先）',
  '22152':'摄影、影像类相关专业（优先）',
  '22145':'不限',
  '21318':'不限',
 };
 return {education_requirement:education,major_requirement:overrides[id]??major};
}
export function cleanJD(d){
 const clean=t=>t.split('\n').map(l=>l.replace(/^\s*(?:\d{1,2}[、.．)）]\s*|[-•]\s+)/,'')).join('\n').replace(/\n{3,}/g,'\n\n').trim();
 return '工作职责\n'+clean(d.responsibilities)+'\n\n任职资格\n'+clean(d.qualifications);
}
