import {load} from 'cheerio';
const clean=s=>s.replace(/\s+/g,' ').trim();
export const titleKey=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export function visiblePublications(html,url) {
  const $=load(html),rows=[];
  const add=(title,authors,context,link,abstract='')=>{
    title=clean(title).replace(/^\[arXiv\]\s*/i,'');authors=clean(authors);
    if(!title||!authors||title.length<10||authors.length>2500)return;
    const year=(context.match(/\b20\d{2}\b/)||[])[0]||'未公开';
    rows.push({title,authors,year,url:link?new URL(link,url).href:url,abstract:clean(abstract),context:clean(context),source:url});
  };
  if(url.includes('aclanthology.org')){
    for(const e of $('.d-sm-flex').toArray()){
      const node=$(e),a=node.find('strong a').first(),authors=node.find('a[href^="/people/"]').map((_,e)=>$(e).text()).get();
      const venue=node.find('a[href^="/volumes/"]'),ab=node.find('a[aria-controls]').attr('aria-controls');
      add(a.text(),authors.join(', '),venue.text()+' '+(a.attr('href')||''),a.attr('href'),ab?$(`[id="${ab}"]`).text():'');
    }
  }else{
    if(url.includes('cwu/publications')){
      const body=$('body').clone();body.find('br').replaceWith('\n');
      for(const line of body.text().split('\n')){const m=clean(line).match(/^([A-Z][^"\n]{5,500})\.\s*"([^"]+)"[,\s]*(.*)$/);if(m)add(m[2].replace(/,$/,''),m[1],m[3],url);}
      const seen=new Set();return rows.filter(r=>{const key=titleKey(r.title);if(seen.has(key))return false;seen.add(key);return true;});
    }
    for(const e of $('a.title-link').toArray()){const p=$(e).parent();add($(e).text(),p.find('.authors').text(),p.text(),p.find('a[href*="arxiv"],a[href*="aclanthology"]').first().attr('href')||$(e).attr('href'));}
    for(const e of $('.publication.row').toArray()){const p=$(e);add(p.find('.section-1>span').first().text(),p.find('.section-2').text(),p.find('.section-1').text(),p.find('a[href*="arxiv"],a[href*="aclanthology"]').first().attr('href'));}
    for(const e of $('.pub-title').toArray()){const p=$(e).parent();add($(e).text(),p.find('.pub-authors').text(),p.find('.pub-venue').text(),p.find('a[href*="arxiv"],a[href*="aclanthology"]').first().attr('href'));}
    for(const e of $('p.title').toArray()){const n=$(e);add(n.text(),n.next('p').text(),n.next('p').next('p').text(),n.parent().find('a[href*="arxiv"],a[href*="aclanthology"]').first().attr('href'));}
    for(const e of $('.article-title').toArray()){const p=$(e).parent();add($(e).text(),p.find('.stream-meta').text(),p.text(),p.find('a[href*="arxiv"],a[href*="aclanthology"]').first().attr('href'));}
    for(const e of $('.li-cite-author').toArray()){const p=$(e).parent(),title=p.children('a').first();add(title.text(),$(e).text(),p.text(),p.find('a[href*="arxiv"],a[href*="aclanthology"]').first().attr('href')||title.attr('href'));}
    for(const e of $('.paper-box-text').toArray()){const p=$(e),paras=p.children('p');add(paras.eq(0).text(),paras.eq(1).text(),p.parent().text(),p.find('a[href*="arxiv"],a[href*="aclanthology"]').first().attr('href'));}
    for(const e of $('li,p').toArray()){
      const n=$(e);if(!n.children('br').length||n.find('li,p').length)continue;
      const copy=n.clone();copy.find('br').replaceWith('\n');const lines=copy.text().split('\n').map(clean).filter(Boolean);
      if(lines.length>=3&&lines[1].includes(','))add(lines[0],lines[1],lines.slice(2).join(' '),n.find('a[href*="arxiv"],a[href*="aclanthology"]').first().attr('href')||n.find('a').first().attr('href'));
    }
  }
  const seen=new Set();return rows.filter(r=>{const k=titleKey(r.title);if(seen.has(k))return false;seen.add(k);return true;});
}
