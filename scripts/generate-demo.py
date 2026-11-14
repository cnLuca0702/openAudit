#!/usr/bin/env python3
"""Build deterministic business fixtures, genuine office/media files and isolated truth.
演示模拟数据. Dependencies and reproduction instructions: demo/README.md.
"""
from pathlib import Path
import csv, hashlib, io, json, mimetypes, re, shutil, subprocess, zipfile, wave
from datetime import datetime, timezone
from xml.sax.saxutils import escape
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin
import cairosvg, imageio_ffmpeg, pymupdf
ROOT=Path(__file__).resolve().parents[1]; D=ROOT/'demo'; LABEL='演示模拟数据'
PID='DEMO-AUDIT-2027-006'; NAME='澄川市南岸片区雨污分流与道路更新工程'
SECOND='DEMO-AUDIT-2027-009'; NOW='2026-11-14T00:00:00Z'
FIXED=datetime(2026,11,14,tzinfo=timezone.utc)
for p in ['materials/initial','materials/feedback','materials/review','materials/rectification','media','truth']: (D/p).mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('AuditCJK','/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',subfontIndex=0))
FONT='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
docs=[]
def jwrite(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def stable_zip(path):
 with zipfile.ZipFile(path) as f: contents=[(i.filename,f.read(i.filename)) for i in f.infolist()]
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as f:
  for name,b in contents:
   if name=='docProps/core.xml':b=re.sub(rb'(<dcterms:modified[^>]*>).*?(</dcterms:modified>)',rb'\g<1>2026-11-14T00:00:00Z\g<2>',b)
   z=zipfile.ZipInfo(name,(2026,11,14,0,0,0));z.compress_type=zipfile.ZIP_DEFLATED;f.writestr(z,b)
def office(title,lines,path):
 doc=Document(); s=doc.sections[0];s.top_margin=Cm(2);s.bottom_margin=Cm(2)
 style=doc.styles['Normal'];style.font.name='微软雅黑';style.font.size=Pt(10.5);style.element.rPr.rFonts.set(qn('w:eastAsia'),'微软雅黑')
 s.header.paragraphs[0].text=f'openAudit  |  {LABEL}  |  {PID}'
 doc.add_heading(title,0);doc.add_paragraph(LABEL,'Subtitle')
 for line in lines:doc.add_paragraph(line)
 s.footer.paragraphs[0].text='模拟材料，不作为真实审批、支付或审计结论。'
 doc.core_properties.created=FIXED;doc.core_properties.modified=FIXED;doc.core_properties.author='openAudit 演示资料生成器';doc.save(path);stable_zip(path)
def pdf(title,lines,path):
 c=canvas.Canvas(str(path),pagesize=(595.28,841.89),invariant=1);c.setTitle(f'{LABEL}｜{title}');c.setAuthor('openAudit')
 y=770
 def header():
  c.setFillColorRGB(.08,.2,.35);c.setFont('AuditCJK',10);c.drawString(42,810,f'{LABEL} | {PID}');c.setFillColorRGB(0,0,0)
 header(); c.setFont('AuditCJK',17);c.drawString(42,y,title);y-=35
 for line in [LABEL]+lines:
  for chunk in [line[i:i+43] for i in range(0,len(line),43)]:
   if y<60:c.showPage();header();y=770
   c.setFont('AuditCJK',11);c.drawString(42,y,chunk);y-=19
 c.save()
def sheet(title,rows,path):
 wb=Workbook();ws=wb.active;ws.title='数据';ws.append([LABEL,title]);keys=list(dict.fromkeys(k for r in rows for k in r))
 ws.append(keys)
 for r in rows:ws.append([json.dumps(r.get(k),ensure_ascii=False) if isinstance(r.get(k),(list,dict)) else r.get(k) for k in keys])
 ws.freeze_panes='A3';ws.auto_filter.ref=f'A2:{ws.cell(2,len(keys)).column_letter}{ws.max_row}'
 for cell in ws[2]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='173B5C')
 for col in ws.columns:ws.column_dimensions[col[0].column_letter].width=24
 wb.properties.created=FIXED;wb.properties.modified=FIXED;wb.save(path);stable_zip(path)
def csvfile(rows,path):
 keys=list(dict.fromkeys(k for r in rows for k in r))
 with path.open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(rows)
def add(id,title,kind,batch='initial',lines=None,rows=None,fmt='docx',version=1,logical=None,project=PID,status='pending',**extra):
 rows=[dict(r,label=LABEL) for r in (rows or [])]
 for r in rows:
  subtype=r.get('type',kind);r['recordSubtype']=subtype
  r['type']=kind
  if kind=='measurement':r['segmentId']=r.get('segment');r['projectId']=r.get('projectId',project)
  if kind=='project':
   r.setdefault('owner','澄川市南岸建设事务中心');r.setdefault('name',title)
   if r.get('totalInvestment') is not None:r.update(approvedInvestment=48600,ledgerInvestment=r['totalInvestment'])
   if r.get('to'):r['successor']=r['to'];r['owner']=r['from']
  if kind=='payment':
   r['payee']=r.get('counterparty','澄川泽远市政工程有限公司' if r.get('contractId')=='C01' else '澄川清序工程咨询有限公司')
   if subtype!='payment':r['type']=subtype
  if kind=='drawing':r.update(segmentId=r.get('segment'),component=r.get('diameter','DN600污水管'),legend='蓝色污水管、绿色雨水管；按标注净长度',region=r.get('region','图纸全幅'),parameterConfirmed=False,readable=True)
  if kind=='inventory':
   r.update(assetId=r.get('itemId'),name=r.get('item'),issuedNotPosted=r.get('issuedQuantity',0))
   if subtype=='issue':r['type']='issue'
  if kind=='count':r.update(assetId=r.get('itemId'),confirmed=False,conversionFactor=.1 if r.get('unit')=='件' and r.get('itemId')=='SEAL-B' else 1,conversionConfirmed=False)
  if kind=='feedback':r.update(issueIds=r.get('issueIds',[r.get('issueId',r['id'])]),claim=r.get('opinion',r.get('requirement',title)),receivedDate='2027-08-11',deadlineDays=10,deadlineBasis='人工设置的演示期限，待核验适用性')
  if kind=='review':r.update(targetId=r.get('targetDocumentId',r.get('issueId','E-REPORT-V2')),response=r.get('reply',''))
  if kind=='requirement':r.update(phase='archive' if batch=='rectification' else 'review' if batch=='review' else 'preparation',title=r.get('name',title),requiredVersion=r.get('expectedVersion',r.get('requiredVersion')))
  if kind=='report':
   if subtype=='workpaper':r['type']='workpaper'
   if r.get('issueId') in ['ISSUE-MEASURE','ISSUE-INVEST'] and subtype!='workpaper':r['factRef']='WP-01' if r['issueId']=='ISSUE-MEASURE' else 'WP-02'
   r.update(title=r.get('issueId',title),text='；'.join(lines or []),sampleScope='two-period-sample',claimScope='all' if r.get('scope')=='全部管网' else 'sample',evidenceIds=r.get('sourceIds',['B-MEASUREMENTS','B-LOG']),lawIds=['LAW-02'] if r.get('issueId')=='ISSUE-INVEST' else ['LAW-08'],behaviorDate='2027-06-30')
   if id=='E-REPORT-V2' and r['id']=='FINAL-1':r.update(factRef='WP-01',attachmentAmount=21.6,attachmentUnit='万元',dateSourceId='ACC-MAY')
  if kind=='rectification':
   if subtype=='rectificationTask':r.update(recordKind='requirement',responsible=r.get('subject','澄川市南岸建设事务中心'),recipient='澄川市南岸建设事务中心')
   if subtype=='rectificationEvidence':r.update(recordKind='proof',recipient='澄川市南岸建设事务中心',voucherId=r['id'],bankVerified=False,proofType=r.get('proofType','到账凭证待核'),offsetVerified=False)
   if subtype=='followup':r.update(recordKind='followup',period='2027-09',recurred=True,confirmed=False)
   if subtype=='measurement':r['type']='measurement';r['segmentId']=r['segment']
  if kind=='media':r.update(statement=r.get('visible',r.get('subject',title)),checkpoint=r.get('segment','NA-WS-01'),location='南岸路0+240至0+360',captureTimeVerified=False)
 for i,r in enumerate(rows):r.setdefault('locator',f'数据!第{i+3}行' if fmt=='xlsx' else f'第{i+2}行' if fmt=='csv' else f'正文段落{4+len(lines or [])+i}／记录{i+1}' if fmt=='docx' else f'第1页／记录{i+1}')
 lines=lines or []; text='\n'.join([LABEL,title,f'项目：{NAME if project==PID else "澄川市北溪支路海绵化改造工程"}；编号：{project}']+lines)
 if rows:text+='\n'+'\n'.join('；'.join(f'{k}={v}' for k,v in r.items()) for r in rows)
 path=D/f'materials/{batch}/{id}.{fmt}';blines=text.splitlines()[2:]
 if fmt=='docx':office(title,blines,path)
 elif fmt=='pdf':pdf(title,blines,path)
 elif fmt=='xlsx':sheet(title,rows,path)
 elif fmt=='csv':csvfile(rows,path)
 elif fmt=='json':jwrite(path,{'label':LABEL,'title':title,'kind':kind,'records':rows,'text':text})
 else:path.write_text(text,encoding='utf-8')
 for i,r in enumerate(rows):r.setdefault('locator',f'数据!第{i+3}行' if fmt=='xlsx' else f'第{i+2}行' if fmt=='csv' else f'正文段落{4+len(lines or [])+i}／记录{i+1}' if fmt=='docx' else f'第1页／记录{i+1}')
 d=dict(id=id,name=title+f'.{fmt}',logicalId=logical or id,version=version,status=status,kind=kind,batch=batch,stage={'initial':'A/B','feedback':'C','review':'D/E','rectification':'F'}[batch],projectId=project,path=path.relative_to(D).as_posix(),source=f'openAudit 全新生成的虚构提供方材料；{LABEL}',text=text,records=rows,createdAt=NOW,parseStatus='supplied-records-needs-verification',**extra)
 docs.append(d);return d
