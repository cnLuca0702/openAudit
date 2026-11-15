"""Build editable architecture review artifacts. Requires python-pptx and XlsxWriter.
Run: PYTHONPATH=/tmp/openaudit-architecture-deps python3 scripts/build-workbench-architecture.py
Source catalog is read from current server exports; no project data is loaded or changed.
"""
import json, subprocess, pathlib, math, html, textwrap, zipfile
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from lxml import etree as LET
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
import xlsxwriter
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/deliverables/工作台架构-V1'
OUT.mkdir(parents=True, exist_ok=True)
source = json.loads(subprocess.check_output(['node','--input-type=module','-e', 'import {SCENARIOS} from "./packages/server/scenarios.js"; import {WORKFLOW_FORMS,REFERENCE} from "./packages/server/workflow.js"; console.log(JSON.stringify({scenarios:SCENARIOS,forms:WORKFLOW_FORMS,reference:REFERENCE}));'], cwd=ROOT))
commit = subprocess.check_output(['git','rev-parse','--short','HEAD'],cwd=ROOT,text=True).strip()
nodes=[]
def add(id,parent,name,desc,inputs='',actions='',outputs='',scope='项目共享',status='已实现',entry='',boundary='',roles='相关审计人员',sourcefile='',kind='功能节点'):
    nodes.append(dict(id=id,parent=parent,name=name,description=desc,inputs=inputs,actions=actions,outputs=outputs,scope=scope,status=status,entry=entry,boundary=boundary,roles=roles,source=sourcefile,kind=kind))
def group(id,name,desc,entry='',scope='项目共享',status='已实现',kind='菜单/页面'):
    add(id,'ROOT',name,desc,scope=scope,status=status,entry=entry,kind=kind)
def children(parent, rows, scope='项目共享', entry='', sourcefile='', status='已实现'):
    for row in rows:
        id,name,desc,inputs,actions,outputs,*extra=row
        add(id,parent,name,desc,inputs,actions,outputs,scope,status,entry,extra[0] if extra else '',sourcefile=sourcefile)
add('ROOT','', 'openAudit 个人审计工作台','以审计人员个人办理为入口，围绕项目共享资料完成核查、文书编制、复核审理、整改检查和归档；保留来源与办理记录。',scope='个人入口＋项目共享',status='部分实现',boundary='个人偏好目前保存在浏览器；正式账号级个人工作区与任务分派尚未实现。',kind='系统根节点')
group('P','我的工作台','根据个人岗位推荐事项，收藏常用功能、记录个人安排，并查看项目共用的待核事项和最近结果。','#overview','个人浏览器＋项目共享')
group('M','审计资料','接收、查找和核对审计资料，管理版本、摘录、原件阅读与个人关注。','#documents')
group('FA','事实核对','对资料提取或人工录入的事实明细进行核验、校正和确认，并追溯原件出处。','#facts')
group('ST','按审计阶段查找','按六个阶段组织 24 项办理事项，支持跨阶段查找、收藏和按个人分工进入。','#catalog',kind='导航分组')
group('W','文书办理台账','登记实际发生的单位、节点、回证、质量控制、签发用印、修改留痕和归档移交。','#workflow')
group('R','项目待核事项','汇集核查线索、处理意见、变更影响和人工确认历史，供人员按分工核验。','#review')
group('L','审计参考资料','管理可复用的案例、审计方法和参考数据，保留适用范围、审核及测试要求。','#assets')
group('H','办理记录','查看办理过程、成功或失败情况及操作留痕，追踪结果形成过程。','#history')
group('SET','演示资料管理','分批导入模拟资料或重置模拟项目，支持演示和验证。','#settings',scope='演示管理')
group('U','各事项共用的办理能力','统一选择资料、引用成果、执行核查、核验结果、导出文书及比较版本。',kind='共用能力，非独立菜单')
group('SYS','基础支撑与数据边界','支撑登录校验、资料持久化、来源引用、版本失效、模型调用和本机文件预览。',scope='系统支撑',kind='系统能力，非独立菜单')
group('NEXT','个人工作台待完善项','列出实现正式个人工作台仍需明确的账号、项目、任务、权限与协同能力，供本轮调整。',scope='待确定',status='待规划',kind='调整建议，未上线')
children('P',[
('P01','我的工作岗位','选择工作岗位，改变首页推荐事项；所有阶段仍可访问。','岗位选项','选择岗位','岗位推荐入口','只调整推荐，不改变权限或审批身份。'),
('P02','我常用的事项','收藏或取消收藏办理事项，在首页集中显示，减少逐级查找。','办理事项编号','收藏；取消收藏；进入办理','个人常用事项列表'),
('P03','我的工作安排','记录个人准备办理的工作，关联办理事项，可勾选完成、进入办理或移除。','工作说明；关联事项','加入安排；完成勾选；进入；移除','个人备忘记录','完成勾选不改变项目业务状态，也不分派任务。'),
('P04','上手指引','提供收集资料、核对原件与摘录、选择事项办理三个快捷入口。','当前需要办理的工作','上传资料；查看资料；查找事项','对应页面或上传表单'),
('P05','按阶段与关键词找事项','按阶段或合同、底稿等工作关键词查找功能，不要求按顺序执行全部事项。','阶段；关键词','搜索；进入办理','匹配的办理事项'),
('P06','项目待核提醒','折叠展示项目共用待核内容，提示进入项目待核事项核验处理。','项目待核记录','展开；查看待核事项','待核事项入口','当前没有按登录账号自动分派的个人待办。'),
('P07','项目最近办理结果','查看项目最新成果及其状态，快速返回相关事项核对。','项目成果与状态','查看结果；进入事项','项目成果入口','项目结果不等于当前个人完成的工作。')],scope='个人浏览器；P06/P07 为项目共享',entry='#overview',sourcefile='packages/client/src/workspace.tsx；App.tsx')
for id,title,ids in [('member','审计组成员','B05、B03、B09、B08'),('lead','审计组组长 / 主审','A03、C01、C02、D01'),('review','业务部门复核人员','D01、D02、D04、E01'),('legal','审理人员','D03、D02、D04、E01'),('followup','整改检查 / 档案人员','F01、F02、F04、F03')]:
    add('ROLE-'+id,'P01',title,'为该岗位推荐 '+ids+'，个人可收藏其他事项；不限制对全部功能的访问。',inputs='岗位选择',actions='选择；进入推荐事项',outputs='推荐事项列表',scope='个人浏览器',entry='#overview',boundary='岗位选择不代表经授权的业务角色。',kind='岗位选项')
