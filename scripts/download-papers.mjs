import { readFile, writeFile, mkdir, access, rename, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { relative } from 'node:path';
import { root, sourceDir, date } from './fetch-source.mjs';

const exec = promisify(execFile);
const dir = `${root}/港大/Kong, Lingpeng/论文`;
await mkdir(dir,{recursive:true});
await mkdir(`${sourceDir}/论文摘录`,{recursive:true});
const papers=JSON.parse(await readFile(`${sourceDir}/catalog.json`,'utf8'));
const start=Number(process.argv[2]||0), end=Number(process.argv[3]||9999);
let results=[];
let saving = Promise.resolve();
try {results=JSON.parse(await readFile(`${sourceDir}/downloads.json`,'utf8'));}catch{}
const exists=async p=>access(p).then(()=>true,()=>false);
const cleanName=s=>s.replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,180);
async function download(p) {
  if(p.type==='学位论文')return;
  if(results.some(r=>r.id===p.id && r.status==='已下载'))return;
  const candidates=[];
  if(p.acl)candidates.push(p.acl.pdf);
  if(p.arxiv)candidates.push(`https://arxiv.org/pdf/${p.arxiv.arxivId}`);
  for(let url of p.links){
    if(/arxiv.org/.test(url)) url=url.replace(/\/(abs|pdf)\//,'/pdf/').replace(/\.pdf$/,'');
    if(/openreview.net/.test(url)) url=url.replace('/forum?','/pdf?');
    if(/aclweb.org\/anthology/.test(url))url=url.replace(/https?:\/\/(www\.)?aclweb.org\/anthology\//,'https://aclanthology.org/').replace(/\/$/,'')+'.pdf';
    if(/\.pdf(?:$|\?)|openreview.net\/pdf\?|arxiv.org\/pdf\//.test(url)) candidates.push(url);
  }
  const file=`${p.year}_${cleanName(p.title)}.pdf`;
  const target=`${dir}/${file}`, tmp=`${target}.part`, textPath=`${sourceDir}/论文摘录/${p.id}.txt`;
  const attempts=[];
  let state='未下载', reason='没有已确认的开放PDF链接';
  for(const url of [...new Set(candidates)]){
    try{
      const {stdout}=await exec('curl',['-L','-sS','--connect-timeout','10','--max-time','35','-w','%{http_code}','-o',tmp,url],{maxBuffer:1024*1024});
      attempts.push({url,http:stdout,date});
      const buffer=await readFile(tmp);
      if(stdout!=='200'||!buffer.subarray(0,5).equals(Buffer.from('%PDF-'))){reason=`HTTP ${stdout}，不是可读PDF`;continue;}
      await exec('pdftotext',['-f','1','-l','3','-layout',tmp,textPath]);
      const text=await readFile(textPath,'utf8');
      const words=s=>new Set(s.toLowerCase().replace(/-\s+/g,'').match(/[a-z0-9]+/g)||[]);
      const titleWords=words(p.title), pdfWords=words(text.slice(0,7500));
      const matched=[...titleWords].filter(w=>pdfWords.has(w)).length/titleWords.size;
      if(matched<0.66 || !/Lingpeng\s+Kong|Kong,?\s+Lingpeng|lingpenk|lpk@/i.test(text)){
        reason=`首页标题或导师姓名需人工核验（标题词匹配率${matched.toFixed(2)}）`;
        state='待核验';
        await rename(tmp,`${sourceDir}/论文摘录/${p.id}-待核验.pdf`);
        continue;
      }
      await rename(tmp,target);state='已下载';reason='PDF文件头、可读文本、首页标题词与导师姓名已核对';break;
    }catch(error){reason=error.message.slice(0,300);attempts.push({url,error:reason,date});}
  }
  if(await exists(tmp))await unlink(tmp);
  const result={id:p.id,status:state,file:state==='已下载'?relative(root,target):null,textFile:await exists(textPath)?relative(root,textPath):null,attempts,reason};
  const old=results.findIndex(r=>r.id===p.id);if(old>=0)results[old]=result;else results.push(result);
  saving = saving.then(() => writeFile(`${sourceDir}/downloads.json`,JSON.stringify(results.toSorted((a,b)=>a.id-b.id),null,2)));
  await saving;
  console.log(`${p.id}\t${state}\t${p.title}`);
}
const pending=papers.filter(p=>p.id>=start&&p.id<=end);
let cursor=0;
await Promise.allSettled(Array.from({length:3},async()=>{while(cursor<pending.length)await download(pending[cursor++]);}));
console.log(JSON.stringify({done:results.length,downloaded:results.filter(r=>r.status==='已下载').length}));
