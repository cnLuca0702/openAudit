import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../index.js";
import { populate } from "./fixtures.js";
const actor = { actor: "模拟复核员", reason: "对照原件逐项核对" };
async function fresh(t, config = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "audit-integration-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return AuditService.create({ dataDir, ...config });
}
test("actual 55-document manifest parses, all scenarios run, payment identities and E01 errors are derived", async (t) => {
  const service = await fresh(t);
  const seeded = await service.action({
    action: "seed",
    payload: { batch: "all" },
  });
  assert.ok(seeded.result.imported >= 55);
  assert.ok(
    service
      .state()
      .documents.some(
        (d) =>
          d.mimeType === "application/pdf" &&
          (d.text.includes("[第 1 页]") ||
            (d.parseStatus === "supplied-records-needs-verification" &&
              d.textOrigin === "supplied-transcript")),
      ),
  );
  assert.ok(
    service
      .state()
      .documents.some((d) => d.name.endsWith(".xlsx") && d.text.includes("!")),
  );
  assert.equal(
    (await service.action({ action: "seed", payload: { batch: "all" } })).result
      .imported,
    0,
  );
  for (const scenario of service.state().scenarios) {
    await service.action({ action: "run", scenarioId: scenario.id });
    assert.equal(service.state().runs.at(-1).status, "succeeded");
  }
  const table = service.state().artifacts.find((a) => a.scenarioId === "B01");
  assert.equal(table.rows.length, 5);
  assert.equal(table.summary.totalYuan, 1336800);
  const overlap = service
    .state()
    .findings.find((f) => f.scenarioId === "B03" && f.title.includes("120米"));
  assert.equal(overlap.amount, 216000);
  assert.equal(
    service.state().findings.some((f) => f.title.includes("BX-WS-01")),
    false,
    "another project cannot supply current project facts",
  );
  const contract = service
    .state()
    .documents.find((d) => d.id === "B-CONTRACT-C01-V2");
  await service.action({
    action: "confirm",
    payload: { targetType: "document", targetId: contract.id, ...actor },
  });
  await service.action({ action: "run", scenarioId: "B05" });
  const payment = service
    .state()
    .artifacts.at(-1)
    .rows.find((r) => r.paymentId === "PAY-061");
  assert.equal(payment.paymentCap, 550800);
  assert.notEqual(payment.paymentCap, 518400);
  const final = service.state().documents.find((d) => d.id === "E-REPORT-V2");
  await service.action({
    action: "confirm",
    payload: { targetType: "document", targetId: final.id, ...actor },
  });
  await service.action({ action: "run", scenarioId: "E01" });
  const checks = service.state().artifacts.at(-1).checks;
  for (const code of [
    "source-amount",
    "date-conflict",
    "scope-overreach",
    "attachment-amount",
  ])
    assert.ok(
      checks.some((c) => c.code === code),
      code,
    );
  const archive = service.state().artifacts.find((a) => a.scenarioId === "F04");
  assert.ok(archive.rows.some((r) => r.status === "缺失待补"));
  for (const format of ["docx", "xlsx"]) {
    const file = await service.export(table.id, format);
    assert.equal(file.bytes.subarray(0, 2).toString(), "PK");
    assert.ok(file.bytes.length > 1000);
  }
});
test("B09 becomes C01 with no report upload, and E01 detects revised report row and prose", async (t) => {
  const service = await fresh(t);
  await populate(service);
  const docs = service
    .state()
    .documents.filter((d) => d.kind !== "report")
    .map((d) => d.id);
  const b09 = await service.action({
    action: "run",
    scenarioId: "B09",
    payload: { documentIds: docs },
  });
  const c01 = await service.action({
    action: "run",
    scenarioId: "C01",
    payload: { documentIds: docs, artifactIds: [b09.result.artifactId] },
  });
  const source = service
    .state()
    .artifacts.find((a) => a.id === c01.result.artifactId);
  assert.equal(source.rows[0].factRef, "P1");
  const changed = await service.action({
    action: "revise",
    payload: {
      targetType: "artifact",
      targetId: source.id,
      patch: {
        rows: source.rows.map((r, i) =>
          i === 0 ? { ...r, amountYuan: 999999 } : r,
        ),
      },
      ...actor,
    },
  });
  await service.action({
    action: "run",
    scenarioId: "E01",
    payload: { documentIds: docs, artifactIds: [changed.result.updated.id] },
  });
  assert.ok(
    service
      .state()
      .artifacts.at(-1)
      .checks.some((c) => c.code === "source-amount"),
  );
  const prose = await service.action({
    action: "revise",
    payload: {
      targetType: "artifact",
      targetId: changed.result.updated.id,
      patch: { content: "演示模拟数据：全部管网已发生999999万元。" },
      ...actor,
    },
  });
  await service.action({
    action: "run",
    scenarioId: "E01",
    payload: { documentIds: docs, artifactIds: [prose.result.updated.id] },
  });
  assert.ok(
    service
      .state()
      .artifacts.at(-1)
      .checks.some((c) => c.code === "prose-amount"),
  );
  assert.ok(
    service
      .state()
      .artifacts.at(-1)
      .checks.some((c) => c.code === "scope-overreach"),
  );
});
test("corrected artifact can undergo E01 recheck then human confirmation", async (t) => {
  const service = await fresh(t);
  await populate(service);
  const report = await service.action({ action: "run", scenarioId: "C01" });
  const a = service.state().artifacts.at(-1);
  const revised = await service.action({
    action: "revise",
    payload: {
      targetType: "artifact",
      targetId: a.id,
      patch: { content: "演示模拟数据：抽查发现216000元线索，待核实。" },
      ...actor,
    },
  });
  await assert.rejects(
    service.action({
      action: "confirm",
      payload: {
        targetType: "artifact",
        targetId: revised.result.updated.id,
        ...actor,
      },
    }),
    (e) => e.status === 409,
  );
  await service.action({
    action: "run",
    scenarioId: "E01",
    payload: { artifactIds: [revised.result.updated.id] },
  });
  assert.equal(
    service
      .state()
      .artifacts.at(-1)
      .checks.filter((c) => c.blocking).length,
    0,
  );
  await service.action({
    action: "confirm",
    payload: {
      targetType: "artifact",
      targetId: revised.result.updated.id,
      ...actor,
    },
  });
  assert.equal(
    service.state().artifacts.find((a) => a.id === revised.result.updated.id)
      .status,
    "confirmed",
  );
});
test("same-transaction contradictory amounts remain unknown until mapped by human", async (t) => {
  const service = await fresh(t);
  await populate(service);
  const duplicate = {
    id: "BOOK-P1",
    transactionId: "T1",
    contractId: "C1",
    amount: 91,
    unit: "万元",
  };
  await service.action({
    action: "upload",
    payload: {
      name: "ledger.csv",
      mimeType: "text/csv",
      kind: "payment",
      records: [duplicate],
      contentBase64: Buffer.from("id,amount\nBOOK-P1,91").toString("base64"),
    },
  });
  await service.action({ action: "run", scenarioId: "B01" });
  const row = service
    .state()
    .artifacts.at(-1)
    .rows.find((r) => r.id === "P1");
  assert.equal(row.amountYuan, null);
  assert.equal(row.match, "同一交易来源冲突");
  assert.equal(row.sources.length, 3, "two payment views plus contract source");
});
test("noncash offset needs confirmation and zero-money requirement remains open", async (t) => {
  const service = await fresh(t);
  await populate(service);
  const proof = service.state().facts.find((f) => f.record.id === "PROOF1");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: proof.id,
      patch: {
        record: {
          bankVerified: false,
          proofType: "工程款冲减与对账",
          offsetVerified: false,
        },
      },
      ...actor,
    },
  });
  await service.action({ action: "run", scenarioId: "F01" });
  assert.equal(
    service.state().artifacts.at(-1).rows[0].status,
    "需补充到账/主体/唯一凭证",
  );
  const updated = service
    .state()
    .facts.findLast((f) => f.record.id === "PROOF1");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: updated.id,
      patch: { record: { offsetVerified: true } },
      ...actor,
    },
  });
  await service.action({ action: "run", scenarioId: "F01" });
  assert.equal(service.state().artifacts.at(-1).rows[0].status, "具备复查条件");
  const req = service.state().facts.findLast((f) => f.record.id === "RECT1");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: req.id,
      patch: { record: { requiredAmount: 0, issueId: "NON-FINANCIAL" } },
      ...actor,
    },
  });
  await service.action({ action: "run", scenarioId: "F01" });
  assert.notEqual(
    service.state().artifacts.at(-1).rows[0].status,
    "具备复查条件",
  );
});
test("AI adapter receives actual bytes and speech; narrower source context; errors persist", async (t) => {
  const calls = [];
  const model = {
    capabilities: () => ({}),
    analyze: async (input) => {
      calls.push(input);
      return { text: "依据所给原始图像，待人工核验", model: "test-adapter" };
    },
    transcribe: async (input) => {
      assert.equal(input.buffer.toString(), "audio bytes");
      return {
        text: "实际适配器转写返回",
        segments: [{ start: 0, end: 1, text: "实际" }],
        provider: "test",
        model: "asr",
      };
    },
  };
  const service = await fresh(t, { model });
  await populate(service);
  for (const [name, mimeType, content] of [
    ["photo.png", "image/png", "image bytes"],
    ["speech.wav", "audio/wav", "audio bytes"],
  ])
    await service.action({
      action: "upload",
      payload: {
        name,
        mimeType,
        kind: "media",
        records: [{ id: name, type: "media", description: "模拟输入" }],
        contentBase64: Buffer.from(content).toString("base64"),
      },
    });
  await service.action({
    action: "run",
    scenarioId: "B08",
    payload: { useAI: true },
  });
  assert.equal(calls[0].mode, "vision");
  assert.equal(
    Buffer.from(
      calls[0].documents.find((d) => d.name === "photo.png").contentBase64,
      "base64",
    ).toString(),
    "image bytes",
  );
  assert.ok(
    calls[0].documents.some((d) => d.text.includes("实际适配器转写返回")),
  );
  assert.ok(!calls[0].documents.some((d) => d.name === "rectification.json"));
  assert.equal(service.state().artifacts.at(-1).transcriptions.length, 1);
  const audio = service.state().documents.find((d) => d.name === "speech.wav");
  await service.action({
    action: "transcribe",
    payload: { documentId: audio.id },
  });
  assert.equal(service.state().documents.at(-1).parentDocumentId, audio.id);
  service.model.transcribe = async () => {
    throw new Error("语音服务失败");
  };
  await assert.rejects(
    service.action({ action: "transcribe", payload: { documentId: audio.id } }),
    /语音服务失败/,
  );
  assert.equal(service.state().runs.at(-1).status, "failed");
});
test("real PDF parser failure rolls back an invalid original", async (t) => {
  const service = await fresh(t);
  await assert.rejects(
    service.action({
      action: "upload",
      payload: {
        name: "bad.pdf",
        mimeType: "application/pdf",
        kind: "approval",
        contentBase64: Buffer.from("not a pdf").toString("base64"),
      },
    }),
  );
  assert.equal(service.state().documents.length, 0);
});