children('M',[
('M01','上传并登记资料','上传原件，登记资料类别、提供方及可选摘录；原件与后续核验内容分开保存。','文件；资料类别；来源说明；摘录','选择或拖入文件；上传','资料记录、原件和初始版本','单文件上限 10 MiB；支持格式以接收与预览组件为准。'),
('M02','资料目录与检索','按资料名称、类别或来源查找，查看版本及适用状态。','检索词；查看范围','搜索；筛选；打开资料','匹配的资料清单'),
('M03','查看原文与来源','打开原件阅读面板，核对文件页面、出处、引用版本及相关成果。','资料编号与版本；来源定位','查看原文；下载原始资料','原件页面及来源信息'),
('M04','资料版本管理','上传新版本时选择已有资料建立版本关联，保留旧版本供追溯。','已有资料；新文件；提供方','选择已有资料；上传新版本','版本链及新版本资料','新接收不等于已确认适用。'),
('M05','确认适用版本','核对原件后确认具体资料版本，记录核验人和理由。','资料版本；核验人；理由','确认版本','版本绑定的确认记录','业务状态变更后，关联确认可能失效。'),
('M06','校正资料摘录','校正文字摘录及事实明细，形成新版本，不改写上传原件。','原摘录；修订内容；核验人；理由','校正摘录；保存','修订版本与影响提示'),
('M07','比较资料版本','选择两个资料版本，对比正文或明细的增删变化。','比较前版本；比较后版本','比较版本','版本差异结果'),
('M08','留存本次资料清单','按当前资料状态保存一份版本清单，供后续追溯和核对。','当前资料集；登记人；理由','留存资料清单','资料快照','留存清单不等于正式档案移交。'),
('M09','关注资料','将个人关注的资料加入筛选范围，快速找回常用资料。','资料编号','关注；取消关注；我关注的资料','个人关注列表','只保存在当前浏览器，关注不改变共享资料权限。'),
('M10','查看历史及适用状态','在当前资料、关注资料、待核对、已确认适用、全部历史之间切换。','查看范围','切换范围','对应资料列表')],entry='#documents',sourcefile='packages/client/src/App.tsx；dialogs.tsx；packages/server/service.js')
children('M03',[
('V01','PDF 与办公文档阅读','直接显示 PDF 页；DOC/DOCX/WPS 等在服务器内转换后阅读，保留原件下载。','PDF、DOC、DOCX、WPS 等文件','翻页；选页码；缩放；下载','分页阅读视图','转换预览可能存在排版差异，特殊旧版或加密文件可下载核验。'),
('V02','原图查看','显示图片原件并放大核对，展示可用的图像定位范围。','图片；区域定位','放大；查看定位','原图和区域提示'),
('V03','录音录像查看','播放原始录音或录像，结合已有时间定位或转写片段核验。','音视频；时间码；片段记录','播放；定位片段','可核对的媒体原件'),
('V04','文字识别与录音转写','按需识别 PDF/图片文字或将录音转成文字，生成待人工核验的派生内容。','原件；可选识别页码；模型配置','识别原件文字；录音转文字','带来源的识别或转写记录','依赖已配置模型；失败显示，不以空结果伪装成功。'),
('V05','摘录、解析与接收信息','将文字摘录、解析记录与接收信息分开查看，核对提取过程。','资料记录','切换原文/文字摘录/解析记录/接收信息','资料详情视图'),
('V06','派生与引用关系','在派生内容和原件之间跳转，查看引用该资料的成果。','父资料；来源引用；成果索引','查看派生前原件；查看引用成果','资料与成果的关联定位')],entry='来源与证据面板',sourcefile='packages/client/src/components.tsx；DocumentPreview.tsx；packages/server/preview.js')
children('FA',[
('FA01','查看事实明细','查看已保存的数值、单位、业务记录、状态和来源，核对解析或人工摘录内容。','事实明细；检索词','查看；筛选','事实清单'),
('FA02','确认事实','逐项核验事实及其出处，对具体版本作人工确认。','事实版本；核验人；理由','确认事实','人工核验记录'),
('FA03','修订事实','修订数值、单位或业务记录，保留旧值和修订原因，并提示关联结果重新核对。','事实值；单位；明细；核验人；理由','修改基础事实；保存','新事实版本及变更影响'),
('FA04','追溯资料出处','从事实返回资料原件、版本和定位说明，核对事实是否有支持。','事实来源引用','查看资料出处','原件与定位')],entry='#facts',sourcefile='packages/client/src/App.tsx；dialogs.tsx；packages/server/service.js')
stages=[('A','审计准备','收集资料、开展调查、编制方案与通知书。'),('B','审计实施','核查合同、工程、资产及现场记录，形成取证单和底稿。'),('C','征求意见','起草报告，逐单位处理签收、反馈意见与修改。'),('D','复核审理','检查送审材料、证据与定性依据，落实复核审理意见。'),('E','报告签发送达','核对签发条件，并通过台账登记实际签发、用印和送达。'),('F','整改与归档','核查整改、提出复查建议，分别办理公告草稿、归档与经验整理。')]
for code,title,desc in stages: add('ST-'+code,'ST',title,desc,inputs='项目资料及前序成果',actions='查找事项；进入办理；登记文书',outputs='阶段内办理入口',entry='#stage-'+code,kind='阶段入口')
outputs={
'A01':'缺件、重复件、版本差异和变化影响清单','A02':'调查情况、主体与资金关系、待补调查事项','A03':'实施方案、通知书及所选审前文书草稿',
'B01':'合同支付汇总、单位换算和来源明细','B02':'重要事项时间线与先后顺序提示','B03':'区间重叠、数量金额差异及待核线索','B04':'依据原文、效力期间和适用性待核项','B05':'付款比例复算与履约条件、重复支付疑点','B06':'工程量复算与计价差异、参数来源','B07':'账面、实盘及领用记录差异','B08':'带原件定位的现场记录及待核陈述','B09':'取证单、工作底稿等审计记录草稿',
'C01':'报告草稿、问题明细、金额口径和引用索引','C02':'反馈处理明细、采纳理由、期限及落实待核项',
'D01':'送审缺件、指定版本不符及补正清单','D02':'事实、证据、金额和报告表述一致性检查','D03':'定性处理依据、期间和适用条件核验结果','D04':'意见落实、修改位置及证明对应检查',
'E01':'事实、数字、日期、版本与质量控制阻断项',
'F01':'整改证明、到账凭证及责任落实核验结果','F02':'整改成效复查、未完成事项及销号建议','F03':'审计结果公告草稿及公开范围检查','F04':'应有、实有、缺件及档案归集检查','F05':'待审核的案例、方法和参考数据候选项'}
kindnames=dict(project='项目基础',template='文书模板',contract='合同',payment='支付',approval='批复与决策',measurement='计量',law='法规依据',drawing='图纸',inventory='库存台账',count='实盘记录',media='现场音视频',report='报告',feedback='意见反馈',requirement='资料要求',review='复核意见',rectification='整改证明')
for s in source['scenarios']:
    boundary={'A03':'生成草稿，不自动签发或盖章。','B04':'依据适用性须由人核验。','B06':'图纸参数须有出处并经核验。','B08':'转写和影像识别不等于已查明事实。','C02':'签收、回复、采纳与落实分别管理；期限按实际文书核验。','E01':'检查通过不代替正式审批或签发。','F02':'销号由人决定，必须有有效证明。','F03':'仅生成草稿，不执行公开发布。','F04':'归档不代表整改已完成。','F05':'需核验来源、脱敏、授权和适用条件。'}.get(s['id'],'结果与来源应逐项核对；系统提示不直接成为审计结论。')
    add(s['id'],'ST-'+s['id'][0],s['title'],s['description'],inputs='、'.join(kindnames.get(k,k) for k in s['requiredKinds'])+'；可指定版本、前序成果及办理参数',actions='选择资料；执行本事项；核对来源；人工确认/修订；导出',outputs=outputs[s['id']],entry='#'+s['id'],boundary=boundary,sourcefile='packages/server/scenarios.js；packages/client/src/scenario.tsx',kind='审计办理事项')
