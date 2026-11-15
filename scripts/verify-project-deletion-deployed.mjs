// Creates and deletes only its own clearly labelled acceptance project.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const base = "http://10.8.0.2:3090";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const projectName = "演示模拟数据 · 永久删除验收 " + Date.now();
const human = {
  actor: "部署验收",
  reason: "仅验证本次新建的模拟项目，不操作已有项目",
};
const report = { at: new Date().toISOString(), checks: [] };
let projectId;
let deleted = false;
const digest = (s) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        documents: s.documents,
        facts: s.facts,
        findings: s.findings,
        artifacts: s.artifacts,
        tasks: s.tasks,
        assets: s.assets,
        laws: s.laws,
        confirmations: s.confirmations,
        runs: s.runs,
        workflow: s.workflow.records,
      }),
    )
    .digest("hex");
async function state(id = "") {
  const response = await context.request.get(
    `${base}/api/audit/state?projectId=${encodeURIComponent(id)}`,
  );
  assert(response.ok(), `state status ${response.status()}`);
  return response.json();
}
async function action(action, payload, id = "") {
  const response = await context.request.post(
    `${base}/api/audit/action?projectId=${encodeURIComponent(id)}`,
    { data: { action, payload } },
  );
  assert(
    response.ok(),
    `action status ${response.status()}: ${await response.text()}`,
  );
  return (await response.json()).result;
}
const remote = (command) =>
  execFileSync(
    "ssh",
    [
      "-p",
      "22022",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "root@103.149.91.227",
      command,
    ],
    { timeout: 30000, encoding: "utf8" },
  );
try {
  const before = await state();
  const digests = new Map();
  for (const project of before.projects)
    digests.set(project.id, digest(await state(project.id)));
  projectId = (
    await action("project-manage", {
      ...human,
      operation: "create",
      name: projectName,
    })
  ).projectId;
  assert.match(projectId, /^project_[a-f0-9]{8}-[a-f0-9]{3}$/);
  const document = (
    await action(
      "upload",
      {
        name: "演示模拟数据-删除验证.txt",
        kind: "payment",
        contentBase64: Buffer.from(
          "演示模拟数据：本资料仅用于验证用户确认后的永久删除。",
        ).toString("base64"),
      },
      projectId,
    )
  ).document;
  const artifact = (
    await action(
      "product-save",
      {
        ...human,
        kind: "extract",
        documentIds: [document.id],
        content: "演示模拟数据：永久删除验收摘录。",
      },
      projectId,
    )
  ).artifacts[0];
  assert.match(document.sha256, /^[a-f0-9]{64}$/);
  const directory = `/opt/dsh-v2/openaudit-data/projects/${projectId}`;
  remote(
    `test -f ${directory}/state.json && test -f ${directory}/objects/${document.sha256}`,
  );
  report.checks.push("测试原件及项目状态确实写入服务器磁盘");
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/audit/#documents");
  await page.getByLabel("当前项目", { exact: true }).selectOption(projectId);
  await expect(page.getByLabel("当前项目", { exact: true })).toHaveValue(
    projectId,
  );
  await page.getByRole("button", { name: "删除项目", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("删除项目时，将一并永久删除全部资料，删除后无法撤销。", {
      exact: true,
    }),
  ).toBeVisible();
  const submit = dialog.getByRole("button", { name: "确认删除项目及全部资料" });
  await expect(submit).toBeDisabled();
  await page.screenshot({ path: "validation/project-deletion-dialog.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: "validation/project-deletion-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByLabel(/输入项目名称确认/).fill(projectName);
  await expect(submit).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /我已知晓并确认/ }).check();
  await dialog.getByLabel("经办人", { exact: true }).fill(human.actor);
  await dialog.getByLabel("办理说明", { exact: true }).fill(human.reason);
  await submit.click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("项目及全部资料已删除。", { exact: true }),
  ).toBeVisible();
  remote(`test ! -e ${directory}`);
  deleted = true;
  report.checks.push("双重确认后项目目录及原件被物理移除");
  for (const path of [
    "/state",
    `/file?id=${document.id}`,
    `/export?artifactId=${artifact.id}`,
  ]) {
    const response = await context.request.get(
      `${base}/api/audit${path}${path.includes("?") ? "&" : "?"}projectId=${projectId}`,
    );
    assert.equal(response.status(), 404);
  }
  report.checks.push("删除后项目、原件下载和成果导出均返回 404");
  const after = await state();
  assert.deepEqual(
    after.projects.map((p) => p.id),
    before.projects.map((p) => p.id),
  );
  for (const [id, hash] of digests) assert.equal(digest(await state(id)), hash);
  assert.deepEqual(errors, []);
  report.checks.push("所有已有项目的业务资料校验摘要保持一致");
  report.passed = true;
} finally {
  if (projectId && !deleted) {
    await action("project-manage", {
      ...human,
      operation: "delete",
      projectId,
      confirmation: projectName,
      deleteContents: true,
    }).catch(() => {
      report.cleanupNeeded = projectId;
    });
  }
  await writeFile(
    "validation/project-deletion-deployed.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
