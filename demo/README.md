# openAudit 模拟材料包

**演示模拟数据。** 所有项目、主体、角色、业务日期和业务金额均为新生成的虚构设定。法规是官方真实条文的短摘录，保留条号、施行信息和官方链接，全部处于“待人工核验”。不含真实签名、公章、银行账户或可报销发票。

主项目为“澄川市南岸片区雨污分流与道路更新工程”（`DEMO-AUDIT-2027-006`）；第二项目为“澄川市北溪支路海绵化改造工程”（`DEMO-AUDIT-2027-009`）。2027 年为模拟业务期间，不是已经发生的真实项目事实。

`manifest.json` 是后端导入清单，文件路径相对 demo 根目录；`seed.json` 保留相同文件清单、可读项目事实和辅助表。每个 document 含 id、name、logicalId、version、status、text、source、path、records、SHA-256、格式与批次。records 是生成器给出的模拟结构化派生输入，**不代表 OCR、ASR 或模型提取成功**。后端保存真实原件，派生记录需逐项核对。

材料按阶段导入：

| 批次 | 内容 | 导入方式 |
|---|---|---|
| initial | 前期、合同V1、计量支付、图纸盘点、音视频及法规 | `seed {batch:'initial'}` |
| feedback | 账户及日期补证、底稿、报告V1、组内讨论和反馈 | `seed {batch:'feedback'}` |
| review | 合同V2、送审目录、复核与业务会议、拟出具稿 | `seed {batch:'review'}` |
| rectification | 三轮证明、复查、公告模板、归档和第二项目 | `seed {batch:'rectification'}` |

默认只导入 initial；后续材料按演示进程开放。`all` 仅用于测试或明确标识的全量预载。两版台账和合同均保留，最新接收不等于最新有效。`packages/initial-materials.zip` 是可选真实压缩包输入，不能在已导入清单后无差别再次汇总。

## 复现

从仓库根目录运行（需要 Python 3.10+、中文字体、Cairo 系统库及联网首次安装依赖）：

```bash
python3 -m venv /tmp/openaudit-docs-venv
/tmp/openaudit-docs-venv/bin/pip install -r demo/requirements.txt
/tmp/openaudit-docs-venv/bin/python scripts/generate-demo.py
/tmp/openaudit-docs-venv/bin/python scripts/revise-plan.py
```

系统缺 ensurepip 时可先 `python3 -m venv --without-pip /tmp/openaudit-docs-venv`，再用系统 pip 的 `--target /tmp/openaudit-docs-venv/lib/python3.10/site-packages` 安装依赖；其中 Python 小版本应与环境一致。字体默认 `/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc`，不具备时需安装文泉驿字体或明确修改生成器中的字体路径。不得把字体不同导致的视觉差异说成相同产物。

生成器固定日期、内容、Office ZIP 时间戳和 PDF ID，同一依赖与字体环境可复现文件指纹；不覆盖原始 V2。实际 TTS 由协调者的 `scripts/synthesize-audio.py` 生成，其云模型输出并非位级确定，因此已交付 `media/interview-tts.wav` 作为可复现输入保留；无该文件时生成器不伪造语音，也不宣称全量音频场景可用。人工 TTS 脚本位于 `media/interview-script.txt`，它不是 ASR 输出。

`media/site-inspection.mp4` 为 12 秒有实际画面的合成踏勘视频；字幕按实际生成段落设置为 0—4、4—8、8—12 秒。图纸、库房、扫描件均为程序生成，不是现场照片或可施工设计。录音约 51.267 秒、16kHz 单声道，开头明确说明模拟和合成。逐句语音时间码应通过实际 ASR 或人工对齐获得，不能由脚本文字推算。

## 演示与测试

`scenario-material-map.json/.csv` 覆盖 24 场景的具体资料、操作和可观察结果；`acceptance-checklist.csv` 为待实测记录表，不能将预期结果直接填成通过。完整验收需记录实际输入版本、输出文件、来源、运行/错误、人工决定和浏览器证据。

重要口径：48600万元是批复概算，50200万元是台账填报口径，差1600万元继续待核。120米×1800元/米＝216000元＝21.6万元是潜在重复计量金额，不能直接等同已多付款或损失；不同管线桩号相同不构成重复。银行与账簿同一交易不能重复汇总，同额支付要检查冲回链。整改最后一轮是工程款冲减与对账，不是现金到账证明；不同证明类型需相应人工核验。

`truth/` 仅供测试人员使用，**严禁业务导入、模型检索或生成提示读取**。`truth/validate-fixtures.mjs` 使用真实后端与文件解析运行确定性场景，并将报告留在 truth；运行命令 `node demo/truth/validate-fixtures.mjs`。通过仅说明材料接口和规则运行，不能替代 24 场景业务、人审、模型、界面和部署验收。运行后的随机成果ID与时间属于验证证据，不属于可复现业务输入。

法律资料 `laws.json` 的引用来源均实际浏览于2026-11-14。适用条件不满足或效力/行为期间存疑时保持待核验；真实演示前应复核是否有后续修法。法律适用、整改销号和资产发布始终需要有权人员确认。
