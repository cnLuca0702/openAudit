import { requireThat, id, now, unique, LABEL } from "./core.js";

export const isReportArtifact = (a) =>
  a.scenarioId === "C01" && (!a.productKind || a.productKind === "report");
export const isAuditNarrative = (a) =>
  isReportArtifact(a) ||
  (a.scenarioId === "B09" &&
    (!a.productKind || ["evidence", "workpaper"].includes(a.productKind)));

export const PRODUCTS = {
  extract: { title: "资料摘录", center: "documents", scenario: "A02" },
  plan: { title: "审计实施方案", center: "documents", scenario: "A03" },
  request: { title: "提供资料清单", center: "evidence", scenario: "B09" },
  interview: { title: "谈话大纲", center: "evidence", scenario: "B09" },
  evidence: { title: "审计取证单", center: "evidence", scenario: "B09" },
  workpaper: { title: "审计工作底稿", center: "workpapers", scenario: "B09" },
  management: {
    title: "重要管理事项记录",
    center: "workpapers",
    scenario: "C01",
  },
  progress: {
    title: "审计项目进展报告",
    center: "workpapers",
    scenario: "C01",
  },
  report: { title: "审计报告初稿", center: "workpapers", scenario: "C01" },
  adoption: { title: "采纳情况说明", center: "review-center", scenario: "C02" },
  department: {
    title: "部门复核意见书",
    center: "review-center",
    scenario: "D02",
  },
  meeting: { title: "业务会议纪要", center: "review-center", scenario: "D04" },
  legal: {
    title: "法规处审理意见书",
    center: "review-center",
    scenario: "D03",
  },
  reply: {
    title: "复核审理意见回复",
    center: "review-center",
    scenario: "D04",
  },
};
function select(s, p, key, list) {
  const ids = p[key] ?? [];
  requireThat(
    Array.isArray(ids) &&
      ids.length <= 80 &&
      ids.every((x) => typeof x === "string"),
    "引用资料格式无效或超过 80 项",
  );
  return [...new Set(ids)].map((key) => {
    const row = s[list].find((x) => x.id === key);
    requireThat(row, "选取的资料或成果不属于当前项目", 404);
    requireThat(
      !["stale", "superseded"].includes(row.status),
      "选取的资料或成果已变更，请先核对适用版本",
      409,
    );
    return row;
  });
}
export async function saveProduct(service, s, p, invalidate) {
  const definition = PRODUCTS[p.kind];
  requireThat(definition, "请选择文书类型");
  requireThat(typeof p.actor === "string" && p.actor.trim(), "请填写编制人");
  const documents = select(s, p, "documentIds", "documents");
  const findings = select(s, p, "findingIds", "findings");
  const artifacts = select(s, p, "artifactIds", "artifacts");
  requireThat(
    documents.length + findings.length + artifacts.length,
    "至少选取一项资料、问题疑点或前序文书",
  );
  if (p.kind === "workpaper")
    requireThat(
      artifacts.some((a) => a.productKind === "evidence"),
      "工作底稿须选取审计取证单",
    );
  if (["management", "progress"].includes(p.kind))
    requireThat(
      artifacts.some((a) => ["evidence", "workpaper"].includes(a.productKind)),
      "请选取取证单或工作底稿",
    );
  const previous =
    p.previousId && s.artifacts.find((a) => a.id === p.previousId);
  requireThat(
    !p.previousId || (previous && previous.productKind === p.kind),
    "原文书不存在或类型不符",
  );
  requireThat(
    !previous || !artifacts.some((a) => a.id === previous.id),
    "修订文书不能引用自身作为前序文书",
  );
  if (previous)
    requireThat(
      typeof p.reason === "string" && p.reason.trim(),
      "请填写修订说明",
    );
  const titles = p.titles ?? [p.title || definition.title];
  requireThat(
    Array.isArray(titles) &&
      titles.length > 0 &&
      titles.length <= 20 &&
      titles.every((t) => typeof t === "string" && t.trim() && t.length <= 160),
    "文书名称须为 1–160 字，单次最多拆分 20 份",
  );
  requireThat(
    titles.length === 1 || (p.kind === "evidence" && !previous),
    "仅新建取证单支持拆分多份",
  );
  const sources = unique([
    ...documents.map((d) => ({
      documentId: d.id,
      version: d.version,
      locator: "全文（选取资料）",
    })),
    ...findings.flatMap((f) => f.sources ?? []),
    ...artifacts.flatMap((a) => [
      { artifactId: a.id, version: a.version, locator: "引用文书" },
      ...(a.sources ?? []),
    ]),
  ]);
  const inputs = [
    ...documents.map((d) => ({
      id: d.id,
      name: d.name,
      text: d.text || JSON.stringify(d.records),
      version: d.version,
      status: d.status,
    })),
    ...findings.map((f) => ({
      id: f.id,
      name: f.title,
      text: JSON.stringify({
        detail: f.detail,
        sources: f.sources,
        status: f.status,
      }),
      version: f.version ?? 1,
      status: f.status,
    })),
    ...artifacts.map((a) => ({
      id: a.id,
      name: a.title,
      text: a.content,
      version: a.version,
      status: a.status,
    })),
  ];
  const run = {
    id: id("run"),
    scenarioId: definition.scenario,
    productKind: p.kind,
    input: structuredClone(p),
    startedAt: now(),
    status: "running",
    label: LABEL,
  };
  s.runs.push(run);
  try {
    const created = [];
    for (const title of titles) {
      let model;
      let content = String(p.content ?? "").trim();
      requireThat(content.length <= 200000, "文书正文过长");
      if (p.useModel) {
        requireThat(
          service.model?.analyze,
          "模型尚未配置，不能生成 AI 草稿",
          409,
        );
        model = await service.model.analyze({
          mode: "text",
          prompt: `请编写${definition.title}，标题为“${title}”。本次项目：${s.project.name}。用户编写要求：${String(p.instructions ?? "").slice(0, 8000)}。依据所选资料形成可编辑草稿，逐项标注资料编号、版本及可定位原文。资料不足的部分写“待补充”，不得虚构签字、谈话实录、会议召开、采纳或审批结果。法律依据只可引用已提供的原文并注明待人工核验。事实与文书的确认状态分别处理。${titles.length > 1 ? "本次拆分取证，每份只涉及其标题所指事项。" : ""}`,
          documents: inputs.map((d) => ({
            ...d,
            text: `系统来源状态：${JSON.stringify({ id: d.id, version: d.version, status: d.status })}；资料确认不代表全部事实已核实。\n${d.text}`,
          })),
        });
        requireThat(model?.text?.trim(), "模型未返回有效草稿", 502);
        content = model.text;
      }
      requireThat(content, "请填写文书正文，或勾选 AI 辅助起草");
      const artifact = {
        id: id("artifact"),
        scenarioId: definition.scenario,
        productKind: p.kind,
        center: definition.center,
        title: title.trim(),
        content,
        rows: unique([
          ...findings.map((f) => ({
            id: f.id,
            title: f.title,
            fact: f.detail,
            text: f.detail,
            factRef: f.id,
            amountYuan: f.amount ?? null,
            factStatus: f.status === "confirmed" ? "confirmed" : "pending",
            confirmation: f.status === "confirmed" ? "已确认事实" : "待核实",
            evidenceIds: (f.sources ?? [])
              .map((r) => r.documentId)
              .filter(Boolean),
            sources: f.sources ?? [],
          })),
          ...artifacts.flatMap((a) => a.rows ?? []),
          ...(!findings.length && !artifacts.some((a) => a.rows?.length)
            ? [
                {
                  id: id("narrative"),
                  title: title.trim(),
                  text: content,
                  fact: content,
                  factStatus: "pending",
                  confirmation: "待核实",
                  evidenceIds: documents.map((d) => d.id),
                  sources,
                },
              ]
            : []),
        ]),
        checks: [
          {
            code: "draft-needs-human-review",
            message:
              "编写草稿须逐项核对事实、引用位置和适用依据；文书确认不代替签发审批。",
            status: "待人工核验",
            blocking: false,
            sources,
          },
        ],
        sources,
        dependsOn: [...documents, ...findings, ...artifacts].map((x) => x.id),
        documentIds: documents.map((x) => x.id),
        findingIds: findings.map((x) => x.id),
        artifactIds: artifacts.map((x) => x.id),
        sourceSnapshot: inputs,
        status: "draft",
        version: (previous?.version ?? 0) + 1,
        previousId: previous?.id,
        createdAt: now(),
        actor: p.actor.trim(),
        reason: p.reason,
        runId: run.id,
        model,
        label: LABEL,
      };
      created.push(artifact);
    }
    if (previous) {
      invalidate(s, [previous.id], "引用文书已修订，请核对新版本");
      previous.status = "superseded";
    }
    s.artifacts.push(...created);
    run.status = "completed";
    run.artifactIds = created.map((a) => a.id);
    run.finishedAt = now();
    s.events.push({
      id: id("event"),
      type: "center-document-created",
      actor: p.actor,
      at: now(),
      detail: {
        kind: p.kind,
        artifactIds: run.artifactIds,
        previousId: previous?.id,
      },
      label: LABEL,
    });
    return { artifacts: created };
  } catch (error) {
    run.status = "failed";
    run.error = error.message;
    run.finishedAt = now();
    return {
      failure: {
        error: error.message,
        status: error.status ?? 422,
        code: "DRAFT_FAILED",
      },
      runId: run.id,
    };
  }
}
