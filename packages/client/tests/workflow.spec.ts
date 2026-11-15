import { test, expect } from "@playwright/test";
test("tracking workflow: source reference, two receipts, signed gates, redline and archive are persisted", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const post = async (action: string, payload: any) => {
    const r = await request.post("/api/audit/action", {
      data: { action, payload },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const person = { actor: "浏览器验收人", reason: "演示模拟数据，已核对原件" };
  const document = async (name: string, kind: string, records: any[]) => {
    const res = await post("upload", {
      name,
      kind,
      source: "演示模拟数据",
      contentBase64: Buffer.from(JSON.stringify({ records })).toString(
        "base64",
      ),
    });
    const id = res.result.document.id;
    await post("confirm", { targetType: "document", targetId: id, ...person });
    return id;
  };
  const proof = await document("流程签章证明.json", "template", [
    { id: "workflow-proof", text: "演示模拟签章" },
  ]);
  const report = await document("流程报告.json", "report", [
    {
      id: "workflow-report",
      type: "report",
      title: "抽样问题",
      amount: 0,
      unit: "元",
      evidenceIds: [proof],
    },
  ]);
  const draft = await document("流程修改留痕稿.json", "template", [
    { text: "修改前" },
  ]);
  await page.goto("/audit/#workflow");
  await expect(
    page.getByRole("heading", { name: "文书办理台账", exact: true }),
  ).toBeVisible();
  const add = async (
    kind: string,
    fields: Record<string, string>,
    proofIds: string[] = [proof],
  ) => {
    await page.getByLabel("登记类型", { exact: true }).selectOption(kind);
    await page.getByRole("button", { name: "新增记录", exact: true }).click();
    const dialog = page.getByRole("dialog");
    for (const [name, value] of Object.entries(fields)) {
      const control = dialog.getByLabel(name, { exact: true });
      if ((await control.evaluate((e) => e.tagName)) === "SELECT")
        await control.selectOption(value);
      else await control.fill(value);
    }
    if (kind !== "subject") {
      for (const id of proofIds)
        await dialog
          .getByRole("group", { name: /签章 \/ 办理证明原件/ })
          .locator(`input[value="${id}"]`)
          .check();
    }
    await dialog.getByLabel("登记人", { exact: true }).fill(person.actor);
    await dialog
      .getByLabel("核验依据与登记说明", { exact: true })
      .fill(person.reason);
    await dialog
      .getByRole("button", { name: "保存流程记录", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  };
  await add("subject", { 单位名称: "浏览器项目法人", 单位职责: "现建设单位" });
  await add("subject", {
    单位名称: "浏览器原管理单位",
    单位职责: "原建设单位",
  });
  let state = await (await request.get("/api/audit/state")).json();
  const subjects = state.workflow.records.filter(
    (r: any) => r.kind === "subject",
  );
  for (const [i, subject] of subjects.entries())
    await add("receipt", {
      签收单位: subject.id,
      送达文种: "审计报告",
      文号: "模拟报1号",
      实际签收日期: i ? "2024-06-18" : "2024-06-17",
      签收人: i ? "乙" : "甲",
      "对应报告版本（报告送达必选）": report,
    });
  await expect(page.getByText("2024-08-16", { exact: true })).toBeVisible();
  await expect(page.getByText("2024-08-17", { exact: true })).toBeVisible();
  // Server rejects real issuance before controls exist, without fabricating approvals.
  const issue = {
    ...person,
    kind: "issuance",
    reportId: report,
    documentNumber: "模拟报1号",
    date: "2024-06-14",
    drafter: "拟稿人",
    departmentReviewer: "复核人",
    relatedReviewer: "相关处室",
    leader: "分管领导",
    signer: "签发人",
    sealRegister: "用印1",
    recipients: "两家单位",
    evidenceIds: [proof],
  };
  const denied = await request.post("/api/audit/action", {
    data: { action: "workflow-save", payload: issue },
  });
  expect(denied.status()).toBe(409);
  for (const control of ["部门复核", "业务会议", "法规审理"])
    await post("workflow-save", {
      ...person,
      kind: "quality",
      control,
      reportId: report,
      date: "2024-06-13",
      signedBy: "模拟复核人员",
      conclusion: "逐项核对模拟证明，确认落实",
      answers: Array(8).fill("逐项核对通过"),
      evidenceIds: [proof],
    });
  await post("workflow-save", issue);
  await page.reload();
  await add("archive", {
    档案条目名称: "报告归档测试",
    档案单元: "结论类",
    案卷号: "卷1",
    "全宗号 / 目录号": "全宗1/目录1",
    起始页: "1",
    终止页: "5",
    保管期限: "待人工核定",
    移交日期: "2024-06-20",
    档案接收人: "模拟档案员",
  });
  await page.getByLabel("登记类型", { exact: true }).selectOption("redline");
  await page.getByRole("button", { name: "新增记录", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("文书类型", { exact: true }).selectOption("审计报告");
  await dialog.getByLabel("定稿日期", { exact: true }).fill("2024-06-14");
  await dialog.getByLabel("修改前原文", { exact: true }).fill("人员配备不到位");
  await dialog
    .getByLabel("修改后原文", { exact: true })
    .fill("人员配备不到位，审计期间已整改");
  await dialog
    .getByLabel("修改依据与意见编号", { exact: true })
    .fill("反馈意见1");
  await dialog
    .getByRole("group", { name: /修改留痕稿原件/ })
    .locator(`input[value="${draft}"]`)
    .check();
  await dialog
    .getByRole("group", { name: /定稿原件/ })
    .locator(`input[value="${report}"]`)
    .check();
  await dialog.getByLabel("登记人", { exact: true }).fill(person.actor);
  await dialog
    .getByLabel("核验依据与登记说明", { exact: true })
    .fill(person.reason);
  await dialog
    .getByRole("button", { name: "保存流程记录", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page
    .locator(".workflow-record")
    .filter({ hasText: "修改留痕稿与定稿" })
    .locator("summary")
    .first()
    .click();
  await expect(page.locator("ins")).toHaveText(
    "人员配备不到位，审计期间已整改",
  );
  await page.screenshot({
    path: testInfo.outputPath("tracking-workflow.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "办理流程参考", exact: true }).click();
  await expect(
    page.getByText("期限节点，非已完成事项", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workflow-timeline > li")).toHaveCount(19);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("tracking-reference-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  state = await (await request.get("/api/audit/state")).json();
  expect(
    state.workflow.records.some((r: any) => r.kind === "issuance"),
  ).toBeTruthy();
  expect(state.project.name).not.toContain("云溪");
  expect(errors).toEqual([]);
});
