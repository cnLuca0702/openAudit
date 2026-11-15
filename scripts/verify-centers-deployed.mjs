// Read-only deployment check: authenticated DSH UI and original preview.
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
const report = { at: new Date().toISOString(), checks: [] };
const digest = (s) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        documents: s.documents,
        facts: s.facts,
        artifacts: s.artifacts,
        confirmations: s.confirmations,
        events: s.events,
        workflow: s.workflow.records,
      }),
    )
    .digest("hex");
try {
  const before = await context.request.get(base + "/api/audit/state");
  assert(before.ok());
  const state = await before.json();
  report.before = digest(state);
  await page.goto(base + "/");
  await page.getByRole("button", { name: "审计工作台", exact: true }).click();
  const frame = page.frameLocator('iframe[title="openAudit 审计工作台"]');
  await frame
    .getByRole("heading", { level: 1, name: "我的工作台", exact: true })
    .waitFor();
  assert.equal(
    await frame
      .getByRole("navigation")
      .getByRole("button", { name: "文书办理台账", exact: true })
      .count(),
    0,
  );
  for (const title of [
    "审计资料中心",
    "审计取证中心",
    "审计底稿中心",
    "复核审理中心",
  ]) {
    await frame
      .getByRole("navigation")
      .getByRole("button", { name: new RegExp("^" + title) })
      .click();
    await frame
      .getByRole("heading", { level: 1, name: title, exact: true })
      .waitFor();
    await frame
      .getByRole("button", { name: "相关登记与办理记录", exact: true })
      .click();
    await frame.getByLabel("登记类型", { exact: true }).waitFor();
    report.checks.push(title + "及归并登记入口可用");
  }
  await page.goto(base + "/audit/#documents");
  await page
    .getByRole("heading", { level: 1, name: "审计资料中心", exact: true })
    .waitFor();
  const doc = state.documents.find((d) => d.mimeType === "application/pdf");
  assert(doc);
  const row = page
    .getByRole("table", { name: "审计资料目录" })
    .locator("tbody tr")
    .filter({ hasText: doc.name })
    .first();
  await row.getByRole("button", { name: "查看原文", exact: true }).click();
  const canvas = page.locator(".document-preview canvas");
  await canvas.waitFor();
  await page.waitForFunction(
    () => !!document.querySelector(".document-preview canvas")?.width,
  );
  report.checks.push("现有 PDF 原件可直接阅读");
  await page.getByRole("button", { name: "关闭来源", exact: true }).click();
  await page.getByRole("button", { name: /政策法规 MCP 设置/ }).click();
  assert.match(await page.getByRole("dialog").innerText(), /待接入/);
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.goto(base + "/audit/#evidence");
  await page.getByRole("heading", { level: 1, name: "审计取证中心" }).waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "validation/centers-deployed-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: "validation/centers-deployed-mobile.png",
    fullPage: true,
  });
  report.after = digest(
    await (await context.request.get(base + "/api/audit/state")).json(),
  );
  assert.equal(report.before, report.after);
  assert.deepEqual(errors, []);
  report.checks.push("验收未修改已有项目记录；移动端无横向撑宽；无页面异常");
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.error = e.message;
  throw e;
} finally {
  await writeFile(
    "validation/centers-deployed.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
