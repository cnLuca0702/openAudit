// Local test only: real AuditService and real persisted demo inputs; never deployed.
import http from "node:http";
import { mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { AuditService, createHandlers } from "../../server/index.js";
const root = fileURLToPath(new URL("../../../", import.meta.url));
await mkdir(resolve(root, "packages/client/.test-runtime"), {
  recursive: true,
});
const dataDir = await mkdtemp(
  resolve(root, "packages/client/.test-runtime/run-"),
);
const service = await AuditService.create({
  dataDir,
  demoDir: resolve(root, "demo"),
  clientDist: resolve(root, "packages/client/dist"),
});
const handlers = createHandlers(service, { requestRejection: () => undefined });
http
  .createServer((req, res) =>
    req.url.startsWith("/api/audit")
      ? handlers.api(req, res)
      : handlers.ui(req, res),
  )
  .listen(4318, "127.0.0.1", () =>
    console.log("Real persisted test service on 127.0.0.1:4318"),
  );
