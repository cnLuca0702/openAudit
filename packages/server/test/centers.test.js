import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../service.js";
import { isReportArtifact } from "../centers.js";

const human = { actor: "测试审计人员", reason: "验证项目及文书关联" };
async function fixture(t, model) {
  const dataDir = await mkdtemp(join(tmpdir(), "audit-centers-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return AuditService.create({ dataDir, model });
}
async function upload(
  service,
  text = "工程款付款凭证：尚待核对合同及验收依据。",
) {
  return (
    await service.action({
      action: "upload",
      payload: {
        name: "付款凭证.txt",
        kind: "payment",
        contentBase64: Buffer.from(text).toString("base64"),
      },
    })
  ).result.document;
}
async function finding(service, document, title = "付款依据待核") {
  return (
    await service.action({
      action: "finding-register",
      payload: {
        ...human,
        title,
        detail: "付款依据需与合同核对",
        documentIds: [document.id],
        locator: "第一段",
      },
    })
  ).result.finding;
}
const save = (service, p) =>
  service.action({
    action: "product-save",
    payload: {
      ...human,
      content: "依照所选资料形成草稿，事实与处理意见待核实。",
      ...p,
    },
  });

test("project isolation, rename, persisted registry, soft delete, and reset preserve other projects", async (t) => {
  const service = await fixture(t);
  const original = await upload(service);
  const created = await service.action({
    action: "project-manage",
    payload: { ...human, operation: "create", name: "第二审计项目" },
  });
  const projectId = created.result.projectId;
  const child = await service.forProject(projectId);
  assert.equal(child.state().documents.length, 0);
  await assert.rejects(child.original(original.id), /不存在/);
  const own = await upload(child, "第二项目独立原件");
  assert.equal(service.state().documents.length, 1);
  await assert.rejects(
    save(child, { kind: "evidence", documentIds: [original.id] }),
    /不属于当前项目/,
  );
  await service.action({
    action: "project-manage",
    payload: { ...human, operation: "update", projectId, name: "调整后的项目" },
  });
  assert.equal(child.state().project.name, "调整后的项目");
  const reopened = await AuditService.create({
    dataDir: service.config.dataDir,
  });
  const restored = await reopened.forProject(projectId);
  assert.equal(restored.state().documents[0].id, own.id);
  assert.equal(
    (await restored.original(own.id)).bytes.toString(),
    "第二项目独立原件",
  );
  await service.action({
    action: "reset",
    payload: { confirmation: "重置演示项目" },
  });
  assert.equal(service.state().projects.length, 2);
  assert.equal(
    (await service.forProject(projectId)).state().documents.length,
    1,
  );
  await service.action({
    action: "project-manage",
    payload: {
      ...human,
      operation: "delete",
      projectId,
      confirmation: "调整后的项目",
    },
  });
  assert.equal(service.state().projects.length, 1);
  await assert.rejects(service.forProject(projectId), /已删除/);
  assert.equal(child.store.read().documents[0].id, own.id);
});

test("one finding splits into evidence sheets; multiple findings merge; workpaper/report lineage invalidates after recheck", async (t) => {
  const service = await fixture(t);
  const document = await upload(service);
  const f1 = await finding(service, document);
  const f2 = await finding(service, document, "验收依据待核");
  const split = await save(service, {
    kind: "evidence",
    findingIds: [f1.id],
    titles: ["付款情况取证单", "合同情况取证单"],
  });
  assert.equal(split.result.artifacts.length, 2);
  const merged = await save(service, {
    kind: "evidence",
    findingIds: [f1.id, f2.id],
  });
  assert.deepEqual(merged.result.artifacts[0].findingIds, [f1.id, f2.id]);
  const evidence = split.result.artifacts.map((a) => a.id);
  const paper = (
    await save(service, { kind: "workpaper", artifactIds: evidence })
  ).result.artifacts[0];
  assert.equal(paper.artifactIds.length, 2);
  const exported = await service.export(paper.id, "docx");
  assert.match(exported.name, /审计工作底稿/);
  const parsedWord = await service.parser.parseDocument({
    buffer: exported.bytes,
    name: exported.name,
    mimeType: exported.mimeType,
  });
  assert.ok(parsedWord.text.includes(evidence[0]));
  assert.ok(!parsedWord.text.includes("undefined"));
  assert.ok(
    paper.sources.some((r) => r.documentId === document.id && r.version === 1),
  );
  const report = (
    await save(service, { kind: "report", artifactIds: [paper.id] })
  ).result.artifacts[0];
  assert.equal(isReportArtifact(report), true);
  const progress = (
    await save(service, { kind: "progress", artifactIds: [paper.id] })
  ).result.artifacts[0];
  assert.equal(isReportArtifact(progress), false);
  await service.action({
    action: "finding-dispatch",
    payload: {
      ...human,
      findingIds: [f1.id],
      operation: "assign",
      assignee: "张审计",
      requirement: "核对付款依据",
      dueDate: "2026-12-01",
    },
  });
  await service.action({
    action: "finding-dispatch",
    payload: {
      ...human,
      findingIds: [f1.id],
      operation: "recheck",
      assignee: "李审计",
      requirement: "补充合同原件",
    },
  });
  const state = service.state();
  assert.equal(
    state.findings.find((f) => f.id === f1.id).assignments.length,
    2,
  );
  assert.equal(state.artifacts.find((a) => a.id === paper.id).status, "stale");
  assert.equal(state.artifacts.find((a) => a.id === report.id).status, "stale");
  assert.equal(state.documents[0].sha256, document.sha256);
  await assert.rejects(
    save(service, { kind: "workpaper", documentIds: [document.id] }),
    /须选取审计取证单/,
  );
});

test("AI drafting receives only chosen project sources, persists drafts and failed runs; revisions preserve original", async (t) => {
  const inputs = [];
  let fail = false;
  const service = await fixture(t, {
    capabilities: () => ({ text: { configured: true } }),
    analyze: async (input) => {
      inputs.push(input);
      if (fail) throw new Error("模型网络请求失败");
      return {
        text: "根据所选依据形成的待核草稿",
        sources: input.documents.map((d) => d.id),
      };
    },
  });
  const d = await upload(service);
  await upload(service, "未选取的第二版本");
  const result = await save(service, {
    kind: "request",
    documentIds: [d.id],
    useModel: true,
  });
  const original = result.result.artifacts[0];
  assert.equal(inputs[0].documents.length, 1);
  assert.equal(inputs[0].documents[0].id, d.id);
  assert.equal(original.status, "draft");
  const revision = (
    await save(service, {
      kind: "request",
      previousId: original.id,
      documentIds: [d.id],
      content: "经人工修改后的资料清单",
    })
  ).result.artifacts[0];
  assert.equal(revision.version, 2);
  assert.equal(
    service.state().artifacts.find((a) => a.id === original.id).content,
    "根据所选依据形成的待核草稿",
  );
  assert.equal(
    service.state().artifacts.find((a) => a.id === original.id).status,
    "superseded",
  );
  fail = true;
  await assert.rejects(
    save(service, { kind: "interview", documentIds: [d.id], useModel: true }),
    /模型网络请求失败/,
  );
  assert.equal(service.state().runs.at(-1).status, "failed");
  assert.equal(service.state().artifacts.length, 2);
  const word = await service.export(revision.id, "docx");
  assert.ok(word.bytes.length > 100);
});
