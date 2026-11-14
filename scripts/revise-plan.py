#!/usr/bin/env python3
"""Produce a new proposal, preserve original V2 byte-for-byte. 演示模拟数据."""
from pathlib import Path
import re,json,hashlib,zipfile
from datetime import datetime,timezone
from xml.sax.saxutils import escape
from docx import Document
from docx.shared import Cm,Pt,RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,Table,TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/deliverables';OUT.mkdir(exist_ok=True)
SOURCE=ROOT/'docs/source/方案原文.txt';ORIGINAL=ROOT/'docs/source/审计全流程AI赋能演示方案-V2.docx'
original_hash=hashlib.sha256(ORIGINAL.read_bytes()).hexdigest();lines=SOURCE.read_text().splitlines();LABEL='演示模拟数据'
doc=Document();sec=doc.sections[0];sec.top_margin=Cm(2.1);sec.bottom_margin=Cm(2.0);sec.left_margin=Cm(2.3);sec.right_margin=Cm(2.3)
sec.page_width=Cm(21);sec.page_height=Cm(29.7)
for name,size in [('Normal',10.5),('Title',26),('Subtitle',13),('Heading 1',17),('Heading 2',13.5),('Heading 3',12)]:
 st=doc.styles[name];st.font.name='微软雅黑';st.font.size=Pt(size);st.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'微软雅黑')
 if name.startswith('Heading'):st.font.color.rgb=RGBColor.from_string('173B5C');st.paragraph_format.keep_with_next=True
 st.paragraph_format.space_after=Pt(6)
doc.styles['Normal'].paragraph_format.line_spacing=1.2
sec.header.paragraphs[0].text='openAudit｜政府投资项目审计全流程 AI 赋能演示方案'
f=sec.footer.paragraphs[0];f.alignment=WD_ALIGN_PARAGRAPH.CENTER
f.add_run(LABEL+'｜方案与实测状态分开管理｜第 ')
fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');f._p.append(fld);f.add_run(' 页')
pdf_elements=[];pdfmetrics.registerFont(TTFont('AuditCJK','/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',subfontIndex=0))
pstyles={0:ParagraphStyle('normal',fontName='AuditCJK',fontSize=10.5,leading=16,spaceAfter=7,wordWrap='CJK'),1:ParagraphStyle('h1',fontName='AuditCJK',fontSize=17,leading=24,textColor=colors.HexColor('#173b5c'),spaceAfter=14,keepWithNext=True,wordWrap='CJK'),2:ParagraphStyle('h2',fontName='AuditCJK',fontSize=13,leading=19,textColor=colors.HexColor('#173b5c'),spaceBefore=10,spaceAfter=8,keepWithNext=True,wordWrap='CJK'),3:ParagraphStyle('h3',fontName='AuditCJK',fontSize=12,leading=18,textColor=colors.HexColor('#173b5c'),spaceBefore=9,spaceAfter=6,keepWithNext=True,wordWrap='CJK')}
def para(t,level=0):
 if level:doc.add_heading(t,level)
 else:
  p=doc.add_paragraph();m=re.match(r'^([^：]{2,20}：)(.*)$',t)
  if m:p.add_run(m[1]).bold=True;p.add_run(m[2])
  else:p.add_run(t)
  if 'https://' in t:
   p.clear();prefix,url=t.split('https://',1);p.add_run(prefix);url='https://'+url
   h=OxmlElement('w:hyperlink');h.set(qn('r:id'),p.part.relate_to(url,RT.HYPERLINK,is_external=True))
   r=OxmlElement('w:r');pr=OxmlElement('w:rPr');color=OxmlElement('w:color');color.set(qn('w:val'),'176B9C');pr.append(color);r.append(pr);tx=OxmlElement('w:t');tx.text=url;r.append(tx);h.append(r);p._p.append(h)
 pdf_elements.append(Paragraph(escape(t),pstyles[level]))