wdesc={
'subject':'登记被审计单位及职责，为逐单位送达、回证和期限核验提供主体。',
'milestone':'记录阶段、责任主体、实际办理日期及形成材料，留存工作过程。',
'receipt':'按单位和文种登记签收人、实际签收日、文号及回证，关联具体报告版本和期限。',
'quality':'登记部门复核、业务会议和法规审理记录，关联具体报告版本及有效证明。',
'evidenceChain':'登记方案事项、原始资料、取证单、工作底稿和报告问题的对应关系及签章审核。',
'redline':'关联修改前后文本、修改依据、留痕稿与定稿，保存文书修改过程。',
'issuance':'登记已实际办理的拟稿、审核、签发、文号、用印和分送，校验前置质量记录。',
'archive':'登记四类材料、卷号、目录、页码、保管期限及实际移交接收信息。'}
for i,f in enumerate(source['forms'],1):
    add('W%02d'%i,'W',f['title'],wdesc[f['kind']],inputs='；'.join(x['label'] for x in f['fields'])+'；登记人；登记说明；相关证明',actions='新增登记；保存流程记录；修订并保留历史',outputs='带版本、证明和登记人的流程记录',entry='#workflow',boundary='登记实际办理事实，不执行机关审批或电子签章。' if f['kind'] in ['issuance','quality'] else '证明与对应版本失效时需重新核验。',sourcefile='packages/server/workflow.js；packages/client/src/workflow.tsx',kind='台账登记类型')
children('W',[
('W09','台账检索与历史','按记录类型查看已登记内容、证明来源、变更前记录及当前有效性。','登记类型；流程记录','筛选；查看证明；修订并保留历史','台账明细及版本历史'),
('W10','办理流程参考','查阅用户提供的流程文件、19 个节点、底稿索引、复核内容及四类档案参考。','参考文件与校验指纹','切换办理流程参考；查看','参考内容和待核事项','参考日期、数量、金额不属于当前项目，不自动构成法定期限或结论。')],entry='#workflow',sourcefile='packages/client/src/workflow.tsx；docs/source/tracking-reference.json')
children('U',[
('U01','办理准备与资料选择','查看所需资料，默认使用项目适用资料，也可显式选择具体版本。','资料版本；所需类别','展开资料设置；选择版本','本次使用的资料清单'),
('U02','引用前序成果','引用已有底稿、报告或复核成果的具体版本，延续办理依据。','成果编号与版本','选择前序成果','本次成果引用关系'),
('U03','办理参数与事实调整','填写事项专用参数，按需核对并修订与本次办理相关的基础事实。','事项参数；基础事实','调整参数；修改基础事实','保存后的参数或新事实版本'),
('U04','智能辅助分析','选择是否调用已配置的模型辅助分析，并区分系统计算与模型建议。','提示内容；输入资料；模型能力','启用智能辅助；选择识别方式','辅助分析内容或明确错误','模型输出须人工核验；未配置或失败不产出虚假结果。'),
('U05','执行核查与保存结果','根据保存的输入执行本事项，记录结果、引用来源、检查项和执行状态。','资料；成果引用；参数','执行当前事项；再次办理','持久化结果与办理记录'),
('U06','查看结果与文书草稿','在结果明细、检查项和文书草稿之间切换，理解发现及待核内容。','办理结果','查看明细；查看检查项；查看草稿','可核验结果视图'),
('U07','核验确认与修改成果','核对来源后确认或修订具体成果版本，保存核验人和理由。','成果版本；修改内容；核验人；理由','人工确认；修改文稿','确认记录或新成果版本'),
('U08','成果版本与差异','选择成果历史版本并比较，来源变更时提示重新办理和复核。','成果历史；比较版本','选择历史版本；比较；重新办理','版本差异及失效提示'),
('U09','文书与数据导出','导出可编辑 Word、Excel，以及 CSV 数据表或 Markdown 文本稿。','当前成果版本；导出格式','导出 Word；导出 Excel；数据表；文本稿','含来源与模拟标识的附件'),
('U10','来源证据跳转','从检查项、事实或文稿引用返回原始资料和具体版本定位。','来源编号；版本；页码/段落/时间码','查看资料出处','来源与证据面板')],entry='各办理事项页面',sourcefile='packages/client/src/scenario.tsx；components.tsx；dialogs.tsx')
children('R',[
('R01','核查线索与问题','集中查看核查发现、涉及金额与出处，人工确认发现或填写处理决定。','线索；金额；证据','确认发现；填写处理决定','带理由和证据的处理记录'),
('R02','意见处理与待办事项','分别记录回复、采纳、是否需修改和落实情况，核验所附证明。','反馈或复核意见；处理决定；证明','填写处理决定；查看完整记录','意见处理状态','当前为项目共享事项，不是已分派到个人的任务。'),
('R03','变更影响与重新复核','集中显示资料或文稿变更影响的成果，返回对应事项重新核对。','失效成果；变更原因','查看影响；进入事项；重新办理','更新结果及新确认'),
('R04','人工确认历史','查看各对象具体版本的核验人、理由及确认是否仍有效。','确认记录；对象版本','查看历史；查看来源','确认历史视图')],entry='#review',sourcefile='packages/client/src/App.tsx；packages/server/service.js')
children('L',[
('L01','审计案例库','查阅待审核或已入库的案例、知识与适用边界，并追溯其来源。','案例候选项；适用条件','查看案例；查看来源','可参考案例'),
('L02','审计方法库','保存审计规则、方法和模板，并查看适用范围和验证结果。','方法或模板；测试记录','查看方法；验证审计方法','方法内容及测试结果'),
('L03','参考数据资料','保存经核对和脱敏的数据口径、明细及样本供参考。','数据候选项；口径；来源','查看数据；查看口径','参考数据项'),
('L04','审核参考资料入库','核验来源、脱敏、授权与适用范围，记录审核后方可入库。','范围；脱敏确认；授权确认；审核人；理由','审核入库','已审核参考资料'),
('L05','验证审计方法','对方法执行实际测试并保存结果，未通过不冒充可用能力。','方法；测试输入','验证审计方法','测试记录'),
('L06','跨项目复用检查','填写目标项目条件，检查已入库参考资料是否适用并保留复用结果。','目标项目编号；类型；单位；经办人','跨项目复用','适用性核对与复用记录','当前不等于多项目工作区或项目切换器。')],entry='#assets',sourcefile='packages/client/src/App.tsx；packages/server/service.js')
children('H',[
('H01','办理过程记录','查看各事项何时办理、采用哪些来源、是否成功及失败原因。','办理记录；状态','查看记录；查看详情','可追溯执行历史'),
('H02','操作留痕','查看上传、核验、修订和处理等业务操作的留痕记录。','操作事件；登记人','查看操作明细','业务操作时间线')],entry='#history',sourcefile='packages/client/src/App.tsx；packages/server/service.js')
children('SET',[
('SET01','分批导入演示资料','按首批、征求意见、复核审理、整改证明批次导入模拟资料，验证各阶段。','演示批次','导入此批','模拟项目资料与版本'),
('SET02','重置模拟项目','通过明确确认重置模拟项目，并保留重置前备份。','重置确认文本','确认重置','重置后的模拟数据及备份','这是演示管理功能，不是普通审计人员清理真实项目的入口。')],entry='#settings',scope='演示管理',sourcefile='packages/client/src/App.tsx；packages/server/service.js')
children('SYS',[
('SYS01','DSH 登录与同源校验','校验登录会话及请求来源，保护工作台页面、接口与原件下载。','登录会话；Host/Origin','身份与来源校验','允许访问或拒绝请求','当前未实现细到项目、资料或岗位的业务授权。'),
('SYS02','个人偏好保存','按项目将岗位、收藏、关注与个人备忘保存在当前浏览器。','浏览器本地偏好','读取；保存偏好','下次访问恢复偏好','不是按登录账号隔离；同一浏览器可能共用。'),
('SYS03','项目资料与记录存储','保存项目资料、事实、成果、流程台账及事件，原件按内容摘要存储。','资料及业务记录','持久化；读取；保留历史','项目共享数据与不可变原件'),
('SYS04','来源绑定与版本失效','成果引用绑定具体来源版本；关键数据变更使关联确认失效并提示重新核验。','来源依赖；新旧版本','依赖追踪；失效标记','版本关联和待重新核验状态'),
('SYS05','模型与文件处理','调用已配置的分析、识别或转写能力，执行 PDF、文档、表格、媒体解析。','文件；模型配置；参数','解析；调用模型；记录错误','内容摘录、派生记录或错误'),
('SYS06','原件预览转换','在本机隔离环境转换办公文档，PDF 页面由同源阅读组件显示。','文档原件；预览请求','本机转换；缓存；分页显示','临时预览副本','不改变项目状态，不上传至外部在线转换服务。'),
('SYS07','期限估算与质量检查','结合回证和文书规定计算期限，检查证明和报告版本是否满足当前核验条件。','实际签收日；期限；工作日历；质量记录','估算到期日；列出阻断项','期限及待核提示','工作日历未确认时按工作周估算，不能当成确定法定到期日。')],scope='系统支撑',sourcefile='packages/server/index.js；service.js；workflow.js；core.js；preview.js')
children('NEXT',[
('N01','账号级个人工作区','将个人安排、收藏和关注绑定登录账号，支持跨设备保存与人员隔离。','个人账号；项目成员身份','待确定','个人工作区','现有浏览器偏好只能作为过渡。'),
('N02','我参与的项目','提供个人参与项目列表、进入与切换，并明确项目资料和成员边界。','项目；成员；参与关系','待确定','个人项目列表及项目切换'),
('N03','我的正式待办','建立有经办人、期限、状态和完成条件的个人待办，区分备忘和项目任务。','任务；经办人；期限；完成证明','待确定','可追踪个人任务'),
('N04','工作交接与协同','明确分派、接收、退回、补充资料及跨岗位交接的过程和责任。','交接对象；材料；意见；状态','待确定','交接记录和协同状态'),
('N05','个人资料与项目资料','区分个人暂存、项目共享、正式证据和参考库，明确提交共享与引用规则。','资料归属；可见范围；引用权限','待确定','资料归属与共享机制'),
('N06','岗位授权与审批身份','按账号、项目和职责授予查看、修订、复核或管理权限，明确正式身份。','账号；岗位；授权范围','待确定','可验证的业务权限'),
('N07','消息与期限提醒','按个人职责推送待处理、退回、资料变化和到期提醒，支持已读与处置。','任务事件；到期日；接收人','待确定','个人消息与提醒'),
('N08','机关审批和签章衔接','明确工作台与机关审批、发文、电子签章系统的边界及回写要求。','审批事项；正式版本；回传凭证','待确定','审批或签章接口方案','当前仅登记外部已办理事实。'),
('N09','个人办理进度与工作日历','在可靠的账号、任务和日历数据基础上显示个人进度，避免将项目总量归给个人。','个人任务；实际办理记录；确认日历','待确定','个人进度和期限安排')],scope='待确定',status='待规划',sourcefile='依据当前能力边界提出，尚未实现')
# Map the user's reference into architecture review entries; do not assert example facts or legal rules.
refdesc=[
'在工作台起草并核对通知等材料，通过台账登记实际签发、送达及逐单位回证。',
'接收项目法人承诺书及账户材料，核对原件、提供方和适用版本。',
'接收建设管理单位承诺及账户材料，独立登记主体和资料来源。',
'记录审计组对实施方案的讨论、审计重点和相关管理事项证明。',
'核对方案定稿、审批材料及留痕稿，保存所依据的资料和具体版本。',
'按审计事项核查资料和现场记录，制作取证单、编制底稿并关联证据。',
'汇集现场取证及底稿，检查签章、审核和来源完整性。',
'按事项汇总底稿、索引和报告问题之间的对应关系。',
'围绕报告征求意见稿核对事实、金额、依据和审计组讨论意见。',
'分别登记征求意见书的实际签收与回证，按实际文书和已核验日历检查期限。',
'登记建设管理单位反馈及无异议证明；无异议不由逾期自动推定。',
'登记项目法人逐条反馈和证明，记录采纳理由、是否需修改及落实情况。',
'关联具体报告版本登记部门复核、业务会议及意见采纳说明。',
'核对送审清单、指定资料和报告版本，记录移交及缺件。',
'接收审理意见，核对定性依据，落实文稿修改和补充证明。',
'核对签发条件、正式版本、文号及用印，并登记实际签发事实。',
'按被审计单位分别登记正式报告送达和回证，关联该报告版本。',
'按四类材料整理案卷并登记移交；归档状态与整改状态独立。',
'以实际报告签收和文书规定核对整改报告期限；到期节点不表示整改已完成。']
for i,(m,desc) in enumerate(zip(source['reference']['milestones'],refdesc),1):
    add('REF%02d'%i,'W10',m['title'],desc,inputs='参考文件第 '+str(i)+' 条；实际办理原件',actions='查看参考；按实际情况在对应事项或台账办理',outputs='参考条目及其功能映射',scope='只作流程参考',status='参考映射',entry='#workflow → 办理流程参考',boundary='示例日期与数量不属于当前项目；不是自动流程引擎。',sourcefile='用户提供：项目跟踪审计全流程.html',kind='参考流程节点')