test("PDF recognition rasterizes actual pages, persists candidate lineage, and does not alter original", async (t) => {
  const calls = [];
  const service = await fresh(t, {
    model: {
      capabilities: () => ({ vision: { configured: true } }),
      analyze: async (input) => {
        calls.push(input);
        assert.equal(input.mode, "vision");
        for (const d of input.documents)
          assert.equal(
            Buffer.from(d.contentBase64, "base64").subarray(1, 4).toString(),
            "PNG",
          );
        return {
          text: "识别候选：演示模拟数据，金额待人工核验。",
          provider: "test",
          model: "vision",
        };
      },
    },
  });
  const bytes = await readFile("demo/materials/initial/A-APPROVAL.pdf");
  const uploaded = await service.action({
    action: "upload",
    payload: {
      name: "approval.pdf",
      mimeType: "application/pdf",
      kind: "approval",
      contentBase64: bytes.toString("base64"),
    },
  });
  const originalId = uploaded.result.document.id;
  const recognized = await service.action({
    action: "recognize",
    payload: { documentId: originalId, pages: [1] },
  });
  assert.equal(calls.length, 1);
  assert.equal(recognized.result.document.recordOrigin, "model-candidate");
  assert.equal(recognized.result.document.status, "pending");
  assert.deepEqual((await service.original(originalId)).bytes, bytes);
  const fact = service
    .state()
    .facts.find((f) => f.documentId === recognized.result.document.id);
  assert.ok(
    fact.sources.some(
      (s) =>
        s.documentId === originalId &&
        s.version === 1 &&
        s.locator.includes("第 1 页"),
    ),
  );
  service.model.analyze = async () => {
    throw new Error("模型识别失败");
  };
  await assert.rejects(
    service.action({
      action: "recognize",
      payload: { documentId: originalId, pages: [1] },
    }),
    /模型识别失败/,
  );
  assert.equal(service.state().runs.at(-1).status, "failed");
  assert.equal(service.state().documents.length, 2);
});

