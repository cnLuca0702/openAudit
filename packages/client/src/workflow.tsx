import { useState } from "react";
import { Badge, DataView, Dialog, Sources } from "./components";
import type { State, Row } from "./model";

export function WorkflowView({
  state,
  busy,
  act,
  onSource,
}: {
  state: State;
  busy: boolean;
  act: (action: string, payload?: Record<string, any>) => Promise<any>;
  onSource: (source: any) => void;
}) {
  const workflow = state.workflow;
  const [tab, setTab] = useState("current");
  const [editing, setEditing] = useState<any>(null);
  const [kind, setKind] = useState("subject");
  if (!workflow) return <p>流程台账加载中，请刷新。</p>;
  const reference = workflow.reference;
  return (
    <div className="workflow">
      <div className="heading-actions workflow-tabs">
        <button
          className={"button " + (tab === "current" ? "primary" : "secondary")}
          onClick={() => setTab("current")}
        >
          当前项目台账
        </button>
        <button
          className={
            "button " + (tab === "reference" ? "primary" : "secondary")
          }
          onClick={() => setTab("reference")}
        >
          参考文件逐项对照
        </button>
      </div>
      {tab === "reference" ? (
        <>
          <section className="card padded">
            <h2>{reference.title}</h2>
            <p>
              来源：{reference.sourceFile}
              。仅作流程参考；以下数量、日期和事实不属于当前项目。
            </p>
            <details>
              <summary>原件指纹</summary>
              <code className="workflow-hash">{reference.sha256}</code>
            </details>
            <h3>参考文件待核事项</h3>
            <ul>
              {reference.caveats.map((x: string) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section className="card padded">
            <h2>六个阶段与 19 个节点</h2>
            <p>{reference.stages.join(" → ")}</p>
            <ol className="workflow-timeline">
              {reference.milestones.map((m: any) => (
                <li key={m.id}>
                  <strong>
                    {m.date} · {m.title}
                  </strong>
                  <p>{m.detail}</p>
                  {m.isDeadline && <Badge value="期限节点，非已完成事项" />}
                </li>
              ))}
            </ol>
          </section>
          <section className="card padded">
            <h2>15 项问题与底稿索引</h2>
            <p>
              合计涉及金额 9,597.57
              万元；不能作为应缴应退金额。参考材料中的定性依据仍需核验。
            </p>
            <DataView value={reference.issues} onSource={onSource} />
          </section>
          <section className="card padded">
            <h2>部门复核八项内容</h2>
            <ol>
              {reference.departmentReview.map((x: string) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
            <h3>四类档案</h3>
            <DataView value={reference.archiveGroups} onSource={onSource} />
            <p>参考案例共 54 条、4 卷；当前项目按实际资料及归档要求登记。</p>
          </section>
        </>
      ) : (
        <>
          <section className="notice warning">
            <div>
              {workflow.notices.map((x: string) => (
                <p key={x}>{x}</p>
              ))}
            </div>
          </section>
          <section className="card padded">
            <div className="section-heading">
              <h2>登记流程与文书</h2>
              <span>台账修订 {workflow.revision}</span>
            </div>
            <div className="workflow-toolbar">
              <label>
                登记类型
                <select
                  aria-label="登记类型"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {workflow.forms.map((f: any) => (
                    <option key={f.kind} value={f.kind}>
                      {f.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => setEditing({ kind })}
              >
                新增记录
              </button>
            </div>
            <p className="muted">
              先在资料与版本中心上传原件并确认适用版本，再登记回证、签字及文书索引。这里记录人工核对结果，不代替外部签章。
            </p>
          </section>
          <section className="card padded">
            <h2>逐单位送达与期限</h2>
            {workflow.receipts.length ? (
              <DataView value={workflow.receipts} onSource={onSource} />
            ) : (
              <p>尚未登记被审计单位。两家单位须分别登记、分别取得回证。</p>
            )}
          </section>
          <section className="card padded">
            <h2>四单元组卷</h2>
            <DataView value={workflow.archive} onSource={onSource} />
            <p>档案接收与整改完成分别管理，移交档案不会自动销号。</p>
          </section>
          <section className="card padded">
            <h2>已登记记录（{workflow.records.length}）</h2>
            {!workflow.records.length && (
              <p>尚无流程登记记录；AI 场景运行次数不代表业务节点已完成。</p>
            )}
            {workflow.records.map((r: Row) => (
              <details className="workflow-record" key={r.id}>
                <summary>
                  {workflow.forms.find((f: any) => f.kind === r.kind)?.title} ·{" "}
                  {r.title ||
                    r.name ||
                    r.documentType ||
                    r.control ||
                    r.documentNumber}{" "}
                  <Badge value={r.status} />
                </summary>
                {r.kind === "redline" && (
                  <div className="workflow-redline">
                    <div>
                      <h4>修改前</h4>
                      <del>{r.beforeText}</del>
                    </div>
                    <div>
                      <h4>修改后</h4>
                      <ins>{r.afterText}</ins>
                    </div>
                  </div>
                )}
                <DataView
                  value={Object.fromEntries(
                    Object.entries(r).filter(
                      ([key]) =>
                        !["beforeText", "afterText", "supersededBy"].includes(
                          key,
                        ),
                    ),
                  )}
                  onSource={onSource}
                />
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    setEditing({
                      ...r,
                      replacesId: r.id,
                      evidenceIds: r.sources.map((x: any) => x.documentId),
                    })
                  }
                >
                  修订并保留历史
                </button>
              </details>
            ))}
          </section>
        </>
      )}
      {editing && (
        <WorkflowForm
          key={editing.id || editing.kind}
          state={state}
          initial={editing}
          busy={busy}
          act={act}
          close={() => setEditing(null)}
          onSource={onSource}
        />
      )}
    </div>
  );
}
function WorkflowForm({ state, initial, busy, act, close, onSource }: any) {
  const [value, setValue] = useState<any>(initial);
  const [error, setError] = useState("");
  const schema = state.workflow.forms.find((f: any) => f.kind === initial.kind);
  const documents = state.documents.filter(
    (d: any) => d.status === "confirmed",
  );
  const reports = [
    ...documents.filter((d: any) => d.kind === "report"),
    ...state.artifacts.filter(
      (a: any) => a.scenarioId === "C01" && a.status === "confirmed",
    ),
  ];
  const set = (key: string, v: any) =>
    setValue((old: any) => ({ ...old, [key]: v }));
  const docSelect = (key: string, label: string, required = true) => (
    <label key={key}>
      {label}
      <select
        multiple
        aria-label={label}
        required={required}
        value={value[key] || []}
        onChange={(e) =>
          set(
            key,
            Array.from(e.target.selectedOptions, (x) => x.value),
          )
        }
      >
        {documents.map((d: any) => (
          <option key={d.id} value={d.id}>
            {d.name} · V{d.version}
          </option>
        ))}
      </select>
      <small>仅显示已确认适用版本；可多选。</small>
    </label>
  );
  return (
    <Dialog
      title={(initial.replacesId ? "修订" : "新增") + schema.title}
      onClose={close}
    >
      <form
        className="workflow-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await act("workflow-save", value);
            close();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        {error && (
          <div role="alert" className="notice warning">
            {error}
          </div>
        )}
        {schema.fields.map((f: any) => {
          if (f.type === "documents") return docSelect(f.key, f.label);
          if (f.type === "answers")
            return value.control === "部门复核" ? (
              <fieldset key={f.key}>
                <legend>{f.label}</legend>
                {state.workflow.qualityChecklist.map((q: string, i: number) => (
                  <label key={q}>
                    {i + 1}. {q}
                    <textarea
                      required
                      value={value.answers?.[i] || ""}
                      onChange={(e) => {
                        const a = Array.from(
                          { length: 8 },
                          (_, j) => value.answers?.[j] || "",
                        );
                        a[i] = e.target.value;
                        set("answers", a);
                      }}
                    />
                  </label>
                ))}
              </fieldset>
            ) : null;
          if (
            [
              "select",
              "optionalSelect",
              "subject",
              "report",
              "reportOptional",
            ].includes(f.type)
          ) {
            const options =
              f.type === "subject"
                ? state.workflow.records
                    .filter((r: any) => r.kind === "subject")
                    .map((r: any) => ({
                      value: r.subjectKey || r.id,
                      text: r.name,
                    }))
                : f.type.startsWith("report")
                  ? reports.map((r: any) => ({
                      value: r.id,
                      text: `${r.name || r.title} · V${r.version}`,
                    }))
                  : f.options.map((o: string) => ({ value: o, text: o }));
            return (
              <label key={f.key}>
                {f.label}
                <select
                  aria-label={f.label}
                  required={
                    f.type !== "reportOptional" && f.type !== "optionalSelect"
                  }
                  value={value[f.key] || ""}
                  onChange={(e) => set(f.key, e.target.value)}
                >
                  <option value="">请选择</option>
                  {options.map((o: any) => (
                    <option value={o.value} key={o.value}>
                      {o.text}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          return (
            <label key={f.key}>
              {f.label}
              {f.type === "textarea" ? (
                <textarea
                  aria-label={f.label}
                  rows={4}
                  required
                  value={value[f.key] || ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : (
                <input
                  aria-label={f.label}
                  type={f.type === "optionalNumber" ? "number" : f.type}
                  required={f.type !== "optionalNumber"}
                  value={value[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </label>
          );
        })}
        {initial.kind !== "subject" &&
          docSelect(
            "evidenceIds",
            "签章 / 办理证明原件",
            !schema.fields.some((f: any) => f.type === "documents"),
          )}
        <label>
          登记人
          <input
            required
            value={value.actor || ""}
            onChange={(e) => set("actor", e.target.value)}
          />
        </label>
        <label>
          核验依据与登记说明
          <textarea
            required
            value={value.reason || ""}
            onChange={(e) => set("reason", e.target.value)}
          />
        </label>
        {initial.sources && <Sources row={initial} onSource={onSource} />}
        <button className="button primary" disabled={busy} type="submit">
          保存流程记录
        </button>
      </form>
    </Dialog>
  );
}