byid={n['id']:n for n in nodes}
assert len(byid)==len(nodes)
assert len([n for n in nodes if n['kind']=='审计办理事项'])==24
for n in nodes:
    assert n['description'] and len(n['description'])>=10
    assert not n['parent'] or n['parent'] in byid
    seen={n['id']}; parent=n['parent']
    while parent:
        assert parent not in seen
        seen.add(parent);parent=byid[parent]['parent']

def path(n):
    names=[n['name']];p=n['parent']
    while p: names.insert(0,byid[p]['name']);p=byid[p]['parent']
    return ' / '.join(names)
for n in nodes: n['path']=path(n)
meta={'title':'个人审计工作台架构｜可编辑调整稿 V1','date':'2026-11-15','baselineCommit':commit,'nodeCount':len(nodes),'notes':['现状架构以代码为准；待规划和参考映射单独标记。','图中每个节点均为可编辑文字或形状；稳定编号对应 Excel。','三个格式为独立编辑副本，不自动同步，也不会改动线上平台。','节点归组是架构整理，不代表线上已有同名独立菜单。']}
(OUT/'架构节点数据.json').write_text(json.dumps({'meta':meta,'nodes':nodes},ensure_ascii=False,indent=2),encoding='utf-8')
# Editable workbook: source descriptions plus blank review columns.
wb=xlsxwriter.Workbook(str(OUT/'工作台功能清单与调整表-V1.xlsx'),{'strings_to_formulas':False,'strings_to_urls':False})
fmt_header=wb.add_format({'bold':True,'font_color':'#FFFFFF','bg_color':'#17584F','text_wrap':True,'valign':'vcenter','font_name':'微软雅黑','font_size':11})
fmt_body=wb.add_format({'text_wrap':True,'valign':'top','font_name':'微软雅黑','font_size':10,'border':1,'border_color':'#E1E8E5'})
fmt_edit=wb.add_format({'text_wrap':True,'valign':'top','font_name':'微软雅黑','font_size':10,'bg_color':'#EAF3FE','font_color':'#174C88','border':1,'border_color':'#D5E3F3'})
fmt_title=wb.add_format({'bold':True,'font_color':'#17584F','font_size':20,'font_name':'微软雅黑','text_wrap':True,'valign':'vcenter'})
fmt_note=wb.add_format({'font_name':'微软雅黑','font_size':12,'text_wrap':True,'valign':'top'})
fmt_amber=wb.add_format({'bg_color':'#FFF2D9','font_color':'#8F5A0A'})

