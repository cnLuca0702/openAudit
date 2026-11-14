# openAudit

政府投资项目审计全流程演示工作台，运行于独立的 **DeepSeek Harness 0.2.2-rc.1**。六个阶段、24 个场景贯穿同一模拟工程，资料、事实、成果、人工确认和变更影响均持久化并保留来源。

**所有项目资料均为演示模拟数据。** 数值校核由业务规则计算；真实 DeepSeek 文本、GLM 图像/扫描件识别和语音转写提供待核分析。模型失败会留下失败记录。事实认定、法规适用、审批和销号需要人工处理。

## 开始使用

在新版 DSH 登录后点击侧栏 **审计工作台**，或访问同源 `/audit/`。先导入首批资料，再按需接收征求意见、审理复核和整改批次。资料原件可下载；来源面板定位到资料版本、段落、表格行、图像区域或时间段。修改金额、日期、资料版本或文稿会使受影响成果及确认失效。

- [修订方案 Word](docs/deliverables/政府投资项目审计全流程AI赋能演示方案-V3.docx) · [PDF](docs/deliverables/政府投资项目审计全流程AI赋能演示方案-V3.pdf)
- [演示操作指南](docs/deliverables/演示操作指南.md)
- [原方案与原文](docs/source/)
- [演示资料及清单](demo/) · [最终验收报告](validation/验收报告.md)
- [接口说明](docs/specs/api.md) · [部署、入口与恢复](deploy/README.md)

## 开发与验证

需要 Node.js 24、`poppler-utils`（PDF 文本/转图）和 `ffmpeg` / `ffprobe`（视频抽帧、录音分段）。

```sh
npm ci
npm run setup
npm run build
npm test
npm run test:e2e --prefix packages/client
```

浏览器测试启动仅绑定本机的临时服务，实际读取演示资料并操作持久化 API。生产部署使用 DSH 的 Host/Origin 与 Cookie 鉴权。部署验收脚本 `node scripts/verify-dsh.mjs` 读取被 Git 忽略的 `runtime/browser-auth.json`，应仅对独立演示项目执行。

目录：`packages/server` 业务与存储；`packages/client` 中文工作台；`packages/models` 真实模型适配器；`packages/parsers` 文件解析及 Office 导出；`packages/dsh-bridge` DSH 侧栏入口。`demo/truth` 只用于验收，不被业务导入。

## 当前交付边界

公网域名规划为 `audit-demo.myfangzhou.com`；服务器隧道入口已配置，DNS 由使用者后续设置。通过 VPN 或 SSH 转发可访问独立新版服务。旧 DSH 的安装、数据和服务保持独立。

文件单次接收上限 10 MiB；语音最长 600 秒，按实际分段生成时间范围；PDF 图像识别每次最多六页。识别内容、时序、说话人、图纸尺寸和法律适用仍需核验。此演示采用单项目持久化工作空间，并非多租户生产系统。

## 跟踪审计流程校正

按用户提供的《项目跟踪审计全流程.html》补充了流程与文书台账。入口为审计工作台左侧“流程与文书台账”，包括逐单位送达、期限、三道质控、四层证据链、花脸稿及四单元档案。详见 [逐项校正说明](docs/deliverables/跟踪审计流程校正说明.md)。参考案例不会覆盖当前项目事实。
