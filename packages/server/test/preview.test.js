import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { DocumentPreview } from "../preview.js";
import { AuditService, createHandlers } from "../index.js";
const pdf = Buffer.from("%PDF-1.7\npreview bytes");
const office = Buffer.from("d0cf11e0a1b11ae100", "hex");
test("PDF preview preserves bytes; Office cache coalesces requests and never mutates original", async () => {
  let calls = 0;
  const viewer = new DocumentPreview(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return pdf;
  });
  const original = { name: "审计资料.DOC", bytes: office };
  const before = Buffer.from(office);
  const [a, b] = await Promise.all([
    viewer.open(original),
    viewer.open(original),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.bytes, b.bytes);
  assert.equal(a.converted, true);
  await viewer.open(original);
  assert.equal(calls, 1);
  assert.deepEqual(office, before);
  assert.equal(
    (await viewer.open({ name: "扫描件.PDF", bytes: pdf })).bytes,
    pdf,
  );
  for (const name of ["文书.wps", "文书.docx", "文书.rtf", "文书.odt"])
    assert.equal((await viewer.open({ name, bytes: office })).converted, true);
  await assert.rejects(
    viewer.open({ name: "执行.html", bytes: Buffer.from("<script>") }),
    (e) => e.status === 415,
  );
  await assert.rejects(
    viewer.open({ name: "伪装.pdf", bytes: office }),
    (e) => e.status === 422,
  );
  await assert.rejects(
    viewer.open({ name: "损坏.doc", bytes: pdf }),
    (e) => e.status === 422,
  );
});
test("failed conversions can retry; concurrent conversion work is bounded", async () => {
  const rejects = [];
  const viewer = new DocumentPreview(
    () =>
      new Promise((_, r) => {
        rejects.push(r);
      }),
  );
  const first = viewer.open({ name: "a.doc", bytes: office });
  const second = viewer.open({ name: "b.docx", bytes: office });
  await assert.rejects(
    viewer.open({ name: "c.wps", bytes: office }),
    (e) => e.status === 429,
  );
  const rejection = assert.rejects(second, /failure/);
  rejects[1](new Error("failure"));
  await rejection;
  viewer.converter = async () => pdf;
  assert.equal(
    (await viewer.open({ name: "b.docx", bytes: office })).bytes,
    pdf,
  );
  const firstRejected = assert.rejects(first, /failure/);
  rejects[0](new Error("failure"));
  await firstRejected;
});
test("preview endpoint authenticates, validates IDs, serves PDF inline and leaves state/originals intact", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "audit-preview-test-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const service = await AuditService.create({
    dataDir,
    previewConverter: async () => pdf,
    parser: {
      parseDocument: async () => ({
        text: "",
        records: [],
        parseStatus: "pending",
      }),
    },
  });
  for (const [name, bytes] of [
    ["原件.pdf", pdf],
    ["公文.docx", office],
    ["附件.html", Buffer.from("<script>alert(1)</script>")],
  ]) {
    await service.action({
      action: "upload",
      payload: {
        name,
        ...(name.endsWith(".html") ? { mimeType: "text/plain" } : {}),
        kind: "other",
        contentBase64: bytes.toString("base64"),
      },
    });
  }
  const before = JSON.stringify(service.state());
  const handlers = createHandlers(service, {
    requestRejection: (req) =>
      req.headers.cookie !== "test=ok"
        ? 401
        : req.headers.origin === "https://evil.invalid"
          ? 403
          : undefined,
  });
  const server = createServer(handlers.api);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}/api/audit/`;
  const headers = { cookie: "test=ok" };
  for (const doc of service.state().documents.slice(0, 2)) {
    const path = url + "preview?id=" + doc.id;
    assert.equal((await fetch(path)).status, 401);
    assert.equal(
      (
        await fetch(path, {
          headers: { ...headers, origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(path, { headers, method: "POST" })).status, 405);
    const response = await fetch(path, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(response.headers.get("content-disposition"), /^inline;/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
    assert.equal(
      (await fetch(path, { headers, method: "HEAD" })).headers.get(
        "content-length",
      ),
      String(pdf.length),
    );
    const original = await fetch(url + "file?id=" + doc.id, { headers });
    assert.match(original.headers.get("content-disposition"), /^attachment;/);
    assert.deepEqual(
      Buffer.from(await original.arrayBuffer()),
      (await service.original(doc.id)).bytes,
    );
  }
  assert.equal(
    (await fetch(url + "preview?id=../../state.json", { headers })).status,
    404,
  );
  const html = service.state().documents.at(-1);
  assert.equal(
    (await fetch(url + "preview?id=" + html.id, { headers })).status,
    415,
  );
  assert.equal(JSON.stringify(service.state()), before);
});
