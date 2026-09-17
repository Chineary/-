import {readFile} from 'node:fs/promises';
import {sourceDir} from './fetch-source.mjs';
const start=Number(process.argv[2]||0),end=Number(process.argv[3]||9999);
const catalog=JSON.parse(await readFile(`${sourceDir}/catalog.json`,'utf8'));
const downloads=JSON.parse(await readFile(`${sourceDir}/downloads.json`,'utf8'));
for(const d of downloads.filter(d=>d.id>=start&&d.id<=end&&d.textFile)){
  const text=await readFile(`${sourceDir}/论文摘录/${d.id}.txt`,'utf8');
  const page=text.split('\f')[0];
  const match=page.match(/\bA\s*B\s*S\s*T\s*R\s*A\s*C\s*T\b|\bAbstract\b|\bABSTRACT\b/);
  const head=(match?page.slice(0,match.index):page.slice(0,2100)).split('\n').map(l=>l.trim()).filter(Boolean).join('\n');
  const flags=page.split('\n').filter(l=>/correspond|equal contrib|contributed equal/i.test(l)).join(' ');
  console.log(`\n[${d.id}] ${catalog.find(p=>p.id===d.id).title}\n${head}\n标记:${flags}`);
}
