import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseCSV,parseReport,validateRelations,eligible,ratio} from '../scripts/import-data.mjs';
import {headers,researchSections,collaborationSections} from '../scripts/schema.mjs';
const root=new URL('../港大/Kong, Lingpeng/',import.meta.url);
const read=(f,key)=>readFile(new URL(f,root),'utf8').then(t=>parseCSV(t,headers[key],f));
const [papers,summaries,timeline,people,signatures,issues,shorts]=await Promise.all([
  read('论文/论文记录.csv','papers'),read('论文/论文信息汇总.csv','summaries'),read('论文研究时间线.csv','timeline'),read('合作者信息汇总.csv','collaborators'),read('共同论文署名表.csv','signatures'),read('未完成事项.csv','issues'),read('合作者论文简表.csv','collaboratorPapers'),
]);
test('实际数据跨表关联及计数一致',()=>{validateRelations(papers,summaries,timeline,people,signatures,issues);assert.equal(papers.filter(eligible).length,175);assert.equal(summaries.length,175);assert.equal(papers.filter(p=>p['下载状态']==='已下载').length,129);assert.equal(papers.filter(p=>['已下载','未下载','待核验'].includes(p['下载状态'])).length,175);});
test('未知引用不变成零；真实零保持可读',()=>{assert.ok(papers.every(p=>p['被引次数']==='未获取'));assert.equal(parseCSV('引用\n0\n未获取\n',['引用'])[0]['引用'],'0');});
test('重复论文编号、悬空问题、错误共同论文数量被拒绝',()=>{assert.throws(()=>validateRelations([...papers,papers[0]],summaries,timeline,people,signatures,issues),/重复编号/);assert.throws(()=>validateRelations(papers,summaries,[{...timeline[0],'未完成事项序号':'不存在'},...timeline.slice(1)],people,signatures,issues),/未知问题编号/);assert.throws(()=>validateRelations(papers,summaries,timeline,[{...people[0],'共同论文数':'999'},...people.slice(1)],signatures,issues),/共同论文数不匹配/);});
test('署名比例分别排除未知；空分母不计算',()=>{assert.deepEqual(ratio([{'末位':'是'},{'末位':'否'},{'末位':'待核验'}],'末位'),{yes:1,known:2,unknown:1,value:.5});assert.equal(ratio([{'通讯':'待核验'}],'通讯').value,null);});
test('固定报告章节完整；未知及重复章节报错',async()=>{assert.equal(parseReport(await readFile(new URL('研究轨迹分析.md',root),'utf8'),researchSections).length,7);assert.equal(parseReport(await readFile(new URL('合作分析.md',root),'utf8'),collaborationSections).length,5);assert.throws(()=>parseReport('## 未定义章节\n内容',researchSections),/无法识别章节/);assert.throws(()=>parseReport('## 主题清单\n## 主题清单',researchSections),/重复章节/);});
test('版本和非论文类型不计入统计',()=>{assert.equal(eligible({'条目类型':'学位论文'}),false);assert.equal(eligible({'条目类型':'预印本','备注':'版本待核验'}),false);assert.equal(eligible({'条目类型':'预印本','备注':'引用未获取'}),true);});
test('缺少整个阶段文件允许尚未整理；已有文件漏行仍报错',()=>{const p=[{'序':'1','条目类型':'会议'}];assert.doesNotThrow(()=>validateRelations(p,[],[],[],[],[],['论文/论文信息汇总.csv','论文研究时间线.csv']));assert.throws(()=>validateRelations(p,[],[],[],[],[]),/缺少汇总或时间线/);});
test('合作者不包含导师本人或等贡献符号；同名Lei Li不盲目合并',()=>{assert.ok(people.every(p=>!p['姓名'].includes('Lingpeng Kong')&&!p['姓名'].includes('*')));assert.ok(people.some(p=>p['姓名']==='Lei Li（香港大学）'));assert.ok(people.some(p=>p['姓名'].startsWith('Lei Li（论文 #79')));});
test('每位合作者同题简表只有一行，英文摘要不直接展示',async()=>{const keys=shorts.map(s=>s['合作者姓名']+'|'+s['论文标题'].toLowerCase().replace(/[^a-z0-9]/g,''));assert.equal(new Set(keys).size,keys.length);const d=JSON.parse(await readFile(new URL('中文展示副本.json',root),'utf8'));assert.equal(Object.keys(d.papers).length,175);assert.ok(Object.values(d.papers).every(p=>/[\u4e00-\u9fff]/.test(p['摘要'])));});
