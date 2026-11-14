import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { AuditService } from "../service.js";
import {
  calculateDeadline,
  REFERENCE,
  QUALITY,
  workflowView,
} from "../workflow.js";
const person = {
  actor: "流程验收登记人",
  reason: "演示模拟数据，核对签章原件与具体版本",
};
async function setup(t) {
  const dataDir = await mkdtemp(join(tmpdir(), "workflow-test-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const service = await AuditService.create({
    dataDir,
    model: { capabilities: () => ({}) },
  });
  async function document(name, kind = "template", records = []) {
    const result = await service.action({
      action: "upload",
      payload: {
        name: `${name}.json`,
        kind,
        contentBase64: Buffer.from(JSON.stringify({ records })).toString(
          "base64",
        ),
        records,
        source: "演示模拟数据测试原件",
      },
    });
    const d = result.result.document;
    await service.action({
      action: "confirm",
      payload: { targetType: "document", targetId: d.id, ...person },
    });
    return d;
  }
  const proof = await document("签章证明", "template", [
    { id: "proof", type: "template", text: "模拟签章证明" },
  ]);
  const report = await document("报告", "report", [
    {
      id: "report-row",
      type: "report",
      title: "待核问题",
      evidenceIds: [proof.id],
      amount: 0,
      unit: "元",
    },
  ]);
  const save = async (p) =>
    (
      await service.action({
        action: "workflow-save",
        payload: { ...person, evidenceIds: [proof.id], ...p },
      })
    ).result.record;
  return { service, proof, report, save, document };
}
test("reference preserves original SHA, 19 nodes including future deadline, 15 issues and 54 archive entries", async () => {
  const bytes = await readFile(
    new URL("../../../docs/source/项目跟踪审计全流程.html", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    REFERENCE.sha256,
  );
  assert.equal(REFERENCE.milestones.length, 19);
  assert.equal(REFERENCE.milestones.filter((x) => x.isDeadline).length, 1);
  assert.equal(REFERENCE.issues.length, 15);
  assert.equal(
    Math.round(
      REFERENCE.issues.reduce(
        (n, x) =>
          n +
          (x.amountWan === "—" ? 0 : Number(x.amountWan.replaceAll(",", ""))),
        0,
      ) * 100,
    ),
    959757,
  );
  assert.equal(
    REFERENCE.archiveGroups.reduce((n, x) => n + x.referenceCount, 0),
    54,
  );
});
test("deadlines distinguish calendar days, working days, incomplete calendar and invalid inputs", () => {
  assert.equal(calculateDeadline("2024-06-17", 60).dueDate, "2024-08-16");
  assert.equal(
    calculateDeadline("2024-05-16", 10, "working").dueDate,
    "2024-05-30",
  );
  assert.match(
    calculateDeadline("2024-05-16", 10, "working").deadlineStatus,
    /估算/,
  );
  const calendar = {
    from: "2024-04-30",
    to: "2024-05-31",
    confirmed: true,
    holidays: ["2024-05-01", "2024-05-02", "2024-05-03"],
    workdays: ["2024-05-11"],
  };
  assert.equal(
    calculateDeadline("2024-04-30", 5, "working", calendar).dueDate,
    "2024-05-10",
  );
  assert.equal(
    calculateDeadline("2024-04-30", 6, "working", calendar).dueDate,
    "2024-05-11",
  );
  assert.match(
    calculateDeadline("2024-05-30", 5, "working", calendar).deadlineStatus,
    /待核/,
  );
  for (const n of [-1, 0.5, 4000])
    assert.equal(calculateDeadline("2024-06-17", n).dueDate, null);
  assert.equal(calculateDeadline("2024-02-30", 10).dueDate, null);
});
test("separate recipients, no dates fabricated for missing receipts, custom deadlines and persistent revision history", async (t) => {
  const { service, save, report } = await setup(t);
  const a = await save({
    kind: "subject",
    name: "项目法人",
    role: "现建设单位",
  });
  const b = await save({
    kind: "subject",
    name: "原建设单位",
    role: "原建设任务承担者",
  });
  const original = await save({
    kind: "receipt",
    subjectId: a.id,
    documentType: "审计报告",
    documentNumber: "模拟报1号",
    date: "2024-06-17",
    signedBy: "甲",
    reportId: report.id,
  });
  await save({
    kind: "receipt",
    subjectId: b.id,
    documentType: "审计报告",
    documentNumber: "模拟报1号",
    date: "2024-06-18",
    signedBy: "乙",
    reportId: report.id,
    deadlineDays: 30,
    deadlineUnit: "自然日",
  });
  const w = service.state().workflow;
  assert.deepEqual(
    w.receipts
      .filter((x) => x.documentType === "审计报告")
      .map((x) => x.dueDate),
    ["2024-08-16", "2024-07-18"],
  );
  assert.equal(w.receipts.filter((x) => !x.receiptDate).length, 4);
  await save({ ...original, replacesId: original.id, date: "2024-06-19" });
  assert.equal(
    service.state().workflowRecords.find((x) => x.id === original.id)
      .supersededBy,
    service.state().workflowRecords.at(-1).id,
  );
  await save({
    kind: "subject",
    replacesId: a.id,
    name: "项目法人更名",
    role: "现建设单位",
  });
  assert.equal(
    service
      .state()
      .workflow.receipts.find(
        (x) => x.subject === "项目法人更名" && x.documentType === "审计报告",
      ).dueDate,
    "2024-08-18",
  );
  const reopened = await AuditService.create({
    dataDir: service.config.dataDir,
    model: service.model,
  });
  assert.equal(
    reopened.state().workflow.revision,
    service.state().workflow.revision,
  );
  assert.equal(reopened.state().project.id, "DEMO-AUDIT-2027-006");
});
test("issuance requires all three signed gates bound to one report, eight answers, and prior dates; changed proof revokes validity", async (t) => {
  const { service, save, report, proof } = await setup(t);
  const issue = {
    kind: "issuance",
    reportId: report.id,
    documentNumber: "模拟报1号",
    date: "2024-06-14",
    drafter: "拟稿人",
    departmentReviewer: "复核人",
    relatedReviewer: "相关处室",
    leader: "分管领导",
    signer: "签发人",
    sealRegister: "用印1",
    recipients: "两家单位，各一份",
  };
  await assert.rejects(save(issue), /部门复核/);
  const quality = {
    kind: "quality",
    reportId: report.id,
    date: "2024-06-13",
    signedBy: "责任人",
    conclusion: "逐项核对通过，意见全部按原件落实",
  };
  await assert.rejects(
    save({ ...quality, control: "部门复核", answers: ["仅一项"] }),
    /八项/,
  );
  for (const control of QUALITY)
    await save({
      ...quality,
      control,
      answers: Array(8).fill("经核对模拟证明原件，该项通过"),
    });
  await assert.rejects(save({ ...issue, date: "2024-06-12" }), /有效签字/);
  await service.store.transaction((s) =>
    s.artifacts.push({
      id: "other-report-review",
      scenarioId: "D02",
      status: "draft",
      sources: [],
      dependsOn: [],
      checks: [],
      rows: [],
    }),
  );
  const record = await save(issue);
  assert.match(
    service.state().workflow.records.find((x) => x.id === record.id).status,
    /登记有效/,
  );
  const reportFact = service
    .state()
    .facts.find((f) => f.documentId === report.id);
  await service.action({
    action: "revise",
    payload: {
      ...person,
      targetType: "fact",
      targetId: reportFact.id,
      patch: { record: { claimScope: "all", sampleScope: "sample" } },
    },
  });
  await assert.rejects(save(issue), /出具核验未通过/);
  await service.store.transaction((s) => {
    s.documents.find((x) => x.id === proof.id).status = "superseded";
  });
  assert.match(
    service.state().workflow.records.find((x) => x.id === record.id).status,
    /待重新核验/,
  );
  await assert.rejects(save(issue), /证明资料|有效签字/);
});
test("four-layer evidence requires distinct source, evidence sheet, workpaper and report; redline cannot reuse final original", async (t) => {
  const { save, report, proof, document } = await setup(t);
  const chain = {
    kind: "evidenceChain",
    planItem: "1",
    issueId: "1",
    title: "问题1",
    evidenceSheetNumber: "取1",
    workpaperIndex: "3-1",
    provider: "提供人",
    entitySeal: "已核对模拟印章",
    reviewer: "审核人",
    auditProcess: "查证",
    fact: "事实",
    basis: "依据待核",
    opinion: "补正",
    reportId: report.id,
    originalIds: [proof.id],
    evidenceSheetIds: [proof.id],
    workpaperIds: [proof.id],
  };
  await assert.rejects(save(chain), /四层证据链/);
  const sheet = await document("取证单"),
    paper = await document("工作底稿");
  const saved = await save({
    ...chain,
    evidenceSheetIds: [sheet.id],
    workpaperIds: [paper.id],
  });
  assert.equal(saved.sources.length, 3);
  await assert.rejects(
    save({
      kind: "redline",
      documentType: "审计报告",
      date: "2024-06-14",
      beforeText: "旧稿",
      afterText: "新稿",
      changeBasis: "意见1",
      draftIds: [proof.id],
      finalIds: [proof.id],
    }),
    /分别保留/,
  );
});
test("archive exact document match cannot be satisfied by another report, and archive leaves rectification open", async (t) => {
  const { service, save, proof, document } = await setup(t);
  await document("归档清单", "requirement", [
    {
      id: "archive-1",
      type: "requirement",
      phase: "archive",
      documentId: "missing-exact-report",
      requiredKind: "report",
      archiveGroup: "结论类",
      title: "指定报告",
    },
  ]);
  await service.action({ action: "run", scenarioId: "F04" });
  assert.equal(service.state().artifacts.at(-1).rows[0].status, "缺失待补");
  await service.store.transaction((s) =>
    s.tasks.push({ id: "rectify", scenarioId: "F01", status: "pending" }),
  );
  await save({
    kind: "archive",
    title: "报告归档",
    group: "结论类",
    volume: "卷1",
    catalogue: "全宗1/目录1",
    pageStart: 1,
    pageEnd: 4,
    retention: "待人工核定",
    date: "2024-06-20",
    receiver: "档案员",
    evidenceIds: [proof.id],
  });
  assert.equal(
    service.state().tasks.find((x) => x.id === "rectify").status,
    "pending",
  );
  assert.equal(workflowView(service.state()).archive[0].registeredCount, 1);
});
test("C02 uses consultation service date rather than feedback arrival and handles reasoned no-change separately", async (t) => {
  const { service, document, proof } = await setup(t);
  const d = await document("反馈", "feedback", [
    {
      id: "fb",
      type: "feedback",
      issueId: "1",
      receivedDate: "2024-05-24",
      receiptDate: "2024-05-16",
      deadlineDays: 10,
      decision: "无需处理",
      decisionReason: "事实原稿已有明确表述",
      implementationEvidenceIds: [proof.id],
    },
  ]);
  const fact = service.state().facts.find((x) => x.documentId === d.id);
  await service.action({
    action: "confirm",
    payload: { targetType: "fact", targetId: fact.id, ...person },
  });
  await service.action({ action: "run", scenarioId: "C02" });
  const row = service.state().artifacts.at(-1).rows[0];
  assert.equal(row.dueDate, "2024-05-30");
  assert.equal(row.changeRequired, false);
  assert.equal(row.implemented, true);
});

test("upgrade invalidates affected historical results once without resetting documents or facts", async (t) => {
  const { service } = await setup(t);
  await service.store.transaction((s) => {
    delete s.workflowRulesVersion;
    s.artifacts.push({
      id: "legacy-c02",
      scenarioId: "C02",
      status: "confirmed",
      sources: [],
      checks: [],
      rows: [],
      content: "old result",
    });
    s.confirmations.push({ targetId: "legacy-c02", valid: true });
  });
  const before = JSON.parse(JSON.stringify(service.state()));
  const upgraded = await AuditService.create({
    dataDir: service.config.dataDir,
    model: service.model,
  });
  const after = upgraded.state();
  assert.deepEqual(after.documents, before.documents);
  assert.deepEqual(after.facts, before.facts);
  assert.equal(
    after.artifacts.find((x) => x.id === "legacy-c02").status,
    "stale",
  );
  assert.equal(
    after.confirmations.find((x) => x.targetId === "legacy-c02").valid,
    false,
  );
  assert.equal(after.workflowRulesVersion, 1);
  const restarted = await AuditService.create({
    dataDir: service.config.dataDir,
    model: service.model,
  });
  assert.equal(restarted.state().revision, after.revision);
});
