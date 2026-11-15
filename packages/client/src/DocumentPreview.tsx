import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { apiUrl, type Row } from "./model";
export function supportsPreview(doc?: Row) {
  return (
    !!doc &&
    (doc.mimeType === "application/pdf" ||
      /\.(pdf|docx?|wps|rtf|odt)$/i.test(doc.name || ""))
  );
}
export function DocumentPreview({ doc }: { doc: Row }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [width, setWidth] = useState(600);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pageText, setPageText] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const converted = !(
    /\.pdf$/i.test(doc.name) || doc.mimeType === "application/pdf"
  );
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false;
    let passwordRequired = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPdf(null);
    setPage(1);
    (async () => {
      try {
        const response = await fetch(
          apiUrl("/preview?id=" + encodeURIComponent(doc.id)),
          { signal: controller.signal },
        );
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || "原文暂时无法打开，请稍后重试");
        }
        const data = new Uint8Array(await response.arrayBuffer());
        const lib = await import("pdfjs-dist");
        if (disposed) return;
        lib.GlobalWorkerOptions.workerSrc = workerUrl;
        task = lib.getDocument({
          data,
          cMapUrl: "/audit/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/audit/pdfjs/standard_fonts/",
          wasmUrl: "/audit/pdfjs/wasm/",
        });
        task.onPassword = () => {
          passwordRequired = true;
          if (!disposed) {
            setError("此 PDF 已加密，请下载原件，使用密码打开。");
            setLoading(false);
          }
          void task?.destroy();
        };
        const result = await task.promise;
        if (!disposed) {
          setPdf(result);
          setLoading(false);
        }
      } catch (e) {
        if (!disposed) {
          setError(
            passwordRequired
              ? "此 PDF 已加密，请下载原件，使用密码打开。"
              : /[\u4e00-\u9fff]/.test((e as Error).message)
                ? (e as Error).message
                : "原件暂时无法显示，请重试或下载原件核验。",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      void task?.destroy();
    };
  }, [doc.id, retry]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    let task:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    setRendering(true);
    setPageText("");
    (async () => {
      try {
        const item = await pdf.getPage(page);
        if (cancelled || !canvas.current) return;
        const natural = item.getViewport({ scale: 1 });
        const viewport = item.getViewport({
          scale: (Math.max(0.1, (width - 24) / natural.width) * zoom) / 100,
        });
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(16000000 / (viewport.width * viewport.height)),
        );
        const target = canvas.current;
        target.width = Math.floor(viewport.width * ratio);
        target.height = Math.floor(viewport.height * ratio);
        target.style.width = viewport.width + "px";
        target.style.height = viewport.height + "px";
        task = item.render({
          canvas: target,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        await task.promise;
        if (cancelled) return;
        setRendering(false);
        const content = await item.getTextContent();
        if (!cancelled)
          setPageText(
            content.items
              .map((x) => ("str" in x ? x.str + (x.hasEOL ? "\n" : " ") : ""))
              .join(""),
          );
      } catch (e) {
        if (!cancelled) {
          setError("本页暂时无法显示，请重试或下载原件核验。");
          setRendering(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom, width]);
  return (
    <section className="document-preview" aria-label="原件分页预览">
      <p className="small muted">
        {converted
          ? "当前为原文件转换的预览，排版可能存在差异，请以下载的原件为准。"
          : "直接显示 PDF 原件页面，包含扫描图像和印章。"}
      </p>
      {loading && (
        <p role="status">
          {converted
            ? "正在打开文档，首次转换可能需要约一分钟…"
            : "正在打开 PDF 原件…"}
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button
            className="button secondary compact"
            onClick={() => setRetry((x) => x + 1)}
          >
            重新打开
          </button>
        </div>
      )}
      {pdf && !error && (
        <div className="preview-toolbar" aria-label="原文阅读工具">
          <button
            className="button secondary compact"
            disabled={page === 1}
            onClick={() => setPage((x) => x - 1)}
          >
            上一页
          </button>
          <label>
            页码{" "}
            <select
              aria-label="原文页码"
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
            >
              {Array.from({ length: pdf.numPages }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>{" "}
            / {pdf.numPages}
          </label>
          <button
            className="button secondary compact"
            disabled={page === pdf.numPages}
            onClick={() => setPage((x) => x + 1)}
          >
            下一页
          </button>
          <label>
            缩放{" "}
            <select
              aria-label="原文缩放"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {[75, 100, 125, 150, 200].map((x) => (
                <option key={x} value={x}>
                  {x === 100 ? "适合宽度" : x + "%"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div
        ref={host}
        className="preview-viewport"
        aria-busy={loading || rendering}
      >
        {rendering && !error && <p role="status">正在显示第 {page} 页…</p>}
        <canvas
          ref={canvas}
          hidden={!pdf || !!error}
          role="img"
          aria-label={`${doc.name}，第 ${page} 页`}
          data-rendered={!!pdf && !rendering && !error}
        />
      </div>
      {pdf && !error && (
        <details className="preview-page-text">
          <summary>本页可读文字</summary>
          <pre>
            {pageText ||
              "本页没有可提取的文字，请核对页面图像；扫描件可使用“识别原件文字”。"}
          </pre>
        </details>
      )}
    </section>
  );
}
