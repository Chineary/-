import { writeFile, appendFile } from 'node:fs/promises';
import { stringify } from 'csv-stringify/sync';
import { root, date } from './fetch-source.mjs';
import { headers } from './schema.mjs';
const personal='https://ikekonglp.github.io/';
const cv=personal+'lingpenk_cv.pdf';
const contact=personal+'contact.html';
const info={
  '序号':'1','姓名':'Kong, Lingpeng','中文名':'孔令鹏',
  '院系':'人工智能与数据科学系（本地导师名单）；计算机科学系（个人主页与CV）；当前归属待核验',
  '职称':'助理教授（Assistant Professor）',
  '岗位类型（研究型/教学型/礼聘等）':'研究型（依据公开研究与博士指导信息）','是否研究型教师':'是',
  '学校主页':'https://ai.hku.hk/index.php/people/academic-staff',
  '个人主页':personal,'Google Scholar网址':'Scholar 主页待核验','Google Scholar总被引次数':'未获取','引用统计日期':'未获取',
  'CV网址':cv,'ORCID网址':'https://orcid.org/0000-0002-9033-2724','DBLP网址':'待核验',
  '教育经历（本硕博院校信息及获取学位时间）':`北京语言大学；计算机科学本科（B.E.）；入学时间未公开，2011年毕业；${cv} 第1页\n卡内基梅隆大学；计算机科学硕士（M.S.）；入学时间未公开，2015年毕业；${cv} 第1页\n卡内基梅隆大学；计算机科学博士（Ph.D.）；入学时间未公开，2017年毕业；论文：Neural Representation Learning in Linguistic Structured Prediction；${cv} 第1页`,
  '任职':[
    '清华大学；研究实习；2010；具体工作内容未公开',
    'NEC中国研究院；研究实习；2011；具体工作内容未公开',
    'IBM中国系统与科技实验室；软件工程师；2011-2012；具体工作内容未公开',
    '哈佛大学；研究实习；2015；具体工作内容未公开',
    '华盛顿大学；研究实习；2015-2017；具体工作内容未公开',
    'Google Research；研究实习；2016；具体工作内容未公开',
    'Google DeepMind；研究实习；2017；具体工作内容未公开',
    'Google DeepMind；研究科学家；2017-2019；研究方向见对应署名论文',
    'Google DeepMind；高级研究科学家；2019-2020；研究方向见对应署名论文',
    '香港大学；助理教授；2020-至今（CV日期2026-01-27）；自然语言处理与机器学习研究、教学和博士指导',
  ].map(s=>`${s}；${cv} 第1页`).join('\n'),
  '院内及联聘职务':'HKU NLP Lab 共同负责人（co-director）；其他联聘职务未公开',
  '研究兴趣和方向':'自然语言处理；机器学习；表示学习；结构化预测；生成模型',
  '实验室/课题组名称及网址':'香港大学自然语言处理实验室（HKU NLP Lab）；https://hkunlp.github.io/',
  '是否招收PhD':'是（常设申请说明；具体年度名额待核验）',
  '招生人数及招生方向':`个人联系页欢迎PhD申请，原文“Generally, I take 1(±1.0) student(s) every year”；此为通常规模，不是2026/27承诺名额。具体年度人数与招生方向未公开。公告日期未公开，访问日期${date}。建议申请者介绍研究兴趣及对近期论文的思考。往年说明提到early recruitment的May 1，不作为当前截止日期。来源：${contact}`,
  '资料来源网址':[personal,cv,contact,'https://hkunlp.github.io/people/','https://aclanthology.org/people/lingpeng-kong/','https://pub.orcid.org/v3.0/0000-0002-9033-2724/person','https://ai.hku.hk/index.php/people/academic-staff','https://www.cs.hku.hk/people/academic-staff'].join('\n'),
  '抓取日期':date,
  '核验状态':`部分已核验。个人主页、CV、课题组页交叉确认姓名、职称、教育任职与实验室；ORCID由ACL作者页链接并核对姓名。中文名由任务指定。院系冲突待核验：本地导师名单为AI系，个人主页/CV为CS系；两个官方目录返回403。招生为当前可见常设说明，年度有效性与名额待核验。${date}访问Scholar .com和.com.hk均超时，个人ID未确认，总被引次数未获取；DBLP返回反爬页面。`,
};
await writeFile(`${root}/港大/导师信息汇总.csv`,'\ufeff'+stringify([info],{header:true,columns:headers.faculty}));
await appendFile(`${root}/记录.md`,`\n## ${date}｜Kong, Lingpeng｜第一步\n- 完成：仅整理孔令鹏；核对个人主页、CV、课题组和ORCID；记录教育、全部任职及常设PhD申请说明。\n- 输出：\`./港大/导师信息汇总.csv\`；来源快照位于\`./港大/Kong, Lingpeng/来源/\`。\n- 未解决：官方院系页面403；当前院系冲突；年度招生名额、公告日期未公开；Scholar主页与引用统计未获取；DBLP反爬。\n`);
console.log('第一步已保存');
