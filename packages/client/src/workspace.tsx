import { useState } from "react";
import { ArrowRight, Star, Plus, Trash2 } from "lucide-react";
import { stages, display, isStale, type State, type Row } from "./model";

const roles: Record<string, { title: string; scenes: string[] }> = {
  member: { title: "审计组成员", scenes: ["B05", "B03", "B09", "B08"] },
  lead: { title: "审计组组长 / 主审", scenes: ["A03", "C01", "C02", "D01"] },
  review: { title: "业务部门复核人员", scenes: ["D01", "D02", "D04", "E01"] },
  legal: { title: "审理人员", scenes: ["D03", "D02", "D04", "E01"] },
  followup: {
    title: "整改检查 / 档案人员",
    scenes: ["F01", "F02", "F04", "F03"],
  },
};
type Arrangement = { id: string; title: string; scene: string; done: boolean };
type Preferences = {
  role: string;
  pins: string[];
  documents: string[];
  arrangements: Arrangement[];
};
const initial: Preferences = {
  role: "member",
  pins: [],
  documents: [],
  arrangements: [],
};
export function useWorkspace(projectId: string) {
  const key = "openaudit:personal-workspace:v1:" + projectId;
  const [memory, setMemory] = useState<{
    key: string;
    value: Preferences;
  } | null>(null);
  const [storageError, setStorageError] = useState("");
  let saved = initial;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (
      raw &&
      roles[raw.role] &&
      Array.isArray(raw.pins) &&
      Array.isArray(raw.arrangements)
    ) {
      saved = {
        role: raw.role,
        documents: Array.isArray(raw.documents)
          ? raw.documents.filter((x: unknown) => typeof x === "string")
          : [],
        pins: raw.pins.filter((x: unknown) => typeof x === "string"),
        arrangements: raw.arrangements.filter(
          (x: any) =>
            x &&
            typeof x.id === "string" &&
            typeof x.title === "string" &&
            typeof x.scene === "string" &&
            typeof x.done === "boolean",
        ),
      };
    }
  } catch {
    /* A blocked or old browser store must not prevent audit work. */
  }
  const value = memory?.key === key ? memory.value : saved;
  const update = (next: Preferences) => {
    setMemory({ key, value: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError(
        "浏览器未能保存个人设置，本次页面内仍可使用。请勿在此记录需要长期保留的工作安排。",
      );
    }
  };
  const togglePin = (id: string) =>
    update({
      ...value,
      pins: value.pins.includes(id)
        ? value.pins.filter((x) => x !== id)
        : [...value.pins, id],
    });
  return { value, update, togglePin, storageError };
}
export type Workspace = ReturnType<typeof useWorkspace>;
export function PersonalHome({
  state,
  workspace,
  navigate,
  upload,
}: {
  state: State;
  workspace: Workspace;
  navigate: (v: string) => void;
  upload: () => void;
}) {
  const { value, update, storageError } = workspace;
  const [title, setTitle] = useState("");
  const [scene, setScene] = useState("B09");
  const recommended = roles[value.role].scenes;
  const chosen = value.pins.length ? value.pins : recommended;
  return (
    <>
      <section className="card personal-intro">
        <div>
          <span className="eyebrow">按自己的工作需要使用</span>
          <h2>今天要办理什么？</h2>
          <p>
            选择常用事项直接办理，或按审计阶段查找。各岗位都可使用全部功能。
          </p>
        </div>
        <label>
          我的工作岗位
          <select
            value={value.role}
            onChange={(e) => update({ ...value, role: e.target.value })}
          >
            {Object.entries(roles).map(([id, r]) => (
              <option key={id} value={id}>
                {r.title}
              </option>
            ))}
          </select>
          <small>用于推荐入口，不改变权限或审批身份。</small>
        </label>
      </section>
      <div className="quick-start" aria-label="上手指引">
        {[
          ["1", "收集审计资料", "上传被审计单位报送资料", upload],
          [
            "2",
            "核对原件与摘录",
            "查看来源，确认适用版本",
            () => navigate("documents"),
          ],
          [
            "3",
            "选择事项办理",
            "核查疑点或起草审计文书",
            () => navigate("catalog"),
          ],
        ].map(([n, t, desc, action]) => (
          <button key={String(n)} onClick={action as () => void}>
            <b>{String(n)}</b>
            <span>
              <strong>{String(t)}</strong>
              <small>{String(desc)}</small>
            </span>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
      <div className="section-heading">
        <h2>{value.pins.length ? "我常用的事项" : "适合当前岗位的事项"}</h2>
        <span className="muted small">在事项旁点“收藏”，放到这里</span>
      </div>
      <div className="task-cards">
        {chosen
          .map((id) => state.scenarios.find((s) => s.id === id))
          .filter(Boolean)
          .map((s) => (
            <TaskCard
              key={s!.id}
              scenario={s!}
              state={state}
              workspace={workspace}
              navigate={navigate}
            />
          ))}
      </div>
      <section className="card personal-plan">
        <div className="section-heading">
          <h2>我的工作安排</h2>
          <span className="muted small">个人备忘，不计入项目办理状态</span>
        </div>
        <form
          className="arrangement-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            update({
              ...value,
              arrangements: [
                ...value.arrangements,
                {
                  id: crypto.randomUUID(),
                  title: title.trim(),
                  scene,
                  done: false,
                },
              ],
            });
            setTitle("");
          }}
        >
          <label>
            准备办理的工作
            <input
              maxLength={160}
              required
              placeholder="例如：核对二标段工程款支付凭证"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            关联办理事项
            <select value={scene} onChange={(e) => setScene(e.target.value)}>
              {state.scenarios.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary" type="submit">
            <Plus size={15} />
            加入安排
          </button>
        </form>
        {!value.arrangements.length && (
          <p className="muted">
            可以把今天要核查的事项记在这里，再进入对应功能办理。
          </p>
        )}
        {value.arrangements.map((item) => (
          <div className="arrangement-row" key={item.id}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) =>
                  update({
                    ...value,
                    arrangements: value.arrangements.map((x) =>
                      x.id === item.id ? { ...x, done: e.target.checked } : x,
                    ),
                  })
                }
              />
              <span className={item.done ? "done" : ""}>{item.title}</span>
            </label>
            <button
              className="text-button"
              onClick={() => navigate(item.scene)}
            >
              进入办理
              <ArrowRight size={14} />
            </button>
            <button
              className="icon-button"
              aria-label={"移除工作安排：" + item.title}
              onClick={() =>
                update({
                  ...value,
                  arrangements: value.arrangements.filter(
                    (x) => x.id !== item.id,
                  ),
                })
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <p className="form-hint">
          岗位、收藏和个人安排保存在当前浏览器，并按项目区分；不向项目其他使用者分派任务，也不跨设备同步。
        </p>
        {storageError && (
          <p role="alert" className="error-text">
            {storageError}
          </p>
        )}
      </section>
    </>
  );
}
function TaskCard({
  scenario,
  state,
  workspace,
  navigate,
}: {
  scenario: Row;
  state: State;
  workspace: Workspace;
  navigate: (id: string) => void;
}) {
  const latest = state.artifacts
    .filter((a) => a.scenarioId === scenario.id)
    .at(-1);
  const pinned = workspace.value.pins.includes(scenario.id);
  return (
    <article className="task-card">
      <div className="section-heading">
        <span className="small muted">
          {stages.find((s) => s.id === scenario.id[0])?.title}
        </span>
        <button
          className={"icon-button pin " + (pinned ? "pinned" : "")}
          aria-pressed={pinned}
          aria-label={(pinned ? "取消收藏：" : "收藏：") + scenario.title}
          onClick={() => workspace.togglePin(scenario.id)}
        >
          <Star size={17} />
        </button>
      </div>
      <h3>{scenario.title}</h3>
      <p>{scenario.description}</p>
      <div className="task-card-bottom">
        <small>
          {latest
            ? isStale(latest)
              ? "项目已有结果，需重新核对"
              : "项目已有办理结果"
            : "项目尚无办理结果"}
        </small>
        <button className="text-button" onClick={() => navigate(scenario.id)}>
          进入办理
          <ArrowRight size={15} />
        </button>
      </div>
    </article>
  );
}
export function StageWork({
  stageId,
  state,
  workspace,
  navigate,
}: {
  stageId: string;
  state: State;
  workspace: Workspace;
  navigate: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const stage = stages.find((s) => s.id === stageId) || {
    description: "按工作内容查找所有审计阶段的功能",
  };
  const records = state.scenarios.filter(
    (s) =>
      s.id.startsWith(stageId) &&
      (!search || (s.title + s.description).includes(search)),
  );
  return (
    <>
      <div className="stage-guide">
        <div>
          <h2>选择需要办理的事项</h2>
          <p>{stage.description}。根据分工使用所需功能，无须逐项操作。</p>
        </div>
        <button
          className="button secondary"
          onClick={() =>
            navigate(
              stageId === "A"
                ? "documents"
                : stageId === "B"
                  ? "evidence"
                  : ["C", "F"].includes(stageId)
                    ? "workpapers"
                    : "review-center",
            )
          }
        >
          进入对应业务中心
        </button>
      </div>
      <label className="stage-search">
        查找办理事项
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="输入工作内容，例如合同、底稿、证据"
        />
      </label>
      <div className="task-cards">
        {records.map((s) => (
          <TaskCard
            key={s.id}
            scenario={s}
            state={state}
            workspace={workspace}
            navigate={navigate}
          />
        ))}
      </div>
      {!records.length && (
        <p className="card padded">
          未找到相关事项，请调整关键词或选择其他审计阶段。
        </p>
      )}
    </>
  );
}
