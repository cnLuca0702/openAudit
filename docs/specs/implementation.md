# 开发与验收计划

## 已确认范围

在 Dell 新装的 DSH 0.2.2-rc.1 上提供政府投资项目审计工作台，覆盖 A01–A03、B01–B09、C01–C02、D01–D04、E01、F01–F05 共 24 场景。全部完成并验收后统一交付，内网/VPN 与公网访问并存。代码、修订方案和模拟资料同步到公开仓库 cnLuca0702/openAudit。AI 为辅助，事实确认、依据适用、审批和销号保留人工操作。

## 工程分工

- 服务端：DSH Host 插件、持久化、资料解析及版本、业务规则、24 场景执行、导出、确认与失效机制。
- 客户端：中文工作台，六阶段导航、资料中心、来源定位、场景输入/执行/输出、版本对比和人工确认。
- 资料与文档：修订 Word 方案，贯穿案例输入文件、真实法规来源与测试真值分离。
- 集成：模型连接、DSH 实机插件加载、端到端验证、部署与试用说明。

## 共同协议

Host 提供同源路径 /api/audit，静态 UI 路径 /audit/。DSH 鉴权覆盖 API 与 UI；不得另开无鉴权公网端口。需要调整路径时先通过协调者更新协议。

GET /api/audit/state 返回 State。POST /api/audit/action 接收 {action, scenarioId?, payload?}，返回 {state: State, result?: object}；错误为非 2xx 与 {error: string}。POST 动作包括 seed、run、upload、confirm、revise、resolve、publish、reset。GET /api/audit/export?artifactId=... 下载成果；GET /api/audit/file?id=... 下载原始资料。重置需显式确认，仅影响当前模拟项目。

State 至少含 project、scenarios、documents、facts、findings、runs、artifacts、tasks、assets、laws、events；均为 JSON，列表元素有 id。scenario 含 id/title/stage/description；document 含 id/name/version/status/text/source；artifact 含 id/scenarioId/title/content/sources/status/version。服务端尽早在 docs/specs/api.md 固化具体字段及动作参数。客户端不得维护另一份业务事实。上传可用 JSON {name,mimeType,contentBase64}，大小和类型受服务端限制。处理规则输出必须源于输入，AI 错误必须可见。

## 数据链与验收

资料原件及版本 → 可定位解析内容 → 待确认事实 → 经确认数据 → 线索/检查 → 底稿与报告 → 反馈/复核 → 出具前确认 → 整改/归档 → 受控三库资产。引用绑定具体版本；新资料、事实修正或文稿变化仅使受影响的确认失效，保留历史。

每个场景至少有一次成功执行、缺资料或错误条件验证、来源可追溯和持久化验证。三个贯穿变化测试：合同版本变化影响 B05 及引用成果；金额单位/日期修正触发重算；E01 关键事实变更使相关确认失效。覆盖图纸低清、影像重复、语音转写错误提示、反馈已回复但未落实、整改与归档独立、能力发布前测试、跨项目复用不复制事实。真实模型冒烟和完整 UI 流程单独记录，不以单元测试替代。

## 交付门槛

所有功能清单和验证结果按实填写；未完成项不得标记通过。交付包含 Word 修订版、输入资料与测试真值、源代码、可复现安装脚本、试用指南、验收报告、备份恢复步骤。服务器密钥与运行数据不入 Git。
