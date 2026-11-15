import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = "http://127.0.0.1:13090";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: "runtime/browser-auth.json",
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const digest = (s) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        documents: s.documents,
        facts: s.facts,
        artifacts: s.artifacts,
        confirmations: s.confirmations,
        records: s.workflow?.records,
      }),
    )
    .digest("hex");
const report = { at: new Date().toISOString(), checks: [] };
try {
  const anonymous = await browser.newContext();
  assert.equal(
    (await anonymous.request.get(base + "/api/audit/state")).status(),
    401,
  );
  await anonymous.close();
  const beforeResponse = await context.request.get(base + "/api/audit/state");
  assert(beforeResponse.ok());
  const before = await beforeResponse.json();
  report.before = digest(before);
  await page.goto(base + "/");
  await page.getByRole("button", { name: "审计工作台", exact: true }).click();
  const frame = page.frameLocator('iframe[title="openAudit 审计工作台"]');
  await frame
    .getByRole("heading", { level: 1, name: "我的工作台", exact: true })
    .waitFor();
  await frame.getByLabel("我的工作岗位").selectOption("legal");
  await frame
    .locator(".task-card")
    .getByRole("heading", { name: "定性及处理依据复核", exact: true })
    .waitFor();
  await page.screenshot({
    path: "validation/personal-dsh-home.png",
    fullPage: true,
    animations: "disabled",
  });
  report.checks.push("登录后从 DSH 审计工作台进入个人首页；审理岗位推荐可用");
  await frame
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name: "2 审计实施", exact: true })
    .click();
  assert.equal(await frame.locator(".task-card").count(), 9);
  const card = frame
    .locator(".task-card")
    .filter({
      has: frame.getByRole("heading", {
        name: "工程计量资料比对",
        exact: true,
      }),
    });
  await card.getByRole("button", { name: "进入办理", exact: true }).click();
  await frame
    .getByRole("heading", { level: 1, name: "工程计量资料比对" })
    .waitFor();
  assert(!(await frame.getByLabel("本次使用的资料").isVisible()));
  await frame
    .getByRole("button", { name: "比对工程计量资料", exact: true })
    .waitFor();
  const output = await frame.locator(".output-card").innerText();
  assert.match(output, /216[,.]?000/);
  assert.match(output, /120/);
  await frame.locator(".output-card .source-link:visible").first().click();
  await frame
    .getByRole("link", { name: "下载原始资料", exact: true })
    .waitFor();
  await page.screenshot({
    path: "validation/personal-dsh-source.png",
    fullPage: true,
    animations: "disabled",
  });
  report.checks.push(
    "按阶段查找、默认收起资料设置、既有计量差异及来源原件均可见",
  );
  await page.goto(base + "/audit/#documents");
  await page
    .getByRole("heading", { level: 1, name: "审计资料", exact: true })
    .waitFor();
  const first = page.getByRole("table", { name: "审计资料目录" }).locator("tbody tr").first();
  await first.getByRole("button", { name: "关注资料", exact: true }).click();
  await page.getByLabel("查看范围").selectOption("watched");
  assert.equal(await page.getByRole("table", { name: "审计资料目录" }).locator("tbody tr").count(), 1);
  await page.getByRole("button", { name: "取消关注", exact: true }).click();
  await page.getByText("没有符合条件的资料", { exact: true }).waitFor();
  report.checks.push("个人关注资料与筛选可用；未修改项目资料");
  await page.goto(base + "/audit/#workflow");
  await page.getByRole("button", { name: "办理流程参考", exact: true }).click();
  assert.equal(await page.locator(".workflow-timeline > li").count(), 19);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/audit/#overview");
  await page
    .getByRole("heading", { name: "我的工作台", exact: true })
    .waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: "validation/personal-mobile-home.png",
    fullPage: true,
    animations: "disabled",
  });
  report.checks.push("原参考文件 19 个节点保留；手机端 390px 无页面横向溢出");
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "2 审计实施", exact: true }).click();
  await page.getByRole("heading", { name: "审计实施", level: 1, exact: true }).waitFor();
  assert.equal(await page.locator(".sidebar").evaluate(el => getComputedStyle(el).visibility), "hidden");
  report.checks.push("手机端导航可展开、进入事项后自动收起，隐藏导航不遮挡内容");
  const after = await (
    await context.request.get(base + "/api/audit/state")
  ).json();
  report.after = digest(after);
  assert.equal(report.after, report.before);
  report.counts = {
    documents: after.documents.length,
    facts: after.facts.length,
    artifacts: after.artifacts.length,
    workflowRecords: after.workflow.records.length,
  };
  assert.deepEqual(errors, []);
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.error = e.message;
  throw e;
} finally {
  await writeFile(
    "validation/personal-deployed.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