project=dict(id=PID,name=NAME,label=LABEL,datasetVersion='2026.11.14-v3',type='市政工程',budgetWan=48600,ledgerInvestmentWan=50200,currency='CNY',auditPeriod='2027-01-01/2027-09-30')
add('A-PLAN','年度审计项目计划节选','project',lines=['澄审计演示计划〔2027〕06号。拟审计2027年度建设资金管理及工程计量支付。','审计对象：澄川市南岸建设事务中心（虚构）；范围及程序须人工审定。'],rows=[{'id':'PRJ-1','projectId':PID,'name':NAME,'type':'project','subject':'澄川市南岸建设事务中心','period':'2027-01-01/2027-09-30'}])
add('A-APPROVAL','初步设计与投资概算批复节选','approval',fmt='pdf',lines=['澄发改演示〔2027〕06号。批准概算48600万元。批准日2027-02-18，文件形成日2027-02-20。','范围：南岸路雨污管网及路面更新；附属景观提升不在本次批复列明范围。'],rows=[{'id':'APP-1','type':'approval','subject':'初步设计概算','amount':48600,'unit':'万元','date':'2027-02-18','dateRole':'批准日','budget':48600}])
for v,amt in [(1,48600),(2,50200)]:
 add(f'A-LEDGER-V{v}','项目基本台账','project',fmt='xlsx',version=v,logical='project-ledger',rows=[{'id':f'LEDGER-{v}','type':'project','projectId':PID,'name':NAME,'shortName':'南岸雨污道路工程','totalInvestment':amt,'amount':amt,'unit':'万元','date':f'2027-0{v+2}-01','dateRole':'台账填报日','note':'台账投资口径待与批复核对；未提供调整概算批文'}])
add('A-HANDOVER','建设管理主体移交通知','project',lines=['2027-05-01起，由澄川市南岸建设事务中心接续原澄川市市政更新办公室的建设管理职责。','通知未附资产移交及合同移交清单；不能据此推断不存在清单。'],rows=[{'id':'HANDOVER-1','type':'event','date':'2027-05-01','dateRole':'职责移交日','subject':'建设单位职责移交','from':'澄川市市政更新办公室','to':'澄川市南岸建设事务中心','missingAttachment':'资产及合同移交清单'}])
add('A-DECLARATION','资料真实性承诺与账户申报表','project',lines=['声明仅供演示，无真实签名公章。账户为不可用于交易的模拟标识。','申报账户DEMO-ACCOUNT-01；账簿目录另列DEMO-ACCOUNT-02，需补充申报说明。'],rows=[{'id':'ACC-01','type':'account','accountId':'DEMO-ACCOUNT-01','declared':True},{'id':'ACC-02','type':'account','accountId':'DEMO-ACCOUNT-02','declared':False,'ledgerListed':True}])
add('A-DECLARATION-SUPP','账户补充申报说明','project','feedback',lines=['补报DEMO-ACCOUNT-02为工程保函保证金专户；补表不自动证明此前申报无误，保留历史核实记录。'],rows=[{'id':'ACC-02-S','type':'account','accountId':'DEMO-ACCOUNT-02','declared':True}])
add('A-REQUESTS','审前应收资料清单','requirement',fmt='xlsx',rows=[{'id':f'REQ-{i+1}','type':'requirement','requiredKind':k,'name':n,'required':True} for i,(k,n) in enumerate([('approval','批复'),('contract','合同及补充协议'),('payment','支付流水'),('measurement','计量清单'),('handover','资产及合同移交清单'),('acceptance','验收记录')])])
add('A-TEMPLATES','审前文书包模板','template',lines=['实施方案：项目、对象、期间、目标、事项、方法、拟取得证据、人工职责及批准栏。','通知书：文号待填、审计对象、范围、实施日期待定、附件提供资料清单。','资料清单：概算、合同变更、签证、计量、银行流水、验收、台账；范围需人工确认。','公告草案：仅用于演示；不得外发。','既定角色：主审（模拟角色甲）、工程审核（模拟角色乙）、法规复核（模拟角色丙）。不含人员推荐。'],rows=[{'id':'TPL-A','type':'template','templateType':'实施方案/通知书/资料清单/审前公告','requiredFields':'项目,对象,期间,范围,方法,依据,审批'}])
add('B-TENDER','三个合同包决策与招采范围表','approval',fmt='xlsx',rows=[{'id':'DEC-C01','type':'approval','contractId':'C01','subject':'雨污管网施工','scope':'DN600污水管与DN800雨水管，南岸路0+000至0+600','amount':28600,'unit':'万元','date':'2027-03-12'},{'id':'DEC-C02','type':'approval','contractId':'C02','subject':'道路更新施工','scope':'路面铣刨和恢复，不含景观灯','amount':9800,'unit':'万元','date':'2027-03-12'},{'id':'DEC-C03','type':'approval','contractId':'C03','subject':'监理服务','scope':'工程全过程监理','amount':480,'unit':'万元','date':'2027-03-12'}])
for v,ratio,batch in [(1,.80,'initial'),(2,.85,'review')]:
 add(f'B-CONTRACT-C01-V{v}','管网施工合同','contract',batch,fmt='pdf',version=v,logical='contract-C01',lines=[f'合同C01；甲方澄川市南岸建设事务中心，乙方澄川泽远市政工程有限公司（均虚构）。合同总价28600万元。',f'第12.3条：经监理核定且验收资料完整的计量金额，进度支付比例为{int(ratio*100)}%；无验收证明暂缓核定。','清单Q-DN600：DN600污水管，按同一轴线实际完成净长度计量，综合单价1800元/米；同一管段不得重复申报。', 'V1签署日2027-03-28；V2补充协议形成日2027-07-15、拟自2027-07-01适用，签署效力及是否改变招标实质内容待人工核验。' if v==2 else '签署日2027-03-28，实际开工记录与签署日期分别管理。'],rows=[{'id':f'CON-C01-{v}','type':'contract','contractId':'C01','subject':'管网施工','amount':28600,'unit':'万元','paymentRatio':ratio,'paymentRate':ratio,'unitPrice':1800,'priceUnit':'元/米','clause':'12.3','date':'2027-03-28' if v==1 else '2027-07-15','dateRole':'合同签署日' if v==1 else '补充协议形成日','effectiveFrom':'2027-03-28' if v==1 else '2027-07-01','scope':'DN600污水管/南岸路0+000至0+600','requiresAcceptance':True}],previousId='B-CONTRACT-C01-V1' if v==2 else None)
