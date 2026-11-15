import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  Link2,
  X,
} from "lucide-react";
import {
  display,
  statuses,
  label,
  list,
  sourceList,
  isStale,
  type Row,
  type State,
} from "./model";
export function Badge({ value }: { value: any }) {
  const s = String(value ?? "pending");
  const tone = /stale|invalid|fail|error|blocked/.test(s)
    ? "danger"
    : /pending|unconfirmed|draft|candidate|missing|warning|待/.test(s)
      ? "warn"
      : /^(confirmed|approved|reviewed|published|success|succeeded|passed|closed)$|人工已/.test(
            s,
          )
        ? "good"
        : "neutral";
  return <span className={"badge " + tone}>{display(value ?? "pending")}</span>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <FileText size={27} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
export function SourceButton({
  source,
  onSource,
}: {
  source: any;
  onSource: (x: any) => void;
}) {
  return (
    <button className="source-link" onClick={() => onSource(source)}>
      <Link2 size={12} />
      {typeof source === "string" ? source : source.locator || "查看资料出处"}
      {source.version ? ` · V${source.version}` : ""}
    </button>
  );
}
export function Sources({
  row,
  onSource,
}: {
  row: any;
  onSource: (x: any) => void;
}) {
  const refs = sourceList(row);
  return refs.length ? (
    <div className="source-list">
      {refs.map((s, i) => (
        <SourceButton key={i} source={s} onSource={onSource} />
      ))}
    </div>
  ) : (
    <span className="muted small">未提供来源定位</span>
  );
}
const omit = new Set([
  "sources",
  "source",
  "id",
  "documentId",
  "artifactId",
  "factId",
]);
export function DataView({
  value,
  onSource,
  depth = 0,
}: {
  value: any;
  onSource: (x: any) => void;
  depth?: number;
}) {
  if (value == null) return <span className="muted">未提供</span>;
  if (typeof value === "string" && /^https?:\/\//.test(value))
    return (
      <a href={value} target="_blank" rel="noreferrer">
        查看原始出处 ↗
      </a>
    );
  if (typeof value !== "object")
    return <span className="text-value">{display(value)}</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="muted">暂无条目</span>;
    if (value.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
      return <DataTable rows={value} onSource={onSource} depth={depth + 1} />;
    }
    return (
      <div className="value-list">
        {value.map((v, i) => (
          <div key={i}>
            <DataView value={v} onSource={onSource} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <dl className="details-grid">
      {Object.entries(value)
        .filter(([k]) => !omit.has(k))
        .map(([k, v]) => (
          <div key={k} className={typeof v === "object" ? "wide" : ""}>
            <dt>{label(k)}</dt>
            <dd>
              {k === "status" ? (
                <Badge value={v} />
              ) : (
                <DataView value={v} onSource={onSource} depth={depth + 1} />
              )}
            </dd>
          </div>
        ))}
      {sourceList(value).length > 0 && (
        <div className="wide">
          <dt>来源依据</dt>
          <dd>
            <Sources row={value} onSource={onSource} />
          </dd>
        </div>
      )}
    </dl>
  );
}
export function DataTable({
  rows,
  onSource,
  depth = 0,
}: {
  rows: any[];
  onSource: (x: any) => void;
  depth?: number;
}) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(
    (k) => !omit.has(k),
  );
  const visible = keys.slice(0, 7);
  const more = keys.slice(7);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {visible.map((k) => (
              <th key={k}>{label(k)}</th>
            ))}
            {more.length > 0 && <th>详情</th>}
            <th>依据</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {visible.map((k) => (
                <td key={k}>
                  {k === "status" ? (
                    <Badge value={r[k]} />
                  ) : typeof r[k] === "object" && r[k] !== null ? (
                    <details>
                      <summary>
                        展开 {Array.isArray(r[k]) ? r[k].length : ""} 项{" "}
                        <ChevronDown size={12} />
                      </summary>
                      <DataView
                        value={r[k]}
                        onSource={onSource}
                        depth={depth + 1}
                      />
                    </details>
                  ) : (
                    <DataView value={r[k]} onSource={onSource} />
                  )}
                </td>
              ))}
              {more.length > 0 && (
                <td>
                  <details>
                    <summary>更多明细</summary>
                    <DataView
                      value={Object.fromEntries(more.map((k) => [k, r[k]]))}
                      onSource={onSource}
                    />
                  </details>
                </td>
              )}
              <td>
                <Sources row={r} onSource={onSource} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="document-text">
      {String(text)
        .split("\n")
        .map((line, i) =>
          line.startsWith("#") ? (
            <h4 key={i}>{line.replace(/^#+\s*/, "")}</h4>
          ) : (
            <p key={i}>{line || "\u00a0"}</p>
          ),
        )}
    </div>
  );
}
export function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = nodes[0],
          last = nodes.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={root}
        tabIndex={-1}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}
export function RecordEditor({
  value,
  onChange,
}: {
  value: any;
  onChange: (v: any) => void;
}) {
  if (Array.isArray(value))
    return (
      <div className="record-editor">
        {value.map((v, i) => (
          <label key={i}>
            第 {i + 1} 项
            <RecordEditor
              value={v}
              onChange={(x) => onChange(value.map((r, j) => (j === i ? x : r)))}
            />
          </label>
        ))}
      </div>
    );
  if (value === null || typeof value !== "object")
    return (
      <input
        value={value ?? ""}
        onChange={(e) =>
          onChange(
            typeof value === "number" && e.target.value !== ""
              ? Number(e.target.value)
              : e.target.value,
          )
        }
      />
    );
  return (
    <div className="record-editor">
      {Object.entries(value).map(([k, v]) => (
        <label key={k}>
          {label(k)}
          {v && typeof v === "object" ? (
            <RecordEditor
              value={v}
              onChange={(x) => onChange({ ...value, [k]: x })}
            />
          ) : ["type", "kind", "recordType"].includes(k) &&
            typeof v === "string" ? (
            <select
              value={v}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            >
              {[
                ...new Set([
                  v,
                  "project",
                  "approval",
                  "contract",
                  "payment",
                  "measurement",
                  "drawing",
                  "inventory",
                  "count",
                  "media",
                  "feedback",
                  "review",
                  "report",
                  "rectification",
                  "requirement",
                  "law",
                  "template",
                  "handover",
                ]),
              ].map((key) => (
                <option key={key} value={key}>
                  {statuses[key] || key}
                </option>
              ))}
            </select>
          ) : typeof v === "boolean" ? (
            <select
              value={String(v)}
              onChange={(e) =>
                onChange({ ...value, [k]: e.target.value === "true" })
              }
            >
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          ) : (
            <input
              type={typeof v === "number" ? "number" : "text"}
              step="any"
              value={v == null ? "" : String(v)}
              onChange={(e) =>
                onChange({
                  ...value,
                  [k]:
                    typeof v === "number" && e.target.value !== ""
                      ? Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          )}
        </label>
      ))}
    </div>
  );
}
export function EvidencePanel({
  source,
  state,
  onClose,
  onSource,
  act,
  busy,
}: {
  source: any;
  state: State;
  onClose: () => void;
  onSource: (x: any) => void;
  act: (action: string, payload: Record<string, any>) => Promise<any>;
  busy: boolean;
}) {
  const ref = typeof source === "string" ? { documentId: source } : source;
  const doc = state.documents.find((d) => d.id === ref.documentId);
  const fact = state.facts.find((f) => f.id === ref.factId);
  const artifact = state.artifacts.find((a) => a.id === ref.artifactId);
  const item = doc || fact || artifact;
  const [tab, setTab] = useState("text");
  const [sourceError, setSourceError] = useState("");
  const [pages, setPages] = useState("");
  const parent = state.documents.find(
    (d) =>
      d.id === (doc?.parentDocumentId || doc?.records?.[0]?.sourceDocumentId),
  );
  async function derive(action: string) {
    if (!doc) return;
    setSourceError("");
    try {
      const selectedPages = pages.split(/[,，]/).map((p) => Number(p.trim()));
      if (
        action === "recognize" &&
        pages.trim() &&
        selectedPages.some((p) => !Number.isInteger(p) || p < 1)
      )
        throw new Error("请用逗号分隔从 1 开始的有效页码。");
      const result = await act(action, {
        documentId: doc.id,
        ...(action === "recognize" && pages.trim()
          ? { pages: selectedPages }
          : {}),
      });
      if (result?.document?.id)
        onSource({
          documentId: result.document.id,
          locator: "模型派生内容，待人工核验",
        });
    } catch (error) {
      setSourceError((error as Error).message);
    }
  }
  return (
    <aside className="evidence-panel" aria-label="来源证据面板">
      <header>
        <div>
          <span className="eyebrow">SOURCE EVIDENCE</span>
          <h2>来源与证据</h2>
        </div>
        <button className="icon-button" aria-label="关闭来源" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="evidence-body">
        <div className="evidence-title">
          <FileText size={20} />
          <strong>
            {item?.name || item?.title || item?.key || "来源定位"}
          </strong>
        </div>
        <div className="chips">
          <Badge value={item?.status} />
          {ref.version && (
            <span className="badge neutral">引用 V{ref.version}</span>
          )}
          {item?.version && (
            <span className="badge neutral">资料 V{item.version}</span>
          )}
        </div>
        <div className="locator">
          <Link2 size={15} />
          {ref.locator || "未提供精确定位"}
        </div>
        {doc && (
          <p className="small muted">
            解析记录来源：
            {display(doc.recordOrigin || doc.generation || "未记录")} · 原件保留
          </p>
        )}
        {ref.quote && (
          <blockquote>
            <Quote value={ref.quote} onSource={onSource} />
          </blockquote>
        )}
        {item && isStale(item) && (
          <div className="notice warning">该对象已变更，原确认需重新核验。</div>
        )}
        {doc && (
          <>
            {busy && (
              <div className="notice processing" role="status">
                正在提取原件内容，请稍候；完成后请核对摘录。
              </div>
            )}
            {sourceError && (
              <div className="notice error" role="alert">
                {sourceError}
              </div>
            )}
            <div className="source-actions">
              {(doc.mimeType === "application/pdf" ||
                /^image\/(png|jpeg|webp|gif)$/.test(doc.mimeType)) && (
                <button
                  className="button secondary compact"
                  disabled={busy}
                  onClick={() => void derive("recognize")}
                >
                  识别原件文字
                </button>
              )}
              {doc.mimeType?.startsWith("audio/") && (
                <button
                  className="button secondary compact"
                  disabled={busy}
                  onClick={() => void derive("transcribe")}
                >
                  录音转文字
                </button>
              )}
              {parent && (
                <button
                  className="text-button"
                  onClick={() => onSource({ documentId: parent.id })}
                >
                  查看派生前原件
                </button>
              )}
            </div>
            {doc.mimeType === "application/pdf" && (
              <label>
                识别页码（选填，超过六页须指定）
                <input
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  placeholder="例如 1,2,3"
                />
              </label>
            )}
            <div className="tabs">
              <button
                className={tab === "text" ? "active" : ""}
                onClick={() => setTab("text")}
              >
                原文
              </button>
              <button
                className={tab === "records" ? "active" : ""}
                onClick={() => setTab("records")}
              >
                解析记录
              </button>
              <button
                className={tab === "meta" ? "active" : ""}
                onClick={() => setTab("meta")}
              >
                接收信息
              </button>
            </div>
            {tab === "text" && (
              <>
                <Media
                  doc={parent || doc}
                  detailed
                  locator={ref.locator}
                  segments={
                    doc.records?.flatMap((r: any) => r.segments || []) || []
                  }
                />
                {doc.text ? (
                  <pre className="source-text">{doc.text}</pre>
                ) : (
                  <Empty title="暂无可读原文">
                    原件已保留，请下载核验；解析结果不代表原件真实性。
                  </Empty>
                )}
              </>
            )}
            {tab === "records" && (
              <DataView value={doc.records || []} onSource={onSource} />
            )}
            {tab === "meta" && (
              <DataView
                value={Object.fromEntries(
                  Object.entries(doc).filter(
                    ([k]) => !["text", "records", "contentBase64"].includes(k),
                  ),
                )}
                onSource={onSource}
              />
            )}
            <a
              className="button secondary full"
              href={"/api/audit/file?id=" + encodeURIComponent(doc.id)}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowUpRight size={15} />
              下载原始资料
            </a>
          </>
        )}
        {!doc && item && <DataView value={item} onSource={onSource} />}
        {!item && (
          <Empty title="来源对象暂不可用">
            请核对来源编号或补充原始资料。
            {typeof source === "string"
              ? source
              : ref.documentId || ref.factId || ref.artifactId}
          </Empty>
        )}
        {doc && (
          <section className="inset">
            <h3>引用此资料的成果</h3>
            {state.artifacts
              .filter((a) => sourceList(a).some((s) => s.documentId === doc.id))
              .map((a) => (
                <button
                  className="linked-row"
                  key={a.id}
                  onClick={() => onSource({ artifactId: a.id })}
                >
                  <span>
                    {a.scenarioId} · {a.title}
                  </span>
                  <Badge value={a.status} />
                </button>
              ))}
          </section>
        )}
        <p className="muted small">
          演示模拟数据 · 原件及历史版本保留。来源引用不等于事实已获人工确认。
        </p>
      </div>
    </aside>
  );
}
export function Media({
  doc,
  detailed = false,
  locator = "",
  segments = [],
}: {
  doc: Row;
  detailed?: boolean;
  locator?: string;
  segments?: { start: number; end: number; text: string }[];
}) {
  const url = "/api/audit/file?id=" + encodeURIComponent(doc.id);
  const [zoom, setZoom] = useState(100);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playError, setPlayError] = useState("");
  const region = String(
    doc.records?.find((r: any) => r.region)?.region ||
      locator ||
      doc.records?.[0]?.locator ||
      "",
  );
  const coordinates =
    region.match(
      /x\s*=\s*([\d.]+).*?y\s*=\s*([\d.]+).*?w\s*=\s*([\d.]+).*?h\s*=\s*([\d.]+)/,
    ) ||
    region.match(
      /\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/,
    );
  const timecode = String(locator).match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/);
  const seconds = timecode
    ? Number(timecode[1] || 0) * 3600 +
      Number(timecode[2]) * 60 +
      Number(timecode[3])
    : 0;
  if (detailed && doc.mimeType?.startsWith("image/"))
    return (
      <div className="image-viewer">
        <label>
          原图缩放 {zoom}%
          <input
            aria-label="原图缩放"
            type="range"
            min="50"
            max="400"
            step="25"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <div className="image-viewport">
          <div className="image-canvas" style={{ width: `${zoom}%` }}>
            <img
              src={url}
              alt={doc.name}
              onLoad={(e) =>
                setDimensions({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
            />
            {coordinates && dimensions.width > 0 && (
              <div
                className="region-highlight"
                aria-label="来源记录标注区域"
                style={{
                  left: `${(Number(coordinates[1]) / dimensions.width) * 100}%`,
                  top: `${(Number(coordinates[2]) / dimensions.height) * 100}%`,
                  width: `${(Number(coordinates[3]) / dimensions.width) * 100}%`,
                  height: `${(Number(coordinates[4]) / dimensions.height) * 100}%`,
                }}
              />
            )}
          </div>
        </div>
        {coordinates && (
          <p className="small muted">
            来源已记录区域：{coordinates[0]}（原图像素坐标）
          </p>
        )}
      </div>
    );
  return doc.mimeType?.startsWith("image/") ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="source-image" src={url} alt={doc.name} />
    </a>
  ) : doc.mimeType?.startsWith("audio/") ? (
    <div>
      <audio
        ref={audioRef}
        controls
        src={url}
        onLoadedMetadata={(e) => {
          if (seconds)
            e.currentTarget.currentTime = Math.min(
              seconds,
              e.currentTarget.duration || seconds,
            );
        }}
      />
      {detailed && segments.length > 0 && (
        <div className="transcript-segments">
          <p className="small muted">
            实际分段时间码，不代表逐词对齐；点击回放核对原意。
          </p>
          {segments.map((segment, index) => (
            <button
              key={index}
              className="transcript-segment"
              onClick={() => {
                setPlayError("");
                if (audioRef.current) {
                  audioRef.current.currentTime = segment.start;
                  void audioRef.current
                    .play()
                    .catch(() =>
                      setPlayError(
                        "浏览器未能播放原音频，请使用播放器控件或下载原件核验。",
                      ),
                    );
                }
              }}
            >
              <span>
                {segment.start.toFixed(1)}–{segment.end.toFixed(1)} 秒 · 回放
              </span>
              <p>{segment.text}</p>
            </button>
          ))}
        </div>
      )}
      {playError && (
        <div className="notice error" role="alert">
          {playError}
        </div>
      )}
    </div>
  ) : doc.mimeType?.startsWith("video/") ? (
    <video
      controls
      src={url}
      onLoadedMetadata={(e) => {
        if (seconds)
          e.currentTarget.currentTime = Math.min(
            seconds,
            e.currentTarget.duration || seconds,
          );
      }}
    />
  ) : null;
}

function Quote({
  value,
  onSource,
}: {
  value: any;
  onSource: (s: any) => void;
}) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object")
      return <DataView value={parsed} onSource={onSource} />;
  } catch {}
  return <>{display(value)}</>;
}
