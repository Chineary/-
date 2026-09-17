import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {root} from './fetch-source.mjs';
const dir=resolve(root,'验收');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[],checks=[];
const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1,baseURL:'http://127.0.0.1:5173'});
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400&&r.url().startsWith('http://127.0.0.1'))errors.push(`${r.status()} ${r.url()}`);});
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
async function screen(name){await page.screenshot({path:resolve(dir,name+'.png'),fullPage:true});}
async function noOverflow(){const o=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(o.scroll<=o.width+1,JSON.stringify(o));}
try{
  await page.goto('http://127.0.0.1:5173');await page.getByRole('heading',{name:'孔令鹏',exact:true}).waitFor();
  const data=await page.evaluate(async()=>await(await fetch('/data/advisors.json')).json());const advisor=data.advisors[0];
  await check('首屏数据和照片',async()=>{assert.equal(advisor.papers.length,175);assert.equal(await page.locator('.portrait').evaluate(i=>i.complete&&i.naturalWidth>0),true);assert.equal(await page.locator('.stat strong').first().innerText(),'175');await noOverflow();});
  await screen('01-桌面-基础信息');
  await check('中英文导师搜索、院系和招生筛选',async()=>{const q=page.getByLabel('搜索导师');await q.fill('Lingpeng');assert.ok(await page.getByRole('heading',{name:'孔令鹏',exact:true}).isVisible());await q.fill('没有该导师');await page.getByText('没有符合当前筛选条件的导师').waitFor();await q.fill('孔令鹏');await page.getByRole('button',{name:'筛选',exact:true}).click();await page.getByLabel('博士招生筛选').selectOption('未公开或不招生');await page.getByText('没有符合当前筛选条件的导师').waitFor();await page.getByLabel('博士招生筛选').selectOption('有申请说明');await page.getByRole('heading',{name:'孔令鹏',exact:true}).waitFor();await page.getByRole('button',{name:'重置筛选'}).click();await page.getByRole('button',{name:'筛选',exact:true}).click();});
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'研究方向'}).click();
  await page.locator('canvas').first().waitFor();await page.waitForTimeout(1000);
  await check('ECharts画布非空和研究章节',async()=>{const pixels=await page.locator('canvas').evaluateAll(cs=>cs.map(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0&&(d[i]<240||d[i+1]<240||d[i+2]<240))n++;return{width:c.width,height:c.height,nonblank:n};}));assert.ok(pixels.length>=2);assert.ok(pixels.every(p=>p.nonblank>1500));checks.push(JSON.stringify(pixels));await page.getByRole('navigation',{name:'研究报告章节'}).getByRole('button',{name:'潜在方向'}).click();assert.match(await page.locator('.report-content').innerText(),/推断/);await noOverflow();});
  await screen('02-桌面-研究方向');
  await page.getByRole('tab',{name:/论文目录/}).click();
  await check('论文检索、年份过滤、分页及中文详情',async()=>{assert.equal(await page.locator('.paper-table tbody tr').count(),12);await page.getByRole('button',{name:'下一页',exact:true}).click();assert.match(await page.locator('.pagination').innerText(),/第 2/);await page.getByLabel('论文年份').selectOption('2026');assert.ok((await page.locator('.year-cell').allTextContents()).every(y=>y==='2026'));await page.getByLabel('搜索论文',{exact:true}).fill('SwingArena');assert.equal(await page.locator('.paper-table tbody tr').count(),1);await page.locator('.paper-title').click();await page.getByRole('dialog').waitFor();assert.match(await page.locator('.modal-body .long-copy').innerText(),/[\u4e00-\u9fff]/);await page.getByRole('tab',{name:'证据与核验'}).click();assert.match(await page.locator('.modal-body').innerText(),/arXiv:2505.23932v3/);const pdf=page.getByRole('link',{name:'本地 PDF'});assert.equal((await page.request.get(await pdf.getAttribute('href'))).status(),200);await screen('03-桌面-论文证据');await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByLabel('搜索论文',{exact:true}).fill('');await page.getByLabel('论文年份').selectOption('全部年份');});
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'合作者',exact:true}).click();
  await check('合作者详情、共同论文跳转及比例分母',async()=>{await page.getByLabel('搜索合作者').fill('Lin Zheng');await page.getByRole('button',{name:'Lin Zheng',exact:true}).click();await page.getByRole('heading',{name:'Lin Zheng',exact:true}).waitFor();const sig=advisor.signatures.filter(s=>s['合作者姓名']==='Lin Zheng'),known=sig.filter(s=>['是','否'].includes(s['导师是否通讯'])),yes=known.filter(s=>s['导师是否通讯']==='是');assert.match(await page.locator('.ratio').nth(1).innerText(),new RegExp(`${yes.length} / ${known.length}`));await page.locator('.paper-title').first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await screen('04-桌面-合作者详情');await page.getByRole('button',{name:'返回合作者'}).click();});
  await page.getByLabel('搜索合作者').fill('');await page.getByRole('tab',{name:'合作网络'}).click();await page.waitForTimeout(800);await screen('05-桌面-合作网络');
  await check('合作图节点可点击',async()=>{const canvas=page.locator('.network-section canvas'),box=await canvas.boundingBox();await canvas.click({position:{x:box.width/2,y:40}});await page.getByRole('button',{name:'返回合作者'}).waitFor();await page.getByRole('button',{name:'返回合作者'}).click();});
  for(const width of [768,390]){
    await page.setViewportSize({width,height:900});await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'基础信息'}).click();await check(`${width}px基础信息无页面溢出`,noOverflow);await screen(`06-${width}-基础信息`);
    await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'研究方向'}).click();await page.waitForTimeout(650);await check(`${width}px图表无页面溢出`,noOverflow);await screen(`07-${width}-研究方向`);
    await page.getByRole('tab',{name:/论文目录/}).click();await page.locator('.paper-title').first().click();await check(`${width}px论文弹窗在视口内`,async()=>{const b=await page.getByRole('dialog').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1);});await screen(`08-${width}-论文详情`);await page.keyboard.press('Escape');
  }
  await page.getByRole('button',{name:'来源与材料'}).click();await check('来源下载链接可访问',async()=>{for(const a of await page.locator('.download-list a').all()){const url=await a.getAttribute('href');const r=await page.request.get(url);assert.equal(r.status(),200,url);}});await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);await writeFile(resolve(dir,'浏览器验收.json'),JSON.stringify({passed:true,url:'http://127.0.0.1:5173',checks,errors},null,2));
}finally{await browser.close();}