for cid,title,amt,scope in [('C02','道路更新施工合同',9800,'路面铣刨、恢复及景观灯增设'),('C03','工程监理服务合同',480,'全过程监理及月度履约报告')]:
 add('B-CONTRACT-'+cid,title,'contract',fmt='docx',lines=[f'合同{cid}，合同金额{amt}万元；范围：{scope}。','支付需合同约定的成果及验收证明。'],rows=[{'id':'CON-'+cid,'type':'contract','contractId':cid,'amount':amt,'unit':'万元','scope':scope,'paymentRatio':.8,'requiresAcceptance':True,'date':'2027-03-29'}])
measure=[{'id':'MEAS-05','type':'measurement','contractId':'C01','period':'2027-05','segment':'NA-WS-01','pipeId':'NA-WS-01','item':'DN600污水管','start':0,'end':360,'startM':0,'endM':360,'quantity':360,'unit':'米','unitPrice':1800,'amount':648000,'amountUnit':'元','drawingId':'DWG-01','date':'2027-05-31'}, {'id':'MEAS-06','type':'measurement','contractId':'C01','period':'2027-06','segment':'NA-WS-01','pipeId':'NA-WS-01','item':'DN600污水管','start':240,'end':600,'startM':240,'endM':600,'quantity':360,'unit':'米','unitPrice':1800,'amount':648000,'amountUnit':'元','drawingId':'DWG-01','date':'2027-06-30'}, {'id':'MEAS-06-R','type':'measurement','contractId':'C01','period':'2027-06','segment':'NA-YS-02','pipeId':'NA-YS-02','item':'DN800雨水管','start':240,'end':600,'startM':240,'endM':600,'quantity':360,'unit':'米','unitPrice':2300,'amount':828000,'amountUnit':'元','drawingId':'DWG-01','date':'2027-06-30'}]
add('B-MEASUREMENTS','五月六月计量申请明细','measurement',fmt='xlsx',rows=measure,lines=['不同管线即使桩号重合也不能直接合并。'])
payments=[{'id':'PAY-051','type':'payment','contractId':'C01','date':'2027-06-05','amount':518400,'unit':'元','transactionId':'TX-051','invoiceId':'INV-05','measurementId':'MEAS-05','acceptanceId':'ACC-MAY','subject':'进度支付','direction':'out','counterparty':'澄川泽远市政工程有限公司'}, {'id':'PAY-061','type':'payment','contractId':'C01','date':'2027-07-05','amount':51.84,'unit':'万元','transactionId':'TX-061','invoiceId':'INV-06','measurementId':'MEAS-06','acceptanceId':'','subject':'进度支付','direction':'out','counterparty':'澄川泽远市政工程有限公司'}, {'id':'PAY-071','type':'payment','contractId':'C03','date':'2027-07-09','amount':300000,'unit':'元','transactionId':'TX-071','invoiceId':'INV-MON','subject':'监理服务误付','direction':'out','counterparty':'澄川清序工程咨询有限公司'}, {'id':'PAY-072','type':'payment','contractId':'C03','date':'2027-07-10','amount':-300000,'unit':'元','transactionId':'TX-072','reversalOf':'PAY-071','originalTransactionId':'TX-071','subject':'原路冲回','direction':'in','counterparty':'澄川清序工程咨询有限公司'}, {'id':'PAY-073','type':'payment','contractId':'C03','date':'2027-07-11','amount':300000,'unit':'元','transactionId':'TX-073','invoiceId':'INV-MON','subject':'更正后重付','direction':'out','counterparty':'澄川清序工程咨询有限公司'}]
add('B-PAYMENTS','银行支付流水','payment',fmt='csv',rows=payments)
add('B-FINANCE','财务明细账','payment',fmt='xlsx',rows=[dict(r,id='BOOK-'+r['id'],transactionId=r['transactionId'],note='同一银行交易的账簿视图，不可重复汇总') for r in payments])
add('B-PAY-REQUEST','六月工程款支付申请','payment',lines=['申请金额648000元；按V1的80%比例申请支付518400元，银行流水以51.84万元记载。','计量依据MEAS-06；本包未提供六月验收记录，监理核定及付款条件仍需核实。'],rows=[{'id':'REQ-PAY-JUN','type':'paymentRequest','contractId':'C01','measurementId':'MEAS-06','amount':648000,'requestedPayment':518400,'unit':'元','date':'2027-07-02','acceptanceId':''}])
add('B-INVOICE','工程结算发票模拟样张','payment',fmt='pdf',lines=['票号SIM-INV-06（不可报销）；收款方澄川泽远市政工程有限公司。','项目雨污管网；价税合计648000元；开具日2027-07-01；无真实税务二维码。'],rows=[{'id':'INV-06','type':'invoice','contractId':'C01','amount':648000,'unit':'元','date':'2027-07-01'}])
add('B-REVERSAL','冲回及重付说明','payment',lines=['TX-071于2027-07-09误付300000元；TX-072于次日原路冲回-300000元，关联原交易TX-071。','2027-07-11 TX-073更正后支付300000元；三笔应按同一业务链复算，不将同额两笔直接判为重复付款。'],rows=[{'id':'REV-1','type':'reversal','originalId':'PAY-071','reversalId':'PAY-072','replacementId':'PAY-073','amount':300000,'unit':'元'}])
add('B-ACCEPTANCE','五月分段验收记录','acceptance',fmt='pdf',lines=['验收对象NA-WS-01，0+000至0+360；验收日期2027-05-30。','本件是演示记录，无真实签字、印章；不覆盖六月申报范围。'],rows=[{'id':'ACC-MAY','type':'acceptance','contractId':'C01','segment':'NA-WS-01','start':0,'end':360,'date':'2027-05-30','scope':'五月申报范围','status':'模拟合格'}])
add('B-LOG','施工日志与现场核查记录','media',lines=['2027-02-10记录“进场准备”，2027-03-30正式管道开挖。不可将前者直接当主体工程开工。','2027-06-30现场检查NA-WS-01的0+240至0+360，标识同一DN600污水管；存在局部可见沟槽，回填完成时间待核。','现场测量仅为模拟读数；测量工具、方法与签字需人工复核。'],rows=[{'id':'EV-01','type':'event','subject':'进场准备','date':'2027-02-10','dateRole':'日志记载日'},{'id':'EV-02','type':'event','subject':'主体工程开工','date':'2027-03-30','dateRole':'实际开工日'},{'id':'SITE-01','type':'site','segment':'NA-WS-01','start':240,'end':360,'date':'2027-06-30','visible':'局部沟槽可见','measurementSource':'模拟人工实测记录'}])
add('B-PREWORK','前期准备工作说明','approval','feedback',lines=['2027-02-10仅围挡及设备入场，主体管道施工记录为2027-03-30。','对日志日期作语义澄清，不据此自动认定开工手续齐全。'],rows=[{'id':'EV-01-CLARIFY','type':'event','subject':'围挡与设备进场','date':'2027-02-10','dateRole':'前期准备日','clarifies':'EV-01'}])
add('B-DRAWING-NOTES','图纸目录、设计说明与图例','drawing',lines=['DWG-01 V1：平面示意，NA-WS-01为DN600污水管，NA-YS-02为DN800雨水管，均0+000至0+600。','红框0+240至0+360为待核区间，尺寸以标注为准，本示意不可按屏幕比例测量。','纵剖管底标高示例缺清晰读数，保持待人工确认；不得补造。'],rows=[{'id':'DWG-01','type':'drawing','segment':'NA-WS-01','drawingVersion':'V1','length':600,'unit':'米','diameter':'DN600','parameterStatus':'长度为模拟设计标注，管底标高待核','region':'x=480,y=190,w=180,h=195'}])
add('B-INVENTORY','仓储及领用台账','inventory',fmt='xlsx',rows=[{'id':'INV-PIPE','type':'inventory','item':'DN600短管','itemId':'PIPE-A','location':'一号库A区','bookQuantity':12,'quantity':12,'unit':'件','issuedQuantity':2},{'id':'INV-SEAL','type':'inventory','item':'密封圈','itemId':'SEAL-B','location':'一号库B区','bookQuantity':5,'quantity':5,'unit':'箱','conversionFactor':10,'baseUnit':'件'}])
add('B-COUNTS','现场盘点记录','count',fmt='csv',rows=[{'id':'COUNT-PIPE','type':'count','itemId':'PIPE-A','item':'DN600短管','actualQuantity':10,'quantity':10,'unit':'件','photoIds':'PHOTO-A,PHOTO-A-DUP','countMethod':'模拟人工复点','date':'2027-07-03'},{'id':'COUNT-SEAL','type':'count','itemId':'SEAL-B','item':'密封圈','actualQuantity':50,'quantity':50,'unit':'件','countMethod':'模拟人工逐件清点','date':'2027-07-03'}])
add('B-ISSUE','材料领用单','inventory',lines=['2027-07-02领用DN600短管2件，领用号ISS-01，库房台账尚未记出库。','照片PHOTO-A-DUP与PHOTO-A为同一视角重复文件，不能累计作为20件。'],rows=[{'id':'ISS-01','type':'issue','itemId':'PIPE-A','quantity':2,'unit':'件','date':'2027-07-02','posted':False}])
add('B-WORKPAPER-TPL','取证单与工作底稿模板','template',lines=['事项编号、事实状态、原始证据ID/版本/定位、复算公式、异常及反例、待补资料、制表及复核角色。','转换链：现场记录→取证单→底稿→问题清单；每一步保留未经确认的限定。'],rows=[{'id':'TPL-B','type':'template','templateType':'取证单/底稿/核查表','requiredFields':'事项,事实,来源,金额口径,核实状态,人工复核'}])
add('C-WORKPAPER','重复计量核查底稿模拟前序稿','report','feedback',lines=['本件为人工编制的模拟前序输入，不代表系统运行成果。','抽查MEAS-05与MEAS-06，均指向NA-WS-01；区间交集0+240至0+360为120米。','120米×1800元/米=216000元=21.6万元，属于潜在重复申报计量金额，不直接等同已多付金额。','付款V1比例80%下对应172800元仅为推算；实际核定、支付及扣款需另证。','投资台账50200万元与批复48600万元差1600万元，口径及调整依据尚未取得。'],rows=[{'id':'WP-01','type':'workpaper','issueId':'ISSUE-MEASURE','amount':216000,'unit':'元','scope':'抽查两期同一管段','sourceIds':['B-MEASUREMENTS','B-DRAWING-NOTES','B-LOG'],'status':'模拟前序待确认'},{'id':'WP-02','type':'workpaper','issueId':'ISSUE-INVEST','amount':1600,'unit':'万元','status':'待补证'}])
add('C-REPORT-V1','审计报告征求意见稿','report','feedback',version=1,logical='audit-report',lines=['模拟前序稿。抽查发现NA-WS-01疑似重复申报计量21.6万元，待结合签证和反馈核实。','投资口径差异1600万元尚待核实，不作超概算结论。','主体简称“南岸雨污道路工程”需核验是否同一项目。'],rows=[{'id':'REPORT-L1','type':'report','issueId':'ISSUE-MEASURE','amount':21.6,'unit':'万元','scope':'抽查','status':'待核实'},{'id':'REPORT-L2','type':'report','issueId':'ISSUE-INVEST','amount':1600,'unit':'万元','status':'待核实'}])
add('C-TEAM-MEETING','审计组内部讨论记录','feedback','feedback',lines=['审计组内部讨论，2027-08-10；参加角色甲、乙，无真实人员。','意见一：核实同一管段与计量范围，不将疑似重复申报直接写成损失。','意见二：投资口径材料不足，保留限定；组内讨论不代替业务部门或审理会议。'],rows=[{'id':'TEAM-01','type':'teamDiscussion','issueId':'ISSUE-MEASURE','requirement':'补核签证与管线标识','owner':'主审（模拟）','status':'pending'}])
add('C-FEEDBACK','被审计单位反馈函与说明','feedback','feedback',lines=['2027-08-18反馈；模拟签收日2027-08-11，期限适用由人工核验。','意见FB-01：南岸雨污道路工程为同一项目简称，附项目编号一致说明。','意见FB-02：施工单位称六月范围含新增管段，但未提供新增管线图及签证，请继续核实。','意见FB-03：台账50200含拟增项目，尚不能提供完整口径表及调整批复。'],rows=[{'id':'FB-01','type':'feedback','issueId':'ISSUE-NAME','opinion':'简称一致','evidence':'项目编号DEMO-AUDIT-2027-006相同','decision':'待人工决定'},{'id':'FB-02','type':'feedback','issueId':'ISSUE-MEASURE','opinion':'声称新增管段','evidence':'未附变更签证','decision':'待补证'},{'id':'FB-03','type':'feedback','issueId':'ISSUE-INVEST','opinion':'台账含拟增项目','evidence':'未附口径明细','decision':'待补证'}])
add('C-EVIDENCE-SUPP','计量复核及简称补证记录','feedback','feedback',lines=['模拟施工资料员与工程审核角色复核：两期申报对应同一NA-WS-01，交集0+240至0+360；无另建平行DN600管线的材料。','项目简称对应同一项目编号；简称差异可由人排除。','结论须由有权人员根据证据签认；本件无真实签字。'],rows=[{'id':'SUP-01','type':'evidence','issueId':'ISSUE-MEASURE','segment':'NA-WS-01','start':240,'end':360,'quantity':120,'unit':'米','sourceIds':['MEAS-05','MEAS-06']},{'id':'SUP-02','type':'evidence','issueId':'ISSUE-NAME','projectId':PID,'sameProject':True}])
add('D-SUBMISSION','送审材料目录','requirement','review',fmt='xlsx',rows=[{'id':'SUB-1','type':'requirement','requiredKind':'report','name':'报告具体版本','expectedDocumentId':'E-REPORT-V2','required':True},{'id':'SUB-2','type':'requirement','requiredKind':'feedback','name':'最新反馈处理说明','expectedVersion':2,'required':True},{'id':'SUB-3','type':'requirement','requiredKind':'workpaper','name':'经审核底稿','required':True},{'id':'SUB-4','type':'requirement','requiredKind':'implementation','name':'复核意见落实说明','required':True}])
add('D-REVIEW','业务部门复核与审理意见','review','review',lines=['2027-08-25，RV-01：报告如写全部项目均存在重复计量，超出两期抽查样本，应保留范围。','RV-02：正文单位与金额表同步，潜在申报金额不等同已多付。','RV-03：法规适用待人工核验，不得把政府投资条例概算条款直接认定为1600万元超概算。'],rows=[{'id':'RV-01','type':'review','issueId':'ISSUE-MEASURE','targetDocumentId':'C-REPORT-V1','locator':'问题一','requirement':'保留抽查范围','status':'pending'},{'id':'RV-02','type':'review','issueId':'ISSUE-MEASURE','requirement':'金额单位和附件同步','status':'replied','reply':'已回复拟修改','evidenceIds':[]},{'id':'RV-03','type':'review','issueId':'ISSUE-INVEST','requirement':'补核口径与法律适用','status':'pending'}])
add('D-REVIEW-MEETING','业务会议与审理复核协调记录','review','review',lines=['2027-08-28业务会议，非审计组内部讨论。','保留意见来源：部门复核提出修正金额单位；审理提出不得省略抽查限定。','协调决定需对照具体修订稿落实；RV-02虽回复但尚无附件修改证明，不得关闭。'],rows=[{'id':'MEETING-D04','type':'reviewMeeting','reviewIds':['RV-01','RV-02','RV-03'],'requirement':'逐条落实并回归核验','status':'pending'}])
add('E-REPORT-V2','拟出具报告待审核稿','report','review',version=2,logical='audit-report',previousId='C-REPORT-V1',lines=['本件为待核验输入，包含演示用错误，不能签发。','正文问题一：全部管网存在重复计量216000万元。','附件金额汇总仍为21.6万元；整改建议以最终核实金额为准。','正文称验收日期2027-05-03，验收记录为2027-05-30。','投资差异1600万元待核实；未批准签发。'],rows=[{'id':'FINAL-1','type':'report','issueId':'ISSUE-MEASURE','amount':216000,'unit':'万元','expectedSource':'C-WORKPAPER','scope':'全部管网','date':'2027-05-03','dateRole':'验收日'},{'id':'FINAL-ATT','type':'report','issueId':'ISSUE-MEASURE','amount':21.6,'unit':'万元','scope':'抽查两期','date':'2027-05-30'}])
add('F-REQUIREMENTS','整改要求与模拟前置报告节选','rectification','rectification',lines=['经人工设置的模拟前置事实：要求核实并纠正重复计量216000元，取得扣回/冲减及对账证明；不是系统自动签发报告。','人工模拟期限2027-10-31，仅为任务期限示例，不代表通用法定期限。','投资口径问题继续补证，不得随其他问题关闭。'],rows=[{'id':'RECT-T1','type':'rectificationTask','issueId':'ISSUE-MEASURE','requiredAmount':216000,'amount':216000,'unit':'元','subject':'澄川泽远市政工程有限公司','dueDate':'2027-10-31','status':'待反馈'},{'id':'RECT-T2','type':'rectificationTask','issueId':'ISSUE-INVEST','requiredAmount':0,'unit':'元','status':'待补证'}])
add('F-CLAIM','第一轮整改自报说明','rectification','rectification',lines=['2027-09-15单位自报已退回216000元，但未附到账凭证。','该声明不证明资金到账，状态应为已反馈待核。'],rows=[{'id':'RECT-CLAIM','type':'rectification','issueId':'ISSUE-MEASURE','amount':216000,'unit':'元','status':'单位自报完成','evidenceIds':[],'round':1}])
add('F-WRONG-PROOF','第二轮附件待核凭证','rectification','rectification',fmt='pdf',lines=['模拟回单R-WRONG，216000元，付款人为澄川清序工程咨询有限公司，2027-09-16。','与应整改施工主体不一致；不能仅金额相同即销号。'],rows=[{'id':'R-WRONG','type':'rectificationEvidence','issueId':'ISSUE-MEASURE','amount':216000,'unit':'元','payer':'澄川清序工程咨询有限公司','date':'2027-09-16','round':2}])
add('F-VALID-PROOF','第三轮工程款扣回与对账证明','rectification','rectification',fmt='pdf',lines=['模拟凭证R-VALID，2027-09-20；澄川泽远市政工程有限公司确认本期已结算工程款冲减216000元。','建设方同一事项应付账款减少216000元；附扣款确认和账务对账，资金性质为工程款冲减，不冒充现金到账或挽回损失。','对应NA-WS-01两期重复计量事项；进入效果复查条件仍需人审。'],rows=[{'id':'R-VALID','type':'rectificationEvidence','issueId':'ISSUE-MEASURE','amount':216000,'unit':'元','payer':'澄川泽远市政工程有限公司','subject':'澄川泽远市政工程有限公司','date':'2027-09-20','proofType':'工程款冲减与对账','round':3,'evidenceComplete':True}])
add('F-FOLLOWUP','整改复查与后续期抽查记录','rectification','rectification',lines=['2027-10-10核对扣款216000元，符合进一步确认的资料条件；销号由有权人员判断。','后续九月计量抽查新增两个区间存在10米交集，应另起复查任务；不能永久完成。','投资口径资料仍未补齐。'],rows=[{'id':'FOLLOW-1','type':'followup','issueId':'ISSUE-MEASURE','amount':216000,'unit':'元','date':'2027-10-10','status':'具备复查条件'},{'id':'FOLLOW-2','type':'measurement','segment':'NA-WS-03','start':0,'end':100,'quantity':100,'unit':'米','unitPrice':1800},{'id':'FOLLOW-3','type':'measurement','segment':'NA-WS-03','start':90,'end':200,'quantity':110,'unit':'米','unitPrice':1800}])
add('F-PUBLIC-TPL','公告候选与公开审查模板','template','rectification',lines=['候选表达：“单位自报完成重复计量整改，审计核验及销号状态待确认。”','应核对金额单位、公开范围与模拟角色去标识化，不自动发布。','投资口径尚待核实的内容不得改写为已查实问题。'],rows=[{'id':'PUBLIC-TPL','type':'template','templateType':'公告','publicScope':'经人工确认的项目摘要及整改状态'}])
add('F-ARCHIVE','归档应有清单与现有目录','requirement','rectification',fmt='xlsx',rows=[{'id':'ARCH-1','type':'requirement','name':'审前方案及审批','requiredKind':'template','required':True},{'id':'ARCH-2','type':'requirement','name':'最终报告及人工签发记录','requiredKind':'signedReport','required':True},{'id':'ARCH-3','type':'requirement','name':'复核意见落实说明','requiredKind':'implementation','required':True},{'id':'ARCH-4','type':'requirement','name':'整改证明','requiredKind':'rectification','required':True}])
add('F-REUSE','三库候选与复用审核模板','template','rectification',lines=['知识候选：同管线、同计量口径的区间交集检查；保留不同管线反例及冲回付款反例。','能力候选：检查输入单位、按管线分组、区间交集×单价；发布前须真实测试。','数据候选：脱敏字段segment/start/end/unitPrice/unit；不得共享原始主体及历史问题结论。','第二项目使用公里单位，必须先换算且重新计算。'],rows=[{'id':'REUSE-TPL','type':'reuse','library':'capability','name':'同管线区间重叠复算','status':'candidate','requiredFields':['segment','start','end','unit','unitPrice'],'scope':'市政线性工程，净长度计量'}])
add('F-SECOND-PROJECT','北溪项目计量与合同样本','measurement','rectification',fmt='xlsx',project=SECOND,lines=['独立虚构项目，不能复制南岸项目21.6万元结论。'],rows=[{'id':'SECOND-01','type':'measurement','projectId':SECOND,'contractId':'NC01','segment':'BX-WS-01','start':0,'end':.15,'quantity':.15,'unit':'公里','unitPrice':1900000,'priceUnit':'元/公里'},{'id':'SECOND-02','type':'measurement','projectId':SECOND,'contractId':'NC01','segment':'BX-WS-01','start':.15,'end':.3,'quantity':.15,'unit':'公里','unitPrice':1900000,'priceUnit':'元/公里'}])
# Rasterized simulated originals for real OCR/image-input testing, not claimed OCR success.
for source_id,new_id in [('A-APPROVAL','A-APPROVAL-SCAN'),('B-INVOICE','B-INVOICE-SCAN')]:
 source=next(d for d in docs if d['id']==source_id);image_path=D/'media'/f'{new_id}.png'
 with pymupdf.open(D/source['path']) as pdf_doc:pdf_doc[0].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(image_path)
 im=Image.open(image_path);meta=PngImagePlugin.PngInfo();meta.add_text('Description',LABEL+'；模拟PDF栅格化扫描件，不是真实批复或发票');im.save(image_path,pnginfo=meta)
 copy=dict(source);copy.update(id=new_id,logicalId=new_id,name=source['name']+'（模拟扫描）.png',path=image_path.relative_to(D).as_posix(),text=LABEL+'；由模拟PDF栅格化，文字/字段需真实OCR或人工核对',records=[],source=LABEL+'；源文件 '+source_id+' 的模拟扫描副本')
 docs.append(copy)
