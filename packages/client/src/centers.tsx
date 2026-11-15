import { useState } from "react";
import {
  Badge,
  Dialog,
  Empty,
  EvidencePanel,
  Markdown,
  Sources,
} from "./components";
import { apiUrl, type Row, type State } from "./model";
import { WorkflowView } from "./workflow";

type Props = {
  state: State;
  busy: boolean;
  act: (action: string, payload?: any) => Promise<any>;
  navigate: (id: string) => void;
  onSource: (source: any) => void;
  onAction: (action: string, type?: string, row?: Row, title?: string) => void;
};
const centerTitles: Record<string, string> = {
  documents: "审计资料中心",
  evidence: "审计取证中心",
  workpapers: "审计底稿中心",
  "review-center": "复核审理中心",
};
const workflowKinds: Record<string, string[]> = {
  documents: ["subject", "milestone"],
  evidence: ["evidenceChain"],
  workpapers: ["redline", "archive"],
  "review-center": ["quality", "receipt", "issuance"],
};
const scenarios: Record<string, string[]> = {
  documents: ["A01", "A02", "A03", "B04"],
  evidence: ["B01", "B02", "B03", "B05", "B06", "B07", "B08"],
  workpapers: ["B09", "C01", "C02", "F04"],
  "review-center": ["D01", "D02", "D03", "D04", "E01"],
};
const guidance: Record<string, string> = {
  documents:
    "先选项目，再上传资料。需要时编制实施方案、提取资料摘录或开展审前调查。",
  evidence:
    "从问题疑点入手：安排核实、补充资料，再编制取证单。同一疑点可拆分取证，多个疑点可合并取证。",
  workpapers:
    "选取审计取证单编制工作底稿，再据此形成管理事项记录、进展报告和审计报告初稿。",
  "review-center":
    "围绕当前项目的报告与底稿，编写复核审理文书，并登记实际办理结果。",
};
function PickList({
  title,
  rows,
  selected,
  set,
  onSource,
  type,
}: {
  title: string;
  rows: Row[];
  selected: string[];
  set: (ids: string[]) => void;
  onSource: Props["onSource"];
  type: string;
}) {
  const [query, setQuery] = useState("");
  return (
    <details className="center-picker" open={selected.length > 0}>
      <summary>
        {title} · 已选 {selected.length} 项
      </summary>
      <label>
        查找{title}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入名称或编号"
        />
      </label>
      <div className="center-picker-list">
        {rows
          .filter((r) => (r.title || r.name || r.id).includes(query))
          .map((r) => (
            <div key={r.id} className="center-pick-row">
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={(e) =>
                    set(
                      e.target.checked
                        ? [...selected, r.id]
                        : selected.filter((id) => id !== r.id),
                    )
                  }
                />
                <span>
                  {r.title || r.name}{" "}
                  <small>
                    v{r.version || 1} · <Badge value={r.status} />
                  </small>
                </span>
              </label>
              {type !== "findingId" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onSource({ [type]: r.id })}
                >
                  查阅
                </button>
              )}
            </div>
          ))}
        {!rows.length && (
          <p className="muted">暂无可选内容。请先上传资料或编制前序文书。</p>
        )}
      </div>
    </details>
  );
}

