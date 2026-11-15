import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  GitCompareArrows,
  Layers,
  Link2,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  DataTable,
  DataView,
  Empty,
  Markdown,
  Media,
  Sources,
} from "./components";
import { AssetView, ReviewLists, dateText } from "./App";
import {
  apiUrl,
  operationNames,
  display,
  isStale,
  list,
  sourceList,
  type Row,
  type State,
} from "./model";
type Props = {
  state: State;
  scenario: Row;
  busy: boolean;
  act: (a: string, p?: any, s?: string) => Promise<any>;
  onSource: (s: any) => void;
  onAction: (a: string, t?: string, r?: Row, title?: string) => void;
};
const kindNames: Record<string, string> = {
  project: "项目基础",
  approval: "批复与决策",
  contract: "合同",
  payment: "支付",
  measurement: "计量",
  drawing: "图纸",
  inventory: "库存台账",
  count: "实盘记录",
  media: "音视频 / 现场记录",
  feedback: "意见反馈",
  review: "复核意见",
  report: "报告",
  rectification: "整改证明",
  requirement: "资料要求",
  law: "法规依据",
  template: "文书模板",
  handover: "移交材料",
};
const factKinds: Record<string, string[]> = {
  A01: ["project"],
  A02: ["project", "contract"],
  A03: ["project", "template"],
  B01: ["payment", "contract"],
  B02: ["approval", "project", "payment", "contract"],
  B03: ["measurement", "contract"],
  B04: ["law", "project"],
  B05: ["contract", "payment"],
  B06: ["drawing", "measurement"],
  B07: ["inventory", "count", "media"],
  B08: ["media"],
  B09: ["measurement", "media"],
  C01: ["report"],
  C02: ["feedback"],
  D01: ["requirement"],
  D02: ["report"],
  D03: ["law", "report"],
  D04: ["review"],
  E01: ["report"],
  F01: ["rectification"],
  F02: ["rectification"],
  F03: ["report"],
  F04: ["requirement"],
  F05: ["measurement"],
};
const inputHints: Record<string, string> = {
  A01: "检查应有资料、版本及变化影响；新接收不等于最新有效。",
  A02: "主体、资金与期间关系均来自已保存资料。未核实关系不会作为责任认定。",
  A03: "填写本次审计重点，选择需要起草的文书，再逐项核对草稿。",
  B01: "按合同编号汇总每笔款项。如金额、单位或合同编号有误，请先修改基础事实再重新核查。",
  B02: "核对原始日期及其含义；如需调整，可修改基础事实后重新梳理。",
  B03: "按事项及实体匹配，复算计量区间交集。差异仅形成待核线索。",
  B04: "先核对法规官方原文、生效期间和适用条件；不自动认定违法。",
  B05: "按所选合同具体版本复算比例、冲回与验收条件。有效版本由人确定。",
  B06: "图纸参数须有清晰出处，并经人工核验后才能参与复算。",
  B07: "人工盘点数量与换算确认独立记录，重复影像不能重复计数。",
  B08: "保留时间码、说话人及转写不确定性。录音、影像和陈述分别核验。",
  B09: "转换保留原始事实和来源，待核陈述不会自动升级为已查明事实。",
  C01: "涉及金额与建议处理金额分列；同一事项引用按业务标识去重。",
  C02: "反馈签收、回复、采纳和落实分别记录；已回复不代表已落实。",
  D01: "检查具体送审清单及指定版本，缺件需补正后重新运行。",
  D02: "检查样本范围、数字、依据引用与未决事项，保留独立复核责任。",
  D03: "核验拟引用依据的原文、行为期间和已证明条件。",
  D04: "修改位置、证据、回复及重新核对关联；冲突意见需人工协调。",
  E01: "事实、日期、数字、版本四类审核。文稿或关键事实变动使相关确认失效。",
  F01: "单位自报状态与审计核验状态分开；到账、主体和凭证唯一性逐项核对。",
  F02: "复查连续期数据与反弹情况；销号需人工决定及有效证明。",
  F03: "起草审计结果公告，保留事实限定并按范围显示信息；不执行公开发布。",
  F04: "应有、实有及缺件三方核对，归档与整改状态独立管理。",
  F05: "来源、脱敏、授权、适用性及方法验证完成后方可审核入库。",
};
export function ScenarioView({
  state,
  scenario,
  busy,
  act,
  onSource,
  onAction,
}: Props) {
  const [explicit, setExplicit] = useState(false);
  const [documentIds, setDocuments] = useState<string[]>([]);
  const [artifactIds, setArtifacts] = useState<string[]>([]);
  const [useModel, setUseModel] = useState(false);
  const [options, setOptions] = useState<Record<string, any>>({});
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState("structured");
  const [localError, setError] = useState("");
  const [auxResult, setAuxResult] = useState<any>(null);
  const artifacts = state.artifacts.filter(
    (a) => a.scenarioId === scenario.id && !a.productKind,
  );
  const current =
    artifacts.find((a) => a.id === selectedId) || artifacts.at(-1);
  const runs = state.runs.filter(
    (r) => r.scenarioId === scenario.id && !r.productKind,
  );
  const lastRun = runs.at(-1);
  const persistedFindings = state.findings.filter(
    (f) => f.artifactId === current?.id,
  );
  const currentFindings = persistedFindings.length
    ? persistedFindings
    : list(current?.findings);
  const relevantFacts = state.facts.filter(
    (f) =>
      f.status !== "superseded" &&
      (factKinds[scenario.id] || []).includes(
        f.recordType ||
          f.record?.type ||
          state.documents.find((d) => d.id === f.documentId)?.kind,
      ),
  );
  const relevantMedia = state.documents.filter(
    (d) =>
      (factKinds[scenario.id] || []).includes(d.kind) &&
      (/^(image|audio|video)\//.test(d.mimeType) ||
        d.kind === "drawing" ||
        d.kind === "media"),
  );
  const run = async () => {
    setError("");
    try {
      const r = await act(
        "run",
        {
          ...(explicit ? { documentIds } : {}),
          artifactIds,
          options,
          useModel,
        },
        scenario.id,
      );
      const a = r?.artifact?.id || r?.artifactId;
      if (a) setSelectedId(a);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <section className="card run-config">
        <div className="section-heading">
          <div className="section-title">
            <Settings2 size={19} />
            <h2>办理准备</h2>
          </div>
          <span className="badge neutral">办理结果自动保存</span>
        </div>
        <p className="scenario-hint">{inputHints[scenario.id]}</p>
        <div className="required-kinds">
          <span>所需资料</span>
          {list(scenario.requiredKinds).map((k: any) => (
            <span
              className={
                "kind-chip " +
                (state.documents.some((d) => d.kind === k)
                  ? "present"
                  : "missing")
              }
              key={k}
            >
              {state.documents.some((d) => d.kind === k) ? (
                <CheckCircle2 size={12} />
              ) : (
                <span>○</span>
              )}
              {kindNames[k] || k}
            </span>
          ))}
        </div>
        <details className="optional-settings">
          <summary>
            调整本次使用的资料{" "}
            <span className="muted small">
              {explicit
                ? `已指定 ${documentIds.length} 份资料`
                : "默认使用项目当前适用资料"}
              {artifactIds.length ? ` · 引用 ${artifactIds.length} 份成果` : ""}
            </span>
          </summary>
          <div className="config-grid">
            <div>
              <label>
                本次使用的资料
                <select
                  value={explicit ? "explicit" : "default"}
                  onChange={(e) => setExplicit(e.target.value === "explicit")}
                >
                  <option value="default">
                    使用项目当前适用资料（自动记录版本）
                  </option>
                  <option value="explicit">自行选择资料及版本</option>
                </select>
              </label>
              {explicit && (
                <div className="checkbox-list source-picker">
                  {state.documents.map((d) => (
                    <label key={d.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={documentIds.includes(d.id)}
                        onChange={(e) =>
                          setDocuments(
                            e.target.checked
                              ? [...documentIds, d.id]
                              : documentIds.filter((x) => x !== d.id),
                          )
                        }
                      />
                      <span>
                        {d.name}{" "}
                        <small>
                          V{d.version} · {display(d.status)}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={"查看" + d.name}
                        onClick={(e) => {
                          e.preventDefault();
                          onSource({ documentId: d.id });
                        }}
                      >
                        <Link2 size={13} />
                      </button>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label>前序成果引用（可选）</label>
              <details className="source-select">
                <summary>
                  {artifactIds.length
                    ? `已选择 ${artifactIds.length} 个成果版本`
                    : "选择底稿、报告或复核成果"}
                  <ChevronDown size={14} />
                </summary>
                <div className="checkbox-list">
                  {state.artifacts
                    .filter((a) => a.scenarioId !== scenario.id)
                    .map((a) => (
                      <label className="checkbox-label" key={a.id}>
                        <input
                          type="checkbox"
                          checked={artifactIds.includes(a.id)}
                          onChange={(e) =>
                            setArtifacts(
                              e.target.checked
                                ? [...artifactIds, a.id]
                                : artifactIds.filter((x) => x !== a.id),
                            )
                          }
                        />
                        <span>
                          {a.scenarioId} · {a.title} V{a.version} ·{" "}
                          {display(a.status)}
                        </span>
                      </label>
                    ))}
                  {!state.artifacts.length && (
                    <p className="muted small">尚无可引用成果</p>
                  )}
                </div>
              </details>
            </div>
          </div>
        </details>
        <Options
          scenarioId={scenario.id}
          options={options}
          setOptions={setOptions}
        />
        <details className="editable-inputs">
          <summary>
            <FileText size={15} />
            核对或修改基础事实 <span>{relevantFacts.length} 条可核对记录</span>
            <ChevronDown size={14} />
          </summary>
          <p className="small muted">
            核对资料出处后修改事实并填写理由。修改后重新办理，以更新引用该事实的结果。
          </p>
          <div className="input-records">
            {relevantFacts.map((f) => (
              <div className="input-record" key={f.id}>
                <div>
                  <strong>
                    {f.record?.title || f.record?.name || f.record?.id || f.key}
                  </strong>
                  <small>
                    {kindNames[f.recordType] || f.recordType} · V{f.version}
                  </small>
                  <Sources row={f} onSource={onSource} />
                </div>
                <Badge value={f.status} />
                <button
                  className="button secondary compact"
                  disabled={busy}
                  onClick={() =>
                    onAction("revise", "fact", f, "修改事实与计算口径")
                  }
                >
                  修改事实
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    onAction("confirm", "fact", f, "核验并确认事实")
                  }
                >
                  确认事实
                </button>
              </div>
            ))}
          </div>
          {!relevantFacts.length && (
            <Empty title="尚无相关事实记录">
              上传所需资料，核对系统摘录；必要时补充人工摘录。
            </Empty>
          )}
        </details>
        <details className="optional-settings intelligent-settings">
          <summary>
            智能辅助分析（选用）
            <span className="muted small">
              {useModel ? "已开启" : "未开启"}
            </span>
          </summary>
          <label className="checkbox-label model-toggle">
            <input
              type="checkbox"
              checked={useModel}
              onChange={(e) => setUseModel(e.target.checked)}
            />
            <Sparkles size={16} />
            <span>
              使用智能辅助分析<small>分析建议须由审计人员核实</small>
            </span>
          </label>
          {useModel && ["B06", "B07", "B08"].includes(scenario.id) && (
            <div className="form-grid">
              <label>
                智能识别方式
                <select
                  value={options.mode || "auto"}
                  onChange={(e) => {
                    const next = { ...options };
                    if (e.target.value === "auto") delete next.mode;
                    else next.mode = e.target.value;
                    setOptions(next);
                  }}
                >
                  <option value="auto">按所选媒体自动选择</option>
                  <option value="vision">识别照片和视频画面</option>
                  <option value="text">分析已提取文字</option>
                </select>
              </label>
              <label>
                视频抽帧时间（秒，逗号分隔）
                <input
                  placeholder="0"
                  value={(options.seconds || []).join(",")}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      seconds: e.target.value
                        .split(",")
                        .map(Number)
                        .filter((n) => Number.isFinite(n) && n >= 0),
                    })
                  }
                />
              </label>
            </div>
          )}
          {useModel && (
            <label>
              需要辅助分析的问题（选填）
              <textarea
                rows={2}
                value={options.prompt || ""}
                onChange={(e) =>
                  setOptions({ ...options, prompt: e.target.value })
                }
                placeholder="例如：请列出需进一步核实的付款条件"
              />
            </label>
          )}
        </details>
        <div className="run-footer">
          <button
            className="button primary"
            disabled={busy || (explicit && !documentIds.length)}
            onClick={() => void run()}
          >
            <Play size={16} />
            {busy ? "正在办理…" : operationNames[scenario.id] || "开始办理"}
          </button>
        </div>
        {localError && (
          <div className="notice error" role="alert">
            {localError}
          </div>
        )}
      </section>
      {["B04", "D03"].includes(scenario.id) && (
        <section className="card margin-top">
          <div className="section-heading padded">
            <div className="section-title">
              <BookOpen size={19} />
              <h2>法规原文与适用性核验</h2>
            </div>
            <span className="small muted">官方出处 · 施行期间 · 人工判断</span>
          </div>
          <div className="law-grid">
            {state.laws.map((l) => (
              <article className="law-card" key={l.id}>
                <Badge value={l.status} />
                <h3>{l.title}</h3>
                <p className="small muted">
                  {l.article} · 施行：{l.effectiveFrom || "未提供"}
                  {l.effectiveTo ? ` · 失效：${l.effectiveTo}` : ""}
                </p>
                <blockquote>
                  {l.excerpt || "未提供可靠原文，不生成法规号或引文。"}
                </blockquote>
                <p>
                  适用条件：
                  {Array.isArray(l.conditions)
                    ? l.conditions.map(display).join("；")
                    : display(l.conditions)}
                </p>
                {/^https?:\/\//.test(l.officialUrl || "") && (
                  <a
                    className="text-button"
                    href={l.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看官方原文 <ExternalLink size={13} />
                  </a>
                )}
                <Sources row={l} onSource={onSource} />
                <button
                  className="button secondary compact"
                  disabled={busy}
                  onClick={() =>
                    onAction("confirm", "law", l, "人工核验法规适用性")
                  }
                >
                  记录适用性确认
                </button>
              </article>
            ))}
            {!state.laws.length && (
              <Empty title="未导入法规依据">
                保留官方原文、URL、生效日期及待人工核验状态后再运行。
              </Empty>
            )}
          </div>
        </section>
      )}
      {["B06", "B07", "B08"].includes(scenario.id) && (
        <section className="card margin-top">
          <div className="section-heading padded">
            <h2>
              {scenario.id === "B06"
                ? "图纸与区域依据"
                : scenario.id === "B07"
                  ? "盘点影像与实物记录"
                  : "现场照片、录音与录像"}
            </h2>
            <span className="muted small">图像不替代现场真实性与专业判断</span>
          </div>
          <div className="media-grid">
            {relevantMedia.map((d) => (
              <article className="media-card" key={d.id}>
                <Media doc={d} />
                <h3>{d.name}</h3>
                <Badge value={d.parseStatus} />
                <span className="version-pill">V{d.version}</span>
                {d.mimeType?.startsWith("audio/") && (
                  <button
                    className="button secondary compact"
                    disabled={busy}
                    onClick={() =>
                      void act("transcribe", { documentId: d.id }).catch((e) =>
                        setError(e.message),
                      )
                    }
                  >
                    录音转文字
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    onSource({
                      documentId: d.id,
                      version: d.version,
                      locator: d.records?.[0]?.locator || "全文",
                    })
                  }
                >
                  打开原件与区域 / 时间码 <ArrowRight size={14} />
                </button>
              </article>
            ))}
            {!relevantMedia.length && (
              <Empty title="尚无现场媒体资料">
                接收图纸、影像或录音，并保留区域及时间码定位。
              </Empty>
            )}
          </div>
        </section>
      )}
      <section className="card margin-top output-card">
        <div className="section-heading padded">
          <div className="section-title">
            <FileCheck2 size={19} />
            <h2>办理结果</h2>
            {current && <Badge value={current.status} />}
          </div>
          {artifacts.length > 0 && (
            <select
              aria-label="选择成果历史版本"
              className="artifact-select"
              value={current?.id || ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {[...artifacts].reverse().map((a) => (
                <option value={a.id} key={a.id}>
                  V{a.version} · {dateText(a.createdAt)} · {display(a.status)}
                </option>
              ))}
            </select>
          )}
        </div>
        {current ? (
          <>
            {isStale(current) && (
              <div className="notice warning in-card">
                <strong>引用资料已变更，需要重新核对</strong>
                <span>
                  {current.invalidationReason ||
                    current.staleReason ||
                    "原确认已失效，请重新运行并对照来源核验。历史成果仍可查看。"}
                </span>
              </div>
            )}
            <p className="result-guidance">
              先查看核查结果与资料出处，再核验确认或修改文稿。需要报送、签发或送达时，请到{" "}
              <a href="#workflow">文书办理台账</a> 登记实际办理情况。
            </p>
            <div className="output-toolbar">
              <div className="tabs">
                <button
                  className={tab === "structured" ? "active" : ""}
                  onClick={() => setTab("structured")}
                >
                  结果明细
                </button>
                <button
                  className={tab === "checks" ? "active" : ""}
                  onClick={() => setTab("checks")}
                >
                  检查项 <span>{list(current.checks).length}</span>
                </button>
                <button
                  className={tab === "document" ? "active" : ""}
                  onClick={() => setTab("document")}
                >
                  文书草稿
                </button>
              </div>
              <div className="toolbar-actions">
                <a
                  className="icon-button"
                  title="下载文本稿（Markdown）"
                  aria-label="下载文本稿（Markdown）"
                  href={apiUrl(
                    "/export?artifactId=" +
                      encodeURIComponent(current.id) +
                      "&format=md",
                  )}
                >
                  <Download size={17} />
                </a>
                <a
                  className="text-button small"
                  href={apiUrl(
                    "/export?artifactId=" +
                      encodeURIComponent(current.id) +
                      "&format=csv",
                  )}
                >
                  数据表（CSV）
                </a>
                <a
                  className="text-button small"
                  href={apiUrl(
                    "/export?artifactId=" +
                      encodeURIComponent(current.id) +
                      "&format=docx",
                  )}
                >
                  导出 Word
                </a>
                <a
                  className="text-button small"
                  href={apiUrl(
                    "/export?artifactId=" +
                      encodeURIComponent(current.id) +
                      "&format=xlsx",
                  )}
                >
                  导出 Excel
                </a>
              </div>
            </div>
            {tab === "structured" && (
              <>
                {current.summary && (
                  <section className="result-summary">
                    <h3>核查结果摘要</h3>
                    <DataView value={current.summary} onSource={onSource} />
                  </section>
                )}
                {currentFindings.length > 0 && (
                  <section
                    className="result-findings"
                    aria-label="本次核查线索"
                  >
                    <div className="section-heading">
                      <h3>本次核查线索 · {currentFindings.length} 项</h3>
                      <span className="small muted">
                        核实前不作为已查明问题
                      </span>
                    </div>
                    {currentFindings.map((finding, index) => (
                      <article key={finding.id || index}>
                        <div className="section-heading">
                          <strong>{finding.title}</strong>
                          <Badge value={finding.status || "pending"} />
                        </div>
                        {finding.amount != null && (
                          <div className="finding-amount">
                            待核实金额 <strong>{finding.amount}</strong>{" "}
                            {finding.unit || "元"}
                          </div>
                        )}
                        <p>{finding.detail || finding.description}</p>
                        <Sources row={finding} onSource={onSource} />
                        {persistedFindings.some((f) => f.id === finding.id) && (
                          <div className="row-actions">
                            <button
                              disabled={busy}
                              onClick={() =>
                                onAction(
                                  "confirm",
                                  "finding",
                                  finding,
                                  "核验并确认本条线索",
                                )
                              }
                            >
                              核验此线索
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                onAction(
                                  "resolve",
                                  "finding",
                                  finding,
                                  "核查排除或处理决定",
                                )
                              }
                            >
                              记录处理决定
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </section>
                )}
                <Structured
                  scenarioId={scenario.id}
                  rows={list(current.rows)}
                  onSource={onSource}
                />
              </>
            )}
            {tab === "checks" && (
              <div className="check-list">
                {list(current.checks).map((c, i) => (
                  <div className="check-item" key={c.id || i}>
                    <div className="section-heading">
                      <strong>{c.message || c.title || c.code}</strong>
                      <Badge value={c.status} />
                    </div>
                    {c.blocking && (
                      <span className="badge danger">阻断整体确认</span>
                    )}
                    <Sources row={c} onSource={onSource} />
                    <details>
                      <summary>核验详情</summary>
                      <DataView value={c} onSource={onSource} />
                    </details>
                  </div>
                ))}
                {!list(current.checks).length && (
                  <Empty title="本次技术检查未返回异常项">
                    仍需人工核验事实、来源和适用性。
                  </Empty>
                )}
              </div>
            )}
            {tab === "document" && (
              <div className="document-view">
                <Markdown text={current.content} />
                <div className="inset">
                  <h3>引用索引（绑定来源版本）</h3>
                  <Sources row={current} onSource={onSource} />
                </div>
              </div>
            )}
            <div className="artifact-footer">
              <span className="small muted">
                {current.id} · V{current.version} · 演示模拟数据
              </span>
              <div className="toolbar-actions">
                <button
                  className="button secondary compact"
                  disabled={busy || artifacts.length < 2}
                  onClick={() =>
                    onAction("compare", "artifact", undefined, "比较成果版本")
                  }
                >
                  <GitCompareArrows size={14} />
                  版本对照
                </button>
                <button
                  className="button secondary compact"
                  disabled={busy}
                  onClick={() =>
                    onAction(
                      "revise",
                      "artifact",
                      current,
                      "修订成果并保留历史",
                    )
                  }
                >
                  编辑成果
                </button>
                <button
                  className="button primary compact"
                  disabled={busy || isStale(current)}
                  onClick={() =>
                    onAction(
                      "confirm",
                      "artifact",
                      current,
                      "核验并确认此成果版本",
                    )
                  }
                >
                  <ShieldCheck size={15} />
                  人工确认
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty title="等待首次实际运行">
            选择输入并执行“{operationNames[scenario.id]}
            ”，完成后在这里查看结果。
          </Empty>
        )}
      </section>
      {lastRun && (
        <div
          className={
            "run-receipt " + (lastRun.status === "failed" ? "failed" : "")
          }
        >
          <span>最近实际运行</span>
          <Badge value={lastRun.status} />
          <span>{dateText(lastRun.startedAt)}</span>
          <span>
            {lastRun.engine === "deterministic+model"
              ? "系统计算及智能辅助"
              : lastRun.engine === "deterministic"
                ? "规则计算，未调用模型"
                : display(lastRun.engine)}
          </span>
          {lastRun.error && <strong>{display(lastRun.error)}</strong>}
        </div>
      )}
      {(state.findings.some((r) => r.scenarioId === scenario.id) ||
        state.tasks.some((r) => r.scenarioId === scenario.id)) && (
        <ReviewLists
          state={state}
          busy={busy}
          onSource={onSource}
          onAction={onAction}
          scenarioId={scenario.id}
        />
      )}
      {scenario.id === "F05" && (
        <>
          <div className="section-heading margin-top">
            <h2>可供参考的经验与方法</h2>
          </div>
          <AssetView
            state={state}
            busy={busy}
            onSource={onSource}
            onAction={onAction}
            act={act}
            setResult={setAuxResult}
          />
          {auxResult && (
            <section className="card padded margin-top">
              <h3>能力实际测试结果</h3>
              <DataView value={auxResult} onSource={onSource} />
            </section>
          )}
        </>
      )}
    </>
  );
}
function Options({
  scenarioId,
  options,
  setOptions,
}: {
  scenarioId: string;
  options: any;
  setOptions: (o: any) => void;
}) {
  const set = (k: string, v: any) => setOptions({ ...options, [k]: v });
  return (
    <div className="scenario-options">
      {scenarioId === "A01" && (
        <details className="optional-settings">
          <summary>调整应提供资料清单（选填）</summary>
          <p className="small muted">
            未调整时按项目资料要求核对；勾选后使用本次选择的类别。
          </p>
          <div className="inline-checks">
            {Object.entries(kindNames).map(([key, title]) => (
              <label className="checkbox-label" key={key}>
                <input
                  type="checkbox"
                  checked={(options.requiredKinds || []).includes(key)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...(options.requiredKinds || []), key]
                      : (options.requiredKinds || []).filter(
                          (x: string) => x !== key,
                        );
                    const updated = { ...options };
                    if (next.length) updated.requiredKinds = next;
                    else delete updated.requiredKinds;
                    setOptions(updated);
                  }}
                />
                {title}
              </label>
            ))}
          </div>
        </details>
      )}
      {scenarioId === "A03" && (
        <>
          <label>
            本次审计重点（每行一项）
            <textarea
              rows={3}
              placeholder={"投资口径\n合同履约\n工程计量"}
              value={(options.focus || []).join("\n")}
              onChange={(e) => set("focus", e.target.value.split("\n"))}
            />
          </label>
          <label>需要起草的文书</label>
          <div className="inline-checks">
            {["实施方案", "审计通知书", "提供资料清单", "审前公告"].map((t) => (
              <label className="checkbox-label" key={t}>
                <input
                  type="checkbox"
                  checked={(
                    options.documentTypes || [
                      "实施方案",
                      "审计通知书",
                      "提供资料清单",
                    ]
                  ).includes(t)}
                  onChange={(e) => {
                    const ts = options.documentTypes || [
                      "实施方案",
                      "审计通知书",
                      "提供资料清单",
                    ];
                    set(
                      "documentTypes",
                      e.target.checked
                        ? [...ts, t]
                        : ts.filter((x: string) => x !== t),
                    );
                  }}
                />
                {t}
              </label>
            ))}
          </div>
        </>
      )}
      {["B04", "D03"].includes(scenarioId) && (
        <label>
          本次核验行为发生日（选填，未指定则使用来源记录）
          <input
            type="date"
            value={options.behaviorDate || ""}
            onChange={(e) => {
              const next = { ...options };
              if (e.target.value) next.behaviorDate = e.target.value;
              else delete next.behaviorDate;
              setOptions(next);
            }}
          />
        </label>
      )}
      {scenarioId === "B09" && (
        <label>
          需要起草的审计记录
          <select
            value={options.documentType || "工作底稿"}
            onChange={(e) => set("documentType", e.target.value)}
          >
            {["工作底稿", "取证单", "询问记录", "核查表", "事项汇总"].map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
        </label>
      )}
      {scenarioId === "F03" && (
        <>
          <label>拟公开的内容范围</label>
          <div className="inline-checks">
            {[
              ["title", "问题标题"],
              ["amount", "涉及金额"],
            ].map(([v, t]) => (
              <label className="checkbox-label" key={v}>
                <input
                  type="checkbox"
                  checked={(
                    options.publicScope || ["title", "amount"]
                  ).includes(v)}
                  onChange={(e) => {
                    const values = options.publicScope || ["title", "amount"];
                    set(
                      "publicScope",
                      e.target.checked
                        ? [...values, v]
                        : values.filter((x: string) => x !== v),
                    );
                  }}
                />
                {t}
              </label>
            ))}
          </div>
          <p className="small muted">
            起草公告后仍需人工核对正文脱敏与公开范围。
          </p>
        </>
      )}
    </div>
  );
}
function Structured({
  scenarioId,
  rows,
  onSource,
}: {
  scenarioId: string;
  rows: Row[];
  onSource: (s: any) => void;
}) {
  if (!rows.length) return <Empty title="本次成果未返回业务明细" />;
  if (scenarioId === "B02")
    return (
      <div className="timeline">
        {rows.map((r, i) => (
          <article key={r.id || i}>
            <div className="timeline-date">
              <strong>{r.date || "日期待核"}</strong>
              <small>{r.dateRole}</small>
            </div>
            <div className="timeline-node" />
            <div className="timeline-card">
              <Badge value={r.status} />
              <h3>{r.event || r.title || r.id}</h3>
              <p>
                {r.subject}
                {r.contractId ? ` · ${r.contractId}` : ""}
              </p>
              {r.daysSincePrevious != null && (
                <p className="small muted">
                  距前一事件 {r.daysSincePrevious} 天（时间间隔不等于因果关系）
                </p>
              )}
              <Sources row={r} onSource={onSource} />
            </div>
          </article>
        ))}
      </div>
    );
  if (scenarioId === "A02")
    return (
      <div className="relationship-view">
        <p className="small muted">
          虚线表示待核实关联，全部节点均可回看资料；不是法律责任认定图。
        </p>
        {rows.map((r, i) => (
          <div className="relationship" key={r.id || i}>
            <button onClick={() => onSource(sourceList(r)[0] || {})}>
              {r.from || "主体待核"}
            </button>
            <div
              className={
                r.status === "人工已确认"
                  ? "relation-line confirmed"
                  : "relation-line"
              }
            >
              <span>{r.relation}</span>
              <ArrowRight size={16} />
              <small>
                {[r.fromDate, r.toDate].filter(Boolean).join(" — ")}
              </small>
            </div>
            <button onClick={() => onSource(sourceList(r)[0] || {})}>
              {r.to || "关联对象待核"}
            </button>
            <Sources row={r} onSource={onSource} />
          </div>
        ))}
      </div>
    );
  if (scenarioId === "E01")
    return (
      <div className="review-panels">
        {rows.map((r, i) => (
          <article className="review-panel" key={r.id || i}>
            <span className="panel-index">0{i + 1}</span>
            <h3>{r.category}</h3>
            <Badge value={r.status} />
            <p>
              <strong>{r.issues ?? 0}</strong> 项需核对事项
            </p>
            <small className="muted">
              报告版本：{r.reportVersions || "未提供"}
            </small>
            <Sources row={r} onSource={onSource} />
          </article>
        ))}
      </div>
    );
  if (["C02", "D04", "F01", "F02"].includes(scenarioId))
    return (
      <div className="business-cards">
        {rows.map((r, i) => (
          <article className="business-card" key={r.id || i}>
            <div className="section-heading">
              <h3>{r.issueId || r.target || r.id}</h3>
              <Badge value={r.status || r.recommendation} />
            </div>
            <DataView value={r} onSource={onSource} />
          </article>
        ))}
      </div>
    );
  if (scenarioId === "F04" || scenarioId === "D01")
    return (
      <div className="archive-compare">
        <div className="archive-head">
          <span>应有资料 / 清单要求</span>
          <span>实际资料 / 具体版本</span>
          <span>缺口与人工核验</span>
        </div>
        {rows.map((r, i) => (
          <div className="archive-row" key={r.id || i}>
            <strong>{r.required}</strong>
            <div>
              <p>{r.name || r.provided}</p>
              <small className="muted">
                版本 {r.version || r.providedVersion || "未提供"} · 要求版本{" "}
                {r.requiredVersion || "依清单"}
              </small>
            </div>
            <div>
              <Badge value={r.status} />
              <Sources row={r} onSource={onSource} />
            </div>
          </div>
        ))}
      </div>
    );
  return <DataTable rows={rows} onSource={onSource} />;
}