def sheet(name,headers,rows,widths=None,editable=()):
    ws=wb.add_worksheet(name);ws.hide_gridlines(2)
    ws.freeze_panes(1,2);ws.set_row(0,34)
    for c,h in enumerate(headers):
        ws.write(0,c,h,fmt_header);ws.set_column(c,c,widths[c] if widths else 24)
    for r,row in enumerate(rows,1):
        ws.set_row(r,75)
        for c,value in enumerate(row):ws.write(r,c,value,fmt_edit if c in editable else fmt_body)
    if rows:ws.autofilter(0,0,len(rows),len(headers)-1)
    ws.set_landscape();ws.fit_to_pages(1,0);ws.repeat_rows(0);ws.set_paper(9)
    ws.set_footer('&LopenAudit 工作台架构 V1&R第 &P 页 / 共 &N 页')
    return ws
intro=wb.add_worksheet('使用说明');intro.set_column('A:A',3);intro.set_column('B:J',12);intro.hide_gridlines(2)
intro.merge_range('B2:J3',meta['title'],fmt_title)
instructions=[
'用途：基于当前实现整理工作台信息架构，供重新命名、分组、拆分及重排流程；不会直接修改线上功能。',
f'基线：{meta["date"]}，代码 {commit}；共 {len(nodes)} 个有功能说明的节点，其中 24 项审计办理事项、8 类台账登记、19 条参考流程映射。',
'建议先在“全部节点与调整”筛选模块或状态，填写蓝色栏目；节点编号保持不变，移动层级时填写新的上级编号。',
'新增功能：复制一行并使用新的编号；合并或拆分：在“处理方式”选择，并在“修改意见”写明目标节点编号及拆分内容。',
'字段调整：在“表单与输入项”修改字段名称、必填与交互要求；“操作与交互”可修改按钮名称、反馈及删除保留意见。',
'待规划节点 N01—N09 是讨论项，并未上线。岗位推荐、浏览器收藏和个人备忘不等于账号权限、正式任务或跨设备工作区。',
'参考流程 REF01—REF19 来自用户提供文件；节点说明用于映射功能，不将示例日期、金额、数量或待核法规结论写入当前项目。',
'PPT、draw.io、Excel 是独立编辑副本；修改不会自动互相同步。建议选 Excel 作为需求修改主稿，保留节点编号便于对照图稿。',
'图稿每一张卡片均为独立文字形状，可在 WPS 演示/PowerPoint 编辑。draw.io 用 diagrams.net 或兼容编辑器打开。',
'蓝色栏目：调整后名称、调整后上级编号、处理方式、优先级和修改意见。所有工作表均未加锁，可继续添加行列。']
for i,t in enumerate(instructions):intro.merge_range(5+i*3,1,7+i*3,9,t,fmt_note)
headers=['节点编号','当前上级编号','当前节点名称','功能说明','当前状态','调整后名称','调整后上级编号','处理方式','优先级','修改意见','节点类型','主要输入/关键字段','主要操作','主要输出','数据归属/使用范围','当前边界与限制','入口/路由','实现依据']
rows=[[n['id'],n['parent'],n['name'],n['description'],n['status'],'','','','','',n['kind'],n['inputs'],n['actions'],n['outputs'],n['scope'],n['boundary'],n['entry'],n['source']] for n in nodes]
ws=sheet('全部节点与调整',headers,rows,[16,17,30,64,14,30,19,15,12,55,23,55,38,45,28,53,32,50],range(5,10))
for col,choices in [(7,['保留','改名','移动','合并','拆分','删除','新增','待定']),(8,['P0 必须','P1 重要','P2 后续','待定'])]:ws.data_validation(1,col,len(nodes),col,{'validate':'list','source':choices,'error_type':'warning'})
ws.conditional_format(1,4,len(nodes),4,{'type':'text','criteria':'containing','value':'待规划','format':fmt_amber})
ws.write_comment(0,6,'填写目标父节点编号；例如将某事项移入“审计实施”，填写 ST-B。新增父节点时先为其设定唯一编号。')
scenes=[n for n in nodes if n['kind']=='审计办理事项']
sheet('24项审计事项',['编号','阶段','名称','功能说明','所需资料','形成结果','人工核验边界','建议入口/分组','修改意见'],[[n['id'],byid[n['parent']]['name'],n['name'],n['description'],n['inputs'],n['outputs'],n['boundary'],'',''] for n in scenes],[12,20,34,65,55,55,60,28,55],(7,8))
fields=[]
for i,f in enumerate(source['forms'],1):
    for x in f['fields']:
        required='选填' if x['type'] in ['optionalNumber','optionalSelect','reportOptional'] else '必填'
        if x['key']=='answers':required='部门复核时逐项必填'
        if x['type']=='reportOptional':required='报告送达必选；其他文种选填'
        fields.append(['W%02d'%i,f['title'],x['key'],x['label'],x['type'],required,'、'.join(x.get('options') or []),'登记实际办理信息并绑定相应版本；证明选项限已确认资料','','',''])
    for key,label,typ,required in [('actor','登记人','text','必填'),('reason','核验依据与登记说明','textarea','必填')]:fields.append(['W%02d'%i,f['title'],key,label,typ,required,'','记录实际登记人和依据，不由岗位推荐代填','','',''])
    if f['kind']!='subject':fields.append(['W%02d'%i,f['title'],'evidenceIds','签章 / 办理证明原件','documents','表单已有资料引用项时选填；否则必填','已确认适用的资料版本','支持多选；证明变更须重新核验','','',''])
for nid,items in {
'P01':[('role','我的工作岗位','下拉选择','推荐入口，不授权')],
'P03':[('title','准备办理的工作','单行文字','个人备忘'),('scene','关联办理事项','下拉选择','24 项事项中选择')],
'M01':[('file','选择上传文件','文件','单文件最多 10 MiB'),('kind','资料类别','下拉选择','分类登记'),('source','提供方或来源说明','文字','记录原件来源'),('logicalId','已有资料/上传新版本','选择','建立版本关系'),('records','资料摘录','可增删明细','可选，金额等保留数值类型')],
'M02':[('search','资料检索词','搜索','按名称、类别或来源筛选'),('range','查看范围','下拉选择','当前、关注、待核对、已确认、全部历史')],
'V01':[('page','原文页码','下拉选择','跳转页面'),('zoom','原文缩放','下拉选择','适合宽度及放大')],
'V04':[('pages','识别页码','文字','选填；超过六页须指定')],
'FA03':[('value','事实值','数值/文字','按事实类型填写'),('unit','单位','文字','保留计量口径'),('record','事实明细','明细编辑','校正具体记录')],
'U01':[('documentIds','本次使用的资料','默认/自选与复选','绑定资料具体版本')],
'U02':[('artifactIds','前序成果引用','复选','选择具体成果版本')],
'U03':[('options','本事项参数','按事项显示','具体选项随事项变化；如文种、审计重点、核查参数')],
'U04':[('useModel','使用智能辅助分析','复选','依赖实际配置；建议待人核验')],
'U07':[('actor','核验人','文字','实际操作者'),('reason','核验/修改理由','多行文字','保存人工依据'),('content','文稿正文','多行文字','修订产生新版本')],
'R02':[('decision','处理决定','下拉选择','依对象类型选择回复、落实等决定'),('evidenceIds','证明材料','多选','引用可核验的证明')],
'L04':[('scope','适用范围','文字','核定适用条件'),('redacted','脱敏确认','复选','核验敏感信息处理'),('permissionConfirmed','授权确认','复选','核验复用授权')],
'L06':[('targetProject.id','目标项目编号','文字','实际复用目标'),('targetProject.type','目标项目类型','文字','核对适用边界'),('targetProject.unit','目标项目单位','文字','核对对象条件')],
'SET02':[('confirmation','重置确认','文字','仅模拟项目管理操作')]
}.items():
    for key,label,typ,note in items:fields.append([nid,byid[nid]['name'],key,label,typ,'依表单提示填写','',note,'','',''])
