"""Build the amended editable architecture, preserving V1 for comparison."""
import pathlib, subprocess, json
ROOT = pathlib.Path(__file__).resolve().parents[1]

def amend_nodes(nodes, add, group):
    by = {n['id']:n for n in nodes}
    by['M'].update(name='审计资料中心',description='按项目上传、管理和查阅资料，编写审计实施方案、开展审前调查、提取资料摘录，管理版本和个人关注；提供项目管理及政策法规 MCP 接入设置。')
    by['FA'].update(name='审计取证中心',description='按项目汇总问题疑点，分发或退回再核实；选取资料和疑点编写提供资料清单、谈话大纲及取证单，支持一疑点拆多单、多疑点合一单，并直接进入 AI 审计应用。',entry='#evidence')
    group('WP','审计底稿中心','汇总项目取证单并追溯原件，支持多张取证单编制底稿，选取取证单或底稿编写重要管理事项记录、项目进展报告及审计报告初稿。','#workpapers')
    group('RV','复核审理中心','按项目编写采纳情况说明、部门复核意见书、业务会议纪要、法规处审理意见书及回复，登记复核、签发用印和送达回证。','#review-center')
    nodes.remove(by['W'])
    add('FA-FACT','FA','资料事实核对','保留原事实核对功能，核验或修订资料中的事实明细，并追溯原件；由取证中心进入。',entry='#facts')
    for n in nodes:
        if n['id'] in ['FA01','FA02','FA03','FA04']:n['parent']='FA-FACT'
        if n['id'] in ['W01','W02']:n.update(parent='M',entry='#documents → 相关登记与办理记录')
        if n['id']=='W05':n.update(parent='FA',entry='#evidence → 相关登记与办理记录')
        if n['id'] in ['W06','W08']:n.update(parent='WP',entry='#workpapers → 相关登记与办理记录')
        if n['id'] in ['W03','W04','W07']:n.update(parent='RV',entry='#review-center → 相关登记与办理记录')
        if n['id'] in ['W09','W10']:n.update(parent='U',entry='各中心 → 相关登记与办理记录')
        if n['id'].startswith('REF'):n['entry']='各中心 → 相关登记与办理记录 → 办理流程参考'
        for key in ['description','boundary','actions']:
            n[key]=n[key].replace('通过台账登记','在对应业务中心登记').replace('流程台账','办理记录').replace('文书台账','文书办理记录')
    by['ROOT']['boundary']='个人偏好保存在浏览器；项目数据独立，疑点分发登记承办人；尚无账号级任务分派与通知。'
    by['N02'].update(name='项目成员与可见范围',description='当前已提供独立项目及切换；后续需把项目可见范围绑定成员身份，形成“我参与的项目”。',boundary='项目数据独立不等于成员权限隔离。')
    by['N03']['description']='已有承办人、办理要求及期限登记；后续将这些记录绑定个人账号，形成自动送达的正式待办。'
    by['N04']['description']='已有疑点分发和退回再核实记录；后续明确接收、协办、完成凭证和跨账号交接机制。'
    by['L06']['boundary']='本功能核验复用条件，不自动把项目事实复制到其他项目。'
    add('M11','M','项目管理与切换','新建、调整或删除项目，四个中心随当前项目切换；项目删除后停止普通访问，既有资料和办理记录保留备查。','项目名称；被审计单位；经办人；办理说明；删除确认名称','新建项目；调整项目；删除项目；切换当前项目','独立项目和资料范围',entry='页面顶部当前项目',boundary='演示主项目使用专门重置入口；当前尚无按成员划分的项目访问权限。')
    add('M12','M','政策法规 MCP 接入设置','保存法规服务名称和接入地址，显示待接入状态；当前依据上传法规资料核对官方出处、效力期间和适用范围。','服务名称；HTTPS 地址；经办人','保存接入信息；核对上传的法规资料','待接入设置',status='设置已实现，服务待接入',entry='#documents',boundary='本轮不连接远程法规检索服务；请勿在地址中填写密钥。')
    add('FA05','FA','登记问题疑点','根据所选原始资料登记问题疑点和来源位置，形成待核实的问题清单。','问题疑点名称；情况；来源资料及位置；经办人；说明','登记问题疑点','待核问题及来源',entry='#evidence')
    add('FA06','FA','分发与再核实','选取一个或多个疑点登记承办人、办理要求和期限；退回再核实时提示相关取证单、底稿及报告重新复核。','问题疑点；承办人；办理要求；期限；经办人；说明','分发选中疑点；退回再核实；按承办人筛选','分发历史和待复核状态',entry='#evidence',boundary='登记姓名，不创建账号、不推送通知；历史分发记录保留。')
    add('FA07','FA','取证单拆分与合并','同一疑点可按取证事项拆分多张取证单，多个疑点可编为一张取证单；每份保留所选依据及版本。','问题疑点；取证单名称；每份取证事项；正文或 AI 编写要求','选取疑点编制取证单；拆分多张取证单','独立取证单及疑点引用',entry='#evidence')
    add('FA08','FA','直接进入 AI 审计应用','在取证中心直接选择合同支付、重要事项、计量比对、履约核查、计价复核、账实核对及现场记录应用。','当前项目资料；对应应用参数','选择应用；进入办理','带来源的核查结果',entry='#evidence')
    add('WP01','WP','取证单汇总与底稿编制','查阅本项目取证单并追溯原件，勾选多份取证单编制一份底稿，保留每份取证单的具体版本。','取证单；编写要求或正文；编制人','选取取证单编制底稿；查阅；追溯内容出处','工作底稿和引用关系',entry='#workpapers')
    products=json.loads(subprocess.check_output(['node','--input-type=module','-e','import {PRODUCTS} from "./packages/server/centers.js"; console.log(JSON.stringify(PRODUCTS))'],cwd=ROOT))
    for key,d in products.items():
        parent={'documents':'M','evidence':'FA','workpapers':'WP','review-center':'RV'}[d['center']]
        add('DOC-'+key,parent,d['title'],'选取当前项目资料、疑点或前序文书，人工编写或使用 AI 辅助起草'+d['title']+'；保存具体来源和版本，可修订、核对并导出 Word。','文书名称；来源资料/疑点/文书；正文或 AI 编写要求；编制人；修订说明','编写'+d['title']+'；选取依据；保存文书草稿；修订文书；确认文书内容；导出 Word','可编辑草稿及来源引用',entry='#'+d['center'],boundary='草稿不代表正式签发、会议召开或审批完成；AI 结果需人工核验。',sourcefile='packages/client/src/centers.tsx；packages/server/centers.js')
    by['U07']['description']='中心文书和场景成果均支持版本核验，中心文书可修订正文并保存新版本；引用的原件或文书变更后提示复核。'
    # Keep the screenshot's top-level order while retaining the other modules.
    order=['ROOT','P','M','FA','WP','RV','ST']
    nodes.sort(key=lambda n: order.index(n['id']) if n['id'] in order else len(order))

