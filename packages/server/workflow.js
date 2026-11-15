import { isReportArtifact } from "./centers.js";
import { readFileSync } from "node:fs";
import { date, number, requireThat, id, now, check } from "./core.js";

export const REFERENCE = JSON.parse(
  readFileSync(
    new URL("../../docs/source/tracking-reference.json", import.meta.url),
    "utf8",
  ),
);
export const QUALITY = ["部门复核", "业务会议", "法规审理"];
export const ARCHIVE_GROUPS = ["结论类", "证明类", "立项类", "备查类"];
const field = (key, label, type = "text", options) => ({
  key,
  label,
  type,
  options,
});
export const WORKFLOW_FORMS = [
  {
    kind: "subject",
    title: "被审计单位",
    fields: [field("name", "单位名称"), field("role", "单位职责")],
  },
  {
    kind: "milestone",
    title: "工作节点",
    fields: [
      field("title", "节点名称"),
      field("stage", "工作阶段", "select", REFERENCE.stages),
      field("date", "办理日期", "date"),
      field("responsible", "责任主体"),
      field("outcome", "完成情况及形成材料"),
    ],
  },
  {
    kind: "receipt",
    title: "送达回证",
    fields: [
      field("subjectId", "签收单位", "subject"),
      field("documentType", "送达文种", "select", [
        "审计通知书",
        "征求意见书",
        "审计报告",
      ]),
      field("documentNumber", "文号"),
      field("date", "实际签收日期", "date"),
      field("signedBy", "签收人"),
      field(
        "deadlineDays",
        "文书规定期限天数（留空采用参考值）",
        "optionalNumber",
      ),
      field("deadlineUnit", "期限单位（留空采用参考值）", "optionalSelect", [
        "工作日",
        "自然日",
      ]),
      field("reportId", "对应报告版本（报告送达必选）", "reportOptional"),
    ],
  },
  {
    kind: "quality",
    title: "签发前质量控制",
    fields: [
      field("control", "审核环节", "select", QUALITY),
      field("reportId", "被审核报告版本", "report"),
      field("date", "签字日期", "date"),
      field("signedBy", "签字责任人 / 会议参加人"),
      field("conclusion", "复核结论与意见落实情况"),
      field("answers", "部门复核八项逐项答复", "answers"),
    ],
  },
  {
    kind: "evidenceChain",
    title: "方案、证据、底稿与报告对应关系",
    fields: [
      field("planItem", "实施方案事项序号"),
      field("issueId", "报告问题序号"),
      field("title", "问题名称"),
      field("evidenceSheetNumber", "取证单编号"),
      field("workpaperIndex", "底稿索引号"),
      field("provider", "证据提供人签字"),
      field("entitySeal", "被审计单位签章核对说明"),
      field("reviewer", "底稿审核人"),
      field("auditProcess", "审计过程"),
      field("fact", "认定事实"),
      field("basis", "定性依据（适用性另行核验）"),
      field("opinion", "处理意见"),
      field("reportId", "对应报告版本", "report"),
      field("originalIds", "第一层：原始资料", "documents"),
      field("evidenceSheetIds", "第二层：取证单", "documents"),
      field("workpaperIds", "第三层：工作底稿", "documents"),
    ],
  },
  {
    kind: "redline",
    title: "修改留痕稿与定稿",
    fields: [
      field("documentType", "文书类型", "select", [
        "审计通知书",
        "审计实施方案",
        "征求意见书",
        "审计报告",
      ]),
      field("date", "定稿日期", "date"),
      field("beforeText", "修改前原文", "textarea"),
      field("afterText", "修改后原文", "textarea"),
      field("changeBasis", "修改依据与意见编号"),
      field("draftIds", "修改留痕稿原件", "documents"),
      field("finalIds", "定稿原件", "documents"),
    ],
  },
  {
    kind: "issuance",
    title: "签发用印登记",
    fields: [
      field("reportId", "正式报告版本", "report"),
      field("documentNumber", "正式文号"),
      field("date", "签发日期", "date"),
      field("drafter", "拟稿人"),
      field("departmentReviewer", "主办处室复核人"),
      field("relatedReviewer", "相关处室审核人"),
      field("leader", "分管领导审核人"),
      field("signer", "签发人"),
      field("sealRegister", "用印与发文登记号"),
      field("recipients", "主送、抄报、抄送及印发份数"),
    ],
  },
  {
    kind: "archive",
    title: "档案条目与移交",
    fields: [
      field("title", "档案条目名称"),
      field("group", "档案单元", "select", ARCHIVE_GROUPS),
      field("volume", "案卷号"),
      field("catalogue", "全宗号 / 目录号"),
      field("pageStart", "起始页", "number"),
      field("pageEnd", "终止页", "number"),
      field("retention", "保管期限"),
      field("date", "移交日期", "date"),
      field("receiver", "档案接收人"),
    ],
  },
];
const active = (s, kind) =>
  (s.workflowRecords ?? []).filter(
    (r) => !r.supersededBy && (!kind || r.kind === kind),
  );