sheet('表单与输入项',['所属节点','所属功能','字段标识','当前名称','当前控件','当前要求','可选值/资料范围','功能说明','调整后名称','调整后控件及必填要求','修改意见'],fields,[16,28,27,40,25,38,50,60,34,45,55],(8,9,10))
ops=[]
for n in nodes:
    if n['kind'] not in ['审计办理事项','参考流程节点','岗位选项'] and n['actions'] and n['status']!='待规划':
        for a in n['actions'].split('；'):ops.append([n['id'],n['name'],a,n['description'],n['inputs'],n['outputs'],n['boundary'],'','',''])
sheet('操作与交互',['节点编号','所属功能','当前操作/按钮','功能说明','操作前输入','操作后结果','提示与边界','调整后按钮名称','保留/合并/删除','交互修改意见'],ops,[16,30,32,60,55,45,55,30,22,60],(7,8,9))
roles=[n for n in nodes if n['kind']=='岗位选项']
sheet('岗位与个人边界',['岗位节点','岗位名称','现有推荐功能','当前个人能力','项目共享内容','身份与权限边界','期望首页/待办','期望权限','修改意见'],[[n['id'],n['name'],n['description'],'浏览器中的岗位、收藏、关注、个人备忘','资料、事实、成果、待核记录与台账','推荐不是授权；人工操作登记人不自动等于登录账号','','',''] for n in roles],[20,30,65,50,50,55,55,45,55],(6,7,8))
edges=[
('P','ST','选择阶段','个人按工作需要进入事项，不强制执行全部事项'),('P','M','收集与核对资料','从个人入口进入项目共用资料'),('M','FA','提取并核验','资料摘录形成事实明细，保留来源'),('FA','U05','核验后办理','以保存的事实和来源开展核查'),('U05','U06','形成结果','查看计算结果、检查项和文稿'),('U06','U07','人工核对','人工确认或修订具体版本'),('U07','W','登记实际办理','正式程序在台账登记；确认不代替签发'),
('ST-A','ST-B','准备→实施','按实际项目安排进入核查取证'),('ST-B','ST-C','实施→征求意见','以证据和底稿支撑报告草稿'),('ST-C','ST-D','反馈处理后复核','记录采纳理由、修改和送审材料'),('ST-D','ST-E','复核→签发送达','质量记录及对应报告版本须满足签发检查'),('ST-E','F01','进入整改检查','按实际回证与整改要求检查证明'),('ST-E','F04','进入归档整理','归档与整改可分别办理，不互相标记完成'),('F01','F02','复查与销号建议','对证明和整改成效再次核验'),('F04','W08','登记归档移交','按实际材料和卷宗登记'),('ST-B','W05','建立证据对应','方案、原始资料、取证单、底稿与报告对应'),('ST-C','W03','登记征求意见回证','按单位分别登记签收'),('ST-D','W04','登记质量控制','部门复核、业务会议、法规审理'),('ST-E','W07','登记签发用印','记录实际文号、签发及用印'),('W07','W03','登记报告回证','按单位关联正式报告具体版本'),('M06','R03','变更影响','摘录变化使关联结果提示重新核验'),('R03','U05','重新办理','保留历史结果，形成新结果'),('F05','L','审核入库','案例、方法与数据经过审核后供复用')]
sheet('流程与数据关系',['起点编号','起点名称','终点编号','终点名称','关系名称','功能说明/约束','调整后起点','调整后终点','关系修改意见'],[[a,byid[a]['name'],b,byid[b]['name'],label,desc,'','',''] for a,b,label,desc in edges],[16,30,16,30,25,70,18,18,60],(6,7,8))
sheet('19条参考流程',['编号','参考原节点','参考日期','对应功能说明','当前性质','实际办理入口建议','调整后流程节点','顺序/并行/退回修改意见'],[[f'REF{i:02d}',m['title'],m['date'],refdesc[i-1],'用户参考示例，非当前项目进度','W 台账＋对应阶段事项','',''] for i,m in enumerate(source['reference']['milestones'],1)],[14,70,25,80,38,35,45,65],(6,7))
decisions=[
('D-01','个人身份如何确定','当前岗位只作推荐，偏好保存在浏览器','绑定登录账号；明确一人多岗位及项目身份','N01、N06'),
('D-02','首页围绕什么工作组织','推荐事项＋个人备忘＋项目信息','按正式待办、参与项目、阶段或常用工具排序','P、N02、N03'),
('D-03','项目与个人资料如何分界','当前资料属于项目共享','明确个人暂存、项目共享、正式证据、参考资料','M、N05'),
('D-04','如何分派和交接','当前无正式个人任务分派','确定分派、接收、退回、协办和完成证明','N03、N04'),
('D-05','24 项事项如何呈现','当前按六阶段查找、可跨阶段使用','决定保留哪些主入口，哪些合并为工具或子步骤','ST、A01—F05'),
('D-06','文书台账是否融入办理页','当前是单独台账入口','决定直接嵌入事项、自动带入哪些字段、仍需人工核对哪些内容','W、U'),
('D-07','哪些操作需要不同权限','当前未实现岗位或资料级业务授权','确认查看、编辑、复核、确认、管理的权限边界','N06、SYS01'),
('D-08','正式审批由哪个系统承担','当前登记外部已办理事实','确定审批与电子签章系统的对接和回写','N08、W04、W07'),
('D-09','个人提醒以什么为依据','当前主要显示项目待核及估算期限','明确个人待办责任、确认日历、通知方式','N07、N09、SYS07'),
('D-10','首批调整的范围和顺序','已列明现状与待规划节点','填写 P0/P1/P2，选择先调整信息架构还是同时增加协同能力','全部节点')]
sheet('本轮调整重点',['议题编号','调整议题','当前状态','需要明确的内容','关联节点','你的决定','优先级','备注'],[[*x,'','',''] for x in decisions],[16,32,52,75,30,65,16,65],(5,6,7))
wb.close()
# Native editable PowerPoint and draw.io, sharing identical node IDs and descriptions.
NAVY='153F3A'; GREEN='207366'; MINT='EAF5F0'; BLUE='EAF1FC'; AMBER='FFF2DB'; GREY='F2F5F4'; INK='203A35'; MUTED='58716B'
prs=Presentation();prs.slide_width=Inches(19.2);prs.slide_height=Inches(10.8)
W,H=19.2,10.8
mx=ET.Element('mxfile',{'host':'app.diagrams.net','version':'24.7.17','type':'device'})
page_data=[]
def rgb(s):return RGBColor.from_string(s)
def txt(slide,x,y,w,h,text,size=16,color=INK,bold=False):
    box=slide.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h));tf=box.text_frame
    tf.clear();tf.word_wrap=True;tf.margin_left=Pt(0);tf.margin_right=Pt(0);tf.margin_top=Pt(0);tf.margin_bottom=Pt(0)
    for i,line in enumerate(text.split('\n')):
        p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text=line;p.font.name='微软雅黑';p.font.size=Pt(size);p.font.bold=bold;p.font.color.rgb=rgb(color);p.space_after=Pt(4)
    return box