# Code-native diagrams: deterministic, visibly synthetic; no stock or real site imagery.
def svg_asset(id,title,body,kind,records):
 path=D/'media'/f'{id}.svg'
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720"><rect width="1200" height="720" fill="#f4f7fb"/><g font-family="WenQuanYi Zen Hei, sans-serif"><text x="40" y="48" font-size="27" fill="#173b5c">{escape(title)}</text><text x="40" y="83" font-size="20" fill="#b42318">{LABEL} | {PID} | 非现场照片、非施工设计文件</text>{body}<text x="40" y="685" font-size="19" fill="#b42318">{LABEL} · 所有位置、尺寸及物品均为程序生成</text></g></svg>'
 path.write_text(svg);png=path.with_suffix('.png');cairosvg.svg2png(bytestring=svg.encode(),write_to=str(png))
 meta=PngImagePlugin.PngInfo();meta.add_text('Description',LABEL);im=Image.open(png);im.save(png,pnginfo=meta)
 for ext in ['svg','png']:
  p=path.with_suffix('.'+ext);docs.append(dict(id=id+'-'+ext.upper(),name=title+'.'+ext,logicalId=id+'-'+ext,version=1,status='pending',kind=kind,batch='initial',stage='B',projectId=PID,path=p.relative_to(D).as_posix(),source=f'程序生成示意图；{LABEL}',text=LABEL+'\n'+title,records=[dict(r,label=LABEL,locator=r.get('locator','图像全幅')) for r in records],createdAt=NOW))