test("review reply cannot be considered implementation with nonexistent evidence IDs", async (t) => {
  const service = await fresh(t);
  await populate(service);
  const report = await service.action({ action: "run", scenarioId: "B01" });
  const fact = service.state().facts.find((f) => f.record.id === "RV1");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: fact.id,
      patch: {
        record: {
          modifiedArtifactId: report.result.artifactId,
          modifiedLocator: "第一行",
          evidenceIds: ["missing-evidence"],
        },
      },
      ...actor,
    },
  });
  await service.action({ action: "run", scenarioId: "D04" });
  const row = service
    .state()
    .artifacts.at(-1)
    .rows.find((r) => r.id === "RV1");
  assert.equal(row.implemented, false);
  assert.equal(row.status, "已回复但未落实");
});

test("model sees actual rule findings and explicit document/fact confirmation state", async (t) => {
  let received;
  const service = await fresh(t, {
    model: {
      capabilities: () => ({}),
      analyze: async (input) => {
        received = input;
        return { text: "资料记载的区间重叠需人工核验。" };
      },
    },
  });
  await populate(service);
  await service.action({
    action: "run",
    scenarioId: "B03",
    payload: { useModel: true },
  });
  assert.match(received.prompt, /216000/);
  assert.match(received.prompt, /findings/);
  assert.match(received.prompt, /validConfirmationIds/);
  assert.ok(
    received.documents.every((d) => d.text.includes('"status":"pending"')),
  );
  assert.ok(
    received.documents.every((d) =>
      d.text.includes("资料记载；不是自动确认的事实"),
    ),
  );
});

