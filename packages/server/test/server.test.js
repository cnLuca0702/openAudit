import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { AuditService, createHandlers, apply, inject } from "../index.js";
import { SCENARIOS } from "../scenarios.js";
import { populate } from "./fixtures.js";
const actor = { actor: "模拟审计员", reason: "人工逐项复核演示资料" };
async function fresh(t, config = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "audit-test-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return AuditService.create({
    dataDir,
    parser: {
      parseDocument: async () => ({
        text: "",
        records: [],
        parseStatus: "pending",
      }),
    },
    model: {
      capabilities: () => ({ text: { configured: false } }),
      analyze: async () => {
        throw new Error("模型测试故障");
      },
    },
    ...config,
  });
}
for (const scenario of SCENARIOS) {
  test(`${scenario.id} computes persisted inputs, sources, reload and missing-input failure`, async (t) => {
    const service = await fresh(t);
    await assert.rejects(
      service.action({ action: "run", scenarioId: scenario.id }),
      (e) => e.status === 409,
    );
    assert.equal(service.state().runs.at(-1).status, "failed");
    await populate(service);
    const output = await service.action({
      action: "run",
      scenarioId: scenario.id,
    });
    const artifact = output.state.artifacts.find(
      (a) => a.id === output.result.artifactId,
    );
    assert.ok(artifact.rows.length);
    assert.ok(artifact.sources.length);
    assert.match(artifact.content, /演示模拟数据/);
    for (const ref of artifact.sources) {
      const doc = output.state.documents.find((d) => d.id === ref.documentId);
      assert.equal(doc.version, ref.version);
      assert.ok(ref.locator);
    }
    const reopened = await AuditService.create({
      dataDir: service.config.dataDir,
      parser: service.parser,
      model: service.model,
    });
    assert.equal(reopened.state().artifacts.at(-1).id, artifact.id);
    assert.equal(reopened.state().runs.at(-1).status, "succeeded");
  });
}
test("interval calculations change with inputs and preserve original bytes", async (t) => {
  const service = await fresh(t);
  await populate(service);
  await service.action({ action: "run", scenarioId: "B03" });
  assert.equal(service.state().findings.at(-1).amount, 216000);
  const doc = service.state().documents.find((d) => d.kind === "measurement");
  const original = await service.original(doc.id);
  const fact = service.state().facts.find((f) => f.record.id === "M2");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: fact.id,
      patch: { record: { start: 180 } },
      ...actor,
    },
  });
  assert.equal(service.state().artifacts.at(-1).status, "stale");
  await service.action({ action: "run", scenarioId: "B03" });
  assert.equal(service.state().findings.at(-1).amount, 36000);
  assert.deepEqual((await service.original(doc.id)).bytes, original.bytes);
  assert.equal(
    service.state().facts.find((f) => f.id === fact.id).record.start,
    80,
  );
});
test("contract versions invalidate only linked checks and confirmations", async (t) => {
  const service = await fresh(t);
  await populate(service);
  const contract = service.state().documents.find((d) => d.kind === "contract");
  await service.action({
    action: "confirm",
    payload: { targetType: "document", targetId: contract.id, ...actor },
  });
  const b = await service.action({ action: "run", scenarioId: "B05" });
  await service.action({
    action: "confirm",
    payload: {
      targetType: "artifact",
      targetId: b.result.artifactId,
      ...actor,
    },
  });
  const unrelated = await service.action({ action: "run", scenarioId: "B08" });
  const changed = { ...contract.records[0], paymentRatio: 0.95 };
  await service.action({
    action: "upload",
    payload: {
      name: contract.name,
      logicalId: contract.logicalId,
      mimeType: "application/json",
      kind: "contract",
      contentBase64: Buffer.from(
        JSON.stringify({ records: [changed] }),
      ).toString("base64"),
    },
  });
  assert.equal(
    service.state().artifacts.find((a) => a.id === b.result.artifactId).status,
    "stale",
  );
  assert.equal(
    service.state().artifacts.find((a) => a.id === unrelated.result.artifactId)
      .status,
    "draft",
  );
  assert.equal(
    service
      .state()
      .confirmations.find((c) => c.targetId === b.result.artifactId).valid,
    false,
  );
  assert.equal(
    service.state().documents.find((d) => d.id === contract.id).status,
    "confirmed",
  );
  const next = service.state().documents.at(-1);
  await service.action({
    action: "confirm",
    payload: { targetType: "document", targetId: next.id, ...actor },
  });
  const output = await service.action({ action: "run", scenarioId: "B05" });
  assert.equal(output.state.artifacts.at(-1).rows[0].ceiling, 950000);
});
test("unit and date corrections recalculate rather than overwrite", async (t) => {
  const service = await fresh(t);
  await populate(service);
  await service.action({ action: "run", scenarioId: "B01" });
  let fact = service.state().facts.find((f) => f.record.id === "P1");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: fact.id,
      patch: { unit: "元" },
      ...actor,
    },
  });
  await service.action({ action: "run", scenarioId: "B01" });
  assert.equal(service.state().artifacts.at(-1).rows[0].amountYuan, 90);
  fact = service.state().facts.find((f) => f.record.id === "start");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: fact.id,
      patch: { record: { date: "2027-02-05", dateRole: "start" } },
      ...actor,
    },
  });
  await service.action({ action: "run", scenarioId: "B02" });
  assert.equal(
    service
      .state()
      .artifacts.at(-1)
      .checks.some((c) => c.code === "sequence"),
    false,
  );
});
test("E01 confirmation invalidates when a referenced report fact changes", async (t) => {
  const service = await fresh(t);
  await populate(service);
  const run = await service.action({ action: "run", scenarioId: "E01" });
  await service.action({
    action: "confirm",
    payload: {
      targetType: "artifact",
      targetId: run.result.artifactId,
      ...actor,
    },
  });
  const fact = service.state().facts.find((f) => f.record.id === "R1");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: fact.id,
      patch: { record: { unit: "元", claimScope: "all" } },
      ...actor,
    },
  });
  assert.equal(
    service
      .state()
      .confirmations.find((c) => c.targetId === run.result.artifactId).valid,
    false,
  );
  await service.action({ action: "run", scenarioId: "E01" });
  const current = service.state().artifacts.at(-1);
  assert.ok(current.checks.some((c) => c.code === "scope-overreach"));
  assert.ok(current.checks.some((c) => c.code === "source-amount"));
  await assert.rejects(
    service.action({
      action: "confirm",
      payload: { targetType: "artifact", targetId: current.id, ...actor },
    }),
    (e) => e.status === 409,
  );
});
test("low quality drawing, duplicate image, ASR uncertainty, feedback reply gates", async (t) => {
  const service = await fresh(t);
  await populate(service);
  for (const [scene, code] of [
    ["B06", "drawing-unverified"],
    ["B07", "duplicate-image"],
    ["B08", "media-uncertain"],
    ["C02", "feedback-not-implemented"],
    ["D04", "review-not-implemented"],
  ]) {
    await service.action({ action: "run", scenarioId: scene });
    assert.ok(
      service
        .state()
        .artifacts.at(-1)
        .checks.some((c) => c.code === code),
    );
  }
  const drawing = service.state().artifacts.find((a) => a.scenarioId === "B06");
  assert.equal(drawing.rows[1].total, null);
  const task = service.state().tasks.find((t) => t.scenarioId === "C02");
  await service.action({
    action: "resolve",
    payload: {
      targetType: "task",
      targetId: task.id,
      decision: "replied",
      ...actor,
    },
  });
  await assert.rejects(
    service.action({
      action: "resolve",
      payload: {
        targetType: "task",
        targetId: task.id,
        decision: "implemented",
        ...actor,
      },
    }),
  );
});
test("rectification effects and archive are independent; closure requires evidence", async (t) => {
  const service = await fresh(t);
  await populate(service);
  await service.action({ action: "run", scenarioId: "F01" });
  const task = service.state().tasks.at(-1);
  assert.equal(task.status, "ready-review");
  await service.action({ action: "run", scenarioId: "F04" });
  assert.equal(
    service.state().tasks.find((x) => x.id === task.id).status,
    "ready-review",
  );
  await assert.rejects(
    service.action({
      action: "resolve",
      payload: {
        targetType: "task",
        targetId: task.id,
        decision: "closed",
        ...actor,
      },
    }),
  );
  await service.action({ action: "run", scenarioId: "F02" });
  assert.equal(
    service.state().artifacts.at(-1).rows[0].recommendation,
    "可提请人工销号",
  );
  const follow = service.state().facts.find((f) => f.record.id === "FOLLOW1");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: follow.id,
      patch: { record: { recurred: true } },
      ...actor,
    },
  });
  await service.action({ action: "run", scenarioId: "F02" });
  assert.equal(
    service.state().artifacts.at(-1).rows[0].recommendation,
    "反弹，继续整改",
  );
});
test("capability publication needs executed tests; reuse copies no facts; source revision withdraws", async (t) => {
  const service = await fresh(t);
  await populate(service);
  for (const d of service.state().documents)
    await service.action({
      action: "confirm",
      payload: { targetType: "document", targetId: d.id, ...actor },
    });
  await service.action({ action: "run", scenarioId: "F05" });
  const capability = service
    .state()
    .assets.find((a) => a.library === "capability");
  const publication = {
    assetId: capability.id,
    redacted: true,
    permissionConfirmed: true,
    scope: "同实体线性工程",
    ...actor,
  };
  await assert.rejects(
    service.action({ action: "publish", payload: publication }),
    (e) => e.status === 409,
  );
  await service.action({
    action: "testAsset",
    payload: { assetId: capability.id },
  });
  await service.action({ action: "publish", payload: publication });
  const factsBefore = service.state().facts.length;
  const reused = await service.action({
    action: "reuse",
    payload: {
      assetId: capability.id,
      targetProject: {
        id: "new-project",
        type: "linear-engineering",
        unit: "米",
      },
      actor: actor.actor,
    },
  });
  assert.deepEqual(reused.result.copiedFacts, []);
  assert.equal(service.state().facts.length, factsBefore);
  const fact = service.state().facts.find((f) => f.record.id === "M1");
  await service.action({
    action: "revise",
    payload: {
      targetType: "fact",
      targetId: fact.id,
      patch: { record: { end: 220 } },
      ...actor,
    },
  });
  assert.equal(
    service.state().assets.find((a) => a.id === capability.id).status,
    "stale",
  );
});
test("model errors persisted, malformed uploads rollback, resets explicit, concurrent writes durable", async (t) => {
  const service = await fresh(t);
  await populate(service);
  await assert.rejects(
    service.action({
      action: "run",
      scenarioId: "A02",
      payload: { useModel: true },
    }),
    /模型测试故障/,
  );
  assert.equal(service.state().runs.at(-1).status, "failed");
  assert.equal(service.state().artifacts.length, 0);
  const count = service.state().documents.length;
  await assert.rejects(
    service.action({
      action: "upload",
      payload: {
        name: "bad.json",
        mimeType: "application/json",
        contentBase64: Buffer.from("{bad").toString("base64"),
      },
    }),
  );
  assert.equal(service.state().documents.length, count);
  await assert.rejects(service.action({ action: "reset", payload: {} }));
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      service.action({
        action: "upload",
        payload: {
          name: `concurrent-${i}.txt`,
          mimeType: "text/plain",
          contentBase64: Buffer.from(`演示模拟数据 ${i}`).toString("base64"),
        },
      }),
    ),
  );
  assert.equal(service.state().documents.length, count + 8);
  const reset = await service.action({
    action: "reset",
    payload: { confirmation: "重置演示项目" },
  });
  assert.equal(reset.state.documents.length, 0);
  assert.ok(reset.result.backup);
});
test("HTTP authentication applies to API and every static resource; methods and exports", async (t) => {
  const service = await fresh(t);
  const dist = join(service.config.dataDir, "dist");
  await mkdir(dist);
  await writeFile(join(dist, "index.html"), "<html>演示模拟数据</html>");
  await writeFile(join(dist, "app.js"), "export const demo=true");
  service.config.clientDist = dist;
  const handlers = createHandlers(service, {
    requestRejection: (req) =>
      req.headers.cookie === "dsh=valid" ? undefined : 401,
  });
  const server = createServer((req, res) =>
    req.url.startsWith("/api") ? handlers.api(req, res) : handlers.ui(req, res),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/api/audit/state", "/audit/", "/audit/app.js"])
    assert.equal((await fetch(url + path)).status, 401);
  const opts = { headers: { cookie: "dsh=valid" } };
  assert.equal((await fetch(url + "/audit/", opts)).status, 200);
  assert.equal((await fetch(url + "/api/audit/state", opts)).status, 200);
  assert.equal((await fetch(url + "/api/audit/action", opts)).status, 405);
  assert.equal(
    (
      await fetch(url + "/api/audit/action", {
        method: "POST",
        headers: { ...opts.headers, "content-type": "application/json" },
        body: "bad",
      })
    ).status,
    400,
  );
  await populate(service);
  const result = await service.action({ action: "run", scenarioId: "B03" });
  for (const format of ["md", "csv", "json"]) {
    const response = await fetch(
      `${url}/api/audit/export?artifactId=${result.result.artifactId}&format=${format}`,
      opts,
    );
    assert.equal(response.status, 200);
    assert.match(await response.text(), /演示模拟数据/);
  }
});
test("DSH actual registration interface and disposer ownership", async (t) => {
  const service = await fresh(t);
  const registrations = [];
  const effects = [];
  await apply(
    {
      webServer: {
        register: (route) => {
          registrations.push(route);
          return () => {};
        },
      },
      connection: { requestRejection: () => 401 },
      effect: (fn, label) => {
        effects.push(label);
        fn();
      },
    },
    {
      dataDir: service.config.dataDir,
      parser: service.parser,
      model: service.model,
    },
  );
  assert.deepEqual(inject, ["webServer", "connection"]);
  assert.deepEqual(
    registrations.map((r) => [r.kind, r.path]),
    [
      ["prefix", "/api/audit"],
      ["prefix", "/audit"],
    ],
  );
  assert.equal(effects.length, 2);
});
