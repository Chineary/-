import {readFile,writeFile,appendFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {stringify} from 'csv-stringify/sync';
import {parse} from 'csv-parse/sync';
import {load} from 'cheerio';
import {root,sourceDir,date} from './fetch-source.mjs';
import {headers} from './schema.mjs';
import {notes} from './research-notes.mjs';
import {affiliations,corresponding,cofirst,coauthorAffiliations} from './affiliation-notes.mjs';
import {overrides,rawAbstracts,firstAuthors} from './reviewed-overrides.mjs';
import {profiles,profileEvidence,hkuLeiIds,facultyNames} from './collaborator-notes.mjs';
import {visiblePublications,titleKey} from './visible-publications.mjs';

const advisor='Kong, Lingpeng',base=resolve(root,'港大',advisor);
const json=async f=>JSON.parse(await readFile(resolve(sourceDir,f),'utf8'));
const csv=async(file,key,rows)=>writeFile(resolve(base,file),'\ufeff'+stringify(rows,{header:true,columns:headers[key]}));
const unique=xs=>[...new Set(xs)];
const group=(rows,key)=>{const m=new Map();for(const r of rows){const k=key(r);m.set(k,[...(m.get(k)||[]),r]);}return [...m];};
const catalog=await json('catalog.json'),downloads=await json('downloads.json');
const analysis=new Map(notes.map(([id,theme,question,method,contribution,keywords])=>[id,{theme,question,method,contribution,keywords}]));
const issues=[],records=[],summaries=[],timeline=[],files={},translation={};
const byId=new Map(),downloadMap=new Map(downloads.map(d=>[d.id,d]));
const issue=(id,p,reason,next,urls=p?.links||[])=>{if(!issues.some(x=>x['序号']===id))issues.push({'序号':id,'导师姓名':advisor,'论文标题':p?.title||'非论文资料','年份':p?.year||'未公开','尝试过的链接':urls.join('\n'),'失败原因':`${reason}；核验日期${date}`,'下一步建议':next});return id;};
const ref=p=>`[论文 #${p.id}：${p.title}（${p.year}）](#paper-${p.id})`;
const status=p=>p.publication;
const evidence=p=>p.evidence;
const authorUnit=(id,name)=>coauthorAffiliations[id]?.[name]||coauthorAffiliations[id]?.['*']||'待核验';

await mkdir(resolve(base,'论文'),{recursive:true});
for(const original of catalog){
  const o=overrides[original.id]||{},p={...original,...o,notes:[...(original.notes||[]),...(o.note?[o.note]:[])]};
  p.authors=p.authors.map(name=>name.replace(/\*/g,'').replace(/\s+/g,' ').trim());
  p.abstract=rawAbstracts[p.id]||p.abstract;
  if(p.id===128){records.push({'序':p.id,'论文标题':p.title,'年份':p.year,'作者':p.authors.join('；'),'发表载体':'卡内基梅隆大学博士学位论文','条目类型':'学位论文','论文链接':p.links.join('\n'),'被引次数':'未获取','引用统计日期':'未获取','引用来源网址':'未获取','抓取日期':date,'下载状态':'不适用','备注':'学位论文不计入175篇论文；仅作博士阶段补查证据。来源CV第12页。'});continue;}
  const d=downloadMap.get(p.id),n=analysis.get(p.id);
  if(!n)throw new Error(`缺少论文${p.id}中文分析`);
  if(o.promote){const filename=`${p.year}_${p.title.replace(/[\/:*?"<>|]/g,'_')}.pdf`;await copyFile(resolve(sourceDir,`论文摘录/${p.id}-待核验.pdf`),resolve(base,'论文',filename));d.file=`港大/${advisor}/论文/${filename}`;d.status='已下载';d.reason=o.note;}
  const pdfText=d?.textFile?await readFile(resolve(root,d.textFile),'utf8'):'';
  const publisherHeader=pdfText.split('\f')[0].match(/Published as a conference paper at ICLR \d{4}|Published in Transactions on Machine Learning Research[^\n]*|Proceedings of[^\n]*|2011 International Conference on Asian Language Processing|Workshop track - ICLR 2016/);
  p.publication=p.acl||publisherHeader?'发表':p.type==='预印本'?'预印本':'发表（待核验）';
  if(p.id===177)p.publication='发表';
  if(p.publication==='发表'&&p.type==='预印本')p.type=p.id===177?'期刊':'会议';
  if(p.acl?.venue)p.venue=p.acl.venue;
  const affiliation=affiliations[p.id]||{institution:'待核验',stage:'阶段待核验'};
  p.analysis=n;p.affiliation=affiliation;
  p.evidence=[`论文信息汇总.csv 序${p.id}：摘要、研究内容、创新点；内容仅据摘要/Introduction归纳。`,d?.file?`PDF：${d.file}；第1页标题、作者单位与摘要；Introduction在已保存前3页内。`:'仅取得可靠元数据或摘要；未取得可读全文。',p.acl?`${p.acl.url}；访问${date}；ACL作者顺序、发表信息与摘要。`:p.arxiv?`https://arxiv.org/abs/${p.arxiv.arxivId}；访问${date}；arXiv作者顺序和摘要。`:`${p.links[0]}；访问${date}。`,p.cvPage?`CV：https://ikekonglp.github.io/lingpenk_cv.pdf；第${p.cvPage}页；版本2026-01-27。`:'',publisherHeader?`PDF发表标记：“${publisherHeader[0]}”。`:'',`原文摘要依据：“${p.abstract.slice(0,200)}”。`].filter(Boolean).join('\n');
  const pIssues=[];
  pIssues.push(issue(`P${p.id}-C`,p,'Scholar个人主页未确认，条目引用量及引用日期未获取','确认Scholar个人用户ID后逐条读取，不以空白或超时代替0'));
  if(d?.status!=='已下载')pIssues.push(issue(`P${p.id}-D`,p,`全文${d?.status||'未下载'}：${d?.reason||'未取得合法开放PDF'}`,'重试已记录的合法开放链接；核对标题及作者后更新下载状态',d?.attempts?.map(a=>a.url)||p.links));
  if(/待核验/.test(affiliation.stage)||p.authors.some(a=>a!=='Lingpeng Kong'&&/待核验/.test(authorUnit(p.id,a))))pIssues.push(issue(`P${p.id}-A`,p,'导师阶段或部分作者单位映射未确认；见时间线与汇总表的具体待核验字段','按已记录PDF首页和CV时间线补齐单位标记；不以年份或当前单位倒推'));
  if(!corresponding[p.id])pIssues.push(issue(`P${p.id}-R`,p,'通讯作者名单未找到明确标记；作者顺序不能代替通讯身份','核对正式版首页或出版方通讯标记；仍无标记保留待核验'));
  if(p.publication.includes('待核验'))pIssues.push(issue(`P${p.id}-F`,p,'CV列出会议/期刊，但独立出版记录未核实；保留发表载体并标发表待核验','打开已有正式记录链接核对发表状态'));
  if(o.note)pIssues.push(issue(`P${p.id}-V`,p,o.note,'保留原始版本和本次核对记录；需要精确复现时使用同一正式版本'));
  p.issueIds=pIssues;p.download=d;
  const authorFirst=cofirst.has(p.id)?'共同一作':p.authors[0]==='Lingpeng Kong'?'是（按作者顺序）':'否（按作者顺序）';
  const record={'序':p.id,'论文标题':p.title,'年份':p.year,'作者':p.authors.join('；'),'发表载体':p.venue||'未公开','条目类型':p.type,'论文链接':p.links.join('\n'),'被引次数':'未获取','引用统计日期':'未获取','引用来源网址':'未获取','抓取日期':date,'下载状态':d?.status||'未下载','备注':[`来源：${p.sources.join('；')}；访问${date}；非Scholar全量成果。`,...p.notes,`Scholar访问失败，引用未获取（${date}）。`,p.evidence].join('\n')};
  records.push(record);
  const keywords=p.id===126?'原文关键词：Irony；Satire；Formalization':p.id===127?'原文关键词：Dependency parsing；self-disambiguating pattern；raw corpus':`分析提取：${n.keywords}`;
  summaries.push({'序':p.id,'年份':p.year,'文章阶段（发表/预印本）':p.publication,'是否为一作/通讯':`一作 = ${authorFirst}；通讯 = ${corresponding[p.id]||'待核验'}`,'文章标题':p.title,'被引次数':'未获取','引用统计日期':'未获取','引用来源网址':'未获取','摘要':p.abstract||'未公开','关键词':keywords,'研究方向':n.theme,'研究内容':`研究问题：${n.question}\n采用方法：${n.method}`,'创新点':n.contribution,'合作者姓名及其工作单位':p.authors.filter(a=>a!=='Lingpeng Kong').map(a=>`${a}：${authorUnit(p.id,a)}`).join('\n')});
  timeline.push({'序':p.id,'年份':p.year,'文章标题':p.title,'导师论文署名单位':affiliation.institution,'论文对应经历阶段':affiliation.stage,'统一研究主题':n.theme,'研究问题':n.question,'采用方法':n.method,'应用领域':n.theme,'证据位置':p.evidence,'未完成事项序号':pIssues.join(';')||'无'});
  translation[p.id]={'摘要':`${n.question} ${n.method} ${n.contribution}`,...(p.id===126?{'关键词':'原文关键词（中译）：反语；讽刺；形式化'}:p.id===127?{'关键词':'原文关键词（中译）：依存分析；自消歧模式；原始语料'}:{})};
  if(d?.file)files[p.id]=`/materials/${encodeURIComponent(advisor)}/论文/${encodeURIComponent(basename(d.file))}`;
  byId.set(p.id,p);
}
const papers=[...byId.values()];
timeline.sort((a,b)=>Number(a['年份'])-Number(b['年份'])||a['序']-b['序']);
await csv('论文/论文记录.csv','papers',records);
await csv('论文/论文信息汇总.csv','summaries',summaries);
await csv('论文研究时间线.csv','timeline',timeline);

// Collaborator publications are parsed from saved source HTML. Raw candidates remain auditable.
const sourceIndex=await json('collaborator-source-index.json');
sourceIndex.push({name:'Lei Li（香港大学）',url:'https://lilei-nlp.github.io/',file:'合作者/Lei_Li_HKU.html'});
sourceIndex.push({name:'Dani Yogatama',url:'https://dyogatama.github.io/publications.html',file:'合作者/Dani_Yogatama-publications.html'},{name:'Chuan Wu',url:'https://i.cs.hku.hk/~cwu/publications.html',file:'合作者/Chuan_Wu-publications.html'});
const visible=new Map(),audit=[];
for(const s of sourceIndex){
  try{const html=await readFile(resolve(sourceDir,s.file),'utf8'),$=load(html);const parsed=visiblePublications(html,s.url);visible.set(s.name,[...(visible.get(s.name)||[]),...parsed]);audit.push({...s,visible:parsed.length,status:parsed.length?'已解析可见论文':'未提取到论文；身份/页面内容需核验'});if(profiles[s.name]&&!s.url.includes('aclanthology')&&!s.url.includes('publications.html')&&!/404|Access Denied/.test($('title').text()))profiles[s.name].home=s.url;}catch(e){audit.push({...s,visible:0,status:`未获取：${e.code||e.message}`});}
}
const identities=new Map(),rawGroups=group(papers.flatMap(p=>p.authors.filter(a=>a!=='Lingpeng Kong').map(name=>({name,p}))),r=>r.name);
const candidates=new Map(rawGroups.map(([name,rows])=>[name,{ids:rows.map(r=>r.p.id),focus:rows.length>=3||rows.filter(r=>Number(r.p.year)>=2022).length>=2||Boolean(profiles[name])}]));
for(const [rawName,rows]of rawGroups){
  for(const {p}of rows){
    const matched=rawName==='Lei Li'?(hkuLeiIds.has(p.id)?'Lei Li（香港大学）':null):profiles[rawName]?rawName:null;
    const key=matched||`${rawName}（论文 #${p.id}，身份待核验）`;
    const person=identities.get(key)||{name:key,rawName,profile:matched?profiles[matched]:null,papers:[],focus:candidates.get(rawName).focus};person.papers.push(p);identities.set(key,person);
  }
}
const collaborators=[],signatures=[],shortPapers=[],shortRaw=[],shortKeys=new Set();
const keywordTerms=[[/diffusion/i,'扩散模型'],[/language model/i,'语言模型'],[/reasoning/i,'推理'],[/representation/i,'表示学习'],[/attention/i,'注意力'],[/multi.?modal/i,'多模态'],[/multilingual/i,'多语言'],[/machine translation/i,'机器翻译'],[/summari[sz]/i,'摘要生成'],[/sentiment/i,'情感分析'],[/classif/i,'分类'],[/dialogue|conversation/i,'对话系统'],[/generation/i,'文本生成'],[/reinforcement/i,'强化学习'],[/contrastive/i,'对比学习'],[/learn/i,'机器学习'],[/document/i,'文档处理'],[/inference/i,'推断'],[/optimization/i,'优化'],[/embedding/i,'嵌入表示'],[/retriev/i,'检索'],[/data augmentation/i,'数据增强'],[/pre.?train/i,'预训练'],[/graph/i,'图模型'],[/agent/i,'智能体'],[/question answering/i,'问答'],[/evaluation|benchmark/i,'模型评价'],[/neural/i,'神经网络'],[/data/i,'数据'],[/supervis/i,'监督学习']];
const abstractKeywords=s=>{const k=keywordTerms.filter(([re])=>re.test(s)).map(([,zh])=>zh).slice(0,5);return k.length>=3?`分析提取：${k.join('；')}`:'未公开（摘要可支持的分析关键词不足3项）';};
const aliases=new Map([
  ['Dream 7B: Scalable Diffusion Language Models',154],['Dream-Coder 7B',155],
  ['Diffusion of Thought: Chain-of-Thought Reasoning in Diffusion Language Models',52],
  ['Self-adaptive In-context Learning',81],['A Challenging Benchmark for Low-Resource Learning',65],
  ['SunGen: Self-Guided High-Quality Data Generation in Efficient Zero-Shot Learning',91],
].map(([title,id])=>[titleKey(title),id]));
function matchPaper(row){const id=row.url.match(/(?:abs|pdf)\/(\d{4}\.\d{4,5})/)?.[1],key=titleKey(row.title.replace(/\s*\((?:ICLR|ICML|NeurIPS)\s*20\d{2}\)\s*$/i,''));return byId.get(aliases.get(key))||papers.find(p=>titleKey(p.title)===key||id&&(p.arxiv?.arxivId===id||p.links.some(l=>l.includes(id)))||p.links.some(l=>l===row.url));}
function addShort(person,row,role,co,p){
  const key=person.name+'|'+(p?`target-${p.id}`:titleKey(row.title));
  if(shortKeys.has(key)){
    const existing=shortPapers.find(r=>r['合作者姓名']===person.name&&r['论文标题']===(p?.title||row.title));
    if(existing&&role==='共同一作'&&existing['角色']!=='共同一作'){existing['角色']=role;existing['来源及核验依据']+=`\n共同一作补查：${row.source}，访问${date}，主页明确等贡献标记；原文作者：“${row.authors}”。`;}
    return;
  }
  shortKeys.add(key);
  const keywords=p?`分析提取：${p.analysis.keywords}`:row.abstract?abstractKeywords(row.abstract):'未公开（未获得可支持关键词提取的摘要）';
  shortPapers.push({'合作者姓名':person.name,'论文标题':p?.title||row.title,'年份':p?.year||row.year,'角色':role,'关键词':keywords,'是否与目标导师合著':co,'来源及核验依据':p?`${p.evidence}\n${row.source||''}；${role}；${p.publication==='预印本'?'预印本，等级不适用':'CCF/CORE/期刊分区未核验；未取得适用目录版本'}。`:`${row.source}；论文链接${row.url}；访问${date}；可见作者原文：“${row.authors}”；${role}。年份未公开时不从arXiv编号倒推。CCF/CORE/期刊分区未核验。`});
  shortRaw.push({name:person.name,...row,role,co,targetId:p?.id||null});
}
for(const person of identities.values()){
  const pp=person.papers.sort((a,b)=>Number(a.year)-Number(b.year)),pr=person.profile;
  const rawCandidate=candidates.get(person.rawName),ss=sourceIndex.filter(s=>s.name===person.rawName||s.name===person.name);
  const issueText=pr?pr.issue:`身份待核验；按单篇保留，不跨论文合并同名者。${rawCandidate.focus?'达到重点候选筛选阈值；已查可定位来源，身份/历史履历仍未确认。':'待核验（未深查）；原姓名整体未达到重点阈值。'}`;
  collaborators.push({'姓名':person.name,'论文署名单位':pp.map(p=>`${p.year}；论文#${p.id}；${authorUnit(p.id,person.rawName)}`).join('\n'),'当前单位':pr?.current||'待核验','身份':pr?.history||'身份待核验','职称':pr?.role||'待核验','与导师的关系':pr?.relation||'论文合作者（身份待核验）','共同论文数':pr?pp.length:'待核验','首次合作年份':pr?pp[0].year:'待核验','最近合作年份':pr?pp.at(-1).year:'待核验','共同研究方向':unique(pp.map(p=>p.analysis.theme)).join('；'),'共同项目':'未公开','关系证据':pr?profileEvidence(person.name,pr):`${pp.map(evidence).join('\n')}\n仅确认论文内原姓名署名；跨论文身份未确认。${ss.map(s=>s.url).join('\n')}`,'待核验问题':`${issueText}\n具体论文问题：${unique(pp.flatMap(p=>p.issueIds)).join(';')}\n完整Scholar/DBLP论文列表及CCF/CORE目录未获取；当前公开材料可能漏项。`,'共同论文序号':pp.map(p=>p.id).join(';')});
  if(person.focus)for(const p of pp)signatures.push({'合作者姓名':person.name,'论文序号':p.id,'导师是否末位':p.authors.at(-1)==='Lingpeng Kong'?'是':'否','导师是否通讯':corresponding[p.id]||'待核验','证据位置':p.evidence});
  if(!pr)continue;
  const faculty=facultyNames.has(person.name),v=visible.get(person.name)||[];
  for(const p of pp){const equal=firstAuthors[p.id]?.includes(person.rawName);const role=equal?'共同一作':p.authors[0]===person.rawName?'一作（按作者顺序）':'其他作者（共同一作/通讯待核验）';if(!faculty||role.startsWith('一作')||equal)addShort(person,{title:p.title,authors:p.authors.join(', '),year:p.year,url:p.links[0],source:''},role,'是',p);}
  let representative=false,nonFirstChecks=0;
  for(const row of [...v].sort((a,b)=>Number(b.year||0)-Number(a.year||0))){
    if(/^Proceedings of/i.test(row.title)||/thesis|book chapter|Networking for Big Data|Smart Data:/i.test(row.context)||/EvaByte/.test(row.title)&&!matchPaper(row))continue;
    const matched=matchPaper(row),first=row.authors.startsWith(person.rawName),star=row.authors.includes(person.rawName+'*')||row.authors.includes(person.rawName+' *')||row.authors.includes(person.rawName+'#')||row.authors.includes(person.rawName+' #');
    const declared=ss.some(s=>s.url===row.source&&!s.url.includes('aclanthology'))&&['Lin Zheng','Jiacheng Ye','Jiahui Gao','Shansan Gong','Tao Yu','Lei Li（香港大学）'].includes(person.name);
    const role=star&&declared?'共同一作':first?'一作（按作者顺序）':star?'共同一作标记待核验':'其他作者';
    const full=!/et al\.?|\.\.\.|…/i.test(row.authors),co=matched?'是':/Lingpeng Kong|\bL\.\s*Kong/.test(row.authors)?'是':full?'否':'待核验';
    if(first||star){addShort(person,row,role,co,matched);if(co==='否')representative=true;}
    else if(!faculty&&!representative&&nonFirstChecks<3){nonFirstChecks++;if(co==='否'){addShort(person,row,'其他作者（非合著代表）','否',matched);representative=true;}}
  }
}
await csv('合作者信息汇总.csv','collaborators',collaborators);
await csv('共同论文署名表.csv','signatures',signatures);
await csv('合作者论文简表.csv','collaboratorPapers',shortPapers);
for(const [index,row]of shortPapers.entries()){
  if(papers.some(p=>p.title===row['论文标题']))continue;
  const id=`CP${index+1}`,reasons=['CCF/CORE及期刊分区未核验'];
  if(row['角色'].includes('待核验'))reasons.push('共同一作/通讯标记需论文首页复核');
  if(row['关键词'].startsWith('未公开'))reasons.push('可靠摘要或关键词未取得');
  issue(id,{title:row['论文标题'],year:row['年份'],links:unique((row['来源及核验依据'].match(/https?:\/\/[^\s；，。]+/g)||[]))},reasons.join('；'),'按已记录论文链接核对首页、摘要和适用目录，保留缺项');
  const person=collaborators.find(p=>p['姓名']===row['合作者姓名']);if(person)person['待核验问题']+=`;${id}`;
}
await csv('合作者信息汇总.csv','collaborators',collaborators);
await csv('未完成事项.csv','issues',issues);
await writeFile(resolve(sourceDir,'目录核验说明.md'),`# 会议与期刊等级核验\n\n访问尝试日期：${date}。拟访问CCF官方目录https://www.ccf.org.cn/Academic_Evaluation/AI/ 。工具自动审批拒绝执行，原因为“Automatic approval review failed: 官方算力限制，请等待一段时间后再进行使用，如有问题可联系管理员”。未绕过拦截。未取得目录版本与分区年度；所有相关字段保留未核验，预印本不适用。\n`);
await writeFile(resolve(sourceDir,'合作者可见论文摘录.json'),JSON.stringify(shortRaw,null,2));
await writeFile(resolve(sourceDir,'合作者来源核验.json'),JSON.stringify(audit,null,2));

const themeGroups=group(papers,p=>p.analysis.theme).sort((a,b)=>b[1].length-a[1].length);
const confirmed=papers.filter(p=>!p.affiliation.stage.includes('待核验'));
const current=papers.filter(p=>Number(p.year)>=2024&&Number(p.year)<=2026),recent=papers.filter(p=>Number(p.year)>=2022&&Number(p.year)<=2026);
const stageGroups=group(confirmed,p=>p.affiliation.stage);
const info=parse(await readFile(resolve(root,'港大/导师信息汇总.csv'),'utf8'),{bom:true,columns:true})[0];
const coverage=`采集日期${date}；CV版本2026-01-27（130项，含1篇学位论文），arXiv作者查询165条，ACL作者页60条，按标题与版本编号合并后175篇论文，另列1篇学位论文。可见arXiv最新提交日2026-08-28，不等于全部成果截至日；完整资料截至日期待核验。Scholar主页未确认，引用量全部未获取。全文${papers.filter(p=>p.download?.status==='已下载').length}篇；其余${papers.filter(p=>p.download?.status!=='已下载').length}篇保留可靠元数据/摘要。`;
let report=`# 孔令鹏研究轨迹\n\n分析日期：${date}。${coverage}\n\n## 主题清单\n\n每篇论文只分配一个主要主题；主题描述的是研究对象和任务，方法差异另记在时间线。篇数是当前资料库数量。\n\n`;
for(const [theme,ps]of themeGroups)report+=`### ${theme}\n\n对象与应用：${theme}。任务及困难：${unique(ps.map(p=>p.analysis.question)).join('；')}\n\n共${ps.length}篇；代表：${ps.slice(0,3).map(ref).join('；')}。完整序号：${ps.map(p=>p.id).join('、')}。方法与贡献逐篇见时间线及论文汇总。\n\n`;
report+='## 教育任职时间线\n\n已知开始年份的工作经历顺序如下。教育只公开学位完成年份，未倒推入学时间；同年经历可能并行。\n\n';
report+=info['任职'].split('\n').map(s=>`- ${s}。核验：CV公开记录，访问${date}。`).join('\n')+'\n\n教育（开始时间未公开，先后边界待核验）：\n\n'+info['教育经历（本硕博院校信息及获取学位时间）'].split('\n').map(s=>`- ${s}。`).join('\n');
report+='\n\n个人主页研究兴趣：'+info['研究兴趣和方向']+'。招生原文：“Generally, I take 1(±1.0) student(s) every year”；公告日期未公开，具体年度名额待核验。来源：https://ikekonglp.github.io/contact.html ，访问'+date+'。\n\n';
report+=`## 分阶段方向\n\n${confirmed.length}篇已匹配经历阶段；${papers.length-confirmed.length}篇阶段待核验。阶段待核验记录单列，不进入已确认阶段分母；分类待核验0篇，版本关系未确认0篇。岗位边界、双单位任职缺项可能影响重心结论。\n\n`;
for(const [stage,ps]of stageGroups){report+=`### ${stage}\n\n根据该阶段对应论文归纳，分母${ps.length}篇；未分类0篇。\n\n`;for(const [theme,rows]of group(ps,p=>p.analysis.theme).sort((a,b)=>b[1].length-a[1].length))report+=`- ${theme}：${rows.length}/${ps.length}，${(100*rows.length/ps.length).toFixed(1)}%；年份${unique(rows.map(p=>p.year)).sort().join('、')}；代表${rows.slice(0,3).map(ref).join('；')}。\n`;report+='\n';}
report+='硕士/博士的CMU署名论文无法仅依单位拆分。博士补查证据：CV第1、12页，2017年学位论文Neural Representation Learning in Linguistic Structured Prediction，支持“语言结构化预测中的神经表示学习”这一题目范围；不计入论文统计。硕士具体方向无法判断。DeepMind两个岗位与实习阶段存在边界，暂不强分研究科学家和高级研究科学家。IBM、清华、哈佛、华盛顿大学实习缺少足够工作内容，方向无法判断；未见明确博士后经历，不据此补造阶段。\n\n';
report+='## 方向变化\n\n阶段重心待核验，尚不足以判断转向。任职与学位边界未确认的论文可能改变各阶段分母，因此不输出“可能转向”结论。HKU已确认署名论文呈多方向分布，这不代表跨阶段的唯一主要方向已经核实。\n\n';
report+=`问题关系：早期依存分析研究关注非规范语言和结构预测（${ref(byId.get(124))}），近年代码与工具智能体关注真实交互任务可靠性（${ref(byId.get(17))}），对象、任务和困难不同，属于新增问题，不能因为都属于NLP认定同一问题。\n\n`;
report+=`方法延续：${ref(byId.get(93))}与${ref(byId.get(77))}同属序列到序列扩散，后者明确扩展DiffuSeq并处理离散与连续空间之间的训练/采样差异，支持具体机制延续。${ref(byId.get(52))}将扩散机制用于思维链，属于方法扩展到推理问题；不据Transformer等通用架构认定延续。\n\n操作标准按AGENTS.md：主方向须唯一且占比至少50%；转向还要求相邻阶段各至少5篇、占比双向变化至少20个百分点及新方向跨两年。当前缺项条件使重心判断失效。这些阈值不是学术共识，也不能代表个人决定。\n\n`;
report+=`## 当前方向\n\n主窗口2024-2026，共${current.length}篇；回看2022-2026，共${recent.length}篇。2026年尚未结束，不由年度数量推断下降。\n\n`;
for(const [theme,ps]of group(current,p=>p.analysis.theme).sort((a,b)=>b[1].length-a[1].length)){const years=unique(ps.map(p=>p.year)).sort(),first=Math.min(...papers.filter(p=>p.analysis.theme===theme).map(p=>Number(p.year)));report+=`- **${theme}**：${ps.length}篇；出现年份${years.join('、')}；最近${years.at(-1)}。${years.length>=2?'持续方向':'持续性待观察'}${ps.length===1?'，仅一篇':''}${first>=2024?'；现有记录中近期首次出现':''}。代表${ps.slice(0,2).map(ref).join('；')}。\n`;}
report+='\n与主页对照：自然语言处理、机器学习、表示学习和结构化预测与论文主题兼容；主页表述较宽，不能把所有细分主题认定为招生方向。https://ikekonglp.github.io/ 和 https://hkunlp.github.io/ ，访问'+date+'；具体年度招生方向未公开，仍待核验。\n\n';
report+='## 潜在方向\n\n以下均为推断，不是导师公开承诺的计划。\n\n';
for(const [name,a,b,why,limit]of [['扩散推理中的可修正规划',52,174,'从迭代思维链到分块课程学习，可能继续研究生成顺序、推理能力和计算成本之间的关系','是否发展到更多真实长程任务尚无公开计划'],['真实环境智能体的可靠评价',53,176,'从过程进度评价到轨迹奖励，可能继续研究可验证反馈与多步任务成功之间的关系','评价器泛化和实际部署效果仍需证据'],['高效序列表示与部署',59,164,'从重参数化扩散到代理压缩，可能研究表示压缩与灵活生成的兼容性','两种机制是否会统一尚未公开，不能假定为现有项目']])report+=`- **推断：${name}**。${why}。跨年依据：${ref(byId.get(a))}；${ref(byId.get(b))}。不确定之处：${limit}。\n`;
report+='\n## 问题索引\n\n论文问题详细原因只存于未完成事项.csv，时间线按事项编号引用。\n\n'+papers.map(p=>`- 论文#${p.id}：${p.issueIds.join('；')}。`).join('\n');
report+='\n\n非论文问题：学校两院系目录403，院系归属冲突；学位入学年月与DeepMind岗位边界未公开；上海人工智能实验室署名对应任职未公开；Scholar、DBLP受访问限制；常设招生说明的年度有效性、人数和截止日期待核验。\n';
await writeFile(resolve(base,'研究轨迹分析.md'),report);

const knownPeople=[...identities.values()].filter(p=>p.profile),focusCount=[...candidates.values()].filter(c=>c.focus).length;
const ratio=(rows,k)=>{const known=rows.filter(r=>['是','否'].includes(r[k])),yes=known.filter(r=>r[k]==='是').length;return known.length?`${yes}/${known.length}=${(100*yes/known.length).toFixed(1)}%，待核验${rows.length-known.length}篇`:`无可计算分母，待核验${rows.length}篇`;};
let collab=`# 孔令鹏合作分析\n\n抓取及分析日期：${date}。${coverage}\n\n## 身份变化\n\n从175篇论文提取${rawGroups.length}个原始姓名字符串，${focusCount}个达到重点候选阈值；其中${knownPeople.length}个身份有主页/CV证据并可合并。其余按单篇保留，个人数量与起止年份标待核验；因此汇总表行数不是人数。所有候选来源核验结果保存在来源/合作者来源核验.json，未定位或无法访问的主页没有补造。\n\n`;
for(const p of knownPeople)collab+=`- **${p.name}**：${p.profile.history}。当前：${p.profile.current}；${p.profile.role}。依据：${profileEvidence(p.name,p.profile)} 非论文问题见合作者汇总同名行。\n`;
collab+='\n## 学生表现与去向\n\n只统计已核验的一作和共同一作；共同一作标记待核验不进入一作统计。年份范围按可见论文，不把发表年份当作实际合作期。离组边界不明者只报告整体数量。所有数字可由合作者论文简表和共同论文署名表复算。\n\n';
for(const p of knownPeople.filter(p=>!facultyNames.has(p.name)&&/博士|学生/.test(p.profile.history))){const rows=shortPapers.filter(r=>r['合作者姓名']===p.name),first=rows.filter(r=>r['角色']==='共同一作'||r['角色'].startsWith('一作')),sig=signatures.filter(r=>r['合作者姓名']===p.name),years=unique(rows.map(r=>r['年份']).filter(v=>/^\d{4}$/.test(v))).sort();const themes=group(first.map(r=>papers.find(p=>p.title===r['论文标题'])).filter(Boolean),r=>r.analysis.theme).filter(([,r])=>unique(r.map(x=>x.year)).length>=2);
  const non=rows.filter(r=>r['是否与目标导师合著']==='否');collab+=`### ${p.name}\n\n可见范围${years[0]||'未公开'}至${years.at(-1)||'未公开'}；一作/共同一作${first.length}篇，其中与孔令鹏合著${first.filter(r=>r['是否与目标导师合著']==='是').length}篇、非合著${first.filter(r=>r['是否与目标导师合著']==='否').length}篇，合著关系待核验${first.filter(r=>r['是否与目标导师合著']==='待核验').length}篇。共同一作角色待核验${rows.filter(r=>r['角色'].includes('标记待核验')).length}篇。\n\n导师末位：${ratio(sig,'导师是否末位')}；导师通讯：${ratio(sig,'导师是否通讯')}。两者各自排除未知，不能由末位推断通讯。\n\n${non.length?`非合著线索：${non.slice(0,3).map(r=>`${r['论文标题']}（${r['年份']}，${r['角色']}）`).join('；')}。完整作者依据见简表，不将“未合著”解释为独立完成全部工作。`:'暂未发现已确认非合著条目；受列表可见性限制，不能认定没有独立研究。'}\n\n方向：${p.profile.research}。${themes.length?`方向有连续性：${themes.map(([t,ps])=>`${t}，年份${unique(ps.map(p=>p.year)).sort().join('、')}；${ps.slice(0,3).map(ref).join('；')}`).join('。')}。`:'一作条目的主题连续性需进一步统一关键词，现有资料不足以据此作统一判断。'}毕业/去向：${p.profile.current}；时间边界及冲突见合作者汇总同名行。发表论文的CCF/CORE/分区未核验，预印本不填等级；未仅以等级评价表现。\n\n`;}
collab+='## 教师研究方向\n\n已读取可访问的主页及ACL可见列表；Scholar/DBLP全量不可用，不能声称覆盖全部成果。只把一作或明确共同一作/通讯条目纳入方向简表；其余作者角色候选未当作已确认通讯。\n\n';
for(const p of knownPeople.filter(p=>facultyNames.has(p.name))){const rows=shortPapers.filter(r=>r['合作者姓名']===p.name),dominant=group(p.papers,x=>x.analysis.theme).sort((a,b)=>b[1].length-a[1].length)[0][1][0],reps=unique([p.papers[0],p.papers.at(-1),dominant]);collab+=`### ${p.name}\n\n主页明确方向/已有论文线索：${p.profile.research}；来源${p.profile.home||'孔令鹏CV及已记录ACL作者页'}，访问${date}。简表${rows.length}条；原始关键词不足时保留未公开，未从标题编写研究结论。\n\n代表共同论文（最多三篇）：${reps.map(ref).join('；')}。共同指导关系以CV为准；具体第一作者课题组、双方学生当时归属及贡献分工均待核验，不由学校单位或作者顺序判断。\n\n`;}
collab+='## 合作原因\n\n公开事实与推断分开：CV支持的指导/共同指导和同门关系仅作为背景，没有公开动因说明时不写成实际合作原因。共同项目名称、期限和职责未找到可确认公告，均为未公开；不把共同论文当作项目证明，也不读取论文后部致谢替代本阶段证据范围。\n\n';
for(const name of ['Jiacheng Ye','Shansan Gong','Lin Zheng','Tao Yu','Qi Liu','Chuan Wu']){const p=knownPeople.find(p=>p.name===name);if(!p)continue;collab+=`- **${name}**：推断：研究问题相近。本人公开方向为${p.profile.research}；共同论文${p.papers.slice(-2).map(ref).join('；')}的研究问题与之相关。方向来源：${p.profile.home||'孔令鹏CV'}，访问${date}。实际动因及方法/数据/实验分工待核验。\n`;}
collab+='\nDani Yogatama与孔令鹏的博士导师均包括Noah A. Smith，支持“同门”背景；不据此认定具体合作动因。其余关系未有充分公开说明时只记论文合作者。\n\n## 合作时间线\n\n以下按全部可见共同论文逐年列数；名单保留论文原姓名，包含同名待核验者。未见共同论文不代表真实合作中断。共同论文总数按目标论文去重，不能把各合作者计数相加。\n\n';
for(let y=2011;y<=2026;y++){const ps=papers.filter(p=>Number(p.year)===y);collab+=`### ${y}\n\n${ps.length?`${ps.length}篇：发表${ps.filter(p=>status(p)==='发表').length}篇，预印本${ps.filter(p=>status(p)==='预印本').length}篇，发表待核验${ps.filter(p=>status(p).includes('待核验')).length}篇。\n\n主题：${group(ps,p=>p.analysis.theme).map(([t,r])=>`${t}${r.length}篇`).join('；')}。\n\n参与人员：${unique(ps.flatMap(p=>p.authors.filter(n=>n!=='Lingpeng Kong'))).join('、')}。\n\n论文序号：${ps.map(p=>p.id).join('、')}。`:'未见共同论文。'}\n\n`;}
collab+='漏项与边界：论文并非Scholar全量；重点候选中多数身份尚未完成独立核验；个人主页部分为精选列表，第一/共同第一作者统计是可确认下限；未访问成功的CV、Scholar/DBLP与历史项目未补造。具体个人缺项集中在合作者信息汇总.csv，论文缺项集中在未完成事项.csv。\n';
await writeFile(resolve(base,'合作分析.md'),collab);
await writeFile(resolve(base,'中文展示副本.json'),JSON.stringify({papers:translation,files,coverage:{description:coverage,rawNames:rawGroups.length,verifiedProfiles:knownPeople.length,focusCandidates:focusCount}},null,2));
const log=await readFile(resolve(root,'记录.md'),'utf8').catch(()=>'');
for(const [step,content,output,missing]of [
  ['第二步',`${records.length}项记录，排除学位论文后${papers.length}篇；全文${papers.filter(p=>p.download?.status==='已下载').length}篇；逐条记录合法链接与失败原因。`,'论文/论文记录.csv；未完成事项.csv；论文/*.pdf','Scholar主页及引用未获取；不是全量成果。'],
  ['第三步',`${summaries.length}篇逐条摘要/引言分析；一作与通讯分开；保留英文摘要和中文概述。`,'论文/论文信息汇总.csv；中文展示副本.json','部分正式发表信息、单位及通讯角色待核验。'],
  ['第四步',`${timeline.length}篇对应时间线；${themeGroups.length}个主题；当前窗口2024-2026；最多三项潜在方向均标推断。`,'论文研究时间线.csv；研究轨迹分析.md','经历阶段缺项影响重心判定，不输出转向结论。'],
  ['第五步',`${rawGroups.length}个原姓名；${focusCount}个重点候选；${knownPeople.length}个身份资料有证据；其他按单篇分开。`,'合作者信息汇总.csv；共同论文署名表.csv；合作者论文简表.csv；合作分析.md','多数重点候选身份、部分作者角色、完整论文列表、分区等级与项目仍待核验。'],
]){const marker=`## ${date}｜${advisor}｜${step}`;if(!log.includes(marker))await appendFile(resolve(root,'记录.md'),`\n${marker}\n- 完成：${content}\n- 输出：./港大/${advisor}/${output}\n- 未解决：${missing}\n`);}
console.log(JSON.stringify({papers:papers.length,downloaded:papers.filter(p=>p.download?.status==='已下载').length,themes:themeGroups.length,issues:issues.length,rawNames:rawGroups.length,collaboratorRows:collaborators.length,knownProfiles:knownPeople.length,signatures:signatures.length,shortPapers:shortPapers.length}));