def br():doc.add_page_break();pdf_elements.append(PageBreak())
def table(headers,rows):
 t=doc.add_table(rows=1,cols=len(headers));t.style='Light Shading Accent 1'
 for c,h in zip(t.rows[0].cells,headers):c.text=h
 for row in rows:
  for c,val in zip(t.add_row().cells,row):c.text=str(val)
 for row in t.rows:
  for cell in row.cells:
   for p in cell.paragraphs:
    for r in p.runs:r.font.size=Pt(9)
 xml=OxmlElement('w:tblHeader');t.rows[0]._tr.get_or_add_trPr().append(xml)
 for row in rows:pdf_elements.append(Paragraph(escape('｜'.join(str(v) for v in row)),pstyles[0]))
para('政府投资项目审计全流程\nAI 赋能演示方案',1)
para('六阶段 · 24 个场景 · 统一审计工作台',2)
para('V3 交付审阅版｜2026 年 11 月 14 日')
para('贯穿案例：澄川市南岸片区雨污分流与道路更新工程')
para('项目编号：DEMO-AUDIT-2027-006')
para(LABEL+'：项目、组织、角色、金额、业务日期及所有业务材料均为全新虚构；真实法规摘录单独标注官方来源及待人工核验。')
para('用途：供演示方案审阅、场景选择、材料准备与验收使用。原 V2 Word 和原文完整保留，修订记录集中列入附录。')
para('交付状态：本版配套可复现材料包。场景描述是预期业务流程，是否已运行及其结果以协调者的实际验收记录为准；资料生成成功不等于插件、模型或全部 24 场景验收通过。')
para('基本原则：以持久化输入和来源为基础，以可复算规则和模型辅助形成候选成果，以人工确认承担业务责任。运行失败必须可见，不能改播预制答案。')
br();para('阅读导航',1)
for title in ['一、总体设计与共同人工控制','二、六阶段 24 个场景详案','三、统一应用页面与交互','四、共用数据链与版本影响控制','五、贯穿案例、演示路线与变化测试','六、DSH 插件落地与模型配置','七、验收边界与交付清单','附录 A：修订说明与编号沿革','附录 B：场景—材料映射','附录 C：官方资料与法规索引']:para(title)
para('一、总体设计与共同人工控制',1)
para('工作台围绕立项准备（3）、现场取证（9）、征求意见与结果质量内控（2）、审理复核（4）、正式出具前审核确认（1）、整改归档与复用（5）组织，共 24 个场景。业务页面和按钮为主要入口，自然语言用于补充检索、说明与修订。')
para('统一人工控制：资料归属与适用版本、日期语义与单位换算、事实与证据充分性、法规及合同适用、意见采纳、专业复核、最终审批签发、公开、整改销号、档案接收及跨项目发布均由有权人员决定。每次确认应记录对象、版本、操作者、时间、范围和理由；相关内容变化后重新核验。')
para('状态区分：未提供不等于不存在；单位自报不等于核实完成；技术检查通过不等于正式批准；回复不等于落实；归档完成不等于整改完成；候选资产不等于已发布能力。所有原件保留，模型仅处理派生副本。')
para('质量职责边界：C02 负责审计组内部讨论、征求意见及反馈处理；D04 负责业务部门复核、审理复核及业务会议意见的落实与回归检查。不同层级的讨论不能相互替代，意见须保留来源及责任角色。')
para('范围边界：不包含人员库推荐或动态组建，不自动外联、送达、用印或发布，不自动给出违法定性。模拟期限及机构模板属于演示配置，不能冒充通用法律义务。')
para('二、六阶段 24 个场景详案',1)
para('每个场景保留能力定位、输入、AI 与规则分工、页面、输出、人工控制、现场亮点及讲述词。以下流程需以真实运行记录逐项验收。')
start=lines.index('[3] 二 六阶段 24 个场景详案');end=lines.index('[3] 三 统一应用页面与交互')
revisions=[];scene_ids=[];current=None
punct={'审前调查资料收集 消化整理':'审前调查资料收集、消化整理','跨文件 多事项':'跨文件、多事项','工程量 计价':'工程量、计价','辅助编制 转换与审查':'辅助编制、转换与审查','法规 标准及合同':'法规、标准及合同','整改复查 效果评价':'整改复查、效果评价','知识库 能力库 数据库':'知识库、能力库、数据库','多源数据工作台 一张表 一条时间轴 多事项比对':'多源数据工作台：一张表、一条时间轴、多事项比对','图纸知识理解 盘点盘库和多模态':'图纸知识理解、盘点盘库和多模态','整改 归档和资产':'整改、归档和资产'}
def clean(t):
 t=t.replace('&quot;','"').replace('原招投标场景中','招投标资料中')
 t=re.sub(r'^(第[一二三四五六]阶段)\s+',r'\1｜',t)
 for a,b in punct.items():t=t.replace(a,b)
 t=re.sub(r'^V2 ([A-F]\d{2}) ',r'\1｜',t)
 return t