export function ProjectChooser({
  state,
  busy,
  act,
  change,
}: {
  state: State;
  busy: boolean;
  act: Props["act"];
  change: (id: string) => void;
}) {
  const [operation, setOperation] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [actor, setActor] = useState(
    sessionStorage.getItem("audit-reviewer") || "",
  );
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <label className="project-chooser">
        当前项目
        <select
          aria-label="当前项目"
          disabled={busy}
          value={state.project.id}
          onChange={(e) => change(e.target.value)}
        >
          {(state.projects || [state.project]).map((p: Row) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => {
          setOperation("create");
          setName("");
          setUnit("");
          setError("");
        }}
      >
        新建项目
      </button>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => {
          setOperation("update");
          setName(state.project.name);
          setUnit(state.project.unit || "");
          setError("");
        }}
      >
        调整项目
      </button>
      {!state.project.isDefault && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setOperation("delete");
            setError("");
            setConfirmation("");
          }}
        >
          删除项目
        </button>
      )}
      {operation && (
        <Dialog
          title={
            { create: "新建项目", update: "调整项目", delete: "删除项目" }[
              operation
            ]!
          }
          onClose={() => !busy && setOperation("")}
        >
          <form
            className="center-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                const result = await act("project-manage", {
                  operation,
                  projectId: state.project.id,
                  name,
                  unit,
                  actor,
                  reason,
                  confirmation,
                });
                sessionStorage.setItem("audit-reviewer", actor);
                setOperation("");
                change(
                  operation === "delete"
                    ? state.projects.find((p: Row) => p.isDefault).id
                    : result.projectId,
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {operation === "delete" ? (
              <>
                <p>删除后不再显示该项目，既有资料和办理记录保留备查。</p>
                <label>
                  输入项目名称确认：{state.project.name}
                  <input
                    required
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  项目名称
                  <input
                    required
                    maxLength={160}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  被审计单位
                  <input
                    maxLength={160}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              经办人
              <input
                required
                value={actor}
                onChange={(e) => setActor(e.target.value)}
              />
            </label>
            <label>
              办理说明
              <input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              保存项目设置
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function CenterView({ center, ...props }: Props & { center: string }) {
  const { state, busy, act, navigate, onSource, onAction } = props;
  const [tab, setTab] = useState("work");
  const [editor, setEditor] = useState<any>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dispatch, setDispatch] = useState("");
  const [assignee, setAssignee] = useState("");
  const [filter, setFilter] = useState("");
  const [lawSettings, setLawSettings] = useState(false);
  const definitions = Object.entries(state.products || {}).filter(
    ([, d]: any) => d.center === center,
  ) as [string, any][];
  const products = state.artifacts.filter(
    (a) =>
      a.center === center ||
      (center === "workpapers" &&
        !a.productKind &&
        ["B09", "C01"].includes(a.scenarioId)),
  );
  const rows = products.filter(
    (a) =>
      !filter ||
      (a.title + (state.products[a.productKind]?.title || "")).includes(filter),
  );
  return (
    <section className="business-center" aria-label={centerTitles[center]}>
      <div className="center-guide">
        <p>{guidance[center]}</p>
        <small>当前项目：{state.project.name}</small>
      </div>
      <div className="center-tabs" role="group" aria-label="中心内容">
        <button
          className={"button " + (tab === "work" ? "primary" : "secondary")}
          onClick={() => setTab("work")}
        >
          办理事项
        </button>
        <button
          className={"button " + (tab === "records" ? "primary" : "secondary")}
          onClick={() => setTab("records")}
        >
          相关登记与办理记录
        </button>
      </div>
      {tab === "records" ? (
        <WorkflowView
          state={state}
          busy={busy}
          act={act}
          onSource={onSource}
          kinds={workflowKinds[center]}
        />
      ) : (
        <>
          <div className="center-actions">
            {definitions.map(([kind, d]) => (
              <button
                key={kind}
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  setEditor({
                    kind,
                    findingIds: center === "evidence" ? selected : [],
                  })
                }
              >
                {kind === "extract" ? "提取资料摘录" : "编写" + d.title}
              </button>
            ))}
          </div>
          <details className="card padded center-applications">
            <summary>
              {center === "documents"
                ? "审前调查与资料核对"
                : "选择 AI 审计应用"}
            </summary>
            <div className="center-actions">
              {state.scenarios
                .filter((s) => scenarios[center].includes(s.id))
                .map((s) => (
                  <button
                    key={s.id}
                    className="button secondary"
                    onClick={() => navigate(s.id)}
                  >
                    {s.title}
                  </button>
                ))}
            </div>
          </details>
          {center === "documents" && (
            <div className="center-actions">
              <button
                className="text-button"
                onClick={() => setLawSettings(true)}
              >
                政策法规 MCP 设置 ·{" "}
                {state.lawConnection?.name ? "待接入" : "未设置"}
              </button>
              <button className="text-button" onClick={() => navigate("B04")}>
                核对上传的法规资料
              </button>
            </div>
          )}
          {center === "evidence" && (
            <section className="card padded">
              <div className="section-heading">
                <h2>问题疑点</h2>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setDispatch("register")}
                >
                  登记问题疑点
                </button>
              </div>
              <div className="center-actions">
                <label>
                  按承办人筛选
                  <input
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder="输入承办人姓名"
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={busy || !selected.length}
                  onClick={() => setDispatch("assign")}
                >
                  分发选中疑点
                </button>
                <button
                  className="button secondary"
                  disabled={busy || !selected.length}
                  onClick={() => setDispatch("recheck")}
                >
                  退回再核实
                </button>
                <button
                  className="button primary"
                  disabled={busy || !selected.length}
                  onClick={() =>
                    setEditor({ kind: "evidence", findingIds: selected })
                  }
                >
                  选取疑点编制取证单
                </button>
                <button
                  className="text-button"
                  onClick={() => navigate("facts")}
                >
                  核对资料摘录中的事实
                </button>
              </div>
              <p className="muted small">
                已选 {selected.length}{" "}
                项。分发记录保存至本项目，承办人可按姓名查找；本轮不发送账号通知。
              </p>
              {state.findings
                .filter(
                  (f) => !assignee || (f.assignee || "").includes(assignee),
                )
                .map((f) => (
                  <article key={f.id} className="center-finding">
                    <label className="center-check">
                      <input
                        type="checkbox"
                        checked={selected.includes(f.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, f.id]
                              : selected.filter((id) => id !== f.id),
                          )
                        }
                      />
                      <strong>{f.title}</strong>
                      <Badge value={f.status} />
                    </label>
                    <p>{f.detail || f.description}</p>
                    <Sources row={f} onSource={onSource} />
                    {f.assignee && (
                      <p className="small">
                        承办人：{f.assignee} · 期限：{f.dueDate || "未指定"} ·
                        办理要求：{f.requirement}
                      </p>
                    )}
                    <div className="row-actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          onAction("confirm", "finding", f, "确认核查发现")
                        }
                      >
                        确认核查发现
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          onAction(
                            "resolve",
                            "finding",
                            f,
                            "填写核实情况与处理意见",
                          )
                        }
                      >
                        填写核实情况
                      </button>
                    </div>
                    {!!f.assignments?.length && (
                      <details>
                        <summary>查看分发与再核实记录</summary>
                        {f.assignments.map((a: any) => (
                          <p key={a.id}>
                            {a.at} ·{" "}
                            {a.operation === "recheck" ? "退回再核实" : "分发"}{" "}
                            · {a.assignee} · {a.requirement} · 经办人：{a.actor}
                          </p>
                        ))}
                      </details>
                    )}
                  </article>
                ))}
              {!state.findings.length && (
                <Empty title="尚无问题疑点">
                  <p>可先运行上方审计应用，或依据资料登记问题疑点。</p>
                </Empty>
              )}
            </section>
          )}
          {center === "workpapers" && (
            <EvidenceRegister {...props} create={setEditor} />
          )}
          {(center !== "documents" || products.length > 0) && (
            <section className="card padded">
              <div className="section-heading">
                <h2>
                  {center === "documents"
                    ? "方案与资料摘录"
                    : center === "evidence"
                      ? "取证单及取证辅助文书"
                      : "本中心文书"}
                </h2>
                <label>
                  查找文书
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="输入名称或文书类型"
                  />
                </label>
              </div>
              {rows
                .slice()
                .reverse()
                .map((a) => (
                  <details className="center-product" key={a.id}>
                    <summary>
                      <span>
                        {a.title}{" "}
                        <small>
                          v{a.version} ·{" "}
                          {state.products[a.productKind]?.title ||
                            "历史场景成果"}
                        </small>
                      </span>
                      <Badge value={a.status} />
                    </summary>
                    <p className="muted small">
                      {a.actor ? `编制人：${a.actor} · ` : ""}
                      {a.createdAt} ·
                      草稿须人工核实，登记办理结果后方可反映实际进度。
                    </p>
                    <div className="center-document">
                      <Markdown text={a.content} />
                    </div>
                    <Sources row={a} onSource={onSource} />
                    <div className="row-actions">
                      <button onClick={() => onSource({ artifactId: a.id })}>
                        追溯内容出处
                      </button>
                      {a.productKind && (
                        <button
                          disabled={busy || a.status === "superseded"}
                          onClick={() =>
                            setEditor({
                              ...a,
                              kind: a.productKind,
                              previousId: a.id,
                            })
                          }
                        >
                          修订文书
                        </button>
                      )}
                      <button
                        disabled={
                          busy || ["stale", "superseded"].includes(a.status)
                        }
                        onClick={() =>
                          onAction("confirm", "artifact", a, "确认文书内容")
                        }
                      >
                        确认文书内容
                      </button>
                      <a
                        href={apiUrl(
                          "/export?artifactId=" +
                            encodeURIComponent(a.id) +
                            "&format=docx",
                        )}
                      >
                        导出 Word
                      </a>
                      <a
                        href={apiUrl(
                          "/export?artifactId=" +
                            encodeURIComponent(a.id) +
                            "&format=md",
                        )}
                      >
                        下载文本稿
                      </a>
                    </div>
                  </details>
                ))}
              {!rows.length && (
                <Empty title="暂无文书">
                  <p>选取资料或前序文书后，可人工编写或使用 AI 辅助起草。</p>
                </Empty>
              )}
            </section>
          )}
        </>
      )}
      {editor && (
        <ProductEditor
          key={editor.id || editor.kind}
          {...props}
          initial={editor}
          close={() => setEditor(null)}
        />
      )}
      {dispatch && (
        <FindingDialog
          {...props}
          operation={dispatch}
          findingIds={selected}
          close={() => setDispatch("")}
        />
      )}
      {lawSettings && (
        <LawSettings {...props} close={() => setLawSettings(false)} />
      )}
    </section>
  );
}
function EvidenceRegister(props: Props & { create: (value: any) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const records = props.state.artifacts.filter(
    (a) =>
      a.productKind === "evidence" &&
      !["stale", "superseded"].includes(a.status),
  );
  return (
    <section className="card padded">
      <h2>本项目审计取证单</h2>
      <PickList
        title="审计取证单"
        rows={records}
        selected={selected}
        set={setSelected}
        onSource={props.onSource}
        type="artifactId"
      />
      <div className="center-actions">
        <button
          className="button primary"
          disabled={props.busy || !selected.length}
          onClick={() =>
            props.create({ kind: "workpaper", artifactIds: selected })
          }
        >
          选取取证单编制底稿
        </button>
        <button
          className="text-button"
          onClick={() => props.navigate("evidence")}
        >
          前往审计取证中心
        </button>
      </div>
    </section>
  );
}
function ProductEditor({
  initial,
  close,
  ...props
}: Props & { initial: any; close: () => void }) {
  const { state, act, busy } = props;
  const [peek, setPeek] = useState<any>(null);
  const onSource = setPeek;
  const definition = state.products[initial.kind];
  const [kind] = useState(initial.kind);
  const [title, setTitle] = useState(initial.title || definition.title);
  const [content, setContent] = useState(initial.content || "");
  const [documents, setDocuments] = useState<string[]>(
    initial.documentIds || [],
  );
  const [findings, setFindings] = useState<string[]>(initial.findingIds || []);
  const [artifacts, setArtifacts] = useState<string[]>(
    initial.artifactIds || [],
  );
  const [useModel, setUseModel] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [split, setSplit] = useState(false);
  const [titles, setTitles] = useState("");
  const [actor, setActor] = useState(
    sessionStorage.getItem("audit-reviewer") || "",
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const available = (rows: Row[]) =>
    rows.filter(
      (r) => !["stale", "superseded"].includes(r.status) && r.id !== initial.id,
    );
  return (
    <Dialog
      title={(initial.previousId ? "修订" : "编写") + definition.title}
      onClose={() => (peek ? setPeek(null) : !busy && close())}
    >
      <form
        className="center-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await act("product-save", {
              kind,
              title,
              ...(split
                ? {
                    titles: titles
                      .split("\n")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  }
                : {}),
              content,
              documentIds: documents,
              findingIds: findings,
              artifactIds: artifacts,
              useModel,
              instructions,
              actor,
              reason,
              previousId: initial.previousId,
            });
            sessionStorage.setItem("audit-reviewer", actor);
            close();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          文书名称
          <input
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <fieldset>
          <legend>一、选取编写依据</legend>
          <p className="muted">
            引用均限于当前项目，保存时记录所选资料版本。合并编制时可勾选多项。
          </p>
          <PickList
            title="审计资料"
            rows={available(state.documents)}
            selected={documents}
            set={setDocuments}
            onSource={onSource}
            type="documentId"
          />
          <PickList
            title="问题疑点"
            rows={available(state.findings)}
            selected={findings}
            set={setFindings}
            onSource={onSource}
            type="findingId"
          />
          <PickList
            title="取证单、底稿及其他文书"
            rows={available(state.artifacts)}
            selected={artifacts}
            set={setArtifacts}
            onSource={onSource}
            type="artifactId"
          />
        </fieldset>
        {kind === "evidence" && !initial.previousId && (
          <>
            <label className="center-check">
              <input
                type="checkbox"
                checked={split}
                onChange={(e) => setSplit(e.target.checked)}
              />
              按不同取证事项拆分多张取证单
            </label>
            {split && (
              <label>
                各张取证单名称（每行一张）
                <textarea
                  required
                  rows={4}
                  value={titles}
                  onChange={(e) => setTitles(e.target.value)}
                  placeholder={
                    "例如：工程款支付情况取证单\n工程量计量情况取证单"
                  }
                />
              </label>
            )}
          </>
        )}
        <fieldset>
          <legend>二、编写文书</legend>
          <label className="center-check">
            <input
              type="checkbox"
              checked={useModel}
              onChange={(e) => setUseModel(e.target.checked)}
            />
            使用 AI 辅助起草
          </label>
          {useModel ? (
            <>
              <label>
                编写要求
                <textarea
                  rows={3}
                  maxLength={8000}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="说明核查重点、报告范围、待核事项等"
                />
              </label>
              <p className="muted">
                系统根据所选依据生成草稿；完成后请查阅正文并核实引用。
                {!state.capabilities?.model?.text?.configured &&
                  "当前文本模型未配置，无法执行 AI 起草。"}
              </p>
            </>
          ) : (
            <label>
              文书正文
              <textarea
                required
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="填写事实、审计过程、证据来源和处理意见；未知内容请标注待补充。"
              />
            </label>
          )}
        </fieldset>
        <label>
          编制人
          <input
            required
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </label>
        {initial.previousId && (
          <label>
            修订说明
            <input
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          disabled={
            busy || (useModel && !state.capabilities?.model?.text?.configured)
          }
        >
          {busy ? "正在编制…" : useModel ? "生成文书草稿" : "保存文书草稿"}
        </button>
      </form>
      {peek && (
        <EvidencePanel
          key={JSON.stringify(peek)}
          source={peek}
          state={state}
          busy={busy}
          act={act}
          onSource={setPeek}
          onClose={() => setPeek(null)}
        />
      )}
    </Dialog>
  );
}
function FindingDialog({
  operation,
  findingIds,
  close,
  ...props
}: Props & { operation: string; findingIds: string[]; close: () => void }) {
  const [peek, setPeek] = useState<any>(null);
  const [value, setValue] = useState<any>({
    actor: sessionStorage.getItem("audit-reviewer") || "",
    documentIds: [],
  });
  const [error, setError] = useState("");
  const field = (
    key: string,
    title: string,
    type = "text",
    required = true,
  ) => (
    <label>
      {title}
      <input
        type={type}
        required={required}
        value={value[key] || ""}
        onChange={(e) => setValue({ ...value, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <Dialog
      title={
        operation === "register"
          ? "登记问题疑点"
          : operation === "recheck"
            ? "退回再核实"
            : "分发问题疑点"
      }
      onClose={() => (peek ? setPeek(null) : !props.busy && close())}
    >
      <form
        className="center-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await props.act(
              operation === "register"
                ? "finding-register"
                : "finding-dispatch",
              { ...value, operation, findingIds },
            );
            sessionStorage.setItem("audit-reviewer", value.actor);
            close();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {operation === "register" ? (
          <>
            {field("title", "问题疑点名称")}
            <label>
              问题疑点情况
              <textarea
                required
                rows={5}
                value={value.detail || ""}
                onChange={(e) => setValue({ ...value, detail: e.target.value })}
              />
            </label>
            {field("locator", "来源位置（页码、段落或表格单元格）")}
            <PickList
              title="来源资料"
              rows={props.state.documents.filter(
                (d) => d.status !== "superseded",
              )}
              selected={value.documentIds}
              set={(documentIds) => setValue({ ...value, documentIds })}
              onSource={setPeek}
              type="documentId"
            />
          </>
        ) : (
          <>
            <p>本次选取 {findingIds.length} 项问题疑点。</p>
            {field("assignee", "承办人")}
            {field("requirement", "办理要求")}
            {field("dueDate", "办理期限", "date", false)}
          </>
        )}
        {field("actor", "经办人")}
        {field("reason", "办理说明")}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={props.busy}>
          保存办理记录
        </button>
      </form>
      {peek && (
        <EvidencePanel
          key={JSON.stringify(peek)}
          source={peek}
          state={props.state}
          busy={props.busy}
          act={props.act}
          onSource={setPeek}
          onClose={() => setPeek(null)}
        />
      )}
    </Dialog>
  );
}
function LawSettings({
  state,
  act,
  busy,
  close,
}: Props & { close: () => void }) {
  const [name, setName] = useState(state.lawConnection?.name || "");
  const [endpoint, setEndpoint] = useState(state.lawConnection?.endpoint || "");
  const [actor, setActor] = useState(
    sessionStorage.getItem("audit-reviewer") || "",
  );
  const [error, setError] = useState("");
  return (
    <Dialog title="政策法规 MCP 接入设置" onClose={() => !busy && close()}>
      <form
        className="center-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await act("law-connection-save", {
              name,
              endpoint,
              actor,
              reason: "登记待接入的法规服务",
            });
            close();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <p className="notice">
          当前状态：待接入。此处保存接入信息，尚不执行远程法规检索。当前可上传法规原文并核对官方出处、施行日期及适用范围。
        </p>
        <label>
          法规服务名称
          <input
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          服务地址（可后续填写）
          <input
            type="url"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://…（请勿填写密钥）"
          />
        </label>
        <label>
          经办人
          <input
            required
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          保存接入信息
        </button>
      </form>
    </Dialog>
  );
}
