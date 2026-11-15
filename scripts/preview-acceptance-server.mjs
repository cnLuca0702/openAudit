// Isolated acceptance only. Bind loopback; never register in DSH or use production data.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { AuditService, createHandlers } from "../packages/server/index.js";
const fixtures = process.argv[2];
if (!fixtures)
  throw new Error(
    "Provide a directory with public-sample.doc and public-sample.wps",
  );
const dataDir = await mkdtemp(join(tmpdir(), "audit-preview-acceptance-"));
const service = await AuditService.create({
  dataDir,
  model: { capabilities: () => ({}) },
});
for (const [name, path] of [
  ["演示模拟数据-DOC格式验证.doc", join(fixtures, "public-sample.doc")],
  ["演示模拟数据-WPS格式验证.wps", join(fixtures, "public-sample.wps")],
  [
    "演示模拟数据-DOCX格式验证.docx",
    new URL("../demo/materials/initial/A-PLAN.docx", import.meta.url),
  ],
  [
    "演示模拟数据-PDF格式验证.pdf",
    new URL("../demo/materials/initial/A-APPROVAL.pdf", import.meta.url),
  ],
]) {
  await service.action({
    action: "upload",
    payload: {
      name,
      source: "隔离验收样本，不属于项目资料",
      contentBase64: (await readFile(path)).toString("base64"),
    },
  });
}
const handlers = createHandlers(service, {
  requestRejection: (req) =>
    req.headers.host === "127.0.0.1:13191" ? undefined : 403,
});
const server = createServer((req, res) =>
  req.url.startsWith("/api/") ? handlers.api(req, res) : handlers.ui(req, res),
);
await new Promise((r) => server.listen(4319, "127.0.0.1", r));
console.log("Isolated preview acceptance ready");
const close = () =>
  server.close(async () => {
    await rm(dataDir, { recursive: true, force: true });
    process.exit(0);
  });
process.on("SIGTERM", close);
process.on("SIGINT", close);