for line in lines[start+2:end]:
 m=re.match(r'\[(\d+)\] (.*)',line)
 if m:
  lv=int(m[1]);t=clean(m[2]);
  if lv==4:br();para(t,2)
  else:
   current=re.search(r'([A-F]\d{2})',t).group(1);scene_ids.append(current);para(t,3)
  continue
 if line.startswith('能力定位与原编号：'):
  revisions.append((current,line.split('：',1)[1]))
  t=line.split('：',1)[1]
  t=re.sub(r'^合并原\s+[A-F]\d{2}(?:、[A-F]\d{2})*(?:\s*至\s*[A-F]\d{2})?[。。，]','',t)
  t=re.sub(r'^(由原 A08 扩展，|原 B01，|原 B02，|原 B03，|原 B04 重构，|扩展原 B07，|强化原 B08，|强化原 C01，|保留原 D01，|保留原 D02，|保留原 D03。|保留原 F03，|保留原 F04，|强化原 F05，|强化原 F06，|合并原 E01 至 E04，|合并原 F01、F02，|合并原 B05、B06，|合并原 B09、B10，|合并原 B11、B12，|合并原 D04、D05，)','',t)
  line='能力定位：'+t
 if current=='C02':
  line=line.replace('管理报告讨论、征求意见','管理审计组内部报告讨论、征求意见').replace('输入：讨论记录','输入：审计组内部讨论记录').replace('输出：会议记录草案','输出：审计组内部讨论记录草案')
 if current=='D04':line=line.replace('输入：业务会议记录','输入：业务部门、审理复核及业务会议记录')
 para(clean(line))
for sec_start,sec_end,title in [('[3] 三 统一应用页面与交互','[3] 四 共用数据链与版本影响控制','三、统一应用页面与交互'),('[3] 四 共用数据链与版本影响控制','[3] 五 贯穿式模拟案例与演示安排','四、共用数据链与版本影响控制')]:
 br();para(title,1)
 for line in lines[lines.index(sec_start)+1:lines.index(sec_end)]:
  m=re.match(r'\[4\]\s*(.*)',line)
  if m:
   t=re.sub(r'^([一二三四五六七八九十]+)\s+',r'\1、',m[1]);para(clean(t),2)
  else:
   line=line.replace('原 D04、D05 合并后强调','D04 强调').replace('C 阶段提供审计工作质量内部控制看板','C 阶段提供审计组内部质量控制看板').replace('D 阶段单独展示复核工作质量','D 阶段单独展示业务部门、审理复核及业务会议的复核工作质量')
   para(clean(line))