test("calculated finding is visible in every export and flows B03→B09→C01 without copying an answer", async (t) => {
  const service = await fresh(t);
  await populate(service);
  const run = await service.action({ action: "run", scenarioId: "B03" });
  const artifact = service.state().artifacts.at(-1);
  assert.equal(artifact.findings[0].amount, 216000);
  assert.match(artifact.content, /216000/);
  for (const format of ["md", "json", "csv"])
    assert.match(
      (await service.export(artifact.id, format)).bytes.toString(),
      /216000/,
    );
  const { parseDocument } = await import("../../parsers/index.js");
  for (const format of ["docx", "xlsx"]) {
    const file = await service.export(artifact.id, format);
    const parsed = await parseDocument({
      buffer: file.bytes,
      name: file.name,
      mimeType: file.mimeType,
    });
    assert.match(parsed.text, /216000/);
  }
  await service.action({
    action: "confirm",
    payload: {
      targetType: "finding",
      targetId: artifact.findings[0].id,
      ...actor,
    },
  });
  const b09 = await service.action({
    action: "run",
    scenarioId: "B09",
    payload: { artifactIds: [run.result.artifactId] },
  });
  assert.equal(service.state().artifacts.at(-1).rows[0].amountYuan, 216000);
  assert.equal(
    service.state().artifacts.at(-1).rows[0].confirmation,
    "已确认事实",
  );
  await service.action({
    action: "run",
    scenarioId: "C01",
    payload: { artifactIds: [b09.result.artifactId] },
  });
  assert.equal(service.state().artifacts.at(-1).summary.involvedYuan, 216000);
});
