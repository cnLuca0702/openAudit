import { test, expect } from "@playwright/test";
function twoPagePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...[1, 2].map((page) => {
      const text = `BT /F1 24 Tf 50 700 Td (DEMO DATA ONLY - PAGE ${page}) Tj ET`;
      return `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
    }),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 8\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("");
  pdf += `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test("original PDF pages, zoom, excerpts, original download and small screens", async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const uploaded = await request.post("/api/audit/action", {
    data: {
      action: "upload",
      payload: {
        name: "演示模拟数据-两页原件.pdf",
        contentBase64: twoPagePdf().toString("base64"),
      },
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  const state = await (await request.get("/api/audit/state")).json();
  const doc = state.documents.find(
    (d: any) => d.name === "演示模拟数据-两页原件.pdf",
  );
  expect(doc).toBeTruthy();
  await page.goto("/audit/#documents");
  await page.getByLabel("查看范围").selectOption("all");
  const row = page
    .getByRole("table", { name: "审计资料目录" })
    .locator("tbody tr")
    .filter({ hasText: doc.name })
    .first();
  await row.getByRole("button", { name: "查看原文", exact: true }).click();
  const canvas = page.locator(".document-preview canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  expect(
    await canvas.evaluate((c: HTMLCanvasElement) => {
      const data = c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height).data;
      let nonWhite = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] < 180 && data[i + 3]) nonWhite++;
      return nonWhite;
    }),
  ).toBeGreaterThan(100);
  const initialWidth = await canvas.evaluate(
    (c) => c.getBoundingClientRect().width,
  );
  await page.getByLabel("原文缩放").selectOption("150");
  await expect
    .poll(async () => canvas.evaluate((c) => c.getBoundingClientRect().width))
    .toBeGreaterThan(initialWidth * 1.4);
  await page.getByLabel("原文缩放").selectOption("100");
  await expect(page.getByLabel("原文页码").locator("option")).toHaveCount(2);
  {
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(page.getByLabel("原文页码")).toHaveValue("2");
    await expect(canvas).toHaveAttribute("data-rendered", "true");
    await page.getByRole("button", { name: "上一页", exact: true }).click();
  }
  await page.getByRole("button", { name: "文字摘录", exact: true }).click();
  await expect(page.locator(".source-text")).toBeVisible();
  await page.getByRole("button", { name: "原文", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  const preview = await request.get("/api/audit/preview?id=" + doc.id);
  const original = await request.get("/api/audit/file?id=" + doc.id);
  expect(await preview.body()).toEqual(await original.body());
  await page.screenshot({ path: info.outputPath("original-pdf-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  await expect(page.getByLabel("原文页码")).toBeVisible();
  const panel = await page
    .getByRole("complementary", { name: "来源证据面板" })
    .boundingBox();
  expect(panel!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("original-pdf-mobile.png") });
  expect(errors).toEqual([]);
});

test("damaged WPS shows recoverable error and original download remains available", async ({
  page,
  request,
}) => {
  const uploaded = await request.post("/api/audit/action", {
    data: {
      action: "upload",
      payload: {
        name: "演示模拟数据-损坏原件.wps",
        contentBase64: Buffer.from("damaged").toString("base64"),
      },
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  await page.goto("/audit/#documents");
  const row = page
    .getByRole("table", { name: "审计资料目录" })
    .locator("tbody tr")
    .filter({ hasText: "演示模拟数据-损坏原件.wps" });
  await row.getByRole("button", { name: "查看原文", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("文件格式无法识别");
  await expect(page.getByRole("button", { name: "重新打开" })).toBeVisible();
  const download = page.getByRole("link", { name: "下载原始资料" });
  expect(
    (await request.get((await download.getAttribute("href"))!)).ok(),
  ).toBeTruthy();
});