br();para('五、贯穿案例、演示路线与变化测试',1)
a=lines.index('[3] 五 贯穿式模拟案例与演示安排');b=next(i for i in range(a,len(lines)) if '领导版候选组合' in lines[i])
for line in lines[a+1:b]:
 m=re.match(r'\[4\]\s*(.*)',line)
 if m:para(re.sub(r'^([一二三四五六七八九十]+)\s+',r'\1、',m[1]),2)
 else:para(line.replace('继续采用全新模拟的','采用全新虚构的').replace('取消人员库推荐及时间冲突桥段。','项目已有角色由人工配置。'))
para('四、领导版：25—30 分钟，建议 28 分钟',2)
para('以一条证据链贯穿。为保证三个变化测试实际出现，领导路线明确包含 B05 合同检查；既定准备与核验使用显著标注的模拟前序材料，不能冒充当场生成成果。')
table(['环节','场景与操作','分钟'],[['开场与资料','A01 接收、冻结、版本对照；A02 项目全景','5'],['统一表达','B01 单位映射与来源反查','4'],['计量与合同','B03 区间交集；B05 V1/V2条件变化与冲回反例','6'],['形成与复核','C01 报告候选；E01 金额、限定和日期核验','6'],['整改与复用','F01 三轮证明；F05 第二项目适配','4'],['互动及缓冲','保留疑问、失败处理与人工确认时间','3']])
para('五、审计人员完整版：60—90 分钟，建议 80 分钟',2)
table(['阶段','场景','分钟'],[['立项准备','A01—A03：版本、全景、文书包','10'],['现场取证','B01—B09：一表一轴、比对、法规合同、图纸盘点、多模态、底稿','27'],['质量内控','C01—C02：报告转换、组内讨论与反馈处置','8'],['审理复核','D01—D04：送审、证据、依据与意见落实','10'],['出具前审核','E01：四类检查和确认失效','7'],['整改归档复用','F01—F05：证明轮次、效果、公告、缺档、三库','12'],['互动缓冲','模型延迟、复算检查及讨论','6']])
para('完整路线覆盖全部 24 场景。60 分钟采用预先载入但明确标识的模拟前序输入，90 分钟增加逐条法规与多模态复核；不能因压缩时间取消来源、人工控制或失败状态。上述是排程预算，非已实测耗时。')
para('六、三个必须保留的变化测试',2)
table(['测试','两条路线中的实际操作','验收观察'],[['T1 合同变化','A01 比较C01 V1/V2→B05 使用人工选择版本复算','80%与85%条件不同；旧稿不覆盖；仅相关确认失效；V2不自动生效'],['T2 单位或日期','B01将51.84万元的单位映射变为元再纠正；或B02区分准备日/开工日','计算随实际输入变化，保留原值及修订来源；错误不得静默修正'],['T3 成果变化','E01 修改关键金额或将“抽查”改为“全部”','原确认仅绑定原版本；受影响事实、金额、附件和确认项要求重检']])
para('资料开放：initial 仅前期与现场材料；feedback 开放征求意见及补证；review 开放复核、拟出具稿及合同V2；rectification 开放整改、归档、第二项目资料。默认不得加载测试真值，后续阶段不能提前向模型透露结局。')
br();para('六、DSH 插件落地与模型配置',1)
para('一、固定版本与安装结构',2)
para('目标框架为 DSH 0.2.2-rc.1，使用独立新环境 /opt/dsh-v2；旧 DSH 只读。插件组合包按 dsh.bundle 和 cordis.patch.yml 声明，由 Host 提供权威项目数据、原件版本、规则、日志和门禁。Client 提供原生审计入口与同源 /audit/ 工作台，业务接口位于 /api/audit。实际集成及部署由协调者验收。')
para('官方打包、Client Modules、Slots、存储与工具文档支持上述工程设计的框架基础，但不意味着框架自带审计功能。官方源码固定至 dsh-v0.2.2-rc.1，具体链接见附录 C；文档接口与本插件实现必须通过安装、持久化和浏览器流程验证。')
para('二、实际模型选择与责任分工',2)
table(['用途','配置模型','输出边界'],[['文本主模型','deepseek-flash','摘要、字段候选、带来源的解释与草案；不可覆盖确定性复算'],['复杂文本备选','deepseek-v4-pro','需显式配置并单独记录实际调用；未调用不得宣称验证'],['图像与图纸','glm-4.6v','可见对象、标签和参数候选；低清和未确认参数不进入工程量复算'],['音频转写','glm-asr-2512','实际音频分段转写，保留分段时间与误差；人工脚本不冒充ASR结果'],['模拟录音制作','MiniMax speech-2.8-hd','只用于生成明显标注的合成演示素材，不冒充真实访谈']])
para('模型配置以 packages/models 的适配接口与运行时配置为准；本方案不包含密钥或原服务器配置。数据包内的 records 是生成器提供的模拟派生记录，必须和原件核对，不能把其存在当作 OCR、ASR 或视觉识别成功。金额、交集、比例、指纹与版本依赖由程序处理；模型调用记录模型名、输入来源、时间、状态及错误。')
para('三、公共服务与权限',2)
para('文档解析、字段与日期规范、法规合同索引、图纸区域与媒体时间索引、来源追溯、成果转换及导出共用同一事实层。原件按指纹保存，业务对象与会话日志分开；事实修订生成版本并保留血缘。备份恢复和权限不是因为采用文件或数据库就自动满足审计级要求。')
para('按场景限制工具和业务操作范围，Host 对项目、资料集、状态及权限进行检查。UI 隐藏不构成权限隔离，工具 restrict 也不能被当作所有自注册工具的万能边界。全部场景输入、输出、失败及人工决定应可追溯。')
para('四、成熟度与实测边界',2)
para('DSH 官方标注开发者预览及安全边界。演示仅使用模拟数据及独立环境，不对接真实审批、发文或调查。模型连通、素材生成、字段解析、规则检查、业务端到端与部署分别验收；任何一项通过都不能替代其余验收。')
br();para('七、验收边界与交付清单',1)
for line in lines[lines.index('[3] 七 验收边界与方案审阅')+1:]:
 if '当前尚未进行开发或实测' in line or '完成方案确认后再进入开发' in line:continue
 para(line)
