import { useState, type FormEvent } from "react";
import { AlertTriangle, Check, FileUp, Plus, Trash2 } from "lucide-react";
import { Dialog, RecordEditor, Badge } from "./components";
import { type Row, type State, label, display } from "./model";
type Act = (
  action: string,
  payload?: Record<string, any>,
  scenarioId?: string,
) => Promise<any>;
export function ActionDialog({
  modal,
  state,
  busy,
  act,
  onClose,
  onResult,
}: {
  modal: { action: string; targetType?: string; row?: Row; title?: string };
  state: State;
  busy: boolean;
  act: Act;
  onClose: () => void;
  onResult: (r: any) => void;
}) {
  const { action, targetType, row } = modal;
  const [actor, setActor] = useState(
    sessionStorage.getItem("audit-reviewer") || "",
  );
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("");
  const [decision, setDecision] = useState("replied");
  const [evidenceIds, setEvidence] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [redacted, setRedacted] = useState(false);
  const [permissionConfirmed, setPermission] = useState(false);
  const [checked, setChecked] = useState(false);
  const [leftId, setLeft] = useState("");
  const [rightId, setRight] = useState("");
  const [content, setContent] = useState(row?.content || row?.text || "");
  const [value, setValue] = useState(row?.value ?? "");
  const [unit, setUnit] = useState(row?.unit || "");
  const [record, setRecord] = useState(row?.record || {});
  const [records, setRecords] = useState<Row[]>(
    row?.records || row?.rows || [],
  );
  const [error, setError] = useState("");
  const [targetProject, setTargetProject] = useState({
    id: "",
    type: "",
    unit: "",
  });
  const needActor = !["compare", "reset"].includes(action);
  const needReason = !["compare", "reset", "reuse"].includes(action);
  const targets = targetType === "artifact" ? state.artifacts : state.documents;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    let payload: any = {};
    if (needActor) payload.actor = actor.trim();
    if (needReason) payload.reason = reason.trim();
    if (["confirm", "revise", "resolve"].includes(action)) {
      payload.targetType = targetType;
      payload.targetId = row?.id;
    }
    if (action === "confirm" && targetType === "law")
      payload.scope = scope.trim();
    if (action === "compare") payload = { leftId, rightId };
    if (action === "revise")
      payload.patch =
        targetType === "fact"
          ? { value, unit, record }
          : targetType === "artifact"
            ? { content, rows: records }
            : { text: content, records };
    if (action === "resolve") {
      payload.decision = decision;
      payload.evidenceIds = evidenceIds;
    }
    if (action === "publish")
      Object.assign(payload, {
        assetId: row?.id,
        scope,
        redacted,
        permissionConfirmed,
      });
    if (action === "reuse")
      Object.assign(payload, { assetId: row?.id, targetProject });
    if (action === "reset") payload = { confirmation };
    try {
      const result = await act(action, payload);
      if (actor.trim()) sessionStorage.setItem("audit-reviewer", actor.trim());
      onClose();
      if (["compare", "reuse", "freeze"].includes(action) && result)
        onResult(result);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog
      title={modal.title || "人工操作"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        {row && (
          <div className="target-summary">
            <strong>{row.title || row.name || row.key}</strong>
            <div>
              <span className="version-pill">V{row.version || 1}</span>
              <Badge value={row.status} />
            </div>
          </div>
        )}
        {["confirm", "revise", "resolve", "publish"].includes(action) && (
          <div className="notice warning">
            <AlertTriangle size={18} />
            <span>
              {action === "revise"
                ? "保存后形成新版本，引用此内容的成果须重新核对。原件及历史版本保留。"
                : "请核对具体版本、证据与适用范围。此操作不会替代正式审批、签发或送达。"}
            </span>
          </div>
        )}
        {action === "compare" && (
          <>
            <p className="muted">
              选择需要比较的两个版本，查看正文和明细的变化。
            </p>
            <div className="form-grid">
              <label>
                比较前版本
                <select
                  required
                  value={leftId}
                  onChange={(e) => setLeft(e.target.value)}
                >
                  <option value="">请选择</option>
                  {targets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.title} · V{d.version} · {d.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                比较后版本
                <select
                  required
                  value={rightId}
                  onChange={(e) => setRight(e.target.value)}
                >
                  <option value="">请选择</option>
                  {targets
                    .filter((d) => d.id !== leftId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name || d.title} · V{d.version} · {d.id}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </>
        )}
        {action === "revise" && (
          <>
            {targetType === "fact" ? (
              <>
                <div className="form-grid">
                  <label>
                    事实值
                    <RecordEditor value={value} onChange={setValue} />
                  </label>
                  <label>
                    单位
                    <input
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="如：元、万元、米"
                    />
                  </label>
                </div>
                {Object.keys(record).length > 0 && (
                  <>
                    <h3>事实明细</h3>
                    <RecordEditor
                      value={record}
                      onChange={(next) => {
                        setRecord(next);
                        if (next.amount !== record.amount)
                          setValue(next.amount);
                        else if (next.quantity !== record.quantity)
                          setValue(next.quantity);
                        else if (next.value !== record.value)
                          setValue(next.value);
                        if (next.unit !== record.unit) setUnit(next.unit || "");
                      }}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <label>
                  {targetType === "artifact"
                    ? "成果正文"
                    : "资料摘录（原件保留）"}
                  <textarea
                    rows={12}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                  />
                </label>
                {records.length > 0 && (
                  <details className="inset">
                    <summary>编辑业务明细（{records.length} 条）</summary>
                    {records.map((r, i) => (
                      <div className="record-block" key={i}>
                        <h4>第 {i + 1} 条</h4>
                        <RecordEditor
                          value={r}
                          onChange={(v) =>
                            setRecords(records.map((x, j) => (i === j ? v : x)))
                          }
                        />
                      </div>
                    ))}
                  </details>
                )}
              </>
            )}
            <div className="inset">
              <h3>可能受此次修改影响的成果</h3>
              <p className="small muted">
                保存后将标记需要重新核对的成果。以下成果引用了当前内容：
              </p>
              {state.artifacts
                .filter(
                  (a) =>
                    a.id !== row?.id &&
                    (JSON.stringify(a.sources).includes(row?.id || "\u0000") ||
                      JSON.stringify(a.dependsOn || []).includes(
                        row?.id || "\u0000",
                      )),
                )
                .map((a) => (
                  <p key={a.id}>
                    {a.scenarioId} · {a.title} · V{a.version}
                  </p>
                ))}
            </div>
          </>
        )}
        {action === "resolve" && (
          <>
            <label>
              处理决定
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <option value="replied">已回复（仍待落实核验）</option>
                <option value="implemented">确认落实（需有效证据）</option>
                <option value="closed">人工销号（需有效证据）</option>
                {targetType === "finding" && (
                  <option value="excluded">排除此线索（保留说明）</option>
                )}
              </select>
            </label>
            <label>核验所据资料与成果</label>
            <div className="checkbox-list">
              {[...state.documents, ...state.artifacts].map((d) => (
                <label className="checkbox-label" key={d.id}>
                  <input
                    type="checkbox"
                    checked={evidenceIds.includes(d.id)}
                    onChange={(e) =>
                      setEvidence(
                        e.target.checked
                          ? [...evidenceIds, d.id]
                          : evidenceIds.filter((x) => x !== d.id),
                      )
                    }
                  />
                  <span>
                    {d.name || d.title} · V{d.version}
                  </span>
                </label>
              ))}
            </div>
            {["implemented", "closed"].includes(decision) &&
              !evidenceIds.length && (
                <p className="form-hint error-text">
                  请先选择已核实的证明材料，再确认落实或销号。
                </p>
              )}
          </>
        )}
        {(action === "publish" ||
          (action === "confirm" && targetType === "law")) && (
          <label>
            人工适用性说明 / 适用范围
            <textarea
              required
              rows={3}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="说明行为期间、适用地域、对象、条件及核验依据"
            />
          </label>
        )}
        {action === "publish" && (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                required
                checked={redacted}
                onChange={(e) => setRedacted(e.target.checked)}
              />
              已完成脱敏核验
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                required
                checked={permissionConfirmed}
                onChange={(e) => setPermission(e.target.checked)}
              />
              已核验跨项目使用权限
            </label>
            <p className="small muted">审计方法须验证可用，并经审核后入库。</p>
          </>
        )}
        {action === "reuse" && (
          <>
            <div className="notice warning">
              仅复用方法和适配条件，不复制原事实核对与结论。
            </div>
            <label>
              新项目编号
              <input
                required
                value={targetProject.id}
                onChange={(e) =>
                  setTargetProject({ ...targetProject, id: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                项目类型
                <input
                  required
                  value={targetProject.type}
                  onChange={(e) =>
                    setTargetProject({ ...targetProject, type: e.target.value })
                  }
                  placeholder="如：市政工程"
                />
              </label>
              <label>
                新项目计量单位
                <input
                  required
                  value={targetProject.unit}
                  onChange={(e) =>
                    setTargetProject({ ...targetProject, unit: e.target.value })
                  }
                  placeholder="如：米"
                />
              </label>
            </div>
          </>
        )}
        {action === "reset" && (
          <>
            <div className="notice error">
              此操作清空当前演示项目记录。请确认已导出所需成果。
            </div>
            <label>
              输入“重置演示项目”确认
              <input
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </label>
          </>
        )}
        {action === "freeze" && (
          <p className="muted">
            保存本次使用的资料目录及版本，便于后续查阅。资料真实性和适用性仍须核验。
          </p>
        )}
        {needActor && (
          <label>
            经办人 / 核验人
            <input
              required
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="填写实际经办人或核验人姓名"
            />
          </label>
        )}
        {needReason && (
          <label>
            核验依据与处理理由
            <textarea
              required
              minLength={3}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="说明已核对的事实、来源、范围及本次决定"
            />
          </label>
        )}
        {action === "confirm" && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={checked}
              required
              onChange={(e) => setChecked(e.target.checked)}
            />
            我已核对本次具体版本及其证据，愿意记录本次人工确认。
          </label>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className={"button " + (action === "reset" ? "danger" : "primary")}
            disabled={
              busy ||
              (action === "reset" && confirmation !== "重置演示项目") ||
              (action === "resolve" &&
                ["implemented", "closed"].includes(decision) &&
                !evidenceIds.length)
            }
          >
            {busy
              ? "正在保存…"
              : action === "compare"
                ? "计算版本差异"
                : action === "reuse"
                  ? "生成适配清单"
                  : "确认并保存"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function UploadDialog({
  busy,
  documents,
  act,
  onClose,
}: {
  busy: boolean;
  documents: Row[];
  act: Act;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("");
  const [logicalId, setLogicalId] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [records, setRecords] = useState<Record<string, any>[]>([]);
  const [fieldName, setFieldName] = useState("");
  const choose = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setError("单个文件不得超过 10 MB。");
      return;
    }
    setError("");
    setFile(f);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError("");
    setReading(true);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("无法读取该文件"));
        reader.readAsDataURL(file);
      });
      await act("upload", {
        name: file.name,
        ...(file.type ? { mimeType: file.type } : {}),
        contentBase64,
        ...(kind ? { kind } : {}),
        ...(logicalId ? { logicalId } : {}),
        source,
        ...(records.length ? { records } : {}),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  };
  const kinds: Record<string, string> = {
    project: "项目基础",
    approval: "批复与决策",
    contract: "合同",
    payment: "支付",
    measurement: "计量",
    drawing: "图纸",
    inventory: "库存台账",
    count: "实盘记录",
    media: "现场音视频",
    feedback: "征求意见反馈",
    review: "复核意见",
    report: "报告",
    rectification: "整改证明",
    requirement: "资料要求",
    law: "法规依据",
    template: "文书模板",
  };
  return (
    <Dialog
      title="上传并登记审计资料"
      onClose={() => {
        if (!busy && !reading) onClose();
      }}
    >
      <form onSubmit={submit}>
        <label
          className="upload-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files[0]);
          }}
        >
          <FileUp size={32} />
          <strong>{file ? file.name : "选择文件，或拖入此处"}</strong>
          <span>
            {file
              ? `${(file.size / 1024).toFixed(1)} KiB`
              : "单个文件最大 10 MB，可上传文档、表格、照片及音视频"}
          </span>
          <input
            aria-label="选择上传文件"
            type="file"
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </label>
        <label>
          本次上传用途
          <select
            aria-label="本次上传用途"
            value={
              documents.find((d) => d.logicalId === logicalId)?.logicalId || ""
            }
            onChange={(e) => {
              setLogicalId(e.target.value);
              const existing = documents.find(
                (d) => d.logicalId === e.target.value,
              );
              if (existing) setKind(existing.kind);
            }}
          >
            <option value="">登记一份新资料</option>
            {documents
              .filter(
                (d, i, all) =>
                  d.logicalId &&
                  all.findIndex((x) => x.logicalId === d.logicalId) === i,
              )
              .map((d) => (
                <option key={d.logicalId} value={d.logicalId}>
                  登记新版本：{d.name}
                </option>
              ))}
          </select>
          <small>
            已有同一份资料时，选择其名称登记新版本，便于比较修改内容。
          </small>
        </label>
        <div className="form-grid">
          <label>
            资料类别
            <select
              aria-label="资料类别"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">自动识别资料类别</option>
              {Object.entries(kinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <details className="optional-settings">
            <summary>自行填写资料标识（选填）</summary>
            <label>
              同一资料标识（选填）
              <input
                value={logicalId}
                onChange={(e) => setLogicalId(e.target.value)}
                placeholder="同一文件各版本使用同一标识"
              />
            </label>
          </details>
        </div>
        <label>
          资料提供单位及来源
          <input
            required
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="如：演示模拟数据，项目单位第二批报送"
          />
        </label>
        <div className="notice warning">
          原件会完整保留。上传后请核对提取内容；无法识别的内容可人工摘录。新版本须核对后确认适用。
        </div>
        <details className="inset">
          <summary>补充人工摘录（选填）</summary>
          <p className="small muted">
            可补充图纸参数、录音文字或表格内容，并填写原件页码、位置等出处。
          </p>
          {records.map((r, i) => (
            <div className="record-block" key={i}>
              <div className="section-heading">
                <h4>人工记录 {i + 1}</h4>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={"移除记录" + (i + 1)}
                  onClick={() => setRecords(records.filter((_, j) => i !== j))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <RecordEditor
                value={r}
                onChange={(v) =>
                  setRecords(records.map((x, j) => (i === j ? v : x)))
                }
              />
            </div>
          ))}
          <div className="toolbar">
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setRecords([
                  ...records,
                  {
                    type: kind || "manual",
                    locator: "",
                    value: "",
                    unit: "",
                    note: "人工摘录",
                  },
                ])
              }
            >
              <Plus size={14} />
              添加记录
            </button>
            <label>
              补充摘录项目
              <select
                aria-label="补充摘录项目"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
              >
                <option value="">请选择</option>
                {[
                  ["amount", "金额"],
                  ["quantity", "数量"],
                  ["date", "日期"],
                  ["dateRole", "日期含义"],
                  ["contractId", "合同编号"],
                  ["unitPrice", "单价"],
                  ["title", "事项名称"],
                  ["statement", "现场记录内容"],
                  ["length", "长度"],
                  ["width", "宽度"],
                  ["height", "高度"],
                  ["parameterConfirmed", "参数已人工核验"],
                  ["transcript", "录音文字"],
                  ["measurement", "实测值"],
                ].map(([key, text]) => (
                  <option key={key} value={key}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={
                !fieldName.trim() ||
                !records.length ||
                ["__proto__", "constructor", "prototype"].includes(
                  fieldName.trim(),
                )
              }
              onClick={() => {
                setRecords(
                  records.map((r) => ({
                    ...r,
                    [fieldName.trim()]:
                      fieldName === "parameterConfirmed"
                        ? false
                        : [
                              "amount",
                              "quantity",
                              "unitPrice",
                              "length",
                              "width",
                              "height",
                              "measurement",
                            ].includes(fieldName)
                          ? 0
                          : "",
                  })),
                );
                setFieldName("");
              }}
            >
              添加摘录项目
            </button>
          </div>
        </details>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy || reading}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={!file || busy || reading}
          >
            <Check size={16} />
            {busy || reading ? "接收登记中…" : "保存原件并登记"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
