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
page.setDefaultTimeout(90000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const digest = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
const report = { at: new Date().toISOString(), checks: [] };
async function readOriginal(frame, doc, screenshot) {
  const row = frame
    .getByRole("table", { name: "审计资料目录" })
    .locator("tbody tr")
    .filter({ has: frame.getByRole("button", { name: doc.name, exact: true }) })
    .first();
  await row.getByRole("button", { name: "查看原文", exact: true }).click();
  const canvas = frame.locator(
    '.document-preview canvas[data-rendered="true"]',
  );
  await canvas.waitFor();
  const ink = await canvas.evaluate((c) => {
    const pixels = c
      .getContext("2d")
      .getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] < 180 && pixels[i + 3]) n++;
    return n;
  });
  assert(ink > 100);
  const pages = await frame.getByLabel("原文页码").locator("option").count();
  if (pages > 1) {
    await frame.getByRole("button", { name: "下一页", exact: true }).click();
    await canvas.waitFor();
    assert.equal(await frame.getByLabel("原文页码").inputValue(), "2");
  }
  await frame.getByLabel("原文缩放").selectOption("150");
  await canvas.waitFor();
  await frame.getByLabel("原文缩放").selectOption("100");
  await canvas.waitFor();
  await page.screenshot({ path: screenshot, fullPage: true });
  await frame.getByRole("button", { name: "关闭来源", exact: true }).click();
  return { name: doc.name, pages, renderedNonWhitePixels: ink };
}
try {
  const response = await context.request.get(base + "/api/audit/state");
  assert(response.ok());
  const before = await response.json();
  report.before = digest(before);
  const anonymous = await browser.newContext();
  assert.equal(
    (
      await anonymous.request.get(base + "/api/audit/preview?id=missing")
    ).status(),
    401,
  );
  await anonymous.close();
  await page.goto(base + "/");
  await page.getByRole("button", { name: "审计工作台", exact: true }).click();
  const frame = page.frameLocator('iframe[title="openAudit 审计工作台"]');
  await frame.getByRole("button", { name: /^审计资料/ }).click();
  await frame.getByLabel("查看范围").selectOption("all");
  for (const ext of ["pdf", "docx"]) {
    const doc = before.documents.find((d) =>
      d.name.toLowerCase().endsWith("." + ext),
    );
    assert(doc);
    const original = await context.request.get(
      base + "/api/audit/file?id=" + doc.id,
    );
    const hash = digest(await original.body());
    report.checks.push(
      await readOriginal(frame, doc, "validation/preview-dsh-" + ext + ".png"),
    );
    const preview = await context.request.get(
      base + "/api/audit/preview?id=" + doc.id,
    );
    assert.equal(preview.status(), 200);
    assert.equal(preview.headers()["content-type"], "application/pdf");
    if (ext === "pdf") assert.equal(digest(await preview.body()), hash);
    assert.equal(
      digest(
        await (
          await context.request.get(base + "/api/audit/file?id=" + doc.id)
        ).body(),
      ),
      hash,
    );
  }
  report.after = digest(
    await (await context.request.get(base + "/api/audit/state")).json(),
  );
  assert.equal(report.before, report.after);
  // Four-format integration uses an isolated server and disposable data directory.
  const isolated = "http://127.0.0.1:13191";
  const isolatedState = await (
    await context.request.get(isolated + "/api/audit/state")
  ).json();
  const isolatedBefore = digest(isolatedState);
  await page.goto(isolated + "/audit/#documents");
  for (const doc of isolatedState.documents) {
    const original = await context.request.get(
      isolated + "/api/audit/file?id=" + doc.id,
    );
    const hash = digest(await original.body());
    report.checks.push(
      await readOriginal(
        page,
        doc,
        "validation/preview-isolated-" + doc.name.split(".").at(-1) + ".png",
      ),
    );
    assert.equal(
      digest(
        await (
          await context.request.get(isolated + "/api/audit/file?id=" + doc.id)
        ).body(),
      ),
      hash,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  report.checks.push(
    await readOriginal(
      page,
      isolatedState.documents.find((d) => d.name.endsWith(".wps")),
      "validation/preview-mobile-wps.png",
    ),
  );
  assert.equal(
    digest(
      await (await context.request.get(isolated + "/api/audit/state")).json(),
    ),
    isolatedBefore,
  );
  assert.deepEqual(errors, []);
  report.status = "passed";
  await writeFile(
    "validation/preview-deployed.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