para('配套交付：docs/deliverables 内的本方案 Word/PDF；demo/manifest.json 和 demo/seed.json；demo/laws.json；按阶段组织的真实格式材料；demo/scenario-material-map.csv；demo/acceptance-checklist.csv；demo/truth/expected.json；scripts/generate-demo.py 与 scripts/revise-plan.py。')
para('执行与验收：生成器可验证文件可打开、模拟标识、指纹、数学关系和资料范围；业务验收逐条记录输入版本、动作、输出、来源、结果与已知缺口。未执行的项保持“待实测”，不得用预期值填为已通过。')
br();para('附录 A：修订说明与编号沿革',1)
para('本附录供内部版本对照；对外正文使用稳定场景编号。原 V2 文件未覆盖，SHA-256：'+original_hash)
para('本次调整：将修订过程和旧新编号移至附录；领导版25—30分钟、完整版60—90分钟；将B05纳入领导变化测试路线；新增共同人工控制、模型实配及官方链接；澄清C02组内讨论和D04业务复核会议；统一标题标点。24场景业务细节及各自控制要求保留。')
orig_a=lines.index('[3] 一 修订口径与旧新编号对应');orig_b=lines.index('[3] 二 六阶段 24 个场景详案')
for line in lines[orig_a+1:orig_b]:
 if line.startswith('原 ') or line.startswith('编号提示'):para(line)
for sid,change in revisions:para(f'{sid} 沿革：{change}')
br();para('附录 B：场景—材料映射',1)
mapfile=ROOT/'demo/scenario-material-map.json'
if mapfile.exists():
 for r in json.loads(mapfile.read_text()):para(f"{r['scenarioId']}｜{r['title']}：{', '.join(r['documentIds'])}；操作：{r['action']}；验收：{r['acceptance']}。")
