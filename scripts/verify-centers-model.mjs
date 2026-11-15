// Isolated synthetic acceptance. Never opens or changes production project state.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../packages/server/service.js";
import { PRODUCTS } from "../packages/server/centers.js";
const dataDir = await mkdtemp(join(tmpdir(), "audit-centers-ai-"));
const report = {
  at: new Date().toISOString(),
  label: "演示模拟数据，隔离验证",
  cases: [],
};
try {
  const service = await AuditService.create({
    dataDir,
    modelConfigFile: process.argv[2],
  });
  assert.equal(service.state().capabilities.model.text.configured, true);
  const action = (action, payload) => service.action({ action, payload });
  const human = { actor: "隔离验收人员", reason: "验证实际模型调用与来源绑定" };
  const document = (
    await action("upload", {
      name: "演示模拟数据-核查记录.txt",
      kind: "payment",
      contentBase64: Buffer.from(
        "演示模拟数据：某工程付款凭证记载已支付 5 万元；合同及验收记录尚未提供。本次仅核查付款依据，金额尚待人工核实。未召开业务会议，未进行正式审批。",
      ).toString("base64"),
    })
  ).result.document;
  const finding = (
    await action("finding-register", {
      ...human,
      title: "付款依据待补充",
      detail: "合同及验收记录尚未提供，需补证。",
      documentIds: [document.id],
      locator: "第一段",
    })
  ).result.finding;
  const saved = {};
  for (const [kind, definition] of Object.entries(PRODUCTS)) {
    const artifactIds =
      kind === "workpaper"
        ? [saved.evidence]
        : ["management", "progress", "report"].includes(kind)
          ? [saved.workpaper]
          : definition.center === "review-center"
            ? [saved.report]
            : [];
    const result = await action("product-save", {
      ...human,
      kind,
      useModel: true,
      documentIds: [document.id],
      findingIds: [finding.id],
      artifactIds,
      instructions:
        "用于隔离验收，请控制在180字以内，提供简短但可核验的草稿；说明未提供的资料和待核事实。",
    });
    const artifact = result.result.artifacts[0];
    saved[kind] = artifact.id;
    assert.equal(artifact.status, "draft");
    assert(artifact.model?.text?.length > 20);
    assert(
      artifact.sources.some(
        (r) => r.documentId === document.id && r.version === 1,
      ),
    );
    assert.equal(service.state().runs.at(-1).status, "completed");
    report.cases.push({
      kind,
      title: definition.title,
      model: artifact.model.model,
      characters: artifact.content.length,
      status: artifact.status,
      sourceBound: true,
    });
    console.log(definition.title + ": actual model draft and sources passed");
  }
  assert.equal(
    (await service.original(document.id)).bytes.toString().includes("5 万元"),
    true,
  );
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await writeFile(
    process.argv[3] || "/tmp/centers-model-validation.json",
    JSON.stringify(report, null, 2),
  );
  await rm(dataDir, { recursive: true, force: true });
}