def amend_fields(fields,byid):
    groups={
      'M11':[('name','项目名称','文字'),('unit','被审计单位','文字'),('actor','经办人','文字'),('reason','办理说明','文字'),('confirmation','输入项目名称确认','文字')],
      'M12':[('name','法规服务名称','文字'),('endpoint','服务地址','HTTPS 地址，选填'),('actor','经办人','文字')],
      'FA05':[('title','问题疑点名称','文字'),('detail','问题疑点情况','多行文字'),('locator','来源位置','文字'),('documentIds','来源资料','多选')],
      'FA06':[('assignee','承办人','文字'),('requirement','办理要求','文字'),('dueDate','办理期限','日期，选填'),('actor','经办人','文字'),('reason','办理说明','文字')],
      'FA07':[('titles','各张取证单名称（每行一张）','多行文字')],
    }
    for n in byid.values():
        if n['id'].startswith('DOC-'):groups[n['id']]=[('title','文书名称','文字'),('documentIds','审计资料','多选'),('findingIds','问题疑点','多选'),('artifactIds','取证单、底稿及其他文书','多选'),('useModel','使用 AI 辅助起草','复选'),('instructions','编写要求','多行文字'),('content','文书正文','多行文字'),('actor','编制人','文字'),('reason','修订说明','文字')]
    for nid,rows in groups.items():
        for key,label,typ in rows:fields.append([nid,byid[nid]['name'],key,label,typ,'按办理方式及界面要求填写','仅当前项目','保存真实输入；AI 起草使用实际所选依据','','',''])

