import {readFile,writeFile,mkdir,copyFile,readdir,access} from 'node:fs/promises';
import {resolve,basename,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'csv-parse/sync';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import {headers,researchSections,collaborationSections} from './schema.mjs';
import {root} from './fetch-source.mjs';

export function parseCSV(text, columns, label='CSV') {
  const rows=parse(text,{bom:true,columns:true,skip_empty_lines:true});
  const first=parse(text,{bom:true,to_line:1})[0]??[];
  const missing=columns.filter(c=>!first.includes(c));
  if(missing.length)throw new Error(`${label} 缺少字段：${missing.join('、')}`);
  return rows;
}
export function parseReport(text, expected, label='报告') {
  const tree=unified().use(remarkParse).parse(text);
  const sections=[];
  for(const node of tree.children){
    if(node.type==='heading'&&node.depth===2){
      const title=node.children.map(n=>n.value??'').join('');
      if(!expected.includes(title))throw new Error(`${label} 无法识别章节：${title}`);
      if(sections.some(s=>s.title===title))throw new Error(`${label} 重复章节：${title}`);
      const previous=sections.at(-1);if(previous)previous.end=node.position.start.offset;
      sections.push({title,start:node.position.end.offset,end:text.length});
    }
  }
  const missing=expected.filter(title=>!sections.some(s=>s.title===title));
  if(missing.length)throw new Error(`${label} 缺少章节：${missing.join('、')}`);
  return sections.map(s=>({title:s.title,content:text.slice(s.start,s.end).trim()}));
}
export const eligible = p => !/版本待核验/.test(p['备注']||'') && !['学位论文','报告','书章','专利','其他'].includes(p['条目类型']);
export function validateRelations(papers,summaries,timeline,collaborators,signatures,issues,missing=[]) {
  const unique=(rows,key,label)=>{const seen=new Set();for(const r of rows){if(seen.has(r[key]))throw new Error(`${label} 重复编号 ${r[key]}`);seen.add(r[key]);}return seen;};
  const pids=unique(papers,'序','论文记录');
  const sids=unique(summaries,'序','论文汇总');
  const tids=unique(timeline,'序','时间线');
  const iids=unique(issues,'序号','未完成事项');
  const cids=unique(collaborators,'姓名','合作者');
  for(const p of papers.filter(p=>!['学位论文','报告','书章','专利','其他'].includes(p['条目类型'])))if((!missing.includes('论文/论文信息汇总.csv')&&!sids.has(p['序']))||(!missing.includes('论文研究时间线.csv')&&!tids.has(p['序'])))throw new Error(`论文${p['序']}缺少汇总或时间线`);
  for(const id of sids)if(!pids.has(id))throw new Error(`汇总存在未知论文${id}`);
  for(const id of tids)if(!sids.has(id))throw new Error(`时间线存在未知论文${id}`);
  for(const row of timeline)for(const id of splitIds(row['未完成事项序号']))if(!iids.has(id))throw new Error(`未知问题编号${id}`);
  for(const row of collaborators){const ids=splitIds(row['共同论文序号']);if(new Set(ids).size!==ids.length)throw new Error(`合作者${row['姓名']}的论文重复`);for(const id of ids)if(!sids.has(id))throw new Error(`合作者关联未知论文${id}`);const count=ids.filter(id=>eligible(papers.find(p=>p['序']===id))).length;if(/^\d+$/.test(row['共同论文数'])&&Number(row['共同论文数'])!==count)throw new Error(`合作者${row['姓名']}共同论文数不匹配`);}
  const sig=new Set();for(const row of signatures){const key=row['合作者姓名']+'|'+row['论文序号'];if(sig.has(key))throw new Error(`署名记录重复：${key}`);sig.add(key);if(!sids.has(row['论文序号'])||!cids.has(row['合作者姓名']))throw new Error(`署名关联失效：${key}`);const person=collaborators.find(c=>c['姓名']===row['合作者姓名']);if(!splitIds(person['共同论文序号']).includes(row['论文序号']))throw new Error(`署名非共同论文：${key}`);for(const k of ['导师是否末位','导师是否通讯'])if(!['是','否','待核验'].includes(row[k]))throw new Error(`署名状态非法：${key}`);}
}
export function splitIds(value) {return (value||'').split(';').map(s=>s.trim()).filter(s=>s&&s!=='无');}
export function ratio(rows,key){const known=rows.filter(r=>['是','否'].includes(r[key]));const yes=known.filter(r=>r[key]==='是').length;return {yes,known:known.length,unknown:rows.length-known.length,value:known.length?yes/known.length:null};}
const exists=path=>access(path).then(()=>true,()=>false);
async function importData() {
  const out=resolve(root,'public/data');await mkdir(out,{recursive:true});
  const faculty=parseCSV(await readFile(resolve(root,'港大/导师信息汇总.csv'),'utf8'),headers.faculty,'导师总表');
  const advisors=[];
  for(const row of faculty){
    const name=row['姓名'];if(!name||name.includes('/')||name.includes('..'))throw new Error('导师目录名非法');
    const base=resolve(root,'港大',name);
    const paths={papers:'论文/论文记录.csv',summaries:'论文/论文信息汇总.csv',timeline:'论文研究时间线.csv',issues:'未完成事项.csv',collaborators:'合作者信息汇总.csv',signatures:'共同论文署名表.csv',collaboratorPapers:'合作者论文简表.csv'};
    const data={},missing=[];
    for(const [key,path]of Object.entries(paths)) {if(await exists(resolve(base,path)))data[key]=parseCSV(await readFile(resolve(base,path),'utf8'),headers[key],path);else{data[key]=[];missing.push(path);}}
    validateRelations(data.papers,data.summaries,data.timeline,data.collaborators,data.signatures,data.issues,missing);
    let translations={};if(await exists(resolve(base,'中文展示副本.json')))translations=JSON.parse(await readFile(resolve(base,'中文展示副本.json'),'utf8'));
    const reports={};for(const [key,file,sections]of [['research','研究轨迹分析.md',researchSections],['collaboration','合作分析.md',collaborationSections]]){if(await exists(resolve(base,file)))reports[key]=parseReport(await readFile(resolve(base,file),'utf8'),sections,file);else{reports[key]=[];missing.push(file);}}
    const papers=data.summaries.map(s=>{
      const record=data.papers.find(p=>p['序']===s['序']);const time=data.timeline.find(p=>p['序']===s['序']);
      const translated=translations.papers?.[s['序']];
      if(!translated?.摘要&&s['摘要']&&!/^(未公开|依据不足)/.test(s['摘要']))throw new Error(`论文${s['序']}缺少中文摘要展示副本`);
      return {...record,...s,...time,...translated,'摘要':translated?.摘要??s['摘要'],eligible:eligible(record),pdf:translations.files?.[s['序']]??null};
    });
    const allFiles=[];
    async function copy(relativeDir=''){
      for(const item of await readdir(resolve(base,relativeDir),{withFileTypes:true})){
        const rel=relativeDir?`${relativeDir}/${item.name}`:item.name;
        if(item.isDirectory()){if(item.name==='论文')await copy(rel);continue;}
        if(!/\.(csv|md|pdf)$/.test(item.name))continue;
        const target=resolve(root,'public/materials',name,rel);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(base,rel),target);
        if(!rel.endsWith('.pdf'))allFiles.push({name:rel,url:`/materials/${encodeURIComponent(name)}/${rel.split('/').map(encodeURIComponent).join('/')}`});
      }
    }
    await copy();
    for(const file of ['cv.pdf','lingpeng.jpeg'])if(await exists(resolve(base,'来源',file)))await copyFile(resolve(base,'来源',file),resolve(out,file));
    advisors.push({id:name,info:row,...data,papers,reports,missing,files:allFiles,coverage:translations.coverage??{},portrait:'/data/lingpeng.jpeg'});
  }
  await copyFile(resolve(root,'港大/导师信息汇总.csv'),resolve(out,'导师信息汇总.csv'));
  const output={generatedAt:new Date().toISOString(),advisors};
  await writeFile(resolve(out,'advisors.json'),JSON.stringify(output));
  await writeFile(resolve(root,'导入校验.json'),JSON.stringify({passed:true,generatedAt:output.generatedAt,advisors:advisors.map(a=>({name:a.id,papers:a.papers.length,eligible:a.papers.filter(p=>p.eligible).length,collaborators:a.collaborators.length,issues:a.issues.length,missing:a.missing}))},null,2));
  console.log(`数据校验通过：${advisors.length}位导师，${advisors.reduce((s,a)=>s+a.papers.length,0)}条论文汇总。`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await importData();
