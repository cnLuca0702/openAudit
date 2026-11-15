import { DocumentPreview } from "./preview.js";
import { readFile, realpath } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  Store,
  LABEL,
  AuditError,
  requireThat,
  now,
  id,
  hash,
  parse,
  MIME,
  refs,
  unique,
  markdown,
} from "./core.js";
import { SCENARIOS, executeScenario, testCapability } from "./scenarios.js";
import {
  workflowView,
  saveWorkflowRecord,
  validWorkflowRecord,
} from "./workflow.js";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MAX = 10 * 1024 * 1024;
const lists = {
  document: "documents",
  fact: "facts",
  artifact: "artifacts",
  finding: "findings",
  law: "laws",
  task: "tasks",
  asset: "assets",
};
function initial() {
  return {
    schemaVersion: 1,
    workflowRulesVersion: 1,
    revision: 0,
    project: {
      id: "DEMO-AUDIT-2027-006",
      name: "澄川市南岸片区雨污分流与道路更新工程",
      label: LABEL,
      datasetVersion: 0,
    },
    scenarios: SCENARIOS,
    documents: [],
    facts: [],
    findings: [],
    runs: [],
    artifacts: [],
    tasks: [],
    assets: [],
    laws: [],
    events: [],
    confirmations: [],
    snapshots: [],
  };
}
function event(s, type, detail, actor = "system") {
  s.events.push({
    id: id("event"),
    type,
    detail,
    actor,
    at: now(),
    label: LABEL,
  });
}
function target(s, p) {
  const list = lists[p.targetType];
  requireThat(list, "不支持的对象类型");
  const object = s[list].find((x) => x.id === p.targetId);
  requireThat(object, "目标不存在", 404);
  return object;
}
function human(p) {
  requireThat(
    typeof p.actor === "string" && p.actor.trim(),
    "请填写人工操作者",
  );
  requireThat(
    typeof p.reason === "string" && p.reason.trim(),
    "请填写确认或修改理由",
  );
}
function invalidate(s, seeds, reason) {
  const impacted = new Set(seeds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const list of [
      "facts",
      "artifacts",
      "findings",
      "tasks",
      "assets",
      "laws",
    ])
      for (const object of s[list]) {
        if (impacted.has(object.id)) continue;
        const hit =
          (object.sources ?? []).some((r) =>
            [r.documentId, r.factId, r.artifactId].some((x) => impacted.has(x)),
          ) || (object.dependsOn ?? []).some((x) => impacted.has(x));
        if (hit) {
          impacted.add(object.id);
          object.previousStatus = object.status;
          object.status = "stale";
          object.invalidatedAt = now();
          object.invalidationReason = reason;
          changed = true;
        }
      }
  }
  for (const confirmation of s.confirmations)
    if (impacted.has(confirmation.targetId) && confirmation.valid) {
      confirmation.valid = false;
      confirmation.invalidatedAt = now();
      confirmation.reasonInvalidated = reason;
    }
  event(s, "invalidation", { seeds, impacted: [...impacted], reason });
  return [...impacted];
}
function createFacts(s, d) {
  d.records.forEach((r, index) =>
    s.facts.push({
      id: id("fact"),
      key: r.id ?? `${d.logicalId}:${index + 1}`,
      value: r.amount ?? r.quantity ?? r.value ?? null,
      unit: r.unit,
      recordType: r.type ?? d.kind,
      record: structuredClone(r),
      documentId: d.id,
      recordIndex: index,
      sources: [
        {
          documentId: d.id,
          version: d.version,
          locator: r.locator ?? `记录 ${index + 1}`,
        },
        ...(d.parentDocumentId
          ? [
              {
                documentId: d.parentDocumentId,
                version: s.documents.find(
                  (parent) => parent.id === d.parentDocumentId,
                )?.version,
                locator: d.parentLocator ?? "原件",
              },
            ]
          : []),
      ],
      status: "pending",
      version: 1,
      createdAt: now(),
      generation: d.recordOrigin,
      label: LABEL,
    }),
  );
}
function lawRecords(s, d) {
  if (d.kind !== "law") return;
  for (const r of d.records) {
    requireThat(
      typeof r.officialUrl === "string" && /^https:\/\//.test(r.officialUrl),
      "法规必须保留官方 HTTPS URL",
    );
    const hostname = new URL(r.officialUrl).hostname;
    requireThat(
      hostname.endsWith(".gov.cn") || hostname === "gov.cn",
      "法规来源必须为官方 gov.cn 域",
    );
    requireThat(r.effectiveFrom && r.excerpt, "法规必须注明施行日期和原文摘录");
    s.laws.push({
      ...r,
      id: r.id && !s.laws.some((law) => law.id === r.id) ? r.id : id("law"),
      logicalId: r.id ?? d.logicalId,
      status: "待人工核验",
      sources: [
        {
          documentId: d.id,
          version: d.version,
          locator: r.locator ?? r.article ?? "法规摘录",
        },
      ],
      version: d.version,
      label: LABEL,
    });
  }
}
export class AuditService {
  static async create(config = {}) {
    const service = new AuditService(config);
    await service.init();
    return service;
  }
  constructor(config) {
    this.config = {
      dataDir: resolve(ROOT, ".openaudit-data"),
      demoDir: resolve(ROOT, "demo"),
      clientDist: resolve(ROOT, "packages/client/dist"),
      ...config,
    };
    this.store = new Store(this.config.dataDir, initial);
    this.previewRenderer = new DocumentPreview(config.previewConverter);
    this.parser = config.parser;
    this.model = config.model;
  }
  async init() {
    await this.store.init();
    if (this.store.read().workflowRulesVersion !== 1) {
      await this.store.transaction((s) => {
        const changed = s.artifacts.filter(
          (a) =>
            ["A03", "C01", "C02", "E01", "F04"].includes(a.scenarioId) &&
            !["stale", "superseded"].includes(a.status),
        );
        const reason =
          "跟踪审计流程规则已校正，请按当前资料重新运行；原件和历史成果保留";
        for (const a of changed) {
          a.previousStatus = a.status;
          a.status = "stale";
          a.invalidationReason = reason;
          a.invalidatedAt = now();
        }
        if (changed.length)
          invalidate(
            s,
            changed.map((a) => a.id),
            reason,
          );
        s.workflowRulesVersion = 1;
        event(s, "workflow-rules-migrated", {
          version: 1,
          affected: changed.map((a) => a.id),
        });
      });
    }
    if (!this.parser) {
      try {
        this.parser = await import("../parsers/index.js");
      } catch (error) {
        if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
        this.parser = null;
      }
    }
    if (!this.model) {
      const module = await import(
        this.config.modelAdapter
          ? pathToFileURL(resolve(this.config.modelAdapter)).href
          : "../models/index.js"
      ).catch((error) => {
        if (error.code === "ERR_MODULE_NOT_FOUND") return null;
        throw error;
      });
      if (module)
        this.model = module.createModelAdapter(
          await module.loadModelConfig(this.config.modelConfigFile),
        );
    }
    return this;
  }
  state() {
    const s = this.store.read();
    s.scenarios = SCENARIOS;
    s.workflow = workflowView(s);
    s.capabilities = {
      model: this.model?.capabilities?.() ?? {},
      parsers: Boolean(this.parser),
    };
    return s;
  }
  async ingest(s, p, options = {}) {
    requireThat(
      typeof p.name === "string" && p.name.length > 0 && p.name.length <= 240,
      "文件名须为 1–240 字符",
    );
    requireThat(!/[\x00-\x1f]/.test(p.name), "文件名包含控制字符");
    const extension = extname(p.name).slice(1).toLowerCase();
    const mime = ["doc", "docx", "wps", "rtf", "odt"].includes(extension)
      ? MIME[extension]
      : (p.mimeType ?? MIME[extension]);
    requireThat(
      Object.values(MIME).includes(mime) ||
        [
          "application/zip",
          "image/webp",
          "image/gif",
          "audio/flac",
          "audio/ogg",
          "audio/mp4",
          "audio/webm",
          "audio/x-wav",
        ].includes(mime),
      "不支持的文件类型",
      415,
    );
    requireThat(
      typeof p.contentBase64 === "string" &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          p.contentBase64,
        ),
      "contentBase64 无效",
    );
    const bytes = Buffer.from(p.contentBase64, "base64");
    requireThat(
      bytes.length && bytes.length <= MAX,
      "文件大小须为 1 字节至 10 MiB",
      413,
    );
    let parsed = parse(bytes, mime, p.records);
    if (
      ![
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/json",
        "image/svg+xml",
      ].includes(mime) &&
      this.parser
    ) {
      const external = await this.parser.parseDocument({
        buffer: bytes,
        mimeType: mime,
        name: p.name,
      });
      if (external.entries) {
        requireThat(!options.inArchive, "不支持嵌套压缩包", 415);
        const parent = await this.ingestRaw(
          s,
          p,
          bytes,
          {
            text: "压缩包原件；各条目独立接收登记",
            records: [],
            parseStatus: "archive",
          },
          options,
        );
        const children = [];
        for (const entry of external.entries)
          children.push(
            await this.ingest(
              s,
              {
                name: entry.name,
                mimeType: MIME[extname(entry.name).slice(1).toLowerCase()],
                contentBase64: Buffer.from(entry.buffer).toString("base64"),
                kind: p.kind,
                source: `压缩包 ${parent.id} 条目 ${entry.name}`,
              },
              { ...options, inArchive: true },
            ),
          );
        parent.children = children.map((d) => d.id);
        return parent;
      }
      parsed = {
        ...external,
        records: p.records ?? external.records,
        parseStatus: p.records
          ? external.text?.trim()
            ? "parsed-with-supplied-records"
            : "supplied-records-needs-verification"
          : external.parseStatus,
      };
    }
    if (p.text && !parsed.text?.trim()) {
      parsed.text = parsed.text || String(p.text);
      parsed.textOrigin = "supplied-transcript";
    }
    return this.ingestRaw(s, p, bytes, parsed, options);
  }
  async ingestRaw(s, p, bytes, parsed, options) {
    const logicalId = p.logicalId ?? p.name;
    const versions = s.documents.filter((d) => d.logicalId === logicalId);
    const latest = versions.at(-1);
    const duplicate = s.documents.find((d) => d.sha256 === hash(bytes));
    if (options.seed && s.documents.some((d) => d.seedKey === options.seedKey))
      return s.documents.find((d) => d.seedKey === options.seedKey);
    const doc = {
      id: p.id && !s.documents.some((d) => d.id === p.id) ? p.id : id("doc"),
      name: p.name,
      logicalId,
      version: (latest?.version ?? 0) + 1,
      status: "pending",
      kind: p.kind ?? "unclassified",
      source: p.source ?? "用户上传；归属待人工确认",
      mimeType: p.mimeType ?? MIME[extname(p.name).slice(1)],
      sha256: await this.store.put(bytes),
      size: bytes.length,
      ...parsed,
      records: structuredClone(parsed.records ?? []),
      recordOrigin:
        options.recordOrigin ??
        (p.records ? "supplied-derived-records" : "parser"),
      parentDocumentId: p.parentDocumentId,
      parentLocator: p.parentLocator,
      createdAt: now(),
      previousId: latest?.id,
      duplicateOf: duplicate?.id,
      seedKey: options.seedKey,
      simulation: LABEL,
    };
    requireThat(doc.records.length <= 10000, "解析记录过多", 413);
    if (latest)
      invalidate(s, [latest.id], `收到 ${logicalId} 的新版本，须核实适用关系`);
    s.documents.push(doc);
    createFacts(s, doc);
    lawRecords(s, doc);
    s.project.datasetVersion++;
    event(s, "document-received", {
      id: doc.id,
      sha256: doc.sha256,
      version: doc.version,
      duplicateOf: doc.duplicateOf,
      recordOrigin: doc.recordOrigin,
    });
    return doc;
  }
  async seed(s, p) {
    const batch = p.batch ?? "initial";
    requireThat(
      ["initial", "feedback", "review", "rectification", "all"].includes(batch),
      "未知资料批次",
    );
    let manifest;
    try {
      manifest = JSON.parse(
        await readFile(join(this.config.demoDir, "manifest.json"), "utf8"),
      );
    } catch (e) {
      if (e.code === "ENOENT")
        throw new AuditError("演示资料 manifest.json 尚未安装", 409);
      throw e;
    }
    if (manifest.project)
      s.project = {
        ...s.project,
        ...manifest.project,
        label: LABEL,
        datasetVersion: s.project.datasetVersion,
      };
    const docs =
      manifest.documents ??
      Object.entries(manifest.batches ?? {}).flatMap(([name, ds]) =>
        ds.map((d) => ({ ...d, batch: name })),
      );
    requireThat(Array.isArray(docs), "资料清单 documents 格式无效");
    const imported = [];
    for (const d of docs.filter(
      (d) => batch === "all" || (d.batch ?? "initial") === batch,
    )) {
      const seedKey = d.id ?? `${d.path}:${d.version ?? 1}`;
      if (s.documents.some((x) => x.seedKey === seedKey)) continue;
      requireThat(
        typeof d.path === "string" && !/truth|真值|expected/i.test(d.path),
        "输入资料路径缺失或指向测试真值",
      );
      const root = await realpath(this.config.demoDir);
      const path = await realpath(resolve(root, d.path));
      requireThat(path.startsWith(root + sep), "资料路径超出 demo 目录");
      const bytes = await readFile(path);
      imported.push(
        (
          await this.ingest(
            s,
            {
              ...d,
              mimeType:
                d.mimeType ?? MIME[extname(d.path).slice(1).toLowerCase()],
              contentBase64: bytes.toString("base64"),
            },
            { seed: true, seedKey },
          )
        ).id,
      );
    }
    event(s, "seed", { batch, documentIds: imported });
    return { batch, documentIds: imported, imported: imported.length };
  }
  async run(s, scenarioId, p) {
    const run = {
      id: id("run"),
      scenarioId,
      input: structuredClone(p),
      startedAt: now(),
      status: "running",
      engine: "deterministic",
      label: LABEL,
    };
    s.runs.push(run);
    try {
      const execution = executeScenario(s, scenarioId, p);
      const { result, documents } = execution;
      let modelResult;
      if (p.useAI || p.useModel) {
        requireThat(this.model, "模型适配器未配置", 409);
        run.engine = "deterministic+model";
        const sourceIds = new Set(
          result.sources.map((source) => source.documentId),
        );
        const modelDocuments = p.documentIds
          ? documents
          : documents.filter(
              (document) =>
                sourceIds.has(document.id) ||
                execution.scenario.requiredKinds.includes(document.kind),
            );
        run.modelDocumentIds = modelDocuments.map((document) => document.id);
        const mode =
          p.options?.mode ??
          (["B06", "B07", "B08"].includes(scenarioId) &&
          modelDocuments.some(
            (d) =>
              /^image\/(png|jpeg|webp|gif)$/.test(d.mimeType) ||
              d.mimeType.startsWith("video/") ||
              d.mimeType === "application/pdf",
          )
            ? "vision"
            : "text");
        const inputs = [];
        const transcriptions = [];
        for (const d of modelDocuments) {
          if (d.mimeType.startsWith("audio/") && scenarioId === "B08") {
            const speech = await this.model.transcribe({
              buffer: await this.store.bytes(d.sha256),
              mimeType: d.mimeType,
              fileName: d.name,
            });
            transcriptions.push({
              documentId: d.id,
              version: d.version,
              ...speech,
            });
            inputs.push({
              id: d.id,
              name: d.name,
              text: `真实 ASR 转写（待人工核验）：${speech.text}\n分段：${JSON.stringify(speech.segments ?? [])}`,
              mimeType: "text/plain",
            });
          } else if (d.mimeType === "application/pdf" && mode === "vision") {
            requireThat(
              this.parser?.rasterizePDF,
              "未安装 PDF 页图转换器",
              409,
            );
            const pages = await this.parser.rasterizePDF({
              buffer: await this.store.bytes(d.sha256),
              pages: p.options?.pages,
            });
            for (const page of pages)
              inputs.push({
                id: `${d.id}@page${page.page}`,
                name: `${d.name} 第 ${page.page} 页`,
                text: `来源 ${d.id} v${d.version} 第 ${page.page} 页（共 ${page.pageCount} 页），原始页图`,
                ...page,
              });
          } else if (d.mimeType.startsWith("video/") && mode === "vision") {
            requireThat(
              this.parser?.extractVideoFrames,
              "未安装视频抽帧器",
              409,
            );
            const frames = await this.parser.extractVideoFrames({
              buffer: await this.store.bytes(d.sha256),
              name: d.name,
              seconds: p.options?.seconds ?? [0],
            });
            for (const frame of frames)
              inputs.push({
                id: `${d.id}@${frame.seconds}s`,
                name: `${d.name} ${frame.seconds}秒`,
                text: `来源 ${d.id} v${d.version} 时间码 ${frame.seconds}s`,
                ...frame,
              });
          } else
            inputs.push({
              id: d.id,
              name: d.name,
              text: d.text || JSON.stringify(d.records),
              mimeType: d.mimeType,
              ...(mode === "vision" &&
              /^image\/(png|jpeg|webp|gif)$/.test(d.mimeType)
                ? {
                    contentBase64: (await this.store.bytes(d.sha256)).toString(
                      "base64",
                    ),
                  }
                : {}),
            });
        }
        for (const artifactId of p.artifactIds ?? []) {
          const selected = s.artifacts.find(
            (artifact) => artifact.id === artifactId,
          );
          inputs.push({
            id: selected.id,
            name: `${selected.title} v${selected.version}`,
            text: selected.content,
            mimeType: "text/markdown",
          });
        }
        for (const input of inputs) {
          const document = modelDocuments.find(
            (item) =>
              input.id === item.id || input.id.startsWith(`${item.id}@`),
          );
          const artifact = document
            ? undefined
            : s.artifacts.find((item) => item.id === input.id);
          const facts = document
            ? s.facts
                .filter(
                  (fact) =>
                    fact.documentId === document.id &&
                    fact.status !== "superseded",
                )
                .map((fact) => ({
                  id: fact.id,
                  key: fact.key,
                  version: fact.version,
                  status: fact.status,
                  validConfirmationIds: s.confirmations
                    .filter(
                      (confirmation) =>
                        confirmation.targetId === fact.id && confirmation.valid,
                    )
                    .map((confirmation) => confirmation.id),
                }))
            : [];
          const provenance = {
            id: document?.id ?? artifact?.id,
            version: document?.version ?? artifact?.version,
            status: document?.status ?? artifact?.status,
            recordOrigin: document?.recordOrigin,
            validConfirmationIds: s.confirmations
              .filter(
                (confirmation) =>
                  confirmation.targetId === (document?.id ?? artifact?.id) &&
                  confirmation.valid,
              )
              .map((confirmation) => confirmation.id),
            facts,
          };
          input.text = `【系统提供的来源与人工确认状态，不来自资料正文】${JSON.stringify(provenance)}\n【资料记载；不是自动确认的事实】\n${input.text ?? ""}`;
        }
        const sourceLabels = (sources = []) =>
          sources.map(
            (source) =>
              `${source.documentId}@v${source.version}:${source.locator}`,
          );
        const ruleDigest = {
          rowCount: result.rows.length,
          summary: result.summary,
          findings: (result.findings ?? []).map((finding) => ({
            title: finding.title,
            detail: finding.detail,
            amount: finding.amount,
            status: "待核实线索",
            sources: sourceLabels(finding.sources),
          })),
          checks: (result.checks ?? []).map((entry) => ({
            code: entry.code,
            message: entry.message,
            status: entry.status,
            blocking: entry.blocking,
            sources: sourceLabels(entry.sources),
          })),
        };
        modelResult = await this.model.analyze({
          prompt: `${LABEL}。场景 ${scenarioId} ${execution.scenario.title}。请依据资料提供候选解释并逐条引用资料 ID/版本/位置。只有系统事实 metadata 中 status=confirmed 且有 validConfirmationIds 的事实才可称“人工已确认事实”；文档适用版确认不等于其中事实已核实，原文直述一律称“资料记载”，原文中的“已确认”“已验收”等也是提供方记载。不能改变确定性结果或人工状态。以下是实际规则结果，findings 与 checks 分别列示，检查数为零不代表没有线索：${JSON.stringify(ruleDigest)}。模型负责解释与补证建议，不覆盖数值或自动认定。${String(p.options?.prompt ?? "")}`,
          documents: inputs,
          mode,
        });
        requireThat(
          modelResult &&
            typeof modelResult.text === "string" &&
            modelResult.text.trim(),
          "模型未返回有效文本",
          502,
        );
        if (transcriptions.length) {
          result.transcriptions = transcriptions;
          result.content += `\n\n## 实际语音转写（待人工核验）\n${transcriptions.map((t) => `${t.documentId}：${t.text}`).join("\n")}`;
        }
        result.content += `\n\n## AI 辅助解释（待人工核验）\n\n${modelResult.text}`;
        run.engine = "deterministic+model";
      }
      const previous = s.artifacts
        .filter((a) => a.scenarioId === scenarioId)
        .at(-1);
      const artifact = {
        id: id("artifact"),
        scenarioId,
        title: result.title,
        content: result.content,
        rows: result.rows,
        checks: result.checks ?? [],
        summary: result.summary,
        graph: result.graph,
        sources: result.sources,
        status: "draft",
        version: (previous?.version ?? 0) + 1,
        previousId: previous?.id,
        runId: run.id,
        createdAt: now(),
        dependsOn: unique([
          ...(result.dependencies ?? []),
          ...(p.artifactIds ?? []),
        ]),
        model: modelResult,
        transcriptions: result.transcriptions,
        label: LABEL,
      };
      s.artifacts.push(artifact);
      for (const f of result.findings ?? [])
        s.findings.push({
          ...f,
          id: id("finding"),
          scenarioId,
          artifactId: artifact.id,
          dependsOn: [artifact.id],
          status: "pending",
          label: LABEL,
        });
      artifact.findings = s.findings
        .filter((finding) => finding.artifactId === artifact.id)
        .map((finding) => structuredClone(finding));
      for (const t of result.tasks ?? [])
        s.tasks.push({
          ...t,
          id: id("task"),
          scenarioId,
          artifactId: artifact.id,
          dependsOn: [artifact.id],
          label: LABEL,
        });
      for (const a of result.assetCandidates ?? [])
        s.assets.push({
          ...a,
          id: id("asset"),
          artifactId: artifact.id,
          dependsOn: [artifact.id],
          createdAt: now(),
          label: LABEL,
        });
      run.status = "succeeded";
      run.artifactId = artifact.id;
      run.finishedAt = now();
      event(s, "scenario-run", {
        runId: run.id,
        scenarioId,
        artifactId: artifact.id,
        engine: run.engine,
      });
      return { artifactId: artifact.id, runId: run.id };
    } catch (error) {
      run.status = "failed";
      run.finishedAt = now();
      run.error = error.message;
      event(s, "scenario-failed", {
        runId: run.id,
        scenarioId,
        error: run.error,
      });
      return {
        failure: {
          error: error.message,
          status: error.status ?? 422,
          code: error.code ?? "RUN_FAILED",
        },
        runId: run.id,
      };
    }
  }
  async action(input) {
    requireThat(
      input && typeof input === "object" && !Array.isArray(input),
      "请求必须是对象",
    );
    const { action, scenarioId } = input;
    const p = input.payload ?? {};
    requireThat(
      p && typeof p === "object" && !Array.isArray(p),
      "payload 必须是对象",
    );
    const response = await this.store.transaction(async (s) => {
      switch (action) {
        case "workflow-save": {
          human(p);
          const record = saveWorkflowRecord(s, p);
          if (record.kind === "issuance") {
            const artifact = s.artifacts.find((a) => a.id === record.reportId);
            const groups = new Map();
            for (const d of s.documents) {
              const versions = groups.get(d.logicalId) ?? [];
              versions.push(d);
              groups.set(d.logicalId, versions);
            }
            const documentIds = [...groups.values()]
              .map(
                (versions) =>
                  versions.find((d) => d.status === "confirmed") ??
                  versions.find((d) => d.status !== "superseded") ??
                  versions[0],
              )
              .filter((d) => d.kind !== "report" || d.id === record.reportId)
              .map((d) => d.id);
            const execution = executeScenario(s, "E01", {
              documentIds,
              artifactIds: artifact ? [artifact.id] : [],
              options: { reviewedReportId: record.reportId },
            });
            const blockers = execution.result.checks.filter((c) => c.blocking);
            requireThat(
              !blockers.length,
              `出具核验未通过：${blockers.map((c) => c.message).join("；")}`,
              409,
            );
            record.sources = unique([
              ...record.sources,
              ...execution.result.sources,
            ]);
            requireThat(
              validWorkflowRecord(s, record),
              "报告引用的证明版本尚未全部确认或已失效",
              409,
            );
          }
          const affected = s.artifacts.filter(
            (a) =>
              ["E01", "F04"].includes(a.scenarioId) && a.status !== "stale",
          );
          for (const a of affected) a.status = "stale";
          invalidate(
            s,
            affected.map((a) => a.id),
            "流程登记变化，请重新核验",
          );
          event(
            s,
            "workflow-recorded",
            {
              recordId: record.id,
              kind: record.kind,
              previousId: record.previousId,
            },
            p.actor,
          );
          return { record };
        }
        case "seed":
          return this.seed(s, p);
        case "upload":
          return { document: await this.ingest(s, p) };
        case "run":
          return this.run(s, scenarioId, p);
        case "confirm": {
          human(p);
          const object = target(s, p);
          requireThat(
            !["stale", "superseded"].includes(object.status),
            "来源已变化，需重算或修订后确认",
            409,
          );
          if (p.targetType === "artifact") {
            const rechecked = s.artifacts.some(
              (review) =>
                review.scenarioId === "E01" &&
                review.status !== "stale" &&
                review.dependsOn.includes(object.id) &&
                !review.checks.some((entry) => entry.blocking),
            );
            requireThat(
              !object.checks?.some(
                (x) =>
                  x.blocking &&
                  !(x.code === "human-revision-needs-recheck" && rechecked),
              ),
              "仍有阻断核验项，不能整体确认",
              409,
            );
          }
          if (p.targetType === "law") {
            requireThat(
              typeof p.scope === "string" && p.scope.trim(),
              "法规确认须说明适用范围",
            );
            object.applicabilityScope = p.scope;
          }
          if (p.targetType === "document") {
            for (const old of s.documents.filter(
              (d) =>
                d.logicalId === object.logicalId &&
                d.id !== object.id &&
                d.status === "confirmed",
            )) {
              old.status = "superseded";
              invalidate(s, [old.id], `人工确认适用资料 ${object.id}`);
            }
            for (const fact of s.facts.filter(
              (fact) =>
                fact.documentId === object.id && fact.status === "stale",
            ))
              fact.status = "pending";
            for (const law of s.laws.filter(
              (law) =>
                law.sources.some((source) => source.documentId === object.id) &&
                law.status === "stale",
            ))
              law.status = "待人工核验";
          }
          object.status = p.targetType === "law" ? "人工已确认" : "confirmed";
          const confirmation = {
            id: id("confirmation"),
            targetType: p.targetType,
            targetId: object.id,
            version: object.version ?? 1,
            actor: p.actor,
            reason: p.reason,
            scope: p.scope ?? "entire-object",
            at: now(),
            valid: true,
          };
          s.confirmations.push(confirmation);
          event(s, "human-confirmed", confirmation, p.actor);
          if (
            p.targetType === "artifact" &&
            !s.assets.some((a) => a.autoCandidateFor === object.id)
          )
            s.assets.push({
              id: id("asset"),
              autoCandidateFor: object.id,
              library: "knowledge",
              title: `${object.title} 的方法索引`,
              content: {
                scenarioId: object.scenarioId,
                checkTypes: unique(object.checks.map((c) => c.code)),
                artifactVersion: object.version,
              },
              sources: object.sources,
              dependsOn: [object.id],
              status: "candidate",
              scope: "仅本项目，跨项目使用前需脱敏和适用性审核",
              permission: "private",
              sourceConfirmed: true,
              version: 1,
              label: LABEL,
            });
          return { confirmation };
        }
        case "revise": {
          human(p);
          const object = target(s, p);
          requireThat(
            !(p.targetType === "fact" && object.recordType === "law"),
            "法规摘录修订请对原法规 document 建立新版本，保留官方出处和重新确认适用性",
          );
          requireThat(
            ["fact", "artifact", "document"].includes(p.targetType),
            "此对象不支持修订",
          );
          const patch = p.patch;
          requireThat(
            patch && typeof patch === "object" && !Array.isArray(patch),
            "patch 必须是对象",
          );
          const allowed =
            p.targetType === "fact"
              ? ["value", "unit", "record"]
              : p.targetType === "artifact"
                ? ["content", "rows"]
                : ["text", "records"];
          requireThat(
            Object.keys(patch).length &&
              Object.keys(patch).every((k) => allowed.includes(k)),
            "patch 包含不可修改的字段",
          );
          const affected = invalidate(s, [object.id], p.reason);
          const updated = {
            ...structuredClone(object),
            ...structuredClone(patch),
            id: id(p.targetType),
            previousId: object.id,
            version: (object.version ?? 1) + 1,
            status: p.targetType === "artifact" ? "draft" : "pending",
            createdAt: now(),
          };
          delete updated.invalidationReason;
          delete updated.invalidatedAt;
          delete updated.previousStatus;
          if (p.targetType === "fact") {
            updated.record = { ...object.record, ...patch.record };
            if ("value" in patch) {
              updated.record.value = patch.value;
              if ("amount" in updated.record)
                updated.record.amount = patch.value;
              else if ("quantity" in updated.record)
                updated.record.quantity = patch.value;
            }
            if ("unit" in patch) updated.record.unit = patch.unit;
            object.status = "superseded";
          }
          if (p.targetType === "document") {
            requireThat(Array.isArray(updated.records), "records 必须为数组");
            updated.recordOrigin = "human-revision";
            updated.originalSha256 = object.originalSha256 ?? object.sha256;
            updated.sha256 = await this.store.put(
              Buffer.from(
                JSON.stringify({
                  label: LABEL,
                  text: updated.text,
                  records: updated.records,
                  originalSha256: updated.originalSha256,
                }),
              ),
            );
            updated.mimeType = "application/json";
            updated.size = (await this.store.bytes(updated.sha256)).length;
            createFacts(s, updated);
            lawRecords(s, updated);
            s.project.datasetVersion++;
            object.status = "superseded";
          }
          if (p.targetType === "artifact") {
            if (patch.rows && !patch.content)
              updated.content = markdown(updated.title, updated.rows, []);
            updated.checks = [
              {
                id: id("check"),
                code: "human-revision-needs-recheck",
                message: "文稿已修改，请重新执行相关场景核验",
                status: "待复核",
                blocking: true,
                sources: updated.sources,
              },
            ];
            object.status = "stale";
          }
          s[lists[p.targetType]].push(updated);
          event(
            s,
            "human-revised",
            {
              targetId: object.id,
              newId: updated.id,
              affected,
              patch,
              reason: p.reason,
            },
            p.actor,
          );
          return { updated, affected };
        }
        case "resolve": {
          human(p);
          requireThat(
            ["finding", "task"].includes(p.targetType),
            "仅支持线索或任务处置",
          );
          const object = target(s, p);
          requireThat(object.status !== "stale", "来源变化，先重新核验", 409);
          requireThat(
            ["excluded", "implemented", "closed", "replied"].includes(
              p.decision,
            ),
            "不支持的处置决定",
          );
          if (["implemented", "closed"].includes(p.decision)) {
            requireThat(
              Array.isArray(p.evidenceIds) && p.evidenceIds.length > 0,
              "落实/销号必须引用有效证明",
            );
            for (const eid of p.evidenceIds)
              requireThat(
                s.documents.some(
                  (d) => d.id === eid && d.status === "confirmed",
                ) ||
                  s.artifacts.some(
                    (a) => a.id === eid && a.status === "confirmed",
                  ),
                "证明必须存在且经人工确认",
                409,
              );
            if (object.scenarioId === "F01" && p.decision === "closed") {
              const follow = s.artifacts
                .filter(
                  (a) => a.scenarioId === "F02" && a.status === "confirmed",
                )
                .at(-1);
              requireThat(
                follow?.rows.some(
                  (r) =>
                    r.issueId === object.issueId &&
                    r.recommendation === "可提请人工销号",
                ),
                "须先完成效果复查并确认可销号建议",
                409,
              );
            }
          }
          object.status = p.decision;
          object.resolution = {
            actor: p.actor,
            reason: p.reason,
            evidenceIds: p.evidenceIds ?? [],
            at: now(),
          };
          event(
            s,
            "human-resolved",
            { targetId: object.id, decision: p.decision, ...object.resolution },
            p.actor,
          );
          return { target: object };
        }
        case "publish": {
          human(p);
          const asset = s.assets.find((a) => a.id === p.assetId);
          requireThat(asset, "资产不存在", 404);
          requireThat(asset.status !== "stale", "资产来源失效", 409);
          requireThat(
            p.redacted === true && p.permissionConfirmed === true && p.scope,
            "必须确认脱敏、授权与适用范围",
          );
          requireThat(
            asset.sources.length &&
              asset.sources.every(
                (r) =>
                  s.documents.some(
                    (d) => d.id === r.documentId && d.status === "confirmed",
                  ) ||
                  s.facts.some(
                    (f) => f.id === r.factId && f.status === "confirmed",
                  ),
              ),
            "来源尚未经人工确认",
            409,
          );
          if (asset.library === "capability")
            requireThat(
              asset.testResults?.length &&
                asset.testResults.every((r) => r.passed) &&
                asset.testedHash === hash(asset.content),
              "能力须针对当前版本实际测试通过",
              409,
            );
          asset.status = "published";
          asset.scope = p.scope;
          asset.permission = "reviewed-cross-project";
          asset.publishedAt = now();
          asset.reviewedBy = p.actor;
          event(
            s,
            "asset-published",
            { assetId: asset.id, scope: p.scope, reason: p.reason },
            p.actor,
          );
          return { asset };
        }
        case "testAsset": {
          const asset = s.assets.find((a) => a.id === p.assetId);
          requireThat(
            asset && asset.library === "capability",
            "能力组件不存在",
            404,
          );
          requireThat(asset.status !== "stale", "资产失效，先重新生成", 409);
          asset.testResults = testCapability(asset);
          asset.testedHash = hash(asset.content);
          asset.testedAt = now();
          event(s, "capability-tested", {
            assetId: asset.id,
            results: asset.testResults,
          });
          return { asset };
        }
        case "reuse": {
          const asset = s.assets.find((a) => a.id === p.assetId);
          requireThat(
            asset?.status === "published",
            "只能复用已发布有效资产",
            409,
          );
          requireThat(
            p.targetProject?.id && p.targetProject.id !== s.project.id,
            "请指定不同的新模拟项目",
          );
          const result = {
            assetId: asset.id,
            targetProject: p.targetProject,
            method:
              asset.library === "capability"
                ? asset.content
                : { title: asset.title, scope: asset.scope },
            adaptation: [
              {
                condition: "工程类型",
                status:
                  p.targetProject.type === "linear-engineering"
                    ? "结构相容"
                    : "需核实项目类型",
              },
              {
                condition: "计量单位",
                status:
                  p.targetProject.unit === asset.content?.unit
                    ? "单位相容"
                    : "需要确认单位与换算",
              },
            ],
            copiedFacts: [],
            status: "待新项目提供输入并验证",
            label: LABEL,
          };
          event(s, "reuse-proposed", result, p.actor ?? "human");
          return result;
        }
        case "freeze": {
          human(p);
          const snapshot = {
            id: id("snapshot"),
            at: now(),
            actor: p.actor,
            reason: p.reason,
            documents: s.documents
              .filter((d) => d.status === "confirmed")
              .map((d) => ({ id: d.id, version: d.version, sha256: d.sha256 })),
            datasetVersion: s.project.datasetVersion,
          };
          requireThat(
            snapshot.documents.length,
            "请先确认至少一份适用资料",
            409,
          );
          s.snapshots.push(snapshot);
          event(s, "dataset-frozen", snapshot, p.actor);
          return snapshot;
        }
        case "compare": {
          const left = [...s.documents, ...s.artifacts].find(
              (x) => x.id === p.leftId,
            ),
            right = [...s.documents, ...s.artifacts].find(
              (x) => x.id === p.rightId,
            );
          requireThat(left && right, "对比版本不存在", 404);
          const a = (left.text ?? left.content ?? "").split("\n"),
            b = (right.text ?? right.content ?? "").split("\n");
          const changes = Array.from(
            { length: Math.max(a.length, b.length) },
            (_, i) => ({ line: i + 1, before: a[i] ?? "", after: b[i] ?? "" }),
          ).filter((r) => r.before !== r.after);
          return {
            leftId: left.id,
            rightId: right.id,
            sameBytes: left.sha256 && left.sha256 === right.sha256,
            changes,
            recordsBefore: left.records ?? left.rows,
            recordsAfter: right.records ?? right.rows,
          };
        }
        case "recognize": {
          const run = {
            id: id("run"),
            scenarioId: "A01",
            input: { action, ...p },
            status: "running",
            engine: "vision-model",
            startedAt: now(),
            label: LABEL,
          };
          s.runs.push(run);
          try {
            requireThat(this.model?.analyze, "图像模型未配置", 409);
            const document = s.documents.find(
              (item) => item.id === p.documentId,
            );
            requireThat(
              document &&
                (document.mimeType === "application/pdf" ||
                  /^image\/(png|jpeg|webp|gif)$/.test(document.mimeType)),
              "请选择 PDF 或 PNG/JPEG/WebP/GIF 原件",
              415,
            );
            const bytes = await this.store.bytes(document.sha256);
            let images;
            if (document.mimeType === "application/pdf") {
              requireThat(
                this.parser?.rasterizePDF,
                "未安装 PDF 页图转换器",
                409,
              );
              images = await this.parser.rasterizePDF({
                buffer: bytes,
                pages: p.pages,
              });
            } else
              images = [
                {
                  page: 1,
                  pageCount: 1,
                  mimeType: document.mimeType,
                  contentBase64: bytes.toString("base64"),
                },
              ];
            const recognition = await this.model.analyze({
              prompt: `${LABEL}。逐页识别所给原始图像的可见文字、表格与图示，逐项标记来源页码/区域。无法辨读请明确说明，不猜补金额、日期或印章真实性。输出是待人工核验的派生记录。`,
              mode: "vision",
              documents: images.map((page) => ({
                ...page,
                id: `${document.id}@page${page.page}`,
                name: `${document.name} 第 ${page.page} 页`,
                text: `原件 ${document.id} v${document.version}，第 ${page.page} 页 / 共 ${page.pageCount} 页`,
              })),
            });
            requireThat(
              typeof recognition?.text === "string" && recognition.text.trim(),
              "图像模型未返回有效识别内容",
              502,
            );
            const locator = images
              .map((page) => `第 ${page.page} 页`)
              .join("、");
            const derived = await this.ingest(
              s,
              {
                name: `${document.name}.识别.json`,
                mimeType: "application/json",
                kind: document.kind === "law" ? "unclassified" : document.kind,
                parentDocumentId: document.id,
                parentLocator: locator,
                source: `真实视觉识别 ${recognition.provider}/${recognition.model}；原件 ${document.id} v${document.version} ${locator}；待人工核验`,
                contentBase64: Buffer.from(
                  JSON.stringify({
                    label: LABEL,
                    records: [
                      {
                        id: `${document.id}-recognition`,
                        type:
                          document.kind === "law"
                            ? "unclassified"
                            : document.kind,
                        description: recognition.text,
                        transcript: recognition.text,
                        transcriptConfirmed: false,
                        locator,
                        sourceDocumentId: document.id,
                      },
                    ],
                  }),
                ).toString("base64"),
              },
              { recordOrigin: "model-candidate" },
            );
            derived.model = recognition;
            Object.assign(run, {
              status: "succeeded",
              finishedAt: now(),
              documentId: derived.id,
            });
            event(s, "original-recognized", {
              runId: run.id,
              sourceId: document.id,
              derivedId: derived.id,
              pages: images.map((page) => page.page),
            });
            return { document: derived, recognition };
          } catch (error) {
            Object.assign(run, {
              status: "failed",
              finishedAt: now(),
              error: error.message,
            });
            event(s, "recognition-failed", {
              runId: run.id,
              error: error.message,
            });
            return {
              failure: {
                error: error.message,
                status: error.status ?? 422,
                code: "RECOGNITION_FAILED",
              },
              runId: run.id,
            };
          }
        }
        case "transcribe": {
          const run = {
            id: id("run"),
            scenarioId: "B08",
            input: { action, ...p },
            status: "running",
            engine: "speech-model",
            startedAt: now(),
            label: LABEL,
          };
          s.runs.push(run);
          try {
            requireThat(this.model?.transcribe, "语音模型未配置", 409);
            const d = s.documents.find((d) => d.id === p.documentId);
            requireThat(
              d && d.mimeType.startsWith("audio/"),
              "请选择已上传音频",
              404,
            );
            const result = await this.model.transcribe({
              buffer: await this.store.bytes(d.sha256),
              mimeType: d.mimeType,
              fileName: d.name,
            });
            const derived = await this.ingest(
              s,
              {
                name: `${d.name}.转写.json`,
                mimeType: "application/json",
                contentBase64: Buffer.from(
                  JSON.stringify({
                    records: [
                      {
                        id: `${d.id}-transcript`,
                        type: "media",
                        transcript: result.text,
                        transcriptConfirmed: false,
                        locator: result.segments?.length
                          ? "模型返回分段时间码"
                          : "时间码未提供",
                        segments: result.segments,
                        sourceDocumentId: d.id,
                      },
                    ],
                  }),
                ).toString("base64"),
                kind: "media",
                parentDocumentId: d.id,
                parentLocator: result.segments?.length
                  ? "ASR 分段时间码"
                  : "原始音频，时间码待核",
                source: `真实 ASR ${result.provider}/${result.model}；来源 ${d.id} v${d.version}`,
              },
              { recordOrigin: "model-candidate" },
            );
            derived.parentDocumentId = d.id;
            derived.model = result;
            event(s, "audio-transcribed", {
              sourceId: d.id,
              derivedId: derived.id,
            });
            Object.assign(run, {
              status: "succeeded",
              finishedAt: now(),
              documentId: derived.id,
            });
            return { document: derived, transcription: result };
          } catch (error) {
            Object.assign(run, {
              status: "failed",
              finishedAt: now(),
              error: error.message,
            });
            event(s, "transcription-failed", {
              runId: run.id,
              error: error.message,
            });
            return {
              failure: {
                error: error.message,
                status: error.status ?? 422,
                code: "TRANSCRIPTION_FAILED",
              },
              runId: run.id,
            };
          }
        }
        case "reset": {
          requireThat(
            p.confirmation === "重置演示项目",
            "重置需要准确输入确认文字",
            409,
          );
          const backup = await this.store.snapshot(s);
          const revision = s.revision;
          for (const key of Object.keys(s)) delete s[key];
          Object.assign(s, initial(), { revision });
          event(s, "project-reset", { backup, label: LABEL });
          return { backup };
        }
        default:
          throw new AuditError("未知 action");
      }
    });
    if (response.result?.failure)
      throw Object.assign(
        new AuditError(
          response.result.failure.error,
          response.result.failure.status,
          response.result.failure.code,
        ),
        { runId: response.result.runId },
      );
    response.state.scenarios = SCENARIOS;
    response.state.workflow = workflowView(response.state);
    response.state.capabilities = this.state().capabilities;
    return response;
  }
  async preview(documentId) {
    return this.previewRenderer.open(await this.original(documentId));
  }
  async original(documentId) {
    const d = this.store.read().documents.find((d) => d.id === documentId);
    requireThat(d, "资料不存在", 404);
    return {
      name: d.name,
      mimeType: d.mimeType,
      bytes: await this.store.bytes(d.sha256),
    };
  }
  async export(artifactId, format = "md") {
    const a = this.store.read().artifacts.find((a) => a.id === artifactId);
    requireThat(a, "成果不存在", 404);
    requireThat(
      ["json", "md", "csv", "docx", "xlsx"].includes(format),
      "不支持的导出格式",
    );
    const tabularRows = [
      ...a.rows,
      ...(a.findings ?? []).map((finding) => ({
        rowType: "候选线索",
        id: finding.id,
        title: finding.title,
        detail: finding.detail,
        amountYuan: finding.amount,
        status: finding.status,
        sources: finding.sources,
      })),
    ];
    if (["docx", "xlsx"].includes(format)) {
      const exporters = await import("../parsers/export.js");
      return {
        name: `${a.scenarioId}-v${a.version}.${format}`,
        mimeType: MIME[format],
        bytes:
          format === "docx"
            ? await exporters.createWord(a)
            : await exporters.createWorkbook(a),
      };
    }
    let content;
    if (format === "json")
      content = JSON.stringify({ label: LABEL, ...a }, null, 2);
    else if (format === "md")
      content = `${a.content}\n\n## 来源索引（绑定版本）\n${a.sources.map((r) => `- ${r.documentId} v${r.version} · ${r.locator}`).join("\n")}\n\n状态：${a.status}；版本：${a.version}；${LABEL}\n`;
    else {
      const keys = unique(tabularRows.flatMap(Object.keys));
      const quote = (v) =>
        `"${String(typeof v === "object" ? JSON.stringify(v) : (v ?? ""))
          .replace(/^[=+@-]/, "'$&")
          .replace(/"/g, '""')}"`;
      content = `\uFEFF${quote(LABEL)}\r\n${keys.map(quote).join(",")}\r\n${tabularRows.map((r) => keys.map((k) => quote(r[k])).join(",")).join("\r\n")}`;
    }
    return {
      name: `${a.scenarioId}-v${a.version}.${format}`,
      mimeType:
        format === "json"
          ? "application/json; charset=utf-8"
          : format === "csv"
            ? "text/csv; charset=utf-8"
            : "text/markdown; charset=utf-8",
      bytes: Buffer.from(content),
    };
  }
}
