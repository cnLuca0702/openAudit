// Run after an authenticated login; browser cookies remain in ignored runtime/.
import assert from "node:assert/strict";
import { chromium, request } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const baseURL = process.env.OPENAUDIT_URL || "http://127.0.0.1:13090";
const api = await request.newContext({
  baseURL,
  storageState: "runtime/browser-auth.json",
  timeout: 60000,
});
const anonymous = await request.newContext({ baseURL });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: "runtime/browser-auth.json",
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const result = {
  at: new Date().toISOString(),
  label: "演示模拟数据",
  scenarios: [],
  checks: [],
};
try {
  for (const path of ["/api/audit/state", "/audit/"])
    assert.equal((await anonymous.get(path)).status(), 401);
  result.checks.push("API及静态入口继续要求DSH鉴权");
  const before = await (await api.get("/api/audit/state")).json();
  assert.equal(before.workflowRulesVersion, 1);
  assert.equal(before.workflow.reference.milestones.length, 19);
  assert.equal(before.workflow.reference.issues.length, 15);
  const inputs = JSON.stringify({
    documents: before.documents,
    facts: before.facts,
  });
  for (const scenarioId of ["A03", "C01", "C02", "E01", "F04"]) {
    const response = await api.post("/api/audit/action", {
      data: { action: "run", scenarioId, payload: {} },
    });
    const output = await response.json();
    assert(response.ok(), `${scenarioId}: ${output.error}`);
    const a = output.state.artifacts.find(
      (x) => x.id === output.result.artifactId,
    );
    assert(a.rows.length && a.sources.length);
    if (scenarioId === "E01")
      assert(a.checks.some((c) => c.code === "quality-gate"));
    if (scenarioId === "F04") assert.equal(a.summary.archiveGroups.length, 4);
    result.scenarios.push({
      id: scenarioId,
      artifactId: a.id,
      rows: a.rows.length,
      sources: a.sources.length,
      blockingChecks: a.checks.filter((c) => c.blocking).length,
    });
  }
  const after = await (await api.get("/api/audit/state")).json();
  assert.equal(
    JSON.stringify({ documents: after.documents, facts: after.facts }),
    inputs,
  );
  result.checks.push(
    "五个受影响场景实际运行，保留待核和阻断状态，输入资料与事实无变化",
  );
  await page.goto(baseURL + "/");
  await page.getByRole("button", { name: "审计工作台", exact: true }).click();
  const frame = page.frameLocator('iframe[title="openAudit 审计工作台"]');
  await frame
    .getByRole("button", { name: "流程与文书台账", exact: true })
    .click();
  await frame
    .getByRole("heading", { name: "流程与文书台账", exact: true })
    .waitFor();
  await frame.getByRole("button", { name: "新增记录", exact: true }).waitFor();
  await page.screenshot({
    path: "validation/tracking-dsh-workflow.png",
    fullPage: true,
  });
  result.checks.push("真实DSH侧栏进入工作台，流程台账可见");
  await frame
    .getByRole("button", { name: "参考文件逐项对照", exact: true })
    .click();
  assert.equal(await frame.locator(".workflow-timeline > li").count(), 19);
  await page.screenshot({
    path: "validation/tracking-dsh-reference.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL + "/audit/#workflow");
  await page
    .getByRole("button", { name: "参考文件逐项对照", exact: true })
    .click();
  await page.getByText("期限节点，非已完成事项", { exact: true }).waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: "validation/tracking-mobile.png",
    fullPage: true,
  });
  result.checks.push("参考19节点及15问题可见，390px移动端无横向溢出");
  assert.deepEqual(errors, []);
  result.project = {
    documents: after.documents.length,
    facts: after.facts.length,
    artifacts: after.artifacts.length,
    workflowRecords: after.workflow.records.length,
  };
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.error = error.message;
  throw error;
} finally {
  await writeFile(
    "validation/tracking-deployed.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  await api.dispose();
  await anonymous.dispose();
  await browser.close();
}
