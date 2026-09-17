import { readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { sourceDir } from './fetch-source.mjs';

const read = name => readFile(`${sourceDir}/${name}`, 'utf8');
const clean = text => text.replace(/\s+/g, ' ').trim();
const norm = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const cv = JSON.parse(await read('cv-records.json'));
const $ = load(await read('arxiv-author.xml'), { xml: true });
const arxiv = $('entry').toArray().map(e => ({
  arxivId: $(e).children('id').text().split('/').at(-1).replace(/v\d+$/, ''),
  title: clean($(e).children('title').text()),
  authors: $(e).find('author > name').map((i,n) => clean($(n).text())).get(),
  published: $(e).children('published').text(),
  updated: $(e).children('updated').text(),
  abstract: clean($(e).children('summary').text()),
  comment: clean($(e).find('arxiv\\:comment').text()),
  journal: clean($(e).find('arxiv\\:journal_ref').text()),
  doi: clean($(e).find('arxiv\\:doi').text()),
})).filter(p => p.authors.includes('Lingpeng Kong'));
const a = load(await read('acl-author.html'));
const acl = a('a[aria-label="Open PDF"]').toArray().map(e => {
  const block = a(e).parent().parent().parent();
  const titleLink = block.find('strong > a').first();
  const url = new URL(titleLink.attr('href'), 'https://aclanthology.org').href;
  const abstractId = block.find('a[aria-label="Show Abstract"]').attr('aria-controls');
  return { title: clean(titleLink.text()), url, pdf: a(e).attr('href'),
    authors: block.find('a[href^="/people/"]').map((i,n) => clean(a(n).text())).get(),
    authorLinks: block.find('a[href^="/people/"]').map((i,n) => ({name: clean(a(n).text()), url: new URL(a(n).attr('href'), 'https://aclanthology.org').href})).get(),
    year: url.match(/\/(20\d{2})\./)?.[1],
    venue: clean(block.find('a[href^="/volumes/"]').text()),
    abstract: abstractId ? clean(a(`[id="${abstractId}"]`).text()) : '' };
});
const overrides = new Map([
  [31, 'Recipe2Plan: Evaluating Planning Abilities of LLMs for Efficient and Feasible Multitasking with Time Constraints Between Actions'],
  [52, 'Diffusion of Thoughts: Chain-of-Thought Reasoning in Diffusion Language Models'],
  [95, 'ProGen: Progressive Zero-shot Dataset Generation via In-context Feedback'],
]);
const catalog = cv.map(p => ({...p, links: p.links.map(l=>l.replace('http://ikekonglp','https://ikekonglp')), sources:['CV'], abstract: '', notes: []}));
function matchTitle(title, other) {
  return norm(title) === norm(other);
}
for (const p of arxiv.toSorted((a,b) => a.published.localeCompare(b.published))) {
  let existing = catalog.find(c => matchTitle(c.title, p.title) || matchTitle(overrides.get(c.id) ?? '', p.title));
  if (!existing) {
    const sameId = catalog.filter(c => c.links.some(l=>l.includes(p.arxivId)));
    const words = s => new Set(s.toLowerCase().match(/[a-z0-9]+/g));
    const similarity = c => {
      const cWords=words(c.title), pWords=words(p.title);
      return [...cWords].filter(w=>pWords.has(w)).length / Math.max(cWords.size,pWords.size);
    };
    existing = sameId.find(c=>similarity(c)>0.6);
    if(existing && !matchTitle(existing.title,p.title)) existing.notes.push(`CV标题为“${existing.title}”；arXiv标题为“${p.title}”；相同预印本编号，保留版本信息。`);
  }
  if (!existing) {
    existing = {id: Math.max(...catalog.map(c=>c.id))+1, title:p.title, year:p.published.slice(0,4), authors:p.authors, venue:'arXiv', type:'预印本', links:[], sources:[], notes:[]};
    catalog.push(existing);
  }
  existing.arxiv = p;
  existing.abstract = p.abstract;
  existing.links = [...new Set([...existing.links, `https://arxiv.org/abs/${p.arxivId}`])];
  existing.sources.push('arXiv');
}
for (const p of acl) {
  let existing = catalog.find(c => matchTitle(c.title, p.title) || matchTitle(c.arxiv?.title ?? '', p.title) || matchTitle(overrides.get(c.id) ?? '', p.title));
  if (!existing) {
    existing={id:Math.max(...catalog.map(c=>c.id))+1,title:p.title,year:p.year,authors:p.authors,venue:p.venue,type:'会议',links:[],sources:[],notes:[]};
    catalog.push(existing);
  }
  existing.acl=p;
  existing.title=p.title;
  existing.abstract=p.abstract || existing.abstract;
  existing.authors=p.authors;
  existing.year=p.year ?? existing.year;
  existing.venue=p.venue;
  existing.links=[...new Set([p.url,...existing.links])];
  existing.sources.push('ACL');
}
const merges = [[23,152],[48,150],[55,141],[65,180]];
for (const [keepId, removeId] of merges) {
  const keep = catalog.find(p => p.id === keepId);
  const remove = catalog.find(p => p.id === removeId);
  if (!keep || !remove) throw new Error('版本归并编号失效');
  keep.notes.push(`版本归并：原候选序${removeId}并入序${keepId}；候选标题“${remove.title}”；依据：${keepId===65?'摘要研究问题、11个数据集及作者核心名单一致，采用ACL正式版':keepId===48?'完整作者顺序及ReverseGen研究内容一致，采用OpenReview正式版':'相同arXiv编号与作者名单'}。`);
  keep.links = [...new Set([...keep.links, ...remove.links])];
  keep.sources = [...new Set([...keep.sources,...remove.sources])];
  if (remove.arxiv) keep.arxiv = remove.arxiv;
  if (remove.acl) { keep.acl = remove.acl; keep.title=remove.title; keep.authors=remove.authors; keep.venue=remove.venue; }
  keep.abstract = keep.acl?.abstract || remove.abstract || keep.abstract;
  catalog.splice(catalog.indexOf(remove),1);
}
for (const p of catalog) {
  if (!p.year) p.year = p.arxiv?.published.slice(0,4) ?? '未公开';
  if (p.id === 106) {
    p.notes.push('CV误链至另一篇论文 arXiv:2204.09453；按论文标题和ACL正式记录消歧，不使用该错误链接。');
    p.links = p.links.filter(l => !l.includes('2204.09453'));
  }
  if (!p.authors.some(n => n.replace(/\*/g,'').trim()==='Lingpeng Kong')) p.notes.push('作者归属待核验');
}
await writeFile(`${sourceDir}/catalog.json`, JSON.stringify(catalog,null,2));
await writeFile(`${sourceDir}/arxiv-records.json`, JSON.stringify(arxiv,null,2));
await writeFile(`${sourceDir}/acl-records.json`, JSON.stringify(acl,null,2));
console.log(JSON.stringify({cv:cv.length,arxiv:arxiv.length,acl:acl.length,merged:catalog.length,missingAbstract:catalog.filter(p=>!p.abstract).map(p=>[p.id,p.title]),extra:catalog.filter(p=>p.id>130).map(p=>[p.id,p.year,p.title])},null,2));
