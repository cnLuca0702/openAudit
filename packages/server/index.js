import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { AuditService } from "./service.js";
import { AuditError, requireThat } from "./core.js";
export { AuditService } from "./service.js";
export const name = "openaudit";
export const inject = ["webServer", "connection"];
const MAX_BODY = 15 * 1024 * 1024;
const STATIC_MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
function json(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
async function body(req) {
  requireThat(
    (req.headers["content-type"] ?? "").split(";")[0].trim() ===
      "application/json",
    "请求必须是 application/json",
    415,
  );
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    requireThat(size <= MAX_BODY, "请求超过 15 MiB", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AuditError("JSON 请求格式错误");
  }
}
function download(res, file, head = false) {
  res.writeHead(200, {
    "content-type": file.mimeType,
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "content-length": file.bytes.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
  });
  res.end(head ? undefined : file.bytes);
}
export function createHandlers(service, connection) {
  requireThat(
    connection && typeof connection.requestRejection === "function",
    "DSH connection 鉴权服务缺失",
    500,
  );
  const guard = (handler) => async (req, res) => {
    try {
      const rejection = connection.requestRejection(req);
      if (rejection !== undefined) {
        json(res, rejection, {
          error:
            rejection === 403
              ? "DSH Host/Origin 验证未通过"
              : "请先通过 DSH 登录后访问审计工作台",
        });
        return;
      }
      await handler(req, res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      json(res, error.status ?? 500, {
        error:
          error instanceof AuditError
            ? error.message
            : error.message?.startsWith("模型")
              ? error.message
              : "操作失败，请检查服务端运行记录",
        code: error.code ?? "INTERNAL_ERROR",
        ...(error.runId ? { runId: error.runId } : {}),
      });
    }
  };
  const api = guard(async (req, res) => {
    const url = new URL(req.url, "http://audit.invalid");
    const path = url.pathname;
    if (path === "/api/audit/state") {
      requireThat(req.method === "GET", "仅支持 GET", 405);
      json(res, 200, service.state());
      return;
    }
    if (path === "/api/audit/action") {
      requireThat(req.method === "POST", "仅支持 POST", 405);
      json(res, 200, await service.action(await body(req)));
      return;
    }
    if (path === "/api/audit/export") {
      requireThat(
        req.method === "GET" || req.method === "HEAD",
        "仅支持 GET/HEAD",
        405,
      );
      download(
        res,
        await service.export(
          url.searchParams.get("artifactId"),
          url.searchParams.get("format") ?? "md",
        ),
        req.method === "HEAD",
      );
      return;
    }
    if (path === "/api/audit/file") {
      requireThat(
        req.method === "GET" || req.method === "HEAD",
        "仅支持 GET/HEAD",
        405,
      );
      download(
        res,
        await service.original(url.searchParams.get("id")),
        req.method === "HEAD",
      );
      return;
    }
    throw new AuditError("API 路径不存在", 404);
  });
  const ui = guard(async (req, res) => {
    requireThat(
      req.method === "GET" || req.method === "HEAD",
      "仅支持 GET/HEAD",
      405,
    );
    const url = new URL(req.url, "http://audit.invalid");
    if (url.pathname === "/audit") {
      res.writeHead(302, { location: "/audit/", "cache-control": "no-store" });
      res.end();
      return;
    }
    let relative;
    try {
      relative = decodeURIComponent(url.pathname.slice("/audit/".length));
    } catch {
      throw new AuditError("无效路径");
    }
    requireThat(
      !relative.includes("\\") && !relative.split("/").includes(".."),
      "拒绝路径穿越",
      403,
    );
    const root = await realpath(service.config.clientDist).catch(() => {
      throw new AuditError("客户端构建尚未安装", 503);
    });
    let target = resolve(root, relative || "index.html");
    requireThat(target.startsWith(root + sep), "拒绝路径穿越", 403);
    target = await realpath(target).catch(() => {
      throw new AuditError("静态资源不存在", 404);
    });
    requireThat(target.startsWith(root + sep), "拒绝符号链接越界", 403);
    requireThat((await stat(target)).isFile(), "不是静态文件", 404);
    const bytes = await readFile(target);
    res.writeHead(200, {
      "content-type":
        STATIC_MIME[extname(target)] ?? "application/octet-stream",
      "content-length": bytes.length,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      "content-security-policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  });
  return { api, ui };
}
export async function apply(ctx, config = {}) {
  const service = await AuditService.create(config);
  const handlers = createHandlers(service, ctx.connection);
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: "/api/audit",
        handler: handlers.api,
      }),
    "openaudit: authenticated API",
  );
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: "/audit",
        handler: handlers.ui,
      }),
    "openaudit: authenticated UI",
  );
}