def rect(slide,x,y,w,h,fill,stroke=None):
    s=slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h));s.fill.solid();s.fill.fore_color.rgb=rgb(fill)
    if stroke:s.line.color.rgb=rgb(stroke)
    else:s.line.fill.background()
    s.adjustments[0]=.07
    return s

def mxpage(title,index):
    dia=ET.SubElement(mx,'diagram',{'id':'page-'+str(index),'name':title});model=ET.SubElement(dia,'mxGraphModel',{'dx':'1600','dy':'900','grid':'1','gridSize':'10','guides':'1','tooltips':'1','connect':'1','arrows':'1','fold':'1','page':'1','pageScale':'1','pageWidth':'1600','pageHeight':'900','math':'0','shadow':'0'})
    root=ET.SubElement(model,'root');ET.SubElement(root,'mxCell',{'id':'0'});ET.SubElement(root,'mxCell',{'id':'1','parent':'0'});return root

def mxnode(root,id,title,desc,x,y,w,h,fill=GREY,badge='',font=16):
    content=f'<b>{html.escape(title)}</b><br><br>{html.escape(desc)}'
    if badge:content+='<br><br><font color="#58716B">'+html.escape(badge)+'</font>'
    c=ET.SubElement(root,'mxCell',{'id':id,'value':content,'style':f'rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=14;fillColor=#{fill};strokeColor=#CADBD4;fontColor=#{INK};fontSize={font};','vertex':'1','parent':'1'})
    ET.SubElement(c,'mxGeometry',{'x':str(x),'y':str(y),'width':str(w),'height':str(h),'as':'geometry'})

def mxedge(root,id,a,b,label=''):
    c=ET.SubElement(root,'mxCell',{'id':id,'value':label,'style':'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#89AAA0;fontSize=13;endArrow=block;','edge':'1','parent':'1','source':a,'target':b});ET.SubElement(c,'mxGeometry',{'relative':'1','as':'geometry'})

def base(title,subtitle,index):
    sl=prs.slides.add_slide(prs.slide_layouts[6]);sl.background.fill.solid();sl.background.fill.fore_color.rgb=rgb('F8FAF9')
    rect(sl,0,0,W,.16,GREEN);txt(sl,.62,.38,17.8,.54,title,27,NAVY,True)
    txt(sl,.65,1.02,17.8,.56,subtitle,13,MUTED)
    txt(sl,.65,10.30,16.7,.28,f'openAudit · 可编辑架构 V1 · {meta["date"]} · 节点编号与 Excel 对应 · 基线 {commit}',10,MUTED)
    txt(sl,18.1,10.28,.5,.3,str(index).zfill(2),11,MUTED)
    return sl

cover=base('个人审计工作台架构','用于完整调整入口、层级、功能、流程与个人工作边界',1)
rect(cover,.65,2.0,17.9,3.1,NAVY)
txt(cover,1.1,2.45,16.9,.9,'从“我今天要办理什么”出发',34,'FFFFFF',True)
txt(cover,1.12,3.55,16.6,1.1,'个人入口  →  项目资料与事实  →  审计事项办理  →  文书与质量控制  →  整改、归档及复用',21,'DAF0E6')
for i,(name,desc) in enumerate([('可以直接改图','全部节点为独立文字与形状，支持移动、改名、增删和重连。'),('可以逐项改需求','Excel 蓝色列可填写新名称、新上级、合并拆分、优先级和意见。'),('先分清现状与目标','已实现、部分实现、待规划和参考映射分开标记；同一编号对应同一功能。')]):
    x=.65+i*6.08;rect(cover,x,5.65,5.74,2.6,MINT if i<2 else AMBER);txt(cover,x+.25,5.98,5.2,.55,name,22,NAVY,True);txt(cover,x+.25,6.75,5.2,1.25,desc,17)
txt(cover,.8,8.85,17.5,.8,f'{len(nodes)} 个说明节点 · 24 项审计事项 · 8 类台账登记 · 19 条参考流程映射\n这是现状与调整底稿；本文件不改变线上平台。三个编辑格式不自动同步。',16,MUTED)
root=mxpage('00 使用说明',1)
mxnode(root,'cover','个人审计工作台架构｜V1',f'{len(nodes)} 个节点，24 项审计事项，8 类台账登记，19 条参考流程映射。所有节点与连接线可编辑；编号对应 Excel。',70,80,1450,260,MINT,font=28)
mxnode(root,'readme','如何调整','双击修改文字；拖动节点调整布局；拖动连线调整关系。建议在 Excel 同步记录调整后的名称、上级编号、处理方式与意见。三个文件不会自动互相同步，也不会改变线上平台。',70,410,1450,250,AMBER,font=24)
# A single zoomable tree supports restructuring the whole hierarchy in draw.io.
tree=mxpage('全量架构树｜全部节点可编辑','full')
positions={}; cursor=[65]
def place_tree(node,depth):
    direct=[n for n in nodes if n['parent']==node['id']]
    if direct:
        child_y=[place_tree(child,depth+1) for child in direct]
        y=(child_y[0]+child_y[-1])/2
    else:
        y=cursor[0];cursor[0]+=185
    positions[node['id']]=(65+depth*560,y)
    return y
place_tree(byid['ROOT'],0)
model=list(mx)[-1].find('mxGraphModel')
model.set('pageWidth','2350');model.set('pageHeight',str(cursor[0]+200))
for n in nodes:
    x,y=positions[n['id']]
    fill=AMBER if n['status']=='待规划' else BLUE if n['status']=='参考映射' else MINT if n['kind'] in ['菜单/页面','阶段入口','导航分组'] else 'FFFFFF'
    mxnode(tree,'tree-'+n['id'],n['id']+'｜'+n['name'],n['description'],x,y,490,155,fill,badge=n['status'],font=14)
    if n['parent']:mxedge(tree,'tree-edge-'+n['id'],'tree-'+n['parent'],'tree-'+n['id'])
# One or more detail pages for every parent, ensuring every node is visible.
parents=[]
def visit_parent(node):
    direct=[n for n in nodes if n['parent']==node['id']]
    if direct: parents.append(node)
    for child in direct: visit_parent(child)
