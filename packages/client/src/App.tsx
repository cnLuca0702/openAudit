import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  Files,
  FolderOpen,
  History,
  Layers3,
  LayoutDashboard,
  Loader2,
  Menu,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import {
  request,
  stages,
  operationNames,
  list,
  sourceList,
  isStale,
  display,
  type Row,
  type State,
} from "./model";
import {
  Badge,
  DataView,
  Dialog,
  Empty,
  EvidencePanel,
  Markdown,
  Sources,
} from "./components";
import { ActionDialog, UploadDialog } from "./dialogs";
import { ScenarioView } from "./scenario";
import { WorkflowView } from "./workflow";
type Modal = { action: string; targetType?: string; row?: Row; title?: string };
export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [view, setView] = useState(
    () => decodeURIComponent(location.hash.slice(1)) || "overview",
  );
  const [stage, setStage] = useState("A");
  const [sidebar, setSidebar] = useState(false);
  const [source, setSource] = useState<any>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [upload, setUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<any>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const s = await request("/state");
      setState(s.state || s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const change = () =>
      setView(decodeURIComponent(location.hash.slice(1)) || "overview");
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, [load]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (/^[A-F]\d/.test(view)) setStage(view[0]);
  }, [view]);
  const navigate = (v: string) => {
    setView(v);
    location.hash = v;
    setSidebar(false);
    setSearch("");
    if (/^[A-F]\d/.test(v)) setStage(v[0]);
  };
  const act = async (
    action: string,
    payload: Record<string, any> = {},
    scenarioId?: string,
  ) => {
    setBusy(action);
    setError("");
    try {
      const response = await request("/action", {
        method: "POST",
        body: JSON.stringify({
          action,
          payload,
          ...(scenarioId ? { scenarioId } : {}),
        }),
      });
      setState(response.state);
      setToast(
        action === "run"
          ? "运行已完成，成果仍需人工核验。"
          : "操作已保存，状态已与服务端同步。",
      );
      return response.result;
    } catch (e) {
      setError((e as Error).message);
      try {
        const s = await request("/state");
        setState(s.state || s);
      } catch {
        /* preserve original failure */
      }
      throw e;
    } finally {
      setBusy("");
    }
  };
  const safeAct = (
    action: string,
    payload: Record<string, any> = {},
    scenarioId?: string,
  ) => void act(action, payload, scenarioId).catch(() => {});
  const openAction = (
    action: string,
    targetType?: string,
    row?: Row,
    title?: string,
  ) => setModal({ action, targetType, row, title });
  const scenario = state?.scenarios.find((s) => s.id === view);
  const filteredScenarios = list(state?.scenarios).filter((s) =>
    s.id.startsWith(stage),
  );
  const matches = (r: Row) =>
    !search ||
    [r.name, r.title, r.id, r.key, r.status, r.kind].some((x) =>
      String(x || "")
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const staleArtifacts = list(state?.artifacts).filter(isStale);
  const pendingFacts = list(state?.facts).filter(
    (f) => f.status !== "confirmed" && f.status !== "superseded",
  );
  const openTasks = list(state?.tasks).filter(
    (t) => !["closed", "confirmed", "resolved"].includes(t.status),
  );
  const pageTitle =
    scenario?.title ||
    {
      overview: "项目工作总览",
      workflow: "流程与文书台账",
      documents: "资料与版本中心",
      facts: "项目事实台账",
      review: "人工核验与待办",
      history: "运行与操作记录",
      assets: "知识库 · 能力库 · 数据库",
      settings: "演示资料管理",
    }[view] ||
    "项目工作总览";
  return (
    <div className={"app " + (source ? "has-evidence" : "")}>
      <aside className={"sidebar " + (sidebar ? "open" : "")}>
        <div className="brand">
          <div className="brand-icon">
            <Layers3 size={24} />
          </div>
          <div>
            <strong>openAudit</strong>
            <span>政府投资项目审计</span>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={() => setSidebar(false)}
            aria-label="关闭导航"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          项目工作空间 <span>DEMO</span>
        </div>
        <nav aria-label="主导航">
          <button
            className={"nav-main " + (view === "overview" ? "active" : "")}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={17} />
            工作总览
          </button>
          <button
            className={"nav-main " + (view === "documents" ? "active" : "")}
            onClick={() => navigate("documents")}
          >
            <FolderOpen size={17} />
            资料与版本
            <span className="count">{state?.documents.length ?? "—"}</span>
          </button>
          <button
            className={"nav-main " + (view === "facts" ? "active" : "")}
            onClick={() => navigate("facts")}
          >
            <Database size={17} />
            项目事实
          </button>
          <button
            className={"nav-main " + (view === "workflow" ? "active" : "")}
            onClick={() => navigate("workflow")}
          >
            <ClipboardCheck size={17} />
            流程与文书台账
          </button>
          <div className="nav-section-label">
            全流程审计 <span>{state?.scenarios.length ?? 0} 个场景</span>
          </div>
          {stages.map((s, i) => (
            <div className="stage-nav" key={s.id}>
              <button
                className={"stage-button " + (stage === s.id ? "expanded" : "")}
                onClick={() => setStage(stage === s.id ? "" : s.id)}
                aria-expanded={stage === s.id}
              >
                <span className="stage-index">0{i + 1}</span>
                <span>{s.title}</span>
                <ChevronRight size={14} />
              </button>
              {stage === s.id &&
                list(state?.scenarios)
                  .filter((sc) => sc.id.startsWith(s.id))
                  .map((sc) => (
                    <button
                      key={sc.id}
                      className={
                        "scenario-nav " + (view === sc.id ? "active" : "")
                      }
                      onClick={() => navigate(sc.id)}
                    >
                      <span>{sc.id}</span>
                      {sc.title}
                    </button>
                  ))}
            </div>
          ))}
          <div className="nav-section-label">协作与治理</div>
          <button
            className={"nav-main " + (view === "review" ? "active" : "")}
            onClick={() => navigate("review")}
          >
            <ClipboardCheck size={17} />
            人工核验与待办<span className="count">{openTasks.length}</span>
          </button>
          <button
            className={"nav-main " + (view === "assets" ? "active" : "")}
            onClick={() => navigate("assets")}
          >
            <BookOpen size={17} />
            三库资产
          </button>
          <button
            className={"nav-main " + (view === "history" ? "active" : "")}
            onClick={() => navigate("history")}
          >
            <History size={17} />
            运行记录
          </button>
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={18} />
          <div>
            辅助分析 · 人工决策<small>DSH 审计工作台</small>
          </div>
          <button
            className="icon-button"
            aria-label="演示资料管理"
            onClick={() => navigate("settings")}
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="关闭导航遮罩"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-only"
              aria-label="打开导航"
              onClick={() => setSidebar(true)}
            >
              <Menu size={21} />
            </button>
            <span>审计工作台</span>
            <ChevronRight size={14} />
            <strong>{scenario ? scenario.id : "项目空间"}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-label">演示模拟数据</span>
            <button
              className="icon-button"
              aria-label="刷新服务端状态"
              title="刷新服务端状态"
              disabled={loading || !!busy}
              onClick={() => void load()}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
            <div className="avatar" title="所有确认均需填写实际审核人">
              审
            </div>
          </div>
        </header>
        <main>
          <div className="project-strip">
            <span className="project-dot" />
            <span>{state?.project?.name || "连接审计项目中"}</span>
            <span className="project-version">
              工作资料集 V{state?.project?.datasetVersion ?? "—"}
            </span>
          </div>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {scenario
                  ? `${scenario.id} / ${stages.find((s) => s.id === scenario.id[0])?.title}`
                  : "PROJECT WORKSPACE"}
              </div>
              <h1>{pageTitle}</h1>
              <p>
                {scenario?.description ||
                  "从资料到成果，每一步都有依据，每一次确认都有记录。"}
              </p>
            </div>
            <div className="heading-actions">
              {view !== "history" && (
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => setUpload(true)}
                >
                  <Upload size={16} />
                  接收资料
                </button>
              )}
              {view === "overview" && (
                <button
                  className="button primary"
                  onClick={() => navigate("A01")}
                  disabled={!state?.scenarios.length}
                >
                  进入审计工作
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="notice error" role="alert">
              <strong>操作未成功</strong>
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="关闭错误提示"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="notice processing" role="status">
              <Loader2 size={17} className="spin" />
              正在执行并保存到服务端，请稍候。
              {busy === "run" ? "模型辅助可能需要更长时间。" : ""}
            </div>
          )}
          {loading && !state ? (
            <div className="loading-state">
              <Loader2 className="spin" />
              <p>正在读取已保存项目…</p>
            </div>
          ) : !state ? (
            <Empty title="尚未连接到审计服务">
              <button className="button primary" onClick={() => void load()}>
                重新连接
              </button>
            </Empty>
          ) : (
            <>
              {view === "overview" && (
                <>
                  <div className="overview-grid">
                    <section className="welcome-card">
                      <div className="eyebrow">全流程 · 可追溯 · 人工确认</div>
                      <h2>
                        以事实为起点，
                        <br />
                        让审计判断有据可循。
                      </h2>
                      <p>
                        六个阶段贯通同一项目资料。先核验来源，再形成结论；变化保留历史，影响明确可查。
                      </p>
                      <button
                        className="text-button"
                        onClick={() => navigate("documents")}
                      >
                        查看当前资料集 <ArrowRight size={16} />
                      </button>
                      <div className="welcome-orbit">
                        <ShieldCheck size={88} />
                      </div>
                    </section>
                    <section className="card priorities">
                      <div className="section-heading">
                        <h2>当前需要关注</h2>
                        <span className="live-dot">实时状态</span>
                      </div>
                      <button
                        className="priority-row"
                        onClick={() => navigate("facts")}
                      >
                        <span className="priority-icon amber">
                          <FileCheck2 size={19} />
                        </span>
                        <div>
                          <strong>事实待人工核验</strong>
                          <small>确认口径与来源后供下游使用</small>
                        </div>
                        <b>{pendingFacts.length}</b>
                        <ChevronRight size={15} />
                      </button>
                      <button
                        className="priority-row"
                        onClick={() => navigate("review")}
                      >
                        <span className="priority-icon purple">
                          <ClipboardCheck size={19} />
                        </span>
                        <div>
                          <strong>待处理质量事项</strong>
                          <small>回复、落实与销号分别管理</small>
                        </div>
                        <b>{openTasks.length}</b>
                        <ChevronRight size={15} />
                      </button>
                      <button
                        className="priority-row"
                        onClick={() => navigate("review")}
                      >
                        <span className="priority-icon red">
                          <RefreshCw size={19} />
                        </span>
                        <div>
                          <strong>变更后需重新复核</strong>
                          <small>原确认仅对当时版本有效</small>
                        </div>
                        <b>{staleArtifacts.length}</b>
                        <ChevronRight size={15} />
                      </button>
                    </section>
                  </div>
                  <div className="stats-grid">
                    <div className="stat">
                      <Files />
                      <span>已保存资料版本</span>
                      <strong>
                        {state.documents.length}
                        <small>份</small>
                      </strong>
                    </div>
                    <div className="stat">
                      <Database />
                      <span>项目事实记录</span>
                      <strong>
                        {state.facts.length}
                        <small>条</small>
                      </strong>
                    </div>
                    <div className="stat">
                      <FileCheck2 />
                      <span>已生成成果版本</span>
                      <strong>
                        {state.artifacts.length}
                        <small>份</small>
                      </strong>
                    </div>
                    <div className="stat">
                      <Activity />
                      <span>实际运行记录</span>
                      <strong>
                        {state.runs.length}
                        <small>次</small>
                      </strong>
                    </div>
                  </div>
                  {!state.documents.length && (
                    <section className="notice warning">
                      <div>
                        <strong>项目尚无输入资料</strong>
                        <p>
                          导入首批演示资料或接收本地文件后开始。后续反馈、复核及整改资料分批导入。
                        </p>
                      </div>
                      <button
                        className="button primary"
                        disabled={!!busy}
                        onClick={() => safeAct("seed", { batch: "initial" })}
                      >
                        <Plus size={16} />
                        导入首批演示资料
                      </button>
                    </section>
                  )}
                  <div className="section-heading">
                    <h2>审计全流程</h2>
                    <span className="muted small">
                      六阶段 · {state.scenarios.length} 个业务场景
                    </span>
                  </div>
                  <div className="stage-cards">
                    {stages.map((s, i) => {
                      const scs = state.scenarios.filter((x) =>
                        x.id.startsWith(s.id),
                      );
                      const runs = state.runs.filter((r) =>
                        r.scenarioId?.startsWith(s.id),
                      );
                      return (
                        <button
                          className="stage-card"
                          key={s.id}
                          onClick={() => navigate(scs[0]?.id || "overview")}
                          disabled={!scs.length}
                        >
                          <div className="stage-card-top">
                            <span>0{i + 1}</span>
                            <ArrowRight size={18} />
                          </div>
                          <h3>{s.title}</h3>
                          <p>{s.description}</p>
                          <div className="stage-card-footer">
                            <span>{scs.length} 个场景</span>
                            <span>{runs.length} 次实际运行</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="section-heading">
                    <h2>最近成果</h2>
                    <button
                      className="text-button"
                      onClick={() => navigate("history")}
                    >
                      查看运行记录 <ArrowRight size={14} />
                    </button>
                  </div>
                  <section className="card">
                    {state.artifacts.length ? (
                      [...state.artifacts]
                        .reverse()
                        .slice(0, 5)
                        .map((a) => (
                          <button
                            key={a.id}
                            className="artifact-row"
                            onClick={() => navigate(a.scenarioId)}
                          >
                            <span className="file-tile">
                              <FileCheck2 size={20} />
                            </span>
                            <div>
                              <strong>{a.title}</strong>
                              <small>
                                {a.scenarioId} · V{a.version} ·{" "}
                                {dateText(a.createdAt)}
                              </small>
                            </div>
                            <Badge value={a.status} />
                            <ChevronRight size={16} />
                          </button>
                        ))
                    ) : (
                      <Empty title="还没有生成成果">
                        进入业务场景，选择已保存的资料并执行核查。
                      </Empty>
                    )}
                  </section>
                </>
              )}
              {view === "documents" && (
                <>
                  <div className="toolbar">
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="搜索文件名、分类或编号"
                    />
                    <div className="toolbar-actions">
                      <button
                        className="button secondary"
                        disabled={!!busy || state.documents.length < 2}
                        onClick={() =>
                          openAction(
                            "compare",
                            "document",
                            undefined,
                            "比较资料版本",
                          )
                        }
                      >
                        <Layers3 size={15} />
                        比较版本
                      </button>
                      <button
                        className="button secondary"
                        disabled={!!busy || !state.documents.length}
                        onClick={() =>
                          openAction(
                            "freeze",
                            undefined,
                            undefined,
                            "冻结本次工作资料集",
                          )
                        }
                      >
                        <Archive size={15} />
                        冻结资料集
                      </button>
                    </div>
                  </div>
                  <section className="card">
                    <div className="section-heading padded">
                      <h2>
                        资料目录{" "}
                        <span className="muted small">
                          {state.documents.filter(matches).length} 个版本
                        </span>
                      </h2>
                      <span className="small muted">
                        新接收版本需人工确认适用性
                      </span>
                    </div>
                    {state.documents.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>资料名称 / 来源</th>
                              <th>分类</th>
                              <th>版本</th>
                              <th>解析状态</th>
                              <th>适用状态</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...state.documents]
                              .reverse()
                              .filter(matches)
                              .map((d) => (
                                <tr key={d.id}>
                                  <td>
                                    <button
                                      className="document-name"
                                      onClick={() =>
                                        setSource({
                                          documentId: d.id,
                                          version: d.version,
                                        })
                                      }
                                    >
                                      <FileTextIcon />
                                      {d.name}
                                    </button>
                                    <small className="muted block">
                                      {typeof d.source === "string"
                                        ? d.source
                                        : display(d.source)}
                                    </small>
                                  </td>
                                  <td>{display(d.kind)}</td>
                                  <td>
                                    <span className="version-pill">
                                      V{d.version}
                                    </span>
                                    {d.previousId && (
                                      <small className="block muted">
                                        有历史版本
                                      </small>
                                    )}
                                  </td>
                                  <td>
                                    <Badge value={d.parseStatus} />
                                  </td>
                                  <td>
                                    <Badge value={d.status} />
                                  </td>
                                  <td>
                                    <div className="row-actions">
                                      <button
                                        onClick={() =>
                                          setSource({
                                            documentId: d.id,
                                            version: d.version,
                                          })
                                        }
                                      >
                                        查看原文
                                      </button>
                                      <button
                                        disabled={!!busy}
                                        onClick={() =>
                                          openAction(
                                            "confirm",
                                            "document",
                                            d,
                                            "确认适用版本",
                                          )
                                        }
                                      >
                                        确认版本
                                      </button>
                                      <button
                                        disabled={!!busy}
                                        onClick={() =>
                                          openAction(
                                            "revise",
                                            "document",
                                            d,
                                            "修订派生解析",
                                          )
                                        }
                                      >
                                        修订解析
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty title="资料中心为空">
                        接收文件或在演示管理中导入资料包。
                      </Empty>
                    )}
                  </section>
                  <section className="card margin-top">
                    <div className="section-heading padded">
                      <h2>变更影响与历史快照</h2>
                    </div>
                    <DataView
                      value={[...state.events]
                        .reverse()
                        .filter((e) =>
                          /freeze|revise|upload|invalid/.test(
                            String(e.action || e.type || ""),
                          ),
                        )
                        .slice(0, 15)}
                      onSource={setSource}
                    />
                  </section>
                </>
              )}
              {view === "facts" && (
                <>
                  <div className="toolbar">
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="搜索事实字段或编号"
                    />
                    <span className="small muted">
                      修正单位或日期后，依赖成果需重新计算
                    </span>
                  </div>
                  <section className="card">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>事实 / 口径</th>
                            <th>内容</th>
                            <th>版本与状态</th>
                            <th>来源</th>
                            <th>人工操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.facts.filter(matches).map((f) => (
                            <tr key={f.id}>
                              <td>
                                <strong>{f.key || f.title}</strong>
                                <small className="block muted">
                                  {f.recordType} {f.unit}
                                </small>
                              </td>
                              <td>
                                <DataView
                                  value={f.value}
                                  onSource={setSource}
                                />
                                {f.record && (
                                  <details>
                                    <summary>结构化字段</summary>
                                    <DataView
                                      value={f.record}
                                      onSource={setSource}
                                    />
                                  </details>
                                )}
                              </td>
                              <td>
                                <span className="version-pill">
                                  V{f.version}
                                </span>
                                <Badge value={f.status} />
                              </td>
                              <td>
                                <Sources row={f} onSource={setSource} />
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    disabled={
                                      !!busy || f.status === "superseded"
                                    }
                                    onClick={() =>
                                      openAction(
                                        "confirm",
                                        "fact",
                                        f,
                                        "确认项目事实",
                                      )
                                    }
                                  >
                                    人工确认
                                  </button>
                                  <button
                                    disabled={
                                      !!busy || f.status === "superseded"
                                    }
                                    onClick={() =>
                                      openAction(
                                        "revise",
                                        "fact",
                                        f,
                                        "修正事实与口径",
                                      )
                                    }
                                  >
                                    修正事实
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!state.facts.length && (
                      <Empty title="尚无事实记录">
                        先导入可解析资料，核对提取记录及来源。
                      </Empty>
                    )}
                  </section>
                </>
              )}
              {scenario && (
                <ScenarioView
                  key={scenario.id}
                  state={state}
                  scenario={scenario}
                  busy={!!busy}
                  act={act}
                  onSource={setSource}
                  onAction={openAction}
                />
              )}
              {view === "workflow" && (
                <WorkflowView
                  state={state}
                  busy={!!busy}
                  act={act}
                  onSource={setSource}
                />
              )}
              {view === "review" && (
                <>
                  <div className="notice warning">
                    <ShieldCheck size={20} />
                    <span>
                      事实确认、意见落实、整改销号与正式审批分别管理。机器检查通过不代表正式批准。
                    </span>
                  </div>
                  {staleArtifacts.length > 0 && (
                    <section className="card">
                      <div className="section-heading padded">
                        <h2>变更影响 · 待重新复核</h2>
                      </div>
                      {staleArtifacts.map((a) => (
                        <button
                          className="artifact-row"
                          key={a.id}
                          onClick={() => navigate(a.scenarioId)}
                        >
                          <RefreshCw size={20} />
                          <div>
                            <strong>{a.title}</strong>
                            <small>
                              {a.staleReason ||
                                a.invalidationReason ||
                                "来源或文稿已变更，请重新运行并核验。"}
                            </small>
                          </div>
                          <Badge value={a.status} />
                          <ArrowRight size={16} />
                        </button>
                      ))}
                    </section>
                  )}
                  <ReviewLists
                    state={state}
                    busy={!!busy}
                    onSource={setSource}
                    onAction={openAction}
                  />
                  <section className="card margin-top">
                    <div className="section-heading padded">
                      <h2>版本绑定的人工确认历史</h2>
                    </div>
                    <DataView
                      value={state.confirmations || []}
                      onSource={setSource}
                    />
                  </section>
                </>
              )}
              {view === "assets" && (
                <AssetView
                  state={state}
                  busy={!!busy}
                  onSource={setSource}
                  onAction={openAction}
                  act={act}
                  setResult={setResult}
                />
              )}
              {view === "history" && (
                <>
                  <section className="card">
                    <div className="section-heading padded">
                      <h2>实际运行记录</h2>
                      <span className="muted small">
                        失败运行保留；不会替换为预制成果
                      </span>
                    </div>
                    {[...state.runs].reverse().map((r) => (
                      <div className="run-item" key={r.id}>
                        <div className="run-heading">
                          <span className="mono">{r.scenarioId}</span>
                          <strong>
                            {r.input?.action === "recognize"
                              ? "原件文字识别"
                              : r.input?.action === "transcribe"
                                ? "真实语音转写"
                                : operationNames[r.scenarioId] || r.scenarioId}
                          </strong>
                          <Badge value={r.status} />
                          <time>{dateText(r.startedAt)}</time>
                        </div>
                        <p className="small muted">
                          引擎：
                          {r.engine === "deterministic+model"
                            ? "规则计算 + 模型辅助"
                            : r.engine === "deterministic"
                              ? "规则计算（未调用模型）"
                              : display(r.engine)}
                        </p>
                        {r.error && (
                          <div className="notice error">{display(r.error)}</div>
                        )}
                        <details>
                          <summary>输入与运行详情</summary>
                          <DataView value={r} onSource={setSource} />
                        </details>
                        {r.artifactId && (
                          <button
                            className="text-button"
                            onClick={() => navigate(r.scenarioId)}
                          >
                            打开对应场景成果 <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {!state.runs.length && <Empty title="尚无运行记录" />}
                  </section>
                  <section className="card margin-top">
                    <div className="section-heading padded">
                      <h2>操作留痕</h2>
                    </div>
                    <DataView
                      value={[...state.events].reverse()}
                      onSource={setSource}
                    />
                  </section>
                </>
              )}
              {view === "settings" && (
                <section className="card settings-card">
                  <h2>分批导入演示资料</h2>
                  <p className="muted">
                    全部为演示模拟数据。每个资料包实际保存至服务端，重复导入由服务端幂等处理。
                  </p>
                  <div className="batch-grid">
                    {[
                      [
                        "initial",
                        "首批基础资料",
                        "计划、批复、合同、计量与现场记录",
                      ],
                      [
                        "feedback",
                        "征求意见资料",
                        "反馈函、意见说明及补充材料",
                      ],
                      ["review", "审理复核资料", "复核意见及修改落实材料"],
                      [
                        "rectification",
                        "整改证明资料",
                        "整改说明、凭证与效果复查材料",
                      ],
                    ].map(([batch, title, desc]) => (
                      <div className="batch-card" key={batch}>
                        <h3>{title}</h3>
                        <p>{desc}</p>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() => safeAct("seed", { batch })}
                        >
                          <Plus size={15} />
                          导入此批
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="danger-zone">
                    <div>
                      <h3>重置当前模拟项目</h3>
                      <p>
                        清空项目投影，需输入确认文字。请先导出需要保留的成果。
                      </p>
                    </div>
                    <button
                      className="button danger"
                      disabled={!!busy}
                      onClick={() =>
                        openAction(
                          "reset",
                          undefined,
                          undefined,
                          "重置演示项目",
                        )
                      }
                    >
                      重置项目
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={13} />
              演示模拟数据 · AI 辅助，不替代人工判断
            </span>
            <span>openAudit / 六阶段审计工作台</span>
          </footer>
        </main>
      </div>
      {source && state && (
        <EvidencePanel
          key={JSON.stringify(source)}
          source={source}
          state={state}
          onClose={() => setSource(null)}
          onSource={setSource}
          act={act}
          busy={!!busy}
        />
      )}
      {modal && state && (
        <ActionDialog
          modal={modal}
          state={state}
          busy={!!busy}
          act={act}
          onClose={() => setModal(null)}
          onResult={setResult}
        />
      )}
      {upload && (
        <UploadDialog
          busy={!!busy}
          act={act}
          onClose={() => setUpload(false)}
        />
      )}
      {result && (
        <Dialog title="操作结果与差异" onClose={() => setResult(null)}>
          <DataView
            value={result}
            onSource={(s) => {
              setResult(null);
              setSource(s);
            }}
          />
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function FileTextIcon() {
  return <Files size={17} />;
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function dateText(d: any) {
  return d
    ? new Date(d).toLocaleString("zh-CN", { hour12: false })
    : "未记录时间";
}
export function ReviewLists({
  state,
  busy,
  onSource,
  onAction,
  scenarioId,
}: {
  state: State;
  busy: boolean;
  onSource: (s: any) => void;
  onAction: (a: string, t?: string, r?: Row, title?: string) => void;
  scenarioId?: string;
}) {
  return (
    <>
      {(["findings", "tasks"] as const).map((kind) => (
        <section className="card margin-top" key={kind}>
          <div className="section-heading padded">
            <h2>
              {kind === "findings" ? "核查线索与问题" : "意见处理与待办事项"}
            </h2>
            <span className="small muted">每项处理均记录审核人和理由</span>
          </div>
          {state[kind]
            .filter((r) => !scenarioId || r.scenarioId === scenarioId)
            .map((r) => (
              <div className="review-item" key={r.id}>
                <div className="section-heading">
                  <strong>{r.title}</strong>
                  <Badge value={r.status} />
                </div>
                <p>{r.detail || r.description || r.reason}</p>
                {r.amount != null && (
                  <p>
                    涉及金额：{display(r.amount)} {r.unit || ""}
                  </p>
                )}
                <Sources row={r} onSource={onSource} />
                <div className="row-actions">
                  {kind === "findings" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        onAction("confirm", "finding", r, "确认核查发现")
                      }
                    >
                      确认发现
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      onAction(
                        "resolve",
                        kind === "findings" ? "finding" : "task",
                        r,
                        "人工处置与证据核验",
                      )
                    }
                  >
                    填写处理决定
                  </button>
                  <details>
                    <summary>查看完整记录</summary>
                    <DataView value={r} onSource={onSource} />
                  </details>
                </div>
              </div>
            ))}
          {!state[kind].some(
            (r) => !scenarioId || r.scenarioId === scenarioId,
          ) && (
            <Empty
              title={kind === "findings" ? "尚无核查线索" : "尚无待办事项"}
            />
          )}
        </section>
      ))}
    </>
  );
}
export function AssetView({
  state,
  busy,
  onSource,
  onAction,
  act,
  setResult,
}: {
  state: State;
  busy: boolean;
  onSource: (s: any) => void;
  onAction: (a: string, t?: string, r?: Row, title?: string) => void;
  act: (a: string, p?: any, s?: string) => Promise<any>;
  setResult: (r: any) => void;
}) {
  return (
    <div className="library-grid">
      {[
        ["knowledge", "知识库", "经核验的知识、案例与适用边界"],
        ["capability", "能力库", "规则、方法、模板及实际测试"],
        ["data", "数据库", "结构化字段、口径与脱敏样本"],
      ].map(([kind, title, desc]) => (
        <section className="card library" key={kind}>
          <div className="library-heading">
            <BookOpen size={22} />
            <h2>{title}</h2>
            <p>{desc}</p>
          </div>
          {state.assets
            .filter((a) => a.library === kind)
            .map((a) => (
              <article className="asset-card" key={a.id}>
                <Badge value={a.status} />
                <h3>{a.title || a.name}</h3>
                <p>{a.description || a.scope}</p>
                <Sources row={a} onSource={onSource} />
                <details>
                  <summary>适用条件与测试记录</summary>
                  <DataView value={a} onSource={onSource} />
                </details>
                <div className="row-actions">
                  {kind === "capability" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act("testAsset", { assetId: a.id })
                          .then((r) => setResult(r))
                          .catch(() => {})
                      }
                    >
                      实际测试能力
                    </button>
                  )}
                  <button
                    disabled={busy || a.status === "published"}
                    onClick={() =>
                      onAction("publish", "asset", a, "审核发布到三库")
                    }
                  >
                    审核入库
                  </button>
                  <button
                    disabled={busy || a.status !== "published"}
                    onClick={() =>
                      onAction("reuse", "asset", a, "在新项目复用方法")
                    }
                  >
                    跨项目复用
                  </button>
                </div>
              </article>
            ))}
          {!state.assets.some((a) => a.library === kind) && (
            <Empty title="暂无候选资产">
              执行 F05 从已保存成果中提取候选。
            </Empty>
          )}
        </section>
      ))}
    </div>
  );
}
