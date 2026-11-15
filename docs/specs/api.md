# openAudit API v1（演示模拟数据）

同源 `/api/audit`；UI `/audit/`。DSH 0.2.2-rc.1 `webServer.register` 与 `connection.requestRejection` 保护 API/静态资源，先通过 DSH 根入口登录并取得同源会话，审计路由不自行签发令牌。没有独立监听端口。

## 请求

- `GET /api/audit/state` → State。
- `POST /api/audit/action`，JSON `{action,scenarioId?,payload?}` → `{state,result}`。
- `GET /api/audit/export?artifactId=ID&format=json|md|csv|docx|xlsx` → 带来源与模拟标识的成果附件（默认 md）。
- `GET /api/audit/file?id=ID` → 不可变原件下载。
- `GET|HEAD /api/audit/preview?id=ID` → 鉴权后的 `application/pdf` 分页预览（inline、no-store）。PDF 返回原字节；DOC/DOCX/WPS/RTF/ODT 经本机隔离转换。预览不修改业务状态，不生成资料版本。422 表示损坏、加密或不兼容，429 表示转换繁忙，503 表示缺少转换组件；失败仍可通过 `/file` 下载原件。
- 错误：非 2xx `{error,code?}`；输入错误 400，缺资料/状态冲突 409，不存在 404，超限 413，不支持类型 415。失败运行保留 runs，不能用预置答案替代。

## State

`{schemaVersion:1,revision,project,scenarios,documents,facts,findings,runs,artifacts,tasks,assets,laws,events,confirmations}`。所有列表元素有 `id`；所有时间 ISO；project 含 `id,name,label:'演示模拟数据',datasetVersion`。

- scenario: `{id,title,stage,description,requiredKinds,inputSchema}`；inputSchema 为参数提示。
- document: `{id,name,logicalId,version,status,text,source,mimeType,sha256,size,kind,records,parseStatus,createdAt,previousId?}`。status 为 `pending|confirmed|superseded`；新接收版本不会自动变成适用版。source 为提供方说明。records 为可审计结构化派生记录，原文和原件不变。
- SourceRef: `{documentId,version,locator,quote?,factId?,artifactId?}`。locator 是段落、行号、单元格、图纸区域或时间码。
- fact: `{id,key,value,unit?,recordType?,record?,sources,status,version,previousId?}`。record 保存结构化字段；修订生成新事实版本。
- artifact: `{id,scenarioId,title,content,rows,findings,sources,status,version,createdAt,runId,checks,dependsOn,previousId?}`。content 为可展示 Markdown，rows 为场景独有结果表。status 为 `draft|confirmed|stale`；技术检查与人工确认分开。
- finding: `{id,scenarioId,title,detail,amount?,sources,status,artifactId}`，状态 `pending|confirmed|excluded|stale`。
- run: `{id,scenarioId,status,startedAt,finishedAt,input,error?,artifactId?,engine}`；engine `deterministic|deterministic+model`。
- task: `{id,scenarioId,title,status,sources,artifactId,...}`；asset 含 `library:knowledge|capability|data,status:candidate|published|stale,scope,sources,version,testResults`。
- law: `{id,title,officialUrl,effectiveFrom,effectiveTo?,excerpt,article,conditions,status:'待人工核验'|'人工已确认',sources}`。
- event/confirmation 保存操作者、理由、时间、对象及版本；确认失效保留历史。

## 动作参数

| action | payload |
|---|---|
| seed | `{batch?:'initial'|'feedback'|'review'|'rectification'|'all'}` 导入 demo 数据，幂等；默认 initial |
| run | `{documentIds?:string[],artifactIds?:string[],options?:object,useModel?:boolean,useAI?:boolean}`，scenarioId 必填；useAI 与 useModel 等价；默认当前适用资料或无确认版本时待核首版，输出仍待确认；人工指定 documentIds 可选择历史版但来源失效会阻止确认 |
| upload | `{name,mimeType,contentBase64,kind?,logicalId?,source?,records?}`，单文件最大 10 MiB；JSON/CSV/TXT 自动解析；DOCX 段落、XLSX 工作表和 PDF 文本通过 packages/parsers 实际解析；扫描 PDF 无文本则保留待核；图像/音视频保留原件，useModel 时传实际图像/视频帧/ASR；records 为用户提供的派生记录（不冒充自动识别） |
| confirm | `{targetType:'document'|'fact'|'artifact'|'finding'|'law'|'task',targetId,actor,reason,scope?}`，绑定当前具体版本；法条要求 scope（人工适用性说明）；E01 存在阻断项不能整体确认 |
| revise | `{targetType:'fact'|'artifact'|'document',targetId,actor,reason,patch}`；fact patch 含 value/unit/record，artifact patch 含 content/rows，document patch 含 text/records；原件不可变，产生新版本并使依赖失效 |
| resolve | `{targetType:'finding'|'task',targetId,actor,reason,decision:'excluded'|'implemented'|'closed'|'replied',evidenceIds?:string[]}`；回复不等于落实/销号，后两项必须有效证据与人工说明 |
| publish | `{assetId,actor,reason,redacted:true,permissionConfirmed:true,scope}`；能力组件必须先实际测试通过 |
| reset | `{confirmation:'重置演示项目'}`；保留重置事件，仅清空当前模拟项目投影 |