const report = (s, reportId) =>
  s.documents.find((d) => d.id === reportId && d.kind === "report") ??
  s.artifacts.find((a) => a.id === reportId && isReportArtifact(a));
export function validWorkflowRecord(s, r) {
  return (
    !r.supersededBy &&
    (r.kind !== "issuance" ||
      qualityChecks(s, r.reportId, r.date).length === 0) &&
    r.sources.every(
      (ref) =>
        s.documents.some(
          (d) =>
            d.id === ref.documentId &&
            d.version === ref.version &&
            d.status === "confirmed",
        ) &&
        (!ref.factId ||
          s.facts.some(
            (f) =>
              f.id === ref.factId &&
              !["stale", "superseded"].includes(f.status),
          )),
    ) &&
    (!r.reportId || report(s, r.reportId)?.status === "confirmed")
  );
}
export function calculateDeadline(start, days, unit = "calendar", calendar) {
  if (
    !date(start) ||
    !Number.isInteger(days) ||
    days < 0 ||
    days > 3660 ||
    !["calendar", "working"].includes(unit)
  )
    return { dueDate: null, deadlineStatus: "期限参数待核" };
  let cursor = new Date(start + "T00:00:00Z");
  let complete =
    unit === "calendar" ||
    Boolean(
      calendar &&
        date(calendar.from) &&
        date(calendar.to) &&
        calendar.from <= start &&
        calendar.confirmed === true,
    );
  for (let counted = 0, n = 0; counted < days && n < 15000; n++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = cursor.toISOString().slice(0, 10);
    if (unit === "working") {
      if (!calendar || iso > calendar.to) complete = false;
      const workday =
        calendar?.workdays?.includes(iso) ||
        (!calendar?.holidays?.includes(iso) &&
          cursor.getUTCDay() !== 0 &&
          cursor.getUTCDay() !== 6);
      if (!workday) continue;
    }
    counted++;
  }
  return {
    dueDate: cursor.toISOString().slice(0, 10),
    deadlineStatus: complete
      ? "按登记规则计算，待核对文书"
      : "仅工作周估算，节假日调休待核",
  };
}
export function qualityChecks(s, reportId, atDate) {
  return QUALITY.flatMap((control) => {
    const found = active(s, "quality").find(
      (r) =>
        r.control === control &&
        r.reportId === reportId &&
        validWorkflowRecord(s, r) &&
        (!atDate || r.date <= atDate),
    );
    return found
      ? []
      : [
          check(
            "quality-gate",
            `${control}：缺少对应报告版本的有效签字记录与证明`,
            [],
            "待补正",
            true,
          ),
        ];
  });
}
export function saveWorkflowRecord(s, p) {
  const schema = WORKFLOW_FORMS.find((x) => x.kind === p.kind);
  requireThat(schema, "未知流程记录类型");
  requireThat(
    typeof p.actor === "string" &&
      p.actor.trim() &&
      typeof p.reason === "string" &&
      p.reason.trim(),
    "请填写登记人和核验依据",
  );
  const previous = p.replacesId
    ? active(s, p.kind).find((r) => r.id === p.replacesId)
    : undefined;
  if (p.replacesId) requireThat(previous, "待修订流程记录不存在", 404);
  const row = {
    id: id("workflow"),
    kind: p.kind,
    actor: p.actor.trim(),
    reason: p.reason.trim(),
    createdAt: now(),
    sources: [],
  };
  for (const f of schema.fields) {
    const v = p[f.key];
    if (f.type.startsWith("optional")) {
      if (v === undefined || v === "") continue;
      if (f.type === "optionalNumber") {
        requireThat(
          Number.isInteger(number(v)) && number(v) >= 0 && number(v) <= 3660,
          "期限须为0至3660天",
        );
        row[f.key] = number(v);
      } else {
        requireThat(f.options.includes(v), "期限单位无效");
        row[f.key] = v;
      }
      continue;
    }
    if (f.type === "reportOptional") {
      row[f.key] = typeof v === "string" ? v.trim() : "";
      continue;
    }
    if (f.type === "answers" && p.control !== "部门复核") {
      row.answers = [];
      continue;
    }
    if (["documents", "answers"].includes(f.type)) {
      requireThat(
        Array.isArray(v) &&
          v.length &&
          v.every((x) => typeof x === "string" && x.trim()),
        `${f.label}不能为空`,
      );
      if (f.type === "answers")
        requireThat(v.length === 8, "部门复核须逐项填写八项答复");
      row[f.key] = [...new Set(v.map((x) => x.trim()))];
      if (f.type === "answers") row[f.key] = v.map((x) => x.trim());
    } else if (f.type === "number") {
      requireThat(
        Number.isInteger(number(v)) && number(v) > 0,
        `${f.label}须为正整数`,
      );
      row[f.key] = number(v);
    } else {
      requireThat(
        typeof v === "string" && v.trim() && v.length <= 20000,
        `${f.label}不能为空或过长`,
      );
      row[f.key] = v.trim();
      if (f.type === "date") requireThat(date(v), `${f.label}无效`);
      if (f.type === "select")
        requireThat(f.options.includes(v), `${f.label}选项无效`);
    }
  }
  if (row.kind === "subject")
    requireThat(
      !active(s, "subject").some(
        (r) => r.name === row.name && r.id !== p.replacesId,
      ),
      "被审计单位已登记",
    );
  if (row.kind === "subject")
    row.subjectKey = previous?.subjectKey ?? previous?.id ?? row.id;
  if (row.subjectId) {
    const subject = active(s, "subject").find(
      (r) => r.id === row.subjectId || r.subjectKey === row.subjectId,
    );
    requireThat(subject, "签收单位未登记");
    row.subjectId = subject.subjectKey ?? subject.id;
  }
  if (row.kind === "receipt" && row.documentType === "审计报告")
    requireThat(row.reportId, "报告送达须指定报告版本");
  if (row.reportId)
    requireThat(
      report(s, row.reportId)?.status === "confirmed",
      "报告须存在且已确认具体版本",
      409,
    );
  requireThat(
    p.evidenceIds === undefined ||
      (Array.isArray(p.evidenceIds) &&
        p.evidenceIds.every((x) => typeof x === "string")),
    "证明编号须为数组",
  );
  const evidenceIds = [
    ...new Set([
      ...(p.evidenceIds ?? []),
      ...schema.fields
        .filter((f) => f.type === "documents")
        .flatMap((f) => row[f.key]),
    ]),
  ];
  requireThat(
    row.kind === "subject" || evidenceIds.length,
    "流程记录须引用原件证明",
  );
  for (const docId of evidenceIds) {
    const d = s.documents.find((d) => d.id === docId);
    requireThat(
      d?.status === "confirmed",
      "证明资料须存在且已确认适用版本",
      409,
    );
    row.sources.push({
      documentId: d.id,
      version: d.version,
      locator: "流程登记引用原件",
    });
  }
  if (row.kind === "archive")
    requireThat(row.pageEnd >= row.pageStart, "终止页不得小于起始页");
  if (row.kind === "evidenceChain") {
    requireThat(
      new Set([
        ...row.originalIds,
        ...row.evidenceSheetIds,
        ...row.workpaperIds,
        row.reportId,
      ]).size ===
        row.originalIds.length +
          row.evidenceSheetIds.length +
          row.workpaperIds.length +
          1,
      "方案、证据、底稿与报告对应关系须分别引用原始资料、取证单、底稿及报告",
    );
  }
  if (row.kind === "redline")
    requireThat(
      !row.draftIds.some((x) => row.finalIds.includes(x)),
      "修改留痕稿与定稿须分别保留原件",
    );
  if (row.kind === "issuance") {
    const gaps = qualityChecks(s, row.reportId, row.date);
    requireThat(!gaps.length, gaps.map((x) => x.message).join("；"), 409);
  }
  if (p.replacesId) {
    const old = active(s, row.kind).find((r) => r.id === p.replacesId);
    requireThat(old, "待修订流程记录不存在", 404);
    old.supersededBy = row.id;
    row.previousId = old.id;
  }
  s.workflowRecords ??= [];
  s.workflowRecords.push(row);
  s.workflowRevision = (s.workflowRevision ?? 0) + 1;
  return row;
}
export function workflowView(s) {
  const rows = active(s).map((r) => ({
    ...r,
    status: validWorkflowRecord(s, r)
      ? "登记有效，外部签章据原件核对"
      : "来源或报告版本变化，待重新核验",
  }));
  const subjects = rows.filter((r) => r.kind === "subject");
  const receipts = subjects.flatMap((subject) =>
    ["审计通知书", "征求意见书", "审计报告"].map((documentType) => {
      const r = rows
        .filter(
          (x) =>
            x.kind === "receipt" &&
            x.subjectId === (subject.subjectKey ?? subject.id) &&
            x.documentType === documentType,
        )
        .at(-1);
      const valid = r && validWorkflowRecord(s, r);
      const deadline =
        valid && documentType !== "审计通知书"
          ? calculateDeadline(
              r.date,
              r.deadlineDays ?? (documentType === "征求意见书" ? 10 : 60),
              r.deadlineUnit
                ? r.deadlineUnit === "工作日"
                  ? "working"
                  : "calendar"
                : documentType === "征求意见书"
                  ? "working"
                  : "calendar",
            )
          : { dueDate: null, deadlineStatus: "" };
      return {
        id: `${subject.id}:${documentType}`,
        subject: subject.name,
        documentType,
        receiptDate: r?.date ?? "",
        ...deadline,
        status: !r ? "缺少送达回证" : r.status,
        sources: r?.sources ?? [],
      };
    }),
  );
  const archive = ARCHIVE_GROUPS.map((group) => {
    const entries = rows.filter(
      (r) => r.kind === "archive" && r.group === group,
    );
    return {
      id: group,
      group,
      registeredCount: entries.length,
      validCount: entries.filter((r) => validWorkflowRecord(s, r)).length,
      volumes:
        [...new Set(entries.map((r) => r.volume))].join("、") || "未登记",
    };
  });
  return {
    revision: s.workflowRevision ?? 0,
    forms: WORKFLOW_FORMS,
    records: rows,
    receipts,
    archive,
    qualityChecklist: REFERENCE.departmentReview,
    reference: REFERENCE,
    notices: [
      "逐单位记录送达回证；征求意见默认10个工作日估算，整改书面报告默认60个自然日，具体以实际文书和适用规定核对。",
      "登记外部签章证明不代替正式审批。归档登记与整改销号独立，档案移交不自动关闭整改。",
      "参考案例的19个节点、15项问题及54个档案条目不是当前项目完成数量。",
    ],
  };
}