else:para('逐场景材料映射见 demo/scenario-material-map.csv；其缺失时本交付不完整。')
br();para('附录 C：官方资料与法规索引',1)
base='https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/'
refs=[('官方版本与开发者预览','README.zh.md'),('官方安全说明','SAFETY.zh.md'),('打包与安装插件','docs/user/develop/basic/publish.zh.md'),('Client Modules','docs/subsystems/client-modules.zh.md'),('界面扩展点 Slots','docs/subsystems/slots.zh.md'),('Web Client 架构','docs/subsystems/web-client.zh.md'),('领域存储','docs/subsystems/storage.zh.md'),('工具系统','docs/subsystems/tools.zh.md')]
for title,path in refs:para(title+'：'+base+path)
para('以上官方仓库固定版本路径已于2026-11-14通过GitHub源码树核对；打包、Client架构、Slots和存储正文已读取。模型配置由协调者提供并须以实际调用日志验证，不因模型名称写入方案而声称测试完成。')
for law in json.loads((ROOT/'demo/laws.json').read_text()):
 para(law['id']+'｜'+law['title']+'｜'+law['article'],2)
 para('摘录：“'+law['excerpt']+'”')
 para('本版施行/修订日期：'+law['effectiveFrom']+'；版本：'+law['version']+'；效力层级：'+law['level']+'；状态：待人工核验。')
 para('适用核对：'+law['applicabilityText']);para('官方原文：'+law['officialUrl'])
para('法规核验说明：摘录均来自实际浏览的官方文本，仅为短片段；保留条号、完整原文URL及生效信息，不据此代替全文、司法解释、地方规定和个案适用审查。后续修法及行为发生期应在实际演示前再次核验。')
assert len(scene_ids)==24 and len(set(scene_ids))==24
fixed=datetime(2026,11,14,tzinfo=timezone.utc);doc.core_properties.created=fixed;doc.core_properties.modified=fixed;doc.core_properties.author='openAudit';doc.core_properties.title='政府投资项目审计全流程AI赋能演示方案 V3';doc.core_properties.subject=LABEL
path=OUT/'政府投资项目审计全流程AI赋能演示方案-V3.docx';doc.save(path)
with zipfile.ZipFile(path) as z:contents=[(i.filename,z.read(i.filename)) for i in z.infolist()]
with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
 for name,data in contents:
  info=zipfile.ZipInfo(name,(2026,11,14,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
def footer(c,d):
 c.setFont('AuditCJK',9);c.setFillColor(colors.HexColor('#516578'));c.drawString(48,28,LABEL+'｜方案审阅版');c.drawRightString(548,28,f'{d.page}')
pdfpath=path.with_suffix('.pdf');SimpleDocTemplate(str(pdfpath),pagesize=(595.28,841.89),leftMargin=48,rightMargin=48,topMargin=48,bottomMargin=48,title=LABEL+'｜审计演示方案V3',author='openAudit',invariant=1).build(pdf_elements,onFirstPage=footer,onLaterPages=footer)
assert hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()==original_hash
alltext='\n'.join(p.text for p in Document(path).paragraphs)
for sid in scene_ids:assert sid+'｜' in alltext
(OUT/'proposal-verification.json').write_text(json.dumps({'label':LABEL,'originalV2Sha256':original_hash,'originalPreserved':True,'sceneCount':24,'sceneIds':scene_ids,'word':path.name,'pdf':pdfpath.name,'verification':['Word reopened','24 unique scenario headings','original V2 hash unchanged','PDF generated independently for reading; not a pixel-identical Word render'],'limitation':'Word page layout has not been rendered with Microsoft Word/LibreOffice; PDF is separately typeset'},ensure_ascii=False,indent=2)+'\n')
print(path);print(pdfpath)
