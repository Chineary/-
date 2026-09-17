import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {load} from 'cheerio';
import {fetchSource,sourceDir} from './fetch-source.mjs';
const catalog=JSON.parse(await readFile(`${sourceDir}/catalog.json`,'utf8')).filter(p=>p.type!=='学位论文');
const normalize=n=>n.replace(/\*/g,'').replace(/\s+/g,' ').trim();
const links=new Map();
for(const file of ['cv.xml','lab-people.html','personal-publications.html']){
  const $=load(await readFile(`${sourceDir}/${file}`,'utf8'),file.endsWith('xml')?{xml:true}:{});
  for(const a of $('a[href^="http"]').toArray()){
    const node=$(a),name=normalize(node.find('.card-title').text()||node.text());
    if(name&&name.length<45){const url=node.attr('href');links.set(name,[...new Set([...(links.get(name)||[]),url])]);}
  }
}
for(const paper of catalog) for(const a of paper.acl?.authorLinks||[]) links.set(a.name,[...new Set([...(links.get(a.name)||[]),a.url])]);
const map=new Map();
for(const paper of catalog)for(const name of paper.authors.map(normalize)){
  if(name==='Lingpeng Kong')continue;
  const person=map.get(name)||{name,ids:[],links:links.get(name)||[]};
  person.ids.push(paper.id);map.set(name,person);
}
const advisees=['Qintong Li','Jiahui Gao','Sheng Wang','Chang Ma','Xueliang Zhao','Jiacheng Ye','Yiheng Xu','Lin Zheng','Jingwei Dong','Zhihui Xie','Xijia Tao','Jing Xiong','Shansan Gong','Chenxin An','Lei Li','Zhenyu Wu','Xiachong Feng'];
const people=[...map.values()].map(p=>({...p,ids:[...new Set(p.ids)],focus:p.ids.length>=3||p.ids.filter(id=>Number(catalog.find(x=>x.id===id).year)>=2022).length>=2||advisees.includes(p.name)})).sort((a,b)=>b.ids.length-a.ids.length);
await mkdir(`${sourceDir}/合作者`,{recursive:true});
await writeFile(`${sourceDir}/collaborator-candidates.json`,JSON.stringify(people,null,2));
console.log('重点候选',people.filter(p=>p.focus).length,'全部',people.length);
const jobs=people.filter(p=>p.focus).flatMap(p=>{
  const usable=p.links.filter(l=>!l.includes('scholar.google')&&!l.includes('linkedin'));
  const home=usable.find(l=>!l.includes('aclanthology.org'));
  const acl=usable.find(l=>l.includes('aclanthology.org'));
  return [home,acl].filter(Boolean).map((url,i)=>({name:p.name,url,file:`合作者/${p.name.replace(/[^A-Za-z0-9]/g,'_')}-${i}.html`}));
});
let cursor=0;
await Promise.allSettled(Array.from({length:3},async()=>{
  while(cursor<jobs.length){const job=jobs[cursor++];const result=await fetchSource(job.url,job.file);console.log(job.name,result.status);}
}));
await writeFile(`${sourceDir}/collaborator-source-index.json`,JSON.stringify(jobs,null,2));