code=(ROOT/'scripts/build-workbench-architecture.py').read_text()
code=code.replace('V1','V2')
code=code.replace("byid={n['id']:n for n in nodes}","amend_nodes(nodes, add, group)\nbyid={n['id']:n for n in nodes}")
code=code.replace("sheet('表单与输入项'", "amend_fields(fields,byid)\nsheet('表单与输入项'")
code=code.replace("sheet('流程与数据关系'", "edges=[(a,'RV' if b=='W' else b,l,d) for a,b,l,d in edges]\nedges += [('FA','WP','取证单编制底稿','绑定所选取证单和原始资料版本'),('WP','RV','报告送复核审理','选取底稿及报告编写复核文书'),('M11','FA','项目切换','四中心数据范围同步切换'),('FA06','R03','退回再核实','引用文书提示重新复核')]\nsheet('流程与数据关系'")
code=code.replace("'W 台账＋对应阶段事项'", "'对应业务中心＋阶段事项'")
code=code.replace('当前是单独台账入口','已取消独立入口，分入四个中心').replace('决定直接嵌入事项、自动带入哪些字段、仍需人工核对哪些内容','已确认归并；后续可继续调整各类登记位置').replace('当前无正式个人任务分派','已有承办人和期限登记，尚无账号通知').replace('W、U','M、FA、WP、RV、U')
code=code.replace('待规划节点 N01—N09 是讨论项，并未上线。','N01—N09 为账号、成员权限和通知等后续事项；本轮已提供独立项目和疑点分发登记。')
code=code.replace('8 类台账','8 类归并登记').replace('节点归组是架构整理，不代表线上已有同名独立菜单。','本轮四个业务中心对应页面；共用能力和后续项均单独标明。')
start=code.index("flowids=[")
end=code.index("for a,b in flowedges:",start)
code=code[:start]+"""flowids=['P','M','FA','WP','RV','ST-A','ST-B','ST-C','ST-D','ST-E','F01','F02','F04','R03','U05']
coords={key:(.7+(i%5)*3.7,2.0+(i//5)*2.5) for i,key in enumerate(flowids)}
flowedges=[('P','M'),('M','FA'),('FA','WP'),('WP','RV'),('ST-A','ST-B'),('ST-B','ST-C'),('ST-C','ST-D'),('ST-D','ST-E'),('ST-E','F01'),('ST-E','F04'),('F01','F02'),('R03','U05')]
flow_summary={'M':'项目资料、版本、原文、调查与方案。','FA':'疑点分发、补证准备、拆分或合并取证。','WP':'取证单汇总、底稿及项目报告编制。','RV':'复核审理文书与实际签发送达登记。'}
"""+code[end:]
code=code.replace("n['description'],10.5,INK)","flow_summary.get(id,n['description']),10.5,INK)")
code=code.replace("mxnode(root,id,id+'｜'+n['name'],n['description'],x*80", "mxnode(root,id,id+'｜'+n['name'],flow_summary.get(id,n['description']),x*80")
exec(compile(code, str(ROOT/'scripts/build-workbench-architecture.py'), 'exec'), {**globals(), '__file__':str(ROOT/'scripts/build-workbench-architecture.py')})
