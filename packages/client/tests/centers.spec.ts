import { test, expect } from "@playwright/test";
test("personal centers: project, finding dispatch, split evidence, merged workpaper, report, original and deletion", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/audit/");
  await expect(
    page.getByRole("heading", { level: 1, name: "我的工作台" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "文书办理台账", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("项目名称", { exact: true })
    .fill("演示模拟数据 · 中心验收项目");
  await dialog.getByLabel("被审计单位", { exact: true }).fill("验收建设单位");
  await dialog.getByLabel("经办人", { exact: true }).fill("测试主审");
  await dialog.getByLabel("办理说明", { exact: true }).fill("核对四中心关联");
  await dialog.getByRole("button", { name: "保存项目设置" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("当前项目", { exact: true })).toContainText(
    "中心验收项目",
  );
  const projectId = await page
    .getByLabel("当前项目", { exact: true })
    .inputValue();
  const post = async (action: string, payload: any) => {
    const response = await request.post(
      "/api/audit/action?projectId=" + projectId,
      { data: { action, payload } },
    );
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const doc = (
    await post("upload", {
      name: "中心验收原件.txt",
      kind: "payment",
      contentBase64:
        Buffer.from("付款凭证记载：应核对合同与验收手续。").toString("base64"),
    })
  ).result.document;
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "审计取证中心", exact: true })
    .click();
  await page.getByRole("button", { name: "刷新项目资料" }).click();
  await page.getByRole("button", { name: "登记问题疑点", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("问题疑点名称", { exact: true })
    .fill("付款依据需核实");
  await dialog
    .getByLabel("问题疑点情况", { exact: true })
    .fill("需核对合同及验收原件");
  await dialog.getByLabel("来源位置（页码、段落或表格单元格）").fill("第一段");
  await dialog.locator("summary").filter({ hasText: "来源资料" }).click();
  await dialog.getByRole("checkbox", { name: /中心验收原件/ }).check();
  await dialog.getByLabel("办理说明", { exact: true }).fill("依据付款凭证登记");
  await dialog.getByRole("button", { name: "保存办理记录" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("checkbox", { name: /付款依据需核实/ }).check();
  await page.getByRole("button", { name: "分发选中疑点" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("承办人", { exact: true }).fill("张审计");
  await dialog.getByLabel("办理要求", { exact: true }).fill("取得合同原件核对");
  await dialog.getByLabel("办理期限", { exact: true }).fill("2026-12-01");
  await dialog.getByLabel("办理说明", { exact: true }).fill("按分工办理");
  await dialog.getByRole("button", { name: "保存办理记录" }).click();
  await expect(page.getByText(/承办人：张审计/)).toBeVisible();
  await page.getByRole("button", { name: "选取疑点编制取证单" }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .locator("summary")
    .filter({ hasText: "审计资料 · 已选" })
    .click();
  await dialog
    .getByRole("button", { name: "查阅", exact: true })
    .first()
    .click();
  await expect(
    dialog.getByRole("complementary", { name: "来源证据面板" }),
  ).toContainText("付款凭证记载");
  await dialog.getByRole("button", { name: "关闭来源" }).click();
  await dialog
    .getByRole("checkbox", { name: "按不同取证事项拆分多张取证单" })
    .check();
  await dialog
    .getByLabel("各张取证单名称（每行一张）")
    .fill("付款情况取证单\n验收手续取证单");
  await dialog
    .getByLabel("文书正文", { exact: true })
    .fill("根据付款凭证开展核查，合同与验收手续待补充。");
  await dialog.getByRole("button", { name: "保存文书草稿" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".center-product")).toHaveCount(2);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "审计底稿中心", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "审计取证单 · 已选" })
    .click();
  await page.getByRole("checkbox", { name: /付款情况取证单/ }).check();
  await page.getByRole("checkbox", { name: /验收手续取证单/ }).check();
  await page.getByRole("button", { name: "选取取证单编制底稿" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await dialog.getByLabel("文书名称", { exact: true }).fill("付款事项审计底稿");
  await dialog
    .getByLabel("文书正文", { exact: true })
    .fill("汇总两份取证单，记录核查过程及待补证事项。");
  await dialog.getByRole("button", { name: "保存文书草稿" }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "编写审计报告初稿", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .locator("summary")
    .filter({ hasText: "取证单、底稿及其他文书" })
    .click();
  await dialog.getByRole("checkbox", { name: /付款事项审计底稿/ }).check();
  await dialog
    .getByLabel("文书正文", { exact: true })
    .fill("审计报告初稿：付款事项尚需补充核实。");
  await dialog.getByRole("button", { name: "保存文书草稿" }).click();
  await expect(dialog).toHaveCount(0);
  const report = page
    .locator(".center-product")
    .filter({ hasText: "审计报告初稿" });
  await report.locator("summary").click();
  const downloadPromise = page.waitForEvent("download");
  await report.getByRole("link", { name: "导出 Word" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.docx$/);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "复核审理中心", exact: true })
    .click();
  for (const title of [
    "编写采纳情况说明",
    "编写部门复核意见书",
    "编写业务会议纪要",
    "编写法规处审理意见书",
    "编写复核审理意见回复",
  ])
    await expect(
      page.getByRole("button", { name: title, exact: true }),
    ).toBeVisible();
  await page
    .getByRole("button", { name: "相关登记与办理记录", exact: true })
    .click();
  await expect(page.getByLabel("登记类型", { exact: true })).toContainText(
    "签发",
  );
  await page.goto("/audit/#documents");
  const row = page
    .getByRole("table", { name: "审计资料目录" })
    .locator("tbody tr");
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "查看原文", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "来源证据面板" });
  await expect(panel).toContainText("付款凭证记载");
  expect(
    await panel
      .getByRole("link", { name: "下载原始资料", exact: true })
      .getAttribute("href"),
  ).toContain(projectId);
  await page.getByRole("button", { name: "关闭来源" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("centers-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/audit/#evidence");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("evidence-center.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByText(/承办人：张审计/)).toBeVisible();
  const state = await (
    await request.get("/api/audit/state?projectId=" + projectId)
  ).json();
  expect(state.artifacts).toHaveLength(4);
  expect(
    state.artifacts
      .find((a: any) => a.productKind === "report")
      .sources.some((r: any) => r.documentId === doc.id),
  ).toBeTruthy();
  await page.getByRole("button", { name: "删除项目", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(/输入项目名称确认/)
    .fill("演示模拟数据 · 中心验收项目");
  await dialog
    .getByLabel("办理说明", { exact: true })
    .fill("验收完成，保留历史备查");
  await dialog.getByRole("button", { name: "保存项目设置" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("当前项目", { exact: true })).not.toHaveValue(
    projectId,
  );
  expect(
    (
      await request.get(
        "/api/audit/file?id=" + doc.id + "&projectId=" + projectId,
      )
    ).status(),
  ).toBe(404);
  expect(errors).toEqual([]);
});
