import { test, expect } from "@playwright/test";
import { operationNames } from "../src/model";
test("real persisted project: 24 scenario runs, provenance, review, changes, exports, errors and mobile", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = async () =>
    await (await request.get("/api/audit/state")).json();
  const post = async (action: string, payload: any = {}, scenarioId?: string) =>
    request.post("/api/audit/action", {
      data: { action, payload, scenarioId },
    });
  await page.goto("/audit/");
  await expect(page.getByRole("heading", { name: "我的工作台" })).toBeVisible();
  await page
    .getByRole("button", { name: "导入首批演示资料", exact: true })
    .click();
  await expect(page.getByText("已保存，可继续办理。")).toBeVisible({
    timeout: 90000,
  });
  await page.goto("/audit/#settings");
  for (const title of ["征求意见资料", "审理复核资料", "整改证明资料"]) {
    await page
      .locator(".batch-card")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .getByRole("button", { name: "导入此批" })
      .click();
    await expect(page.locator(".notice.processing")).toHaveCount(0, {
      timeout: 90000,
    });
  }
  let s = await state();
  expect(s.documents.length).toBeGreaterThan(10);
  expect(s.scenarios).toHaveLength(24);
  await page.goto("/audit/#overview");
  await page.screenshot({
    path: testInfo.outputPath("desktop-overview.png"),
    fullPage: true,
  });
  const runSummary: any[] = [];
  for (const scenario of s.scenarios) {
    await page.goto("/audit/#" + scenario.id);
    await expect(
      page.getByRole("heading", { level: 1, name: scenario.title }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: operationNames[scenario.id], exact: true })
      .click();
    await expect(page.locator(".notice.processing")).toHaveCount(0, {
      timeout: 90000,
    });
    const after = await state();
    const run = after.runs
      .filter((r: any) => r.scenarioId === scenario.id)
      .at(-1);
    expect(run?.status, scenario.id + ": " + run?.error).toBe("succeeded");
    const artifact = after.artifacts.find((a: any) => a.id === run.artifactId);
    expect(artifact.rows.length, scenario.id).toBeGreaterThan(0);
    expect(artifact.sources.length, scenario.id).toBeGreaterThan(0);
    await expect(page.locator(".output-card")).toContainText("人工确认");
    if (scenario.id === "B03") {
      await expect(page.locator(".output-card")).toContainText("216000");
      await expect(page.locator(".output-card")).toContainText("120");
      await page.screenshot({
        path: testInfo.outputPath("desktop-comparison.png"),
        fullPage: true,
      });
    }
    await page.locator(".output-card .source-link:visible").first().click();
    await expect(
      page.getByRole("complementary", { name: "来源证据面板" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "下载原始资料" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "关闭来源", exact: true }).click();
    const exported = await request.get(
      "/api/audit/export?artifactId=" + artifact.id + "&format=md",
    );
    expect(exported.ok()).toBeTruthy();
    expect(await exported.text()).toContain("演示模拟数据");
    const missing = await post("run", { documentIds: [] }, scenario.id);
    expect(missing.status()).toBe(409);
    const failedState = await state();
    expect(failedState.runs.at(-1).status).toBe("failed");
    runSummary.push({
      scenario: scenario.id,
      successRun: run.id,
      artifact: artifact.id,
      rows: artifact.rows.length,
      sources: artifact.sources.length,
      missingInputStatus: missing.status(),
    });
  }
  await testInfo.attach("24-scenarios-real-api", {
    body: JSON.stringify(runSummary, null, 2),
    contentType: "application/json",
  });
  // Browser upload creates immutable input, then original source remains downloadable after reload.
  await page.goto("/audit/#documents");
  await page.getByRole("button", { name: "上传资料", exact: true }).click();
  await page.getByLabel("选择上传文件").setInputFiles({
    name: "浏览器上传-演示模拟数据.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        records: [
          {
            id: "ui-proof",
            type: "payment",
            contractId: "UI-CONTRACT",
            amount: 12.3,
            unit: "万元",
            date: "2027-02-03",
          },
        ],
      }),
    ),
  });
  await page.getByLabel("资料类别", { exact: true }).selectOption("payment");
  await page
    .getByLabel("资料提供单位及来源")
    .fill("演示模拟数据，Playwright 浏览器实际上传");
  await page.getByRole("button", { name: "保存原件并登记" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "浏览器上传-演示模拟数据.json",
      exact: true,
    }),
  ).toBeVisible();
  s = await state();
  const uploaded = s.documents.find(
    (d: any) => d.name === "浏览器上传-演示模拟数据.json",
  );
  const original = await request.get("/api/audit/file?id=" + uploaded.id);
  expect(await original.text()).toContain("ui-proof");
  const row = page.locator("tr").filter({
    has: page.getByRole("button", {
      name: "浏览器上传-演示模拟数据.json",
      exact: true,
    }),
  });
  await row.getByRole("button", { name: "确认版本", exact: true }).click();
  await page.getByLabel("经办人 / 核验人").fill("浏览器验收审核人");
  await page
    .getByLabel("核验依据与处理理由")
    .fill("已核对浏览器上传的原件及版本，用于演示测试");
  await page
    .getByRole("checkbox", {
      name: "我已核对本次具体版本及其证据，愿意记录本次人工确认。",
    })
    .check();
  await page.getByRole("button", { name: "确认并保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await state()).documents.find((d: any) => d.id === uploaded.id).status,
  ).toBe("confirmed");
  // Editable amount and unit must change the authoritative record, and invalidate dependencies.
  await page.goto("/audit/#B01");
  await page
    .getByRole("button", { name: "汇总合同与支付", exact: true })
    .click();
  await expect(page.locator(".notice.processing")).toHaveCount(0);
  s = await state();
  const oldB01 = s.artifacts.filter((a: any) => a.scenarioId === "B01").at(-1);
  const fact = s.facts.find((f: any) => f.record?.id === "ui-proof");
  await page.locator(".editable-inputs > summary").click();
  const inputRow = page
    .locator(".input-record")
    .filter({ has: page.getByText("ui-proof", { exact: true }) });
  await inputRow.getByRole("button", { name: "修改事实" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("金额", { exact: true }).fill("15.5");
  await dialog
    .getByLabel("核验依据与处理理由")
    .fill("按原始资料核对人工派生金额，修正为15.5万元");
  await dialog.getByRole("button", { name: "确认并保存" }).click();
  await expect(dialog).toHaveCount(0);
  s = await state();
  const newFact = s.facts.find((f: any) => f.previousId === fact.id);
  expect(newFact.record.amount).toBe(15.5);
  expect(s.artifacts.find((a: any) => a.id === oldB01.id).status).toBe("stale");
  await page
    .getByRole("button", { name: "汇总合同与支付", exact: true })
    .click();
  await expect(page.locator(".notice.processing")).toHaveCount(0);
  s = await state();
  expect(
    s.artifacts
      .filter((a: any) => a.scenarioId === "B01")
      .at(-1)
      .rows.find((r: any) => r.id === "ui-proof").amountYuan,
  ).toBe(155000);
  // Model absence/failure must remain visible, without substituting an artifact.
  const oldArtifacts = s.artifacts.length;
  await page.locator(".intelligent-settings > summary").click();
  await page.getByRole("checkbox", { name: /使用智能辅助分析/ }).check();
  await page
    .getByRole("button", { name: "汇总合同与支付", exact: true })
    .click();
  await expect(page.locator(".notice.processing")).toHaveCount(0, {
    timeout: 90000,
  });
  s = await state();
  expect(s.runs.at(-1).status).toBe("failed");
  expect(s.artifacts.length).toBe(oldArtifacts);
  await expect(page.locator(".notice.error").first()).toBeVisible();
  // E01 confirmation cannot silently bypass a blocking issue.
  await page.goto("/audit/#E01");
  await page
    .getByRole("button", { name: "核对报告签发条件", exact: true })
    .click();
  await expect(page.locator(".notice.processing")).toHaveCount(0);
  await page.getByRole("button", { name: "人工确认", exact: true }).click();
  await page
    .getByLabel("核验依据与处理理由")
    .fill("浏览器验证阻断门禁，不应成功");
  await page
    .getByRole("checkbox", {
      name: "我已核对本次具体版本及其证据，愿意记录本次人工确认。",
    })
    .check();
  await page.getByRole("button", { name: "确认并保存" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "阻断",
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  // Persisted version selection and server-calculated comparison.
  await page.goto("/audit/#documents");
  await page.getByRole("button", { name: "比较版本", exact: true }).click();
  s = await state();
  await page.getByLabel("比较前版本").selectOption(s.documents[0].id);
  await page.getByLabel("比较后版本").selectOption(s.documents[1].id);
  await page.getByRole("button", { name: "计算版本差异" }).click();
  await expect(
    page.getByRole("dialog", { name: "操作结果与差异" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.goto("/audit/#B02");
  await page.screenshot({
    path: testInfo.outputPath("desktop-timeline.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/audit/#overview");
  await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();
  await page.getByRole("button", { name: "打开导航" }).click();
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name: /审计资料/ })
    .click();
  await expect(page.getByRole("heading", { name: "审计资料中心" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("mobile-documents.png"),
    fullPage: true,
  });
  await page.goto("/audit/#B08");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("mobile-media.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("human workflows: contract revision, freeze, legal applicability, resolution, governed reuse and Office export", async ({
  page,
  request,
}, testInfo) => {
  const state = async () =>
    await (await request.get("/api/audit/state")).json();
  const post = async (action: string, payload: any = {}, scenarioId?: string) =>
    request.post("/api/audit/action", {
      data: { action, payload, scenarioId },
    });
  const human = {
    actor: "业务浏览器验收人",
    reason: "演示模拟数据，核对来源及当前版本后执行测试",
  };
  const submitHuman = async () => {
    await page.getByLabel("经办人 / 核验人").fill(human.actor);
    await page.getByLabel("核验依据与处理理由").fill(human.reason);
    const check = page.getByRole("checkbox", {
      name: "我已核对本次具体版本及其证据，愿意记录本次人工确认。",
    });
    if (await check.count()) await check.check();
    await page.getByRole("button", { name: "确认并保存", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "确认并保存", exact: true }),
    ).toHaveCount(0);
  };
  expect((await post("seed", { batch: "all" })).ok()).toBeTruthy();
  const uploadContract = async (ratio: number) => {
    await page.goto("/audit/#documents");
    await page.getByRole("button", { name: "上传资料", exact: true }).click();
    await page.getByLabel("选择上传文件").setInputFiles({
      name: "浏览器版本测试-演示模拟数据.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          records: [
            {
              id: "browser-contract",
              type: "contract",
              contractId: "UI-CONTRACT",
              amount: 100,
              unit: "万元",
              paymentRatio: ratio,
              requiresAcceptance: false,
            },
          ],
        }),
      ),
    });
    await page.getByLabel("资料类别", { exact: true }).selectOption("contract");
    await page.getByText("自行填写资料标识（选填）", { exact: true }).click();
    await page
      .getByLabel("同一资料标识（选填）")
      .fill("browser-contract-chain");
    await page
      .getByLabel("资料提供单位及来源")
      .fill("演示模拟数据，浏览器版本比较专项");
    await page.getByRole("button", { name: "保存原件并登记" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    return (await state()).documents
      .filter((d: any) => d.logicalId === "browser-contract-chain")
      .at(-1);
  };
  const v1 = await uploadContract(0.8);
  let s = await state();
  const payment = s.documents.find(
    (d: any) => d.name === "浏览器上传-演示模拟数据.json",
  );
  expect(payment).toBeTruthy();
  const selectRun = async (contract: any) => {
    await page.goto("/audit/#B05");
    await page
      .locator(".optional-settings > summary")
      .filter({ hasText: "调整本次使用的资料" })
      .click();
    await page.getByLabel("本次使用的资料").selectOption("explicit");
    for (const id of [contract.id, payment.id]) {
      const doc = (await state()).documents.find((d: any) => d.id === id);
      await page
        .locator(".source-picker .checkbox-label")
        .filter({ hasText: doc.name })
        .filter({ hasText: "V" + doc.version })
        .getByRole("checkbox")
        .check();
    }
    await page
      .getByRole("button", { name: "核查履约与支付", exact: true })
      .click();
    await expect(page.locator(".notice.processing")).toHaveCount(0);
  };
  await selectRun(v1);
  s = await state();
  const prior = s.artifacts.filter((a: any) => a.scenarioId === "B05").at(-1);
  expect(
    prior.rows.find(
      (r: any) => r.contractId === "UI-CONTRACT" && r.ceiling !== undefined,
    ).ceiling,
  ).toBe(800000);
  await page.getByRole("button", { name: "人工确认", exact: true }).click();
  await submitHuman();
  const v2 = await uploadContract(0.7);
  s = await state();
  expect(s.artifacts.find((a: any) => a.id === prior.id).status).toBe("stale");
  expect(s.confirmations.find((c: any) => c.targetId === prior.id).valid).toBe(
    false,
  );
  const versionRow = page
    .locator("tr")
    .filter({ has: page.getByRole("button", { name: v2.name, exact: true }) })
    .filter({ has: page.getByText("V2", { exact: true }) });
  await versionRow
    .getByRole("button", { name: "确认版本", exact: true })
    .click();
  await submitHuman();
  await page.getByRole("button", { name: "比较版本", exact: true }).click();
  await page.getByLabel("比较前版本").selectOption(v1.id);
  await page.getByLabel("比较后版本").selectOption(v2.id);
  await page.getByRole("button", { name: "计算版本差异" }).click();
  await expect(
    page.getByRole("dialog", { name: "操作结果与差异" }),
  ).toContainText("0.7");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "留存资料清单" }).click();
  await submitHuman();
  await expect(
    page.getByRole("dialog", { name: "操作结果与差异" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  expect((await state()).snapshots.length).toBeGreaterThan(0);
  await selectRun(v2);
  s = await state();
  const current = s.artifacts.filter((a: any) => a.scenarioId === "B05").at(-1);
  expect(current.rows.find((r: any) => r.ceiling !== undefined).ceiling).toBe(
    700000,
  );
  // Office attachments contain real ZIP-based OOXML, not renamed text.
  for (const format of ["docx", "xlsx"]) {
    const res = await request.get(
      "/api/audit/export?artifactId=" + current.id + "&format=" + format,
    );
    expect(res.ok()).toBeTruthy();
    expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
  }
  await page.goto("/audit/#B04");
  await page
    .locator(".law-card")
    .first()
    .getByRole("button", { name: "记录适用性确认" })
    .click();
  await page
    .getByLabel("人工适用性说明 / 适用范围")
    .fill("已核对官方原文、施行期间及当前模拟事项条件，仅用于本演示项目");
  await submitHuman();
  expect(
    (await state()).laws.some((l: any) => l.status === "人工已确认"),
  ).toBeTruthy();
  await page.goto("/audit/#review");
  const taskCard = page
    .locator(".review-item")
    .filter({ has: page.getByRole("button", { name: "填写处理决定" }) })
    .first();
  await taskCard.getByRole("button", { name: "填写处理决定" }).click();
  await page.getByLabel("处理决定").selectOption("replied");
  await submitHuman();
  s = await state();
  expect(
    [...s.findings, ...s.tasks].some((r: any) => r.status === "replied"),
  ).toBeTruthy();
  // Select real confirmed provenance, then test/publish/reuse the generated capability through UI.
  await page.goto("/audit/#F05");
  await page
    .getByRole("button", { name: "整理经验与方法", exact: true })
    .click();
  await expect(page.locator(".notice.processing")).toHaveCount(0);
  s = await state();
  const capability = s.assets
    .filter((a: any) => a.library === "capability" && a.status === "candidate")
    .at(-1);
  for (const documentId of new Set(
    capability.sources.map((r: any) => r.documentId),
  )) {
    const res = await post("confirm", {
      ...human,
      targetType: "document",
      targetId: documentId,
    });
    expect(res.ok()).toBeTruthy();
  }
  await page.reload();
  const assetCard = page
    .locator(".library")
    .filter({
      has: page.getByRole("heading", { name: "审计方法库", exact: true }),
    })
    .locator(".asset-card")
    .last();
  await assetCard.getByRole("button", { name: "验证审计方法" }).click();
  await expect(page.locator(".notice.processing")).toHaveCount(0);
  expect(
    (await state()).assets
      .find((a: any) => a.id === capability.id)
      .testResults.every((t: any) => t.passed),
  ).toBeTruthy();
  await assetCard.getByRole("button", { name: "审核入库" }).click();
  await page
    .getByLabel("人工适用性说明 / 适用范围")
    .fill("同一实体的线性工程，米及元每米；新项目需重新提供输入并核验");
  await page.getByRole("checkbox", { name: "已完成脱敏核验" }).check();
  await page.getByRole("checkbox", { name: "已核验跨项目使用权限" }).check();
  await submitHuman();
  expect(
    (await state()).assets.find((a: any) => a.id === capability.id).status,
  ).toBe("published");
  await assetCard.getByRole("button", { name: "跨项目复用" }).click();
  await page.getByLabel("新项目编号").fill("BROWSER-NEW-DEMO-2027");
  await page.getByLabel("项目类型", { exact: true }).fill("linear-engineering");
  await page.getByLabel("新项目计量单位").fill("米");
  await page.getByLabel("经办人 / 核验人").fill(human.actor);
  await page.getByRole("button", { name: "生成适配清单" }).click();
  await expect(
    page.getByRole("dialog", { name: "操作结果与差异" }),
  ).toContainText("待新项目提供输入并验证");
  await expect(page.getByRole("dialog")).toContainText("复制的原事实核对");
  await page.screenshot({
    path: testInfo.outputPath("governed-reuse.png"),
    fullPage: true,
  });
});

test("source media: original-image zoom and visible OCR / ASR failures without model configuration", async ({
  page,
  request,
}, testInfo) => {
  await request.post("/api/audit/action", {
    data: { action: "seed", payload: { batch: "initial" } },
  });
  const state = await (await request.get("/api/audit/state")).json();
  const drawing = state.documents.find(
    (d: any) =>
      d.kind === "drawing" &&
      d.mimeType === "image/png" &&
      d.records.some((r: any) => r.region || r.locator?.includes("区域")),
  );
  expect(drawing).toBeTruthy();
  await page.goto("/audit/#documents");
  await page.getByRole("button", { name: drawing.name, exact: true }).click();
  await expect(page.getByLabel("原图缩放")).toBeVisible();
  await page.getByLabel("原图缩放").focus();
  for (let i = 0; i < 4; i++)
    await page.getByLabel("原图缩放").press("ArrowRight");
  await expect(
    page.getByRole("complementary", { name: "来源证据面板" }),
  ).toContainText("200%");
  await expect(page.getByLabel("来源记录标注区域")).toBeVisible();
  await page.getByRole("button", { name: "识别原件文字", exact: true }).click();
  await expect(page.locator(".evidence-panel .notice.processing")).toHaveCount(
    0,
    { timeout: 90000 },
  );
  await expect(
    page.locator(".evidence-panel").getByRole("alert"),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("drawing-source-and-model-error.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭来源", exact: true }).click();
  const audio = state.documents.find((d: any) =>
    d.mimeType.startsWith("audio/"),
  );
  expect(audio).toBeTruthy();
  await page.getByRole("button", { name: audio.name, exact: true }).click();
  await expect(page.locator(".evidence-panel audio")).toBeVisible();
  await page.getByRole("button", { name: "录音转文字", exact: true }).click();
  await expect(page.locator(".evidence-panel .notice.processing")).toHaveCount(
    0,
    { timeout: 90000 },
  );
  await expect(
    page.locator(".evidence-panel").getByRole("alert"),
  ).toBeVisible();
  const after = await (await request.get("/api/audit/state")).json();
  expect(
    after.runs.slice(-2).every((r: any) => r.status === "failed"),
  ).toBeTruthy();
});

test("persisted manual transcript segments seek the actual original audio", async ({
  page,
  request,
}) => {
  await request.post("/api/audit/action", {
    data: { action: "seed", payload: { batch: "initial" } },
  });
  const state = await (await request.get("/api/audit/state")).json();
  const original = state.documents.find((d: any) =>
    d.mimeType.startsWith("audio/"),
  );
  expect(original).toBeTruthy();
  const name = "人工分段定位验收-演示模拟数据.json";
  const records = [
    {
      id: "manual-segment",
      type: "media",
      sourceDocumentId: original.id,
      transcript: "人工录入的模拟分段，仅用于播放器定位验收",
      transcriptConfirmed: false,
      segments: [
        { start: 2, end: 4, text: "人工录入的模拟分段，仅用于播放器定位验收" },
      ],
    },
  ];
  const response = await request.post("/api/audit/action", {
    data: {
      action: "upload",
      payload: {
        name,
        mimeType: "application/json",
        kind: "media",
        source: "演示模拟数据；人工提供的分段测试记录，不是模型结果",
        contentBase64: Buffer.from(JSON.stringify({ records })).toString(
          "base64",
        ),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/audit/#documents");
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看派生前原件" }),
  ).toBeVisible();
  await expect(page.locator(".evidence-panel audio")).toBeVisible();
  await page.getByRole("button", { name: /2.0–4.0 秒 · 回放/ }).click();
  await expect
    .poll(() =>
      page
        .locator(".evidence-panel audio")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThanOrEqual(2);
  await page
    .locator(".evidence-panel audio")
    .evaluate((audio: HTMLAudioElement) => audio.pause());
});