附加真实业务动作：`freeze {actor,reason}` 建立工作资料快照；`compare {leftId,rightId}` 比较资料/成果具体版本；`testAsset {assetId}` 实测能力组件；`reuse {assetId,targetProject:{id,type,unit},actor}` 返回适配清单，不写入历史事实。`recognize {documentId,pages?:number[]}` 对原始图像/PDF 执行真实视觉识别，PDF 使用实际页图，超过六页须指定页码；产生 `model-candidate` 派生资料并绑定原件 ID/版本/页码，原件不变。`transcribe {documentId}` 对已上传音频执行真实 ASR 并建立来源关联的派生资料，失败留存 run。`run.options` 可提供 `focus`、`documentTypes`、`requiredKinds`、`behaviorDate`、`publicScope`、`documentType`、`mode:text|vision`、`seconds:[0,2]`、`pages:[1,2]`、`prompt`；未列出的参数不应暴露为已实现操作。

## 导入结构与适配器

demo manifest 推荐 `demo/manifest.json`，含 project、documents 数组或 batches；document 支持 `{id,name,path,kind,logicalId,version,batch,records,source}`。相对 path 限制在 demo 根内；所有实际读取路径和指纹写入来源。JSON 原件可采用 `{kind,records:[...]}`，CSV 列名作为 records 字段；种类包括 project/approval/contract/payment/measurement/drawing/inventory/count/media/feedback/review/report/rectification/requirement/law/template。每条记录可含 `id,type,contractId,subject,amount,unit,date,dateRole,locator` 及场景字段。测试真值目录绝不作为业务输入读取。

模型由协调者维护 `packages/models/index.js`：`createModelAdapter(await loadModelConfig(modelConfigFile))` 返回 `{analyze,transcribe,capabilities}`。`analyze({prompt,documents:[{id,name,text,mimeType,contentBase64?}],mode:'text'|'vision'})` 返回 `{text,model,provider,sources}`；`transcribe({buffer,mimeType,fileName})` 返回文本和实际分段时间码。插件配置 `modelAdapter` 可替换模块绝对路径，`modelConfigFile` 指向外部私有 JSON，接口/事件/状态不暴露配置或密钥。默认模型资料按本场景输出来源与 requiredKinds 筛选；人工 documentIds 则尊重明确选择，超出模型输入限制会明确失败。每个模型输入带资料 ID/版本/状态、事实状态与有效人工确认 ID；prompt 列出实际 findings/checks 的数值、公式、状态和定位，强调原文直述仅为“资料记载”。原文不静默截断，候选解释不能改规则数字、来源或人工确认；模型失败保存 failed run，不能替换为预置答案。

实际解析文本和用户/manifest 提供的派生记录分开标记：`recordOrigin=parser|supplied-derived-records|human-revision|model-candidate`；扫描件的补录文本标为 `textOrigin=supplied-transcript`，`parseStatus=supplied-records-needs-verification`。导入 manifest 不代表自动识别成功。ZIP 安全解包逐条登记，保留父压缩包原件；嵌套包拒绝。
安装入口 `packages/server/index.js`（ESM named exports name/inject/apply）；配置 `{dataDir,clientDist,demoDir,modelAdapter?,modelConfigFile?}`，Node >=24，server 本身仅 Node 内建模块；解析/Office 导出需要相邻 packages/parsers 的 mammoth、exceljs、fflate 已声明依赖以及系统 pdftotext；视频与长音频需要 ffmpeg/ffprobe；模型模块需相邻 packages/models。数据在 dataDir 下，原件 SHA-256 寻址，状态原子写入，串行事务与持久化运行/操作日志。部署者不得同时启动两个插件实例写同一 dataDir。


## 文稿、门禁与修订闭环

- B03 的候选发现（含计算过程、金额与来源）同时保存在 artifact.findings、正文和五种导出，snapshot 状态代表运行时状态，独立处置以 state.findings 为准。B09 可选择 B03 artifactIds 将该计算线索转底稿，保留人工确认状态；B09 也可使用当前事实形成过程资料；C01 可指定 B09 `artifactIds` 转报告，无需预先上传 report；E01 可指定 C01/B09 `artifactIds` 核对该版本的 rows 和正文。
- 报告数值和日期通过 `factRef`、`measurementId`、`transactionId`、`dateSourceId` 与实际来源比较，不读取测试期望值。`evidenceIds` 保留记录、资料、成果 ID。结构化行改动与正文中的单位/全称范围分别检查。
- 修订 artifact 生成新 ID，旧稿及下游确认失效；修订稿有待复核门禁。指定修订稿运行 E01，技术检查无阻断后允许人工确认该修订稿；E01 本身仍另行人工确认，不代表审批签发。
- 同一 transactionId 的银行/账簿视图合并来源而不重复合计；冲突值保持空缺待映射；合同付款同时显示合同总比例和本期计量金额×比例。
- 整改证明支持到账 `bankVerified` 与工程款冲减 `offsetVerified`，必须主体、接收方、唯一凭证匹配；金额为零的非财务要求还需 `nonFinancialVerified`。F02 效果复查人工确认后才可销号，F04 不改整改任务状态。
- 人工 `confirm` 不能整体通过阻断检查；“replied”永不自动当作“implemented”。资产发布同时校验来源确认、脱敏授权、适用范围；能力实测绑定内容 hash，更新来源后发布状态失效。

## 官方扩展依据与验证边界

版本参考：[DeepSeek Harness dsh-v0.2.2-rc.1](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.1)。实际接口核对 `packages/host/webserver/src/index.ts` 的 `register`、`packages/client/connection/src/rpc-host.ts` 的 `requestRejection` 与 `packages/host/open-in-app/src/index.ts` 的鉴权使用；通过 `ctx.effect` 管理路由释放。本模块不另开 HTTP 端口、不读取旧 DSH 配置。

本地运行 `node --test packages/server/test/*.test.js`；安装时需同时部署 models/parsers/client 产物和 demo 输入，dataDir 放在仓库外私有目录。实机 DSH 加载、真实模型服务、浏览器端到端由协调者独立验收，服务端测试不可替代这些验证。
