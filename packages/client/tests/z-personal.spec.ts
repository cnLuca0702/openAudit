import { test, expect } from "@playwright/test";

test("personal workspace: all roles and 24 tasks, personal plan, bookmarks, document focus and mobile", async ({
  page,
  request,
}, info) => {
  const state = await (await request.get("/api/audit/state")).json();
  await page.goto("/audit/#overview");
  await expect(
    page.getByRole("heading", { name: "我的工作台", exact: true }),
  ).toBeVisible();
  // Recommendations change with the person's work, without hiding other stages.
  for (const [role, expected] of [
    ["member", "合同履约与工程款支付核查"],
    ["lead", "审计实施方案与通知书"],
    ["review", "送审资料核对"],
    ["legal", "定性及处理依据复核"],
    ["followup", "审计整改证明核查"],
  ]) {
    await page.getByLabel("我的工作岗位").selectOption(role);
    await expect(
      page
        .locator(".task-cards")
        .getByRole("heading", { name: expected, exact: true }),
    ).toBeVisible();
  }
  await page.reload();
  await expect(page.getByLabel("我的工作岗位")).toHaveValue("followup");
  await page.getByLabel("准备办理的工作").fill("核对整改资金到账凭证");
  await page.getByLabel("关联办理事项").selectOption("F01");
  await page.getByRole("button", { name: "加入安排", exact: true }).click();
  await page.reload();
  const plan = page
    .locator(".arrangement-row")
    .filter({ hasText: "核对整改资金到账凭证" });
  await expect(plan).toBeVisible();
  await plan.getByRole("checkbox").check();
  await page.reload();
  await expect(plan.getByRole("checkbox")).toBeChecked();
  await plan.getByRole("button", { name: "进入办理" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "审计整改证明核查" }),
  ).toBeVisible();
  await expect(page.getByLabel("本次使用的资料")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "核查整改证明", exact: true }),
  ).toBeVisible();
  for (const id of ["A", "B", "C", "D", "E", "F"]) {
    await page.goto("/audit/#stage-" + id);
    const scenes = state.scenarios.filter((s: any) => s.id.startsWith(id));
    await expect(page.locator(".task-card")).toHaveCount(scenes.length);
    for (const scene of scenes)
      await expect(
        page
          .locator(".task-card")
          .getByRole("heading", { name: scene.title, exact: true }),
      ).toBeVisible();
  }
  await page.goto("/audit/#stage-B");
  await page.getByLabel("查找办理事项").fill("底稿");
  await expect(page.locator(".task-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "收藏：审计取证单与工作底稿", exact: true })
    .click();
  await page.goto("/audit/#overview");
  await expect(
    page.getByRole("heading", { name: "我常用的事项" }),
  ).toBeVisible();
  await expect(page.locator(".task-card")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("personal-home-desktop.png"),
    fullPage: true,
  });
  await page.goto("/audit/#documents");
  const row = page.getByRole("table", { name: "审计资料目录" }).locator("tbody tr").first();
  const name = await row.locator(".document-name").innerText();
  await row.getByRole("button", { name: "关注资料", exact: true }).click();
  await page.getByLabel("查看范围").selectOption("watched");
  await expect(page.getByRole("table", { name: "审计资料目录" }).locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("table", { name: "审计资料目录" }).locator("tbody tr")).toContainText(name);
  await page.reload();
  await page.getByLabel("查看范围").selectOption("watched");
  await expect(page.getByRole("table", { name: "审计资料目录" }).locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "取消关注", exact: true }).click();
  await expect(
    page.getByText("没有符合条件的资料", { exact: true }),
  ).toBeVisible();
  // Shared project records are not changed by personal arrangements or preferences.
  const after = await (await request.get("/api/audit/state")).json();
  expect(after).toEqual(state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/audit/#overview");
  await expect(page.getByLabel("我的工作岗位")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("personal-home-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "2 审计实施", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "审计实施", exact: true }),
  ).toBeVisible();
});

test("personal material intake: find all tasks and register a new version by choosing its name", async ({
  page,
  request,
}) => {
  await page.goto("/audit/#overview");
  await page.getByRole("button", { name: "查找办理事项", exact: true }).click();
  await expect(page.locator(".task-card")).toHaveCount(24);
  await page.getByLabel("查找办理事项").fill("审计报告");
  await expect(page.locator(".task-card").first()).toBeVisible();
  await page.goto("/audit/#documents");
  const upload = async (text: string, old?: string) => {
    await page.getByRole("button", { name: "上传资料", exact: true }).click();
    await page
      .getByLabel("选择上传文件")
      .setInputFiles({
        name: "个人经办资料-演示模拟数据.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(text),
      });
    if (old) {
      await page.getByLabel("本次上传用途").selectOption(old);
      await expect(page.getByLabel("资料类别", { exact: true })).toHaveValue(
        "contract",
      );
    } else
      await page
        .getByLabel("资料类别", { exact: true })
        .selectOption("contract");
    await page
      .getByLabel("资料提供单位及来源")
      .fill("演示模拟数据，个人经办资料登记测试");
    await page
      .getByRole("button", { name: "保存原件并登记", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const state = await (await request.get("/api/audit/state")).json();
    return state.documents
      .filter((d: any) => d.name === "个人经办资料-演示模拟数据.txt")
      .at(-1);
  };
  const first = await upload("演示模拟数据，第一版合同");
  const second = await upload(
    "演示模拟数据，第二版合同，补充付款条件",
    first.logicalId,
  );
  expect(second.previousId).toBe(first.id);
  expect(second.version).toBe(first.version + 1);
  expect(second.kind).toBe("contract");
  expect(second.status).not.toBe("confirmed");
});