visit_parent(byid['ROOT'])
for parent in parents:
    children_nodes=[n for n in nodes if n['parent']==parent['id']]
    for offset in range(0,len(children_nodes),9):
        batch=children_nodes[offset:offset+9];suffix=f'（{offset//9+1}/{math.ceil(len(children_nodes)/9)}）' if len(children_nodes)>9 else ''
        index=len(prs.slides)+1;title=f'{parent["id"]}｜{parent["name"]}{suffix}'
        sl=base(title,parent['description'],index);root=mxpage(title,index)
        color=AMBER if parent['status']=='待规划' else MINT
        rect(sl,.65,1.8,17.9,.65,color)
        txt(sl,.92,1.97,17.2,.35,f'上级节点 {parent["id"]}  ·  {parent["kind"]}  ·  {parent["status"]}  |  {parent["entry"] or parent["scope"]}',14,NAVY,True)
        mxnode(root,'parent-'+parent['id'],parent['id']+' '+parent['name'],parent['description'],55,35,1490,155,color,badge=parent['kind']+' · '+parent['status'],font=19)
        # Hierarchy connectors are behind cards; pages show grouping, not a forced execution order.
        for j,n in enumerate(batch):
            col,row=j%3,j//3;x=.65+col*6.08;y=2.75+row*2.40
            line=sl.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,Inches(9.6),Inches(2.45),Inches(x+2.87),Inches(y));line.line.color.rgb=rgb('CCDCD5');line.line.width=Pt(.75)
        for j,n in enumerate(batch):
            col,row=j%3,j//3;x=.65+col*6.08;y=2.75+row*2.40
            fill=AMBER if n['status']=='待规划' else BLUE if n['status']=='参考映射' else 'FFFFFF'
            rect(sl,x,y,5.74,2.16,fill,'D6E3DC')
            txt(sl,x+.22,y+.14,5.28,.24,n['id']+'  ·  '+n['status'],11,GREEN,True)
            title_lines=math.ceil(sum(1 if ord(c)<128 else 1.8 for c in n['name'])/47)
            name_size=16 if len(n['name'])>20 else 18
            title_h=.65
            txt(sl,x+.22,y+.45,5.28,title_h,n['name'],name_size,NAVY,True)
            desc_y=y+1.18
            txt(sl,x+.22,desc_y,5.28,.65,n['description'],13.5,INK)
            txt(sl,x+.22,y+1.89,5.28,.22,'范围：'+n['scope'],9.5,MUTED)
            dx=55+col*505;dy=215+row*220
            mxnode(root,n['id'],n['id']+'｜'+n['name'],n['description'],dx,dy,480,195,fill,badge=n['status']+' · '+n['scope'],font=16)
            mxedge(root,'edge-'+n['id'],'parent-'+parent['id'],n['id'])
        sl.notes_slide.notes_text_frame.text='\n\n'.join(n['id']+' '+n['name']+'\n功能：'+n['description']+'\n输入：'+n['inputs']+'\n操作：'+n['actions']+'\n输出：'+n['outputs']+'\n边界：'+n['boundary'] for n in batch)
        page_data.append({'page':index,'parent':parent['id'],'nodes':[n['id'] for n in batch]})
# A dedicated relational diagram makes the separation of evidence, formal records and personal work explicit.
index=len(prs.slides)+1
sl=base('办理路径与数据关系','业务关系示意：人员按实际分工办理；归档与整改分别推进，当前没有自动派单流程引擎。',index)
root=mxpage('办理路径与数据关系',index)
flowids=['P','M','FA','ST-A','ST-B','ST-C','ST-D','ST-E','F01','F02','F04','W','L','R03','U05']
coords={'P':(.7,2.0),'M':(4.4,2.0),'FA':(8.1,2.0),'R03':(11.8,2.0),'U05':(15.5,2.0),'ST-A':(.7,4.5),'ST-B':(4.4,4.5),'ST-C':(8.1,4.5),'ST-D':(11.8,4.5),'ST-E':(15.5,4.5),'W':(.7,7.0),'L':(4.4,7.0),'F04':(8.1,7.0),'F01':(11.8,7.0),'F02':(15.5,7.0)}
flowedges=[('P','M'),('M','FA'),('M','R03'),('R03','U05'),('ST-A','ST-B'),('ST-B','ST-C'),('ST-C','ST-D'),('ST-D','ST-E'),('ST-E','F01'),('ST-E','F04'),('F01','F02'),('F04','W')]
for a,b in flowedges:
    x,y=coords[a];xx,yy=coords[b]
    line=sl.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,Inches(x+1.55),Inches(y+1.8),Inches(xx+1.55),Inches(yy));line.line.color.rgb=rgb('8CAC9F');line.line.width=Pt(1.2)
    end=LET.SubElement(line._element.spPr.get_or_add_ln(),'{http://schemas.openxmlformats.org/drawingml/2006/main}tailEnd',{'type':'triangle'})
for id in flowids:
    n=byid[id];x,y=coords[id];rect(sl,x,y,3.1,1.8,'FFFFFF','CADBD4');txt(sl,x+.16,y+.15,2.78,.28,id,11,GREEN,True);txt(sl,x+.16,y+.49,2.78,.47,n['name'],15,NAVY,True);txt(sl,x+.16,y+1.0,2.78,.67,n['description'],10.5,INK)
    mxnode(root,id,id+'｜'+n['name'],n['description'],x*80,y*80,248,144,font=14)
for i,(a,b) in enumerate(flowedges):mxedge(root,'flow-'+str(i),a,b)
sl.notes_slide.notes_text_frame.text='完整的跨页面关系与约束见 Excel“流程与数据关系”。连线说明业务关系，不表示系统自动流转。'
# Every non-root node must appear as an independently editable card.
visible={id for p in page_data for id in p['nodes']}
assert visible==set(byid)-{'ROOT'},set(byid)-visible
ppt_path=OUT/'个人审计工作台架构图-V1.pptx';prs.save(ppt_path)
ET.indent(mx);ET.ElementTree(mx).write(OUT/'个人审计工作台架构图-V1.drawio',encoding='utf-8',xml_declaration=True)
# Verify package integrity and shape geometry, plus XML and spreadsheet dimensions.
for sl in prs.slides:
    for shape in sl.shapes:
        assert shape.left >= -10 and shape.top>=-10
        assert shape.left+shape.width<=prs.slide_width+100 and shape.top+shape.height<=prs.slide_height+100
for file in [ppt_path,OUT/'工作台功能清单与调整表-V1.xlsx']:
    with zipfile.ZipFile(file) as z: assert z.testzip() is None
ET.parse(OUT/'个人审计工作台架构图-V1.drawio')
report={'nodeCount':len(nodes),'scenarioCount':len(scenes),'workflowForms':len(source['forms']),'referenceNodes':len(refdesc),'slides':len(prs.slides),'drawioPages':len(mx),'inputFields':len(fields),'operations':len(ops),'baselineCommit':commit,'allNodesHaveDescription':True,'allNodesHaveEditableShapes':True,'packageIntegrity':'passed','pages':page_data}
(OUT/'文件校验.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'使用说明.txt').write_text('\n'.join([meta['title'],f'基线：{meta["date"]} / {commit}',f'共 {len(nodes)} 节点，{len(prs.slides)} 页架构图，24 项审计事项，8 类台账，19 条参考流程映射。','',
'1. 工作台功能清单与调整表-V1.xlsx：建议作为修改主稿，填写蓝色栏目；含全部节点、事项、字段、操作、岗位、流程关系、参考流程、调整重点。',
'2. 个人审计工作台架构图-V1.pptx：用 WPS 演示或 PowerPoint 打开；每个节点都是可编辑形状和文字，可移动、改名、增删。',
'3. 个人审计工作台架构图-V1.drawio：用 diagrams.net 或兼容编辑器打开；含全量架构树及模块分图；图形和连接线均可编辑，按底部分页切换。',
'4. 架构节点数据.json：结构化节点底稿，可供后续导入和核对。',
'',*meta['notes'],'',
'修改建议：保留原编号；改名称填“调整后名称”；移动填“调整后上级编号”；合并或拆分请写清目标编号；新增节点请使用新编号。完成后提供修改后的任一文件即可据此继续调整。',
'待规划部分只列讨论项，当前未上线。个人偏好仍为浏览器级，岗位推荐不等于正式权限。',
'业务参考来自用户提供文件，不将其中案例数字、日期或法规适用结论视为当前项目事实。']),encoding='utf-8')
zip_path=OUT.parent/'个人审计工作台架构-V1-可编辑文件包.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.iterdir()):
        if p.is_file() and p.suffix in ['.pptx','.xlsx','.drawio','.json','.txt']:z.write(p,'工作台架构-V1/'+p.name)
print(json.dumps({k:v for k,v in report.items() if k!='pages'},ensure_ascii=False,indent=2))