svg_asset('drawing-plan','DWG-01 管网平面与剖面示意', '<text x="70" y="145" font-size="22">平面示意｜尺寸以标注为准，不按屏幕测量</text><line x1="120" y1="235" x2="1020" y2="235" stroke="#2176a7" stroke-width="14"/><line x1="120" y1="340" x2="1020" y2="340" stroke="#508c51" stroke-width="14"/><rect x="480" y="190" width="180" height="195" fill="#f79009" opacity=".22"/><text x="95" y="200" font-size="20">0+000</text><text x="445" y="180" font-size="20">0+240</text><text x="630" y="180" font-size="20">0+360</text><text x="990" y="200" font-size="20">0+600</text><text x="130" y="280" font-size="22">NA-WS-01｜DN600 污水管｜设计600米</text><text x="130" y="385" font-size="22">NA-YS-02｜DN800 雨水管｜不同管线</text><text x="470" y="430" font-size="22">待核计量区间 120米</text><circle cx="240" cy="535" r="55" fill="none" stroke="#2176a7" stroke-width="10"/><text x="320" y="530" font-size="24">剖面示意 DN600；管底标高：待核</text><text x="320" y="575" font-size="21">清单Q-DN600：1800元/米；按轴线净长度</text>', 'drawing',[{'id':'DWG-IMG','type':'drawing','drawingId':'DWG-01','segment':'NA-WS-01','start':0,'end':600,'unit':'米','unitPrice':1800,'locator':'SVG/PNG区域[480,190,180,195]'}])
body='<text x="45" y="140" font-size="24">一号库A区｜DN600短管｜模拟摆放编号P01-P10</text>'
for i in range(10):
 x=100+(i%5)*210;y=240+(i//5)*180
 body+=f'<circle cx="{x}" cy="{y}" r="56" fill="#d1dbe5" stroke="#516578" stroke-width="9"/><circle cx="{x}" cy="{y}" r="34" fill="#f4f7fb"/><text x="{x-23}" y="{y+87}" font-size="22">P{i+1:02}</text>'
body+='<text x="45" y="600" font-size="23">人工模拟复点10件；领用单ISS-01另列已领用2件</text>'
svg_asset('inventory-a','PHOTO-A 库位盘点示意',body,'media',[{'id':'PHOTO-A','type':'photo','itemId':'PIPE-A','visibleLabels':'P01-P10','countStatus':'需人工确认','locator':'图像x=40..1100,y=170..510'}])
shutil.copyfile(D/'media/inventory-a.png',D/'media/inventory-a-duplicate.png')
dup=dict(next(x for x in docs if x['id']=='inventory-a-PNG'));dup.update(id='inventory-a-DUP',name='同一盘点影像重复报送.png',path='media/inventory-a-duplicate.png',logicalId='inventory-a-duplicate',duplicateOf='inventory-a-PNG');docs.append(dup)
# 12 s MP4 with three explicit captioned synthetic scenes; no false camera timestamp.
frames=[]
for index,caption in enumerate(['00:00—00:04  模拟检查点：NA-WS-01，0+240','00:04—00:08  局部沟槽示意可见，不能证明全部已回填','00:08—00:12  回到图纸与人工记录核对；现场事实待核']):
 im=Image.new('RGB',(1200,720),'#edf3f8');dr=ImageDraw.Draw(im);f=ImageFont.truetype(FONT,30)
 dr.text((35,30),LABEL+'｜合成踏勘视频｜非真实拍摄',font=f,fill='#b42318');dr.text((35,100),caption,font=f,fill='#173b5c')
 dr.rectangle((120,240,1080,550),fill='#bca387');dr.rectangle((180,320,1020,470),fill='#506174');dr.line((200,395,1000,395),fill='#6ec0e5',width=45)
 dr.text((35,620),'图像仅演示可见对象与时间码；不替代测量、现场核查',font=ImageFont.truetype(FONT,25),fill='#173b5c')
 p=D/'media'/f'video-frame-{index+1}.png';im.save(p);frames.append(p)
concat=D/'media/video-frames.txt';concat.write_text('# '+LABEL+'\n'+''.join(f"file '{p.name}'\nduration 4\n" for p in frames)+f"file '{frames[-1].name}'\n")
ff=imageio_ffmpeg.get_ffmpeg_exe();subprocess.run([ff,'-y','-loglevel','error','-f','concat','-safe','0','-i',str(concat),'-t','12','-r','25','-c:v','libx264','-pix_fmt','yuv420p','-metadata','comment='+LABEL,'-fflags','+bitexact',str(D/'media/site-inspection.mp4')],check=True)
(D/'media/site-inspection.vtt').write_text('WEBVTT\n\nNOTE 演示模拟数据：人工编写的合成视频字幕，非自动识别\n\n00:00:00.000 --> 00:00:04.000\n演示模拟数据：检查点NA-WS-01，0+240\n\n00:00:04.000 --> 00:00:08.000\n演示模拟数据：局部沟槽示意可见，不能证明全部回填\n\n00:00:08.000 --> 00:00:12.000\n演示模拟数据：回到图纸与人工记录核对，事实待核\n')
def media_doc(id,path,title,records):
 docs.append(dict(id=id,name=title,logicalId=id,version=1,status='pending',kind='media',batch='initial',stage='B',projectId=PID,path=path,source=LABEL+'；合成媒体，不是真实现场记录',text=LABEL+'\n'+title,records=records,createdAt=NOW))
media_doc('B-VIDEO','media/site-inspection.mp4','合成现场踏勘视频.mp4',[{'id':'VIDEO-01','type':'media','mediaType':'video','timecode':'00:04–00:08','statement':'局部沟槽可见','checkpoint':'NA-WS-01','label':LABEL,'locator':'00:04–00:08','description':'局部沟槽示意可见','transcriptOrigin':'生成画面人工字幕'}])
media_doc('B-TRANSCRIPT','media/interview-script.txt','合成访谈人工脚本.txt',[{'id':'SCRIPT-01','type':'media','mediaType':'transcript','statement':'访谈称全部回填，但需核验时间与位置','checkpoint':'NA-WS-01','label':LABEL,'locator':'人工脚本全文；尚未做ASR对齐','origin':'人工编写的TTS输入脚本，非自动转写','segment':'NA-WS-01'}])
audio=D/'media/interview-tts.wav'
if audio.exists():media_doc('B-AUDIO','media/interview-tts.wav','合成访谈录音.wav',[{'id':'AUDIO-01','type':'media','label':LABEL,'locator':'全段；字句时间码待真实ASR/人工对齐','origin':'MiniMax speech-2.8-hd 合成语音；非真实人员'}])
if audio.exists():
 with wave.open(str(audio),'rb') as wf:duration=wf.getnframes()/wf.getframerate()
 next(d for d in docs if d['id']=='B-AUDIO')['durationSeconds']=duration
 next(d for d in docs if d['id']=='B-AUDIO')['records'][0]['durationSeconds']=duration
next(d for d in docs if d['id']=='B-VIDEO')['durationSeconds']=12
# Every law keeps official URL, date and manual-applicability gate.
laws=json.loads((D/'laws.json').read_text())
add('LAW-REGISTER','法规摘录与适用条件登记','law',fmt='json',rows=laws,lines=['真实官方法条的演示登记；全部待人工核验，不能自动定性。'])
for d in docs:
 p=D/d['path']
 if p.suffix in ['.svg','.png']:
  for r in d['records']:
   r['type']=d['kind'];r['segmentId']=r.get('segment');r['parameterConfirmed']=False
   if d['kind']=='media':r['imageHash']=hashlib.sha256(p.read_bytes()).hexdigest();r['assetId']=r.get('itemId');r['statement']='程序生成10件短管示意，需人工复点';r['checkpoint']='库房A区'
 d['sha256']=hashlib.sha256(p.read_bytes()).hexdigest();d['size']=p.stat().st_size;d['mimeType']=mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
facts=[]
for id,key,value,unit,docid in [('FACT-BUDGET','approvedInvestment',48600,'万元','A-APPROVAL'),('FACT-LEDGER','ledgerInvestment',50200,'万元','A-LEDGER-V2')]:
 facts.append(dict(id=id,key=key,value=value,unit=unit,status='pending',version=1,label=LABEL,sources=[{'documentId':docid,'version':next(d['version'] for d in docs if d['id']==docid),'locator':'第1页或数据!第3行'}]))
manifest=dict(schemaVersion=1,label=LABEL,generatedAt=NOW,project=project,documents=docs,laws=laws,ingestionPolicy={'defaultBatch':'initial','allowedBatches':['initial','feedback','review','rectification'],'exclude':['truth/**'],'recordsOrigin':'生成器给定的模拟结构化派生记录，需人工核对原件；不宣称OCR/ASR提取成功'})
jwrite(D/'manifest.json',manifest)
jwrite(D/'seed.json',dict(manifest,facts=facts,projects=[project,{'id':SECOND,'name':'澄川市北溪支路海绵化改造工程','type':'市政工程','unit':'公里','label':LABEL}],measurements=measure,payments=payments))
truth=dict(label=LABEL,notBusinessInput=True,cases=[{'id':'duplicate-measurement','sources':['MEAS-05','MEAS-06'],'expectedOverlapM':120,'expectedAmountYuan':216000,'expectedAmountWan':21.6,'formula':'max(0,min(360,600)-max(0,240))*1800','limit':'潜在重复计量金额；不直接推定已多付或损失'}, {'id':'different-pipe-negative','sources':['MEAS-06','MEAS-06-R'],'expectedDuplicate':False}, {'id':'investment-unresolved','expectedDifferenceWan':1600,'expectedStatus':'待核实','forbidden':'自动认定超概算'}, {'id':'payment-reversal','sources':['PAY-071','PAY-072','PAY-073'],'expectedNetYuan':300000,'expectedDuplicate':False}, {'id':'project-alias','expectedStatusAfterEvidence':'可人工排除'}, {'id':'inventory-duplicate','expectedCount':10,'forbidden':'重复图片累计20件'}, {'id':'inventory-unit','expectedPieces':50}, {'id':'contract-version','v1Rate':.8,'v2Rate':.85,'expected':'旧成果保留；相关确认失效，V2不自动生效'}, {'id':'report-errors','expectedErrors':['万元与元差10000倍','全部表述超出抽查范围','验收日期不一致']}, {'id':'rectification','round1':'缺证明','round2':'主体不匹配','round3':'具备复查条件但需人工销号','investment':'仍待核实'}, {'id':'reuse-project','expectedOverlap':0,'unit':'公里','forbidden':'复制21.6万元结论'}])
jwrite(D/'truth/expected.json',truth)
# 24-scenario reproducible material map and explicit unexecuted acceptance checklist.
scene_specs=[
('A01','资料与版本','A-PLAN,A-APPROVAL,A-LEDGER-V1,A-LEDGER-V2,B-CONTRACT-C01-V1,B-CONTRACT-C01-V2,A-DECLARATION,A-DECLARATION-SUPP','接收/比较/人工选择版本/冻结','旧版保留；重复影像同指纹；V2不自动适用'),
('A02','调查与全景','A-PLAN,A-LEDGER-V2,A-HANDOVER,B-TENDER','选择台账V2，关系和投资口径核查','概算48600与台账50200差1600万元待核；移交清单缺口有来源'),
('A03','审前文书','A-PLAN,A-TEMPLATES,A-REQUESTS','增加合同变更重点并生成文书包','实施方案/通知/资料清单同源，审批及文号待确认'),
('B01','一张表','B-CONTRACT-C01-V1,B-PAYMENTS,B-FINANCE,B-PAY-REQUEST,B-INVOICE,B-INVOICE-SCAN,B-ACCEPTANCE','按交易ID映射并修改金额单位','51.84万元=518400元；银行与账簿不重复汇总；单元格有来源'),
('B02','时间轴','A-APPROVAL,B-LOG,B-PREWORK,B-CONTRACT-C01-V1,B-PAYMENTS','区分准备日、正式开工日和批复日期','日期语义更改后重新排序，不以文件日代替发生日'),
('B03','跨事项比对','B-TENDER,B-CONTRACT-C01-V1,B-CONTRACT-C02,B-MEASUREMENTS','按管线标识/区间/单价核对','NA-WS-01交集120米、216000元；不同管线不合并'),
('B04','法规辅助','LAW-REGISTER,A-PLAN,A-APPROVAL,B-TENDER','逐条打开官方原文与适用条件','九项法律资料保持待人工核验，金额差不自动定性'),
('B05','合同履约','B-CONTRACT-C01-V1,B-CONTRACT-C01-V2,B-CONTRACT-C03,B-PAYMENTS,B-REVERSAL,B-ACCEPTANCE','分别选择合同V1/V2并关联冲回链','80%/85%条件可见；冲回重付净额300000元；六月验收缺口'),
('B06','图纸与计价','B-DRAWING-NOTES,drawing-plan-SVG,drawing-plan-PNG,B-MEASUREMENTS','选择图纸区域并人工核定参数','清晰长度待确认；标高不清不入计算；不得按图像比例测量'),
('B07','盘点盘库','B-INVENTORY,B-COUNTS,B-ISSUE,inventory-a-PNG,inventory-a-DUP','确认计数、单位换算和领用单','重复图不能累计20件；5箱与50件须确认换算；已领用2件保留账务事项'),
('B08','多模态','B-VIDEO,B-AUDIO,B-TRANSCRIPT,B-LOG,drawing-plan-PNG','播放真实文件、运行模型、核对人工脚本','合成媒体标识；视频00:04—00:08可定位；ASR误差待人工修订'),
('B09','过程文书','B-WORKPAPER-TPL,B-MEASUREMENTS,B-LOG,B-PAYMENTS','记录转取证单/底稿并核对来源','未确认事实保留限定，金额与证据不丢失'),
('C01','结果文书','C-WORKPAPER,C-REPORT-V1,B-WORKPAPER-TPL','底稿转换与金额汇总','潜在计量21.6万元不等同多付或损失；未决口径保留'),
('C02','审计组质量内控','C-TEAM-MEETING,C-FEEDBACK,C-EVIDENCE-SUPP,C-REPORT-V1','拆分反馈并作采纳处理','简称可排除、计量补证、投资待核分别追踪；回复不等于落实'),
('D01','送审材料','D-SUBMISSION,C-REPORT-V1,E-REPORT-V2,C-FEEDBACK','对照指定稿和送审目录','缺经审底稿/落实说明、反馈错版可定位'),
('D02','部门复核','C-WORKPAPER,E-REPORT-V2,B-MEASUREMENTS','逐问题复核证据及样本范围','全部管网超出两期抽查；证据链接不能断裂'),
('D03','适用复核','LAW-REGISTER,E-REPORT-V2,B-CONTRACT-C01-V1','核对行为期、法律版本和定性条件','不以最新版本自动适用；保留待审理缺口'),
('D04','复核质量','D-REVIEW,D-REVIEW-MEETING,E-REPORT-V2','回复后逐条检查修改位置与证据','RV-02只有回复不能关闭；业务复核会议与C02组内讨论分开'),
('E01','出具前确认','E-REPORT-V2,C-WORKPAPER,B-ACCEPTANCE,D-REVIEW','检查四类问题，修订后重检','216000万元误写、全部范围、05-03与05-30日期冲突；确认按版本失效'),
('F01','整改材料闭环','F-REQUIREMENTS,F-CLAIM,F-WRONG-PROOF,F-VALID-PROOF','按轮次选择证明核验','缺凭证→错主体→冲减对账待核；无自动销号'),
('F02','效果复查','F-REQUIREMENTS,F-VALID-PROOF,F-FOLLOWUP','核对后期数据和人工复查','新期10米交集触发反弹任务；投资差异不关闭'),
('F03','公告候选','F-PUBLIC-TPL,C-REPORT-V1,F-CLAIM,F-FOLLOWUP','设置公开范围并核对限定','自报不能改成已核实；公开审批待人工'),
('F04','归档审查','F-ARCHIVE,D-SUBMISSION,D-REVIEW,C-FEEDBACK,F-VALID-PROOF','比较应有实有及指定版本','最终签发和落实说明缺件保持；归档不关闭整改'),
('F05','三库与复用','F-REUSE,B-MEASUREMENTS,B-REVERSAL,F-SECOND-PROJECT','候选入库、测试、人工发布、第二项目适配','公里口径需适配，连续区间无交集，不复制21.6万元')]
known={d['id'] for d in docs};mapping=[]
for sid,title,ids,action,acceptance in scene_specs:
 ids=ids.split(',');assert set(ids)<=known,(sid,set(ids)-known)
 mapping.append({'label':LABEL,'scenarioId':sid,'title':title,'documentIds':ids,'action':action,'acceptance':acceptance,'status':'待业务端到端实测','truthAccessibleToBusiness':False})
jwrite(D/'scenario-material-map.json',mapping)
csvfile([dict(r,documentIds=';'.join(r['documentIds'])) for r in mapping],D/'scenario-material-map.csv')
csvfile([{'label':LABEL,'scenarioId':r['scenarioId'],'inputDocumentIds':';'.join(r['documentIds']),'action':r['action'],'observableAcceptance':r['acceptance'],'status':'待实测','actualResult':'','evidencePath':'','testedAt':'','reviewer':''} for r in mapping],D/'acceptance-checklist.csv')

# Validation is data/format verification, not a claim of backend/UI acceptance.
assert len({d['id'] for d in docs})==len(docs)
assert max(0,min(measure[0]['end'],measure[1]['end'])-max(measure[0]['start'],measure[1]['start']))*1800==216000
assert sum(p['amount'] for p in payments[2:])==300000
assert all('truth' not in d['path'] for d in docs)
counts={}
for d in docs:
 ext=Path(d['path']).suffix;counts[ext]=counts.get(ext,0)+1
 if ext=='.docx':assert LABEL in '\n'.join(p.text for p in Document(D/d['path']).paragraphs)
 if ext=='.xlsx':assert load_workbook(D/d['path'],read_only=True).active['A1'].value==LABEL
# Deterministic ZIP available for optional upload; not auto-ingested twice.
package_dir=D/'packages';package_dir.mkdir(exist_ok=True)
with zipfile.ZipFile(package_dir/'initial-materials.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.comment=LABEL.encode('utf-8')
 for d in docs:
  if d['batch']!='initial':continue
  info=zipfile.ZipInfo(d['path'],(2026,11,14,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,(D/d['path']).read_bytes())
jwrite(D/'verification.json',{'label':LABEL,'generatedAt':NOW,'documents':len(docs),'extensions':counts,'laws':len(laws),'checks':['文档ID唯一','所有原件存在且SHA256已计算','DOCX和XLSX可重开且含模拟标识','120米×1800=216000','冲回链净额300000','业务manifest与seed无truth路径'],'unverified':['插件和UI24场景端到端由协调者测试','模型OCR/ASR/视觉准确性未由本生成器验证','法律个案适用待人工核验','所有前序稿均为显著标记的模拟输入']})
print(json.dumps({'documents':len(docs),'extensions':counts,'laws':len(laws),'audio':audio.exists()},ensure_ascii=False))
