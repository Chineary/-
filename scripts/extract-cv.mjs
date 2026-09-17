import { readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { sourceDir } from './fetch-source.mjs';

const $ = load(await readFile(`${sourceDir}/cv.xml`, 'utf8'), { xml: true });
const entries = [];
let current;
for (const page of $('page').toArray()) {
  for (const line of $(page).children('text').toArray()) {
    const node = $(line);
    const text = node.text().trim();
    if (Number(node.attr('top')) > 1100) continue;
    const start = text.match(/^(\d{1,3})\.\s+/);
    if (start && Number($(page).attr('number')) >= 3) {
      current = { id: Number(start[1]), page: Number($(page).attr('number')), nodes: [] };
      entries.push(current);
    }
    if (current && text) current.nodes.push({ text, font: node.attr('font'), href: node.find('a').attr('href') });
  }
}
function join(parts) {
  return parts.join(' ').replace(/- ([a-z])/g, '$1').replace(/\s+/g, ' ').trim();
}
const records = entries.map(entry => {
  const firstTitle = entry.nodes.findIndex(n => n.font === '7' && !/^\W*$/.test(n.text));
  let endTitle = firstTitle;
  while (entry.nodes[endTitle]?.font === '7') endTitle++;
  const title = join(entry.nodes.slice(firstTitle, endTitle).map(n => n.text)).replace(/[.,]$/, '');
  const authorsText = join(entry.nodes.slice(0, firstTitle).map(n => n.text)).replace(/^\d+\.\s*/, '').replace(/[,\s]+$/, '');
  const after = join(entry.nodes.slice(endTitle).map(n => n.text));
  const years = [...after.matchAll(/\b(20\d{2})\b/g)].map(m => m[1]);
  const venue = entry.nodes.find(n => n.font === '4')?.text ?? after;
  return { id: entry.id, title, authors: authorsText.split(/,\s*(?:and\s+)?|\s+and\s+/).map(s => s.trim()).filter(Boolean), year: years.at(0), venue, links: [...new Set(entry.nodes.map(n => n.href).filter(h => h?.startsWith('http')))], cvPage: entry.page, cvText: join(entry.nodes.map(n => n.text)), type: entry.id === 128 ? '学位论文' : entry.id <= 7 ? '预印本' : entry.id >= 129 ? 'Workshop' : entry.id <= 15 ? '期刊' : '会议' };
});
await writeFile(`${sourceDir}/cv-records.json`, JSON.stringify(records, null, 2));
console.log(records.map(p => `${p.id}\t${p.year}\t${p.title}\t${p.authors.length}\t${p.links[0] ?? '无链接'}`).join('\n'));
if (records.length !== 130) throw new Error(`CV 应有130条记录，实际${records.length}`);
