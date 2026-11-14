import {
  LABEL,
  AuditError,
  requireThat,
  number,
  money,
  round,
  date,
  refs,
  unique,
  check,
  markdown,
  id,
  hash,
} from "./core.js";
const definitions = [
  [
    "A01",
    "审计资料及版本智慧管理",
    "立项准备",
    ["project"],
    "清单匹配、指纹去重、版本差异和来源影响",
  ],
  [
    "A02",
    "审前调查与项目全景",
    "立项准备",
    ["project"],
    "按主体、资金和期间组织有来源的关系与调查缺口",
  ],
  [
    "A03",
    "审前工作资料协同准备",
    "立项准备",
    ["project", "template"],
    "从项目事实及审计重点生成文书包和证据需求",
  ],
  [
    "B01",
    "多源资料汇成一张审计表",
    "现场取证",
    ["contract", "payment"],
    "合同主键、明细粒度、金额单位和来源单元格",
  ],
  [
    "B02",
    "多源资料审计时间轴",
    "现场取证",
    ["approval"],
    "区分发生日、文件日和签收日，计算间隔",
  ],
  [
    "B03",
    "跨文件多事项比对",
    "现场取证",
    ["measurement"],
    "逐事项比对范围、参数、金额和区间重叠",
  ],
  [
    "B04",
    "法律法规辅助审查",
    "现场取证",
    ["law", "project"],
    "法规版本、适用条件与证据缺口矩阵",
  ],
  [
    "B05",
    "合同履约与支付审查",
    "现场取证",
    ["contract", "payment"],
    "按条款核算付款比例、冲回、重复候选和履约条件",
  ],
  [
    "B06",
    "图纸知识与工程量计价",
    "现场取证",
    ["drawing", "measurement"],
    "图纸区域索引、低清参数拦截和确认参数复算",
  ],
  [
    "B07",
    "盘点盘库与资产流转",
    "现场取证",
    ["inventory", "count"],
    "单位换算、账实差异、领用流转和重复影像",
  ],
  [
    "B08",
    "多模态现场取证",
    "现场取证",
    ["media"],
    "时间码和点位索引、陈述冲突及转写不确定性",
  ],
  [
    "B09",
    "过程资料编制与转换",
    "现场取证",
    ["measurement"],
    "证据转底稿、字段映射、事实确认和引用检查",
  ],
  [
    "C01",
    "结果资料编制与审查",
    "征求意见与质量内控",
    ["report"],
    "报告问题结构、金额口径、重复引用与限定",
  ],
  [
    "C02",
    "审计质量内部控制",
    "征求意见与质量内控",
    ["feedback"],
    "反馈拆解、签收期限、决定与落实分离",
  ],
  [
    "D01",
    "送审材料完整性与版本",
    "审理复核",
    ["requirement"],
    "具体送审包清单、指纹和所选版本核验",
  ],
  [
    "D02",
    "部门复核与证据链",
    "审理复核",
    ["report"],
    "逐问题检查样本边界、金额、证据及未决事项",
  ],
  [
    "D03",
    "法规标准合同适用复核",
    "审理复核",
    ["law", "report"],
    "核验拟引用条文原文、施行期及事实要件",
  ],
  [
    "D04",
    "复核工作质量管理",
    "审理复核",
    ["review"],
    "覆盖、冲突、落实位置和数字附件回归",
  ],
  [
    "E01",
    "出具前重要事项审核确认",
    "正式出具前审核确认",
    ["report"],
    "事实、日期、数字、版本四类确认卡",
  ],
  [
    "F01",
    "整改任务与证明核验",
    "整改归档与复用",
    ["rectification"],
    "要求、主体、到账证明和重复凭证逐项核验",
  ],
  [
    "F02",
    "整改效果复查与销号建议",
    "整改归档与复用",
    ["rectification"],
    "连续期复查、剩余金额和反弹核验",
  ],
  [
    "F03",
    "公告草案与公开审查",
    "整改归档与复用",
    ["report"],
    "按范围生成脱敏候选，保留自报和抽样限定",
  ],
  [
    "F04",
    "归档清单与缺件审查",
    "整改归档与复用",
    ["requirement"],
    "应有、实有、页码、错版和未确认，独立整改状态",
  ],
  [
    "F05",
    "三库沉淀与跨项目复用",
    "整改归档与复用",
    ["measurement"],
    "有血缘的知识、能力、数据候选及适配条件",
  ],
];
export const SCENARIOS = definitions.map(
  ([id, title, stage, requiredKinds, description]) => ({
    id,
    title,
    stage,
    requiredKinds,
    description,
    inputSchema: {
      documentIds: "选择资料具体版本，可留空使用适用资料",
      artifactIds: "选择前序成果",
      options: "场景参数",
      useAI: "调用实际模型（失败可见）",
    },
  }),
);
const sum = (rows, fn) => round(rows.reduce((s, r) => s + (fn(r) ?? 0), 0));
const amount = (r) => {
  const stated = money(r.amount ?? r.value, r.amountUnit ?? r.unit ?? "元");
  if (stated !== null) return stated;
  if (
    r.type === "measurement" &&
    number(r.quantity) !== null &&
    number(r.unitPrice) !== null
  )
    return round(Number(r.quantity) * Number(r.unitPrice));
  return null;
};
const group = (rows, key) =>
  Map.groupBy
    ? Map.groupBy(rows, key)
    : rows.reduce((m, r) => {
        const k = key(r);
        m.set(k, [...(m.get(k) ?? []), r]);
        return m;
      }, new Map());
const present = (v) => v !== undefined && v !== null && v !== "";
function evidenceExists(c, evidenceId) {
  return (
    c.allRecords.some(
      (record) =>
        record.id === evidenceId &&
        !["stale", "superseded"].includes(record.factStatus),
    ) ||
    c.state.documents.some(
      (document) =>
        document.id === evidenceId && document.status !== "superseded",
    ) ||
    c.state.artifacts.some(
      (artifact) => artifact.id === evidenceId && artifact.status !== "stale",
    )
  );
}
function intervalOverlap(a, b) {
  return Math.max(
    0,
    Math.min(Number(a.end), Number(b.end)) -
      Math.max(Number(a.start), Number(b.start)),
  );
}
function issuesForMissing(rows, fields) {
  return rows.flatMap((r) =>
    fields
      .filter((k) => !present(r[k]))
      .map((k) =>
        check(
          "missing-field",
          `${r.id ?? r.documentName} 缺少 ${k}`,
          r.sources,
          "缺资料",
        ),
      ),
  );
}
function relationRows(c) {
  const rs = c.records("project", "contract", "approval");
  return rs.map((r) => ({
    id: r.id,
    from: r.owner ?? r.subject ?? r.name,
    to: r.contractor ?? r.successor ?? r.projectId ?? c.state.project.id,
    relation:
      r.relationship ?? (r.type === "contract" ? "合同关系" : "项目记载"),
    fromDate: r.fromDate ?? r.date,
    toDate: r.toDate ?? "",
    status: r.status === "confirmed" ? "人工已确认" : "待核实关系",
    sources: r.sources,
  }));
}
function canonicalPayments(c) {
  const groups = group(
    c.records("payment"),
    (r) => `${r.contractId ?? ""}:${r.transactionId ?? r.id}`,
  );
  return [...groups.values()].map((rows) => ({
    ...rows[0],
    sources: refs(rows),
    duplicateViews: rows.map((r) => r.id),
    conflict: unique(rows.map(amount)).length > 1,
    ...(unique(rows.map(amount)).length > 1
      ? { amount: null, value: null }
      : {}),
  }));
}
function reportRows(c) {
  const selected = c.selectedArtifacts.filter((a) =>
    ["C01", "B09"].includes(a.scenarioId),
  );
  let rows;
  if (selected.length)
    rows = selected.flatMap((a) =>
      a.rows.map((r) => ({
        ...r,
        id: r.id ?? r.matter,
        title: r.title ?? r.matter,
        amount: r.amount ?? r.amountYuan,
        unit: r.unit ?? "元",
        text: r.text ?? r.paragraph ?? r.fact,
        factRef: r.factRef ?? r.id,
        evidenceIds: r.evidenceIds ?? r.sources?.map((s) => s.documentId),
        sources: (r.sources ?? a.sources).map((s) => ({
          ...s,
          artifactId: a.id,
        })),
        artifactId: a.id,
        artifactContent: a.content,
        factStatus:
          r.confirmation === "已确认事实" ? "confirmed" : r.factStatus,
      })),
    );
  else {
    const reports = c.records("report").length
      ? c.records("report")
      : c.records("workpaper");
    rows = reports.some((row) => row.recordSubtype !== "workpaper")
      ? reports.filter((row) => row.recordSubtype !== "workpaper")
      : reports;
  }
  return rows.map((row) => ({
    ...row,
    sources: refs([row, ...supportFor(c, row)]),
  }));
}
function supportFor(c, r) {
  const ids = [
    r.factRef,
    r.measurementId,
    r.transactionId,
    r.dateSourceId,
    ...(r.evidenceIds ?? []),
  ].filter(Boolean);
  return [
    ...c.allRecords,
    ...c.state.findings.filter((finding) => finding.id === r.factRef),
  ].filter(
    (x) =>
      (x.id !== r.id || r.artifactId) &&
      (ids.includes(x.id) ||
        ids.includes(x.originDocumentId) ||
        ids.includes(x.transactionId)),
  );
}
function reportChecks(c, reports) {
  const checks = [];
  for (const r of reports) {
    const support = supportFor(c, r);
    const evidence = support.find(
      (x) =>
        (r.factRef && x.id === r.factRef) ||
        (r.measurementId && x.id === r.measurementId) ||
        (r.transactionId && x.transactionId === r.transactionId),
    );
    const scopeAll =
      r.claimScope === "all" ||
      /全部(?:管网|项目|存在|工程)/.test(r.text ?? "");
    if (scopeAll && r.sampleScope !== "all")
      checks.push(
        check(
          "scope-overreach",
          `${r.id} 表述为全部，但证据范围为 ${r.sampleScope ?? "未记载"}`,
          refs([r, ...support]),
          "待专业判断",
          true,
        ),
      );
    if (
      evidence &&
      amount(r) !== null &&
      amount(evidence) !== null &&
      amount(r) !== amount(evidence)
    )
      checks.push(
        check(
          "source-amount",
          `${r.id} 正文 ${amount(r)}元与来源 ${evidence.id} 的 ${amount(evidence)}元不一致`,
          refs([r, evidence]),
          "数字不一致",
          true,
        ),
      );
    const dateSource = c.allRecords.find((x) => x.id === r.dateSourceId);
    if (dateSource && r.date && dateSource.date && r.date !== dateSource.date)
      checks.push(
        check(
          "date-conflict",
          `${r.id} 正文日期 ${r.date} 与 ${dateSource.id} 记载 ${dateSource.date} 不同（日期语义待核）`,
          refs([r, dateSource]),
          "日期不一致",
          true,
        ),
      );
    if (r.date && !date(r.date))
      checks.push(
        check(
          "invalid-date",
          `${r.id} 无效或不确定日期 ${r.date}`,
          r.sources,
          "待确认",
          true,
        ),
      );
    if (
      r.attachmentAmount !== undefined &&
      money(r.attachmentAmount, r.attachmentUnit ?? r.unit) !== amount(r)
    )
      checks.push(
        check(
          "attachment-amount",
          `${r.id} 附件金额与正文不一致`,
          r.sources,
          "版本/数字不一致",
          true,
        ),
      );
    if (r.evidenceIds?.length) {
      for (const eid of r.evidenceIds)
        if (
          !c.allRecords.some((x) => x.id === eid) &&
          !c.state.documents.some((x) => x.id === eid) &&
          !c.state.artifacts.some((x) => x.id === eid && x.status !== "stale")
        )
          checks.push(
            check(
              "broken-evidence",
              `${r.id} 找不到有效证据 ${eid}`,
              r.sources,
              "引用断裂",
              true,
            ),
          );
    } else
      checks.push(
        check(
          "missing-evidence",
          `${r.id} 缺少证据定位清单`,
          r.sources,
          "缺资料",
          true,
        ),
      );
  }
  for (const a of c.selectedArtifacts.filter((a) =>
    ["C01", "B09"].includes(a.scenarioId),
  )) {
    const rows = reports.filter((r) => r.artifactId === a.id);
    const allowed = unique(
      [
        ...rows.map(amount),
        ...rows.flatMap((r) => supportFor(c, r).map(amount)),
      ].filter((v) => v !== null),
    );
    for (const token of a.content.matchAll(
      /(\d[\d,.]*)\s*(亿元|万元|元)(?![\/／])/g,
    )) {
      const value = money(token[1], token[2]);
      if (value !== null && allowed.length && !allowed.includes(value))
        checks.push(
          check(
            "prose-amount",
            `文稿 ${a.id} 的“${token[0]}”与所引事实金额不对应，需逐句复核`,
            a.sources.map((s) => ({ ...s, artifactId: a.id })),
            "正文数字待核",
            true,
          ),
        );
    }
    if (
      /全部(?:管网|项目|存在|工程)/.test(a.content) &&
      rows.some((r) => r.sampleScope !== "all")
    )
      checks.push(
        check(
          "scope-overreach",
          `文稿 ${a.id} 的“全部”表述超出所列样本范围`,
          a.sources.map((s) => ({ ...s, artifactId: a.id })),
          "待专业判断",
          true,
        ),
      );
  }
  for (const [key, rows] of group(
    reports,
    (r) => r.transactionId ?? r.issueId ?? r.factRef ?? r.id,
  ))
    if (rows.length > 1)
      checks.push(
        check(
          "double-total",
          `同一事项 ${key} 被 ${rows.length} 个段落引用，汇总应去重`,
          refs(rows),
          "金额去重",
          true,
        ),
      );
  return checks;
}
const handlers = {
  A01(c) {
    const docs = c.documents;
    const required = c.options.requiredKinds ?? [
      "project",
      "approval",
      "contract",
      "payment",
      "handover",
    ];
    const rows = docs.map((d) => {
      const previous = c.state.documents.find((x) => x.id === d.previousId);
      const duplicate = docs.find(
        (x) => x.id !== d.id && x.sha256 === d.sha256,
      );
      return {
        id: d.id,
        name: d.name,
        kind: d.kind,
        version: d.version,
        status: d.status,
        parseStatus: d.parseStatus,
        sha256: d.sha256,
        duplicateOf: duplicate?.id ?? "",
        change: previous
          ? previous.sha256 === d.sha256
            ? "仅名称/元数据变化"
            : `内容修订：${previous.records.length}→${d.records.length} 条记录`
          : "首次接收",
        impacted: c.state.artifacts
          .filter((a) => a.sources.some((s) => s.documentId === previous?.id))
          .map((a) => a.id),
        sources: [c.ref(d)],
      };
    });
    const checks = required
      .filter((k) => !docs.some((d) => d.kind === k))
      .map((k) =>
        check("missing-document", `未提供 ${k}；不等于不存在`, [], "缺资料"),
      );
    return {
      rows,
      checks,
      tasks: checks.map((x) => ({
        title: x.message,
        status: "pending",
        sources: x.sources,
      })),
    };
  },
  A02(c) {
    const rows = relationRows(c);
    const p = c.records("project");
    const checks = [];
    for (const r of p) {
      if (
        r.approvedInvestment !== undefined &&
        r.ledgerInvestment !== undefined
      ) {
        const delta =
          money(r.ledgerInvestment, r.unit) -
          money(r.approvedInvestment, r.unit);
        if (delta)
          checks.push(
            check(
              "investment-basis",
              `概算与台账差 ${delta}元，需核实投资口径`,
              r.sources,
            ),
          );
      }
      if (r.successor && !c.documents.some((d) => d.kind === "handover"))
        checks.push(
          check(
            "handover-gap",
            `${r.owner ?? r.subject} 向 ${r.successor} 移交缺合同/资产移交清单`,
            r.sources,
            "缺资料",
          ),
        );
    }
    return {
      rows,
      checks,
      graph: {
        nodes: unique(rows.flatMap((r) => [r.from, r.to]).filter(Boolean)).map(
          (name) => ({ id: name, label: name }),
        ),
        edges: rows,
      },
      tasks: checks.map((x) => ({
        title: `调查：${x.message}`,
        status: "pending",
        sources: x.sources,
      })),
    };
  },
  A03(c) {
    const project = c.records("project")[0];
    requireThat(project, "缺少项目事实", 409);
    const focus = c.options.focus ?? ["投资口径", "合同履约", "工程计量"];
    requireThat(
      Array.isArray(focus) && focus.length > 0,
      "审计重点须为非空数组",
    );
    const docs = c.options.documentTypes ?? [
      "实施方案",
      "审计通知书",
      "提供资料清单",
    ];
    const templates = c.records("template");
    const rows = docs.flatMap((type) =>
      focus.map((item) => ({
        documentType: type,
        subject: project.name ?? project.subject ?? c.state.project.name,
        period: project.period ?? "期间待人工填写",
        focus: item,
        procedure: item.includes("计量")
          ? "区间交叉复算及现场复测"
          : item.includes("合同")
            ? "条款与履行凭证逐项核对"
            : "批复、台账与资金口径核对",
        evidence: item.includes("计量")
          ? "图纸、计量明细、测量记录"
          : item.includes("合同")
            ? "合同、变更审批、验收、流水"
            : "批复、投资台账及口径说明",
        documentNumber: "待审批填写",
        sources: refs([project, ...templates]),
      })),
    );
    return {
      rows,
      checks: [
        check(
          "draft-only",
          "审计范围、期间、文号及审批需人工确认；不自动签发",
          refs([project, ...templates]),
        ),
      ],
    };
  },
  B01(c) {
    const contracts = c.records("contract");
    const payments = canonicalPayments(c);
    const rows = payments.map((p) => {
      const contract = contracts.find(
        (x) => (x.contractId ?? x.id) === p.contractId,
      );
      return {
        id: p.id,
        contractId: p.contractId,
        payee: p.payee ?? p.subject,
        originalAmount: p.amount,
        originalUnit: p.unit ?? "元",
        amountYuan: amount(p),
        currency: p.currency ?? "CNY",
        taxBasis: p.taxBasis ?? "待核",
        date: p.date,
        contractAmountYuan: contract ? amount(contract) : null,
        match: p.conflict
          ? "同一交易来源冲突"
          : contract
            ? "主键关联"
            : "未匹配合同",
        conversion: `${p.amount ?? "空缺"} × ${{ 元: 1, 万元: 10000, 亿元: 100000000 }[p.unit ?? "元"] ?? "未知单位"}`,
        cells: {
          amountYuan: {
            sources: p.sources,
            formula: `${p.amount} ${p.unit ?? "元"} → 元`,
          },
          contractAmountYuan: { sources: contract?.sources ?? [] },
        },
        sources: refs([p, ...(contract ? [contract] : [])]),
      };
    });
    const checks = rows
      .filter((r) => r.amountYuan === null || r.match === "未匹配合同")
      .map((r) =>
        check(
          "mapping-gap",
          `${r.id} 金额单位或合同主键待核，不以零填补`,
          r.sources,
        ),
      );
    return {
      rows,
      checks,
      summary: {
        totalYuan: sum(rows, (r) => r.amountYuan),
        missingAmount: rows.filter((r) => r.amountYuan === null).length,
        granularity: "一笔交易一行；合同金额不按付款行重复汇总",
      },
    };
  },
  B02(c) {
    const rs = c.records(
      "approval",
      "project",
      "contract",
      "payment",
      "media",
      "acceptance",
      "measurement",
    );
    const rows = rs
      .filter((r) => r.date || r.fromDate)
      .map((r) => ({
        id: r.id,
        event: r.event ?? r.title ?? r.name ?? r.id,
        date: r.date ?? r.fromDate,
        dateRole: r.dateRole ?? "未确认语义",
        subject: r.subject ?? r.owner,
        contractId: r.contractId,
        status: date(r.date ?? r.fromDate) ? "可排序" : "日期待核",
        sources: r.sources,
      }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const checks = rows
      .filter((r) => r.dateRole === "未确认语义" || r.status === "日期待核")
      .map((r) =>
        check(
          "date-semantics",
          `${r.id} 日期 ${r.date} 语义或值待核`,
          r.sources,
        ),
      );
    for (let i = 1; i < rows.length; i++)
      rows[i].daysSincePrevious =
        date(rows[i].date) && date(rows[i - 1].date)
          ? Math.round(
              (Date.parse(rows[i].date) - Date.parse(rows[i - 1].date)) /
                86400000,
            )
          : null;
    const approved = rows.find((r) =>
      ["approval", "批准日", "审批日"].includes(r.dateRole),
    );
    const start = rows.find((r) =>
      ["start", "开工日", "发生日"].includes(r.dateRole),
    );
    if (
      approved &&
      start &&
      date(approved.date) &&
      date(start.date) &&
      start.date < approved.date
    )
      checks.push(
        check(
          "sequence",
          `开工记录早于提供的批复 ${Math.round((Date.parse(approved.date) - Date.parse(start.date)) / 86400000)} 天，需核实前期文件`,
          refs([approved, start]),
        ),
      );
    return { rows, checks };
  },
  B03(c) {
    const rs = c.records("measurement", "contract", "approval");
    const rows = [];
    const findings = [];
    const checks = [];
    for (const [key, items] of group(rs, (r) =>
      r.segmentId
        ? `${r.projectId ?? c.state.project.id}/${r.contractId ?? "合同待核"}/${r.segmentId}/${r.unit ?? "单位待核"}`
        : (r.contractId ?? r.subject ?? r.id),
    )) {
      for (const r of items)
        rows.push({
          matter: key,
          id: r.id,
          document: r.documentName,
          scope: r.scope ?? "",
          quantity: r.quantity ?? "",
          amountYuan: amount(r),
          start: r.start ?? "",
          end: r.end ?? "",
          sources: r.sources,
        });
      const measures = items.filter((r) => r.type === "measurement");
      for (let i = 0; i < measures.length; i++)
        for (let j = i + 1; j < measures.length; j++) {
          const a = measures[i],
            b = measures[j];
          if ([a.start, a.end, b.start, b.end].some((v) => number(v) === null))
            continue;
          const overlap = intervalOverlap(a, b);
          if (overlap) {
            const unitPrice = number(a.unitPrice);
            const value =
              unitPrice === null ? null : round(overlap * unitPrice);
            findings.push({
              title: `${key} 疑似重复计量 ${overlap}${a.unit ?? "单位待核"}`,
              detail: `${a.id} [${a.start},${a.end}] 与 ${b.id} [${b.start},${b.end}] 交集；${overlap}${a.unit ?? "单位待核"} × ${unitPrice ?? "待核单价"}元/${a.unit ?? "单位待核"} = ${value ?? "待核"}元，须核实实体与口径`,
              amount: value,
              sources: refs([a, b]),
            });
          }
        }
      const scopes = unique(items.map((r) => r.scope).filter(Boolean));
      if (scopes.length > 1)
        checks.push(
          check(
            "scope-difference",
            `${key} 跨文件范围不同：${scopes.join(" / ")}`,
            refs(items),
          ),
        );
    }
    return { rows, findings, checks };
  },
  B04(c) {
    const facts = c.records("project", "approval", "contract", "payment");
    const laws = c.state.laws.filter((l) =>
      c.documents.some((d) => l.sources.some((s) => s.documentId === d.id)),
    );
    requireThat(laws.length, "缺少带官方来源的法规记录", 409);
    const rows = laws.flatMap((l) => {
      const targets = facts.filter(
        (f) => !l.appliesTo || f.type === l.appliesTo,
      );
      return (targets.length ? targets : [{ id: "缺事实", sources: [] }]).map(
        (f) => {
          const d = c.options.behaviorDate ?? f.date;
          const period =
            date(d) && l.effectiveFrom
              ? d >= l.effectiveFrom && (!l.effectiveTo || d <= l.effectiveTo)
              : null;
          const conditions = (
            Array.isArray(l.conditions) ? l.conditions : []
          ).map((k) => ({
            field: typeof k === "string" ? k : k.field,
            value: f[typeof k === "string" ? k : k.field] ?? null,
          }));
          return {
            lawId: l.id,
            title: l.title,
            article: l.article,
            officialUrl: l.officialUrl,
            effectiveFrom: l.effectiveFrom,
            behaviorDate: d ?? "待核",
            factId: f.id,
            periodMatch: period,
            conditions,
            status:
              l.status !== "人工已确认"
                ? "待人工核验"
                : period === false
                  ? "行为期间不匹配"
                  : conditions.some((x) => x.value === null)
                    ? "要件证据不足"
                    : "条件资料已列示，待专业判断",
            sources: refs([l, f]),
          };
        },
      );
    });
    return {
      rows,
      checks: rows
        .filter((r) => r.status !== "条件资料已列示，待专业判断")
        .map((r) =>
          check(
            "law-applicability",
            `${r.title} 对 ${r.factId}：${r.status}`,
            r.sources,
          ),
        ),
    };
  },
  B05(c) {
    const contracts = c.records("contract"),
      payments = canonicalPayments(c);
    const rows = [];
    const checks = [];
    const findings = [];
    for (const contract of contracts) {
      const cid = contract.contractId ?? contract.id;
      const ps = payments.filter((p) => p.contractId === cid);
      const total = amount(contract);
      const ratio = number(contract.paymentRatio ?? contract.progressRatio);
      const paid = sum(ps, (p) =>
        p.direction === "refund" ? -Math.abs(amount(p) ?? 0) : amount(p),
      );
      const ceiling =
        total !== null && ratio !== null
          ? round(total * (ratio > 1 ? ratio / 100 : ratio))
          : null;
      rows.push({
        contractId: cid,
        contractVersion: contract.documentVersion,
        contractAmount: total,
        ratio,
        ceiling,
        netPaid: paid,
        balance: total === null ? null : round(total - paid),
        overLimit: ceiling === null ? null : round(Math.max(0, paid - ceiling)),
        sources: refs([contract, ...ps]),
      });
      if (ceiling !== null && paid > ceiling)
        findings.push({
          title: `${cid} 支付超过所选条款比例`,
          detail: `净支付 ${paid} - 条款上限 ${ceiling} = ${round(paid - ceiling)}元；条款有效性和款项性质待核`,
          amount: round(paid - ceiling),
          sources: refs([contract, ...ps]),
        });
      for (const p of ps) {
        const reversal = payments.find(
          (q) => q.reversalOf === p.id || p.reversalOf === q.id,
        );
        const duplicates = ps.filter(
          (q) =>
            q.id !== p.id &&
            amount(q) === amount(p) &&
            q.payee === p.payee &&
            (!p.measurementId ||
              !q.measurementId ||
              p.measurementId === q.measurementId) &&
            !q.reversalOf &&
            !p.reversalOf,
        );
        const acceptance = c.allRecords.find((x) => x.id === p.acceptanceId);
        const accepted = Boolean(acceptance);
        const measured = c.allRecords.find((x) => x.id === p.measurementId);
        const measuredAmount = measured ? amount(measured) : null;
        const paymentCap =
          measuredAmount !== null && ratio !== null
            ? round(measuredAmount * (ratio > 1 ? ratio / 100 : ratio))
            : null;
        if (paymentCap !== null && amount(p) > paymentCap)
          findings.push({
            title: `${p.id} 超过本期计量约定比例`,
            detail: `本期计量 ${measuredAmount} × ${ratio} = ${paymentCap}元；支付 ${amount(p)}元，差额 ${round(amount(p) - paymentCap)}元，条件及款项性质待核`,
            amount: round(amount(p) - paymentCap),
            sources: refs([contract, p, measured]),
          });
        if (p.conflict)
          checks.push(
            check(
              "transaction-conflict",
              `${p.id} 同一交易在不同来源中金额不一致，净额汇总暂不计入该交易`,
              p.sources,
            ),
          );
        rows.push({
          contractId: cid,
          paymentId: p.id,
          amountYuan: amount(p),
          measurementAmount: measuredAmount,
          paymentCap,
          calculation:
            paymentCap === null
              ? "未提供本期计量/比例"
              : `${measuredAmount} × ${ratio} = ${paymentCap}元`,
          acceptance: accepted ? "验收凭证已关联" : "未提供可核验收证明",
          duplicate: reversal
            ? `有冲回关联 ${reversal.id}`
            : duplicates.length
              ? `疑似重复 ${duplicates.map((d) => d.id).join(",")}`
              : "未见同额同主体候选",
          sources: refs([
            contract,
            p,
            ...(reversal ? [reversal] : []),
            ...(measured ? [measured] : []),
            ...(acceptance ? [acceptance] : []),
          ]),
        });
        if (!accepted && contract.requiresAcceptance !== false)
          checks.push(
            check(
              "acceptance-gap",
              `${p.id} 付款条件缺验收支持，不凭发票认定履行`,
              refs([contract, p]),
            ),
          );
      }
    }
    return { rows, checks, findings };
  },
  B06(c) {
    const drawings = c.records("drawing");
    const measures = c.records("measurement");
    const rows = [];
    const checks = [];
    for (const d of drawings) {
      const m = measures.filter(
        (r) => r.segmentId === d.segmentId || r.drawingId === d.id,
      );
      const clear =
        d.readable !== false && !["low", "低清", "blurred"].includes(d.quality);
      const verified = d.parameterConfirmed === true;
      const quantity =
        clear && verified ? number(d.length ?? d.quantity) : null;
      const price = number(d.unitPrice ?? m[0]?.unitPrice);
      rows.push({
        id: d.id,
        drawing: d.title ?? d.documentName,
        component: d.component ?? d.segmentId,
        legend: d.legend ?? "未提供图例解释",
        region: d.region ?? d.locator ?? "整页",
        quantity,
        unit: d.unit ?? "米",
        unitPrice: price,
        total:
          quantity !== null && price !== null ? round(quantity * price) : null,
        formula:
          quantity === null
            ? "阻止复算：参数需清晰来源和人工确认"
            : `${quantity} × ${price ?? "待核"} 元`,
        sources: refs([d, ...m]),
      });
      if (!clear || !verified)
        checks.push(
          check(
            "drawing-unverified",
            `${d.id} ${!clear ? "低清无法可靠读取" : "参数尚未经人工确认"}，未进入工程量复算`,
            d.sources,
            "待人工核验",
            true,
          ),
        );
    }
    return { rows, checks };
  },
  B07(c) {
    const inventory = c.records("inventory"),
      counts = c.records("count"),
      media = c.records("media").map((record) => ({
        ...record,
        sha256:
          c.documents.find(
            (document) =>
              document.id === record.originDocumentId &&
              document.mimeType.startsWith("image/"),
          )?.sha256 ?? record.sha256,
      }));
    const rows = inventory.map((r) => {
      const cs = counts.filter(
        (x) => (x.assetId ?? x.itemId) === (r.assetId ?? r.itemId ?? r.id),
      );
      const valid = cs.filter((x) => x.confirmed === true);
      let actual = null;
      const warnings = [];
      if (valid.length) {
        const values = valid.map((x) => {
          if (x.unit === r.unit) return number(x.quantity);
          if (
            x.conversionConfirmed === true &&
            number(x.conversionFactor) !== null
          )
            return number(x.quantity) * Number(x.conversionFactor);
          warnings.push("换算关系未确认");
          return null;
        });
        if (values.every((v) => v !== null)) actual = sum(values, (v) => v);
      }
      const book = number(r.quantity);
      const issued = number(r.issuedNotPosted) ?? 0;
      return {
        id: r.id,
        asset: r.name ?? r.assetId,
        location: r.location,
        book,
        actual,
        unit: r.unit,
        difference:
          actual === null || book === null
            ? null
            : round(actual - (book - issued)),
        issuedNotPosted: issued,
        status:
          actual === null
            ? "未盘/数量或换算待确认"
            : actual === book - issued
              ? "数量对应，流转待核"
              : "账实差异待复盘",
        warnings: warnings.join("；"),
        sources: refs([r, ...cs]),
      };
    });
    const checks = rows
      .filter((r) => r.actual === null || r.difference !== 0)
      .map((r) =>
        check("inventory-recount", `${r.asset}：${r.status}`, r.sources),
      );
    for (const [fingerprint, photos] of group(
      media.filter((r) => r.sha256 || r.imageHash),
      (r) => r.sha256 ?? r.imageHash,
    ))
      if (photos.length > 1)
        checks.push(
          check(
            "duplicate-image",
            `${photos.length} 条影像同指纹 ${fingerprint}，不可重复计数`,
            refs(photos),
          ),
        );
    return {
      rows,
      checks,
      tasks: checks.map((x) => ({
        title: `复盘：${x.message}`,
        sources: x.sources,
        status: "pending",
      })),
    };
  },
  B08(c) {
    const rs = c.records("media");
    const rows = rs.map((r) => ({
      id: r.id,
      type: r.mediaType ?? r.kind ?? "现场记录",
      location: r.location ?? "点位待核",
      timecode: r.timecode ?? r.locator ?? "时间码待核",
      statement:
        r.transcript ??
        r.statement ??
        r.description ??
        "未提供转写/可见对象描述",
      speaker: r.speaker ?? "说话人待核",
      measurement: r.measuredValue ?? null,
      design: r.designValue ?? null,
      difference:
        r.measurementConfirmed === true &&
        number(r.measuredValue) !== null &&
        number(r.designValue) !== null
          ? round(Number(r.measuredValue) - Number(r.designValue))
          : null,
      status:
        r.transcriptConfirmed === true ? "人工核验转写" : "转写/影像待人工核验",
      sources: r.sources,
    }));
    const checks = rs.flatMap((r) => {
      const issues = [];
      if (r.transcriptError || r.uncertain || r.quality === "low")
        issues.push(
          check(
            "media-uncertain",
            `${r.id} ${r.transcriptError ?? "听不清、遮挡或低清；不得补齐"}`,
            r.sources,
          ),
        );
      if (!r.captureTimeVerified)
        issues.push(
          check("capture-time", `${r.id} 拍摄/录音时间没有独立确认`, r.sources),
        );
      return issues;
    });
    for (const [point, items] of group(
      rs,
      (r) => r.checkpoint ?? r.location ?? r.id,
    )) {
      const values = unique(
        items.map((x) => x.statement ?? x.measuredValue).filter(present),
      );
      if (values.length > 1)
        checks.push(
          check(
            "statement-conflict",
            `${point} 多源陈述/测量不同：${values.join(" / ")}`,
            refs(items),
          ),
        );
    }
    return { rows, checks };
  },
  B09(c) {
    const derived = c.selectedArtifacts.flatMap((artifact) =>
      (
        artifact.findings ??
        c.state.findings.filter((finding) => finding.artifactId === artifact.id)
      ).map((snapshot) => {
        const finding =
          c.state.findings.find((entry) => entry.id === snapshot.id) ??
          snapshot;
        return {
          id: finding.id,
          title: finding.title,
          targetType: c.options.documentType ?? "工作底稿",
          matter: finding.title,
          fact: finding.detail,
          factRef: finding.id,
          amountYuan: finding.amount,
          evidenceIds: finding.sources.map((source) => source.documentId),
          confirmation:
            finding.status === "confirmed"
              ? "已确认事实"
              : "待核事实，不得升级认定",
          sampleScope: "selected-source-sample",
          claimScope: "sample",
          mapping: "计算线索→人工认定→过程文书",
          sources: finding.sources.map((source) => ({
            ...source,
            artifactId: artifact.id,
          })),
        };
      }),
    );
    if (derived.length)
      return {
        rows: derived,
        checks: derived
          .filter((row) => row.confirmation !== "已确认事实")
          .map((row) =>
            check(
              "unconfirmed-finding",
              `${row.id} 计算线索尚需人工认定`,
              row.sources,
            ),
          ),
        dependencies: c.selectedArtifacts.map((artifact) => artifact.id),
      };
    const rs = c.records("measurement", "media", "payment");
    const rows = rs.map((r) => ({
      id: r.id,
      targetType: c.options.documentType ?? "工作底稿",
      matter: r.segmentId ?? r.contractId ?? r.checkpoint ?? r.id,
      fact: r.statement ?? r.description ?? `${r.type} 记录 ${r.id}`,
      amountYuan:
        amount(r) ??
        (number(r.quantity) !== null && number(r.unitPrice) !== null
          ? round(Number(r.quantity) * Number(r.unitPrice))
          : null),
      confirmation:
        r.factStatus === "confirmed" ? "已确认事实" : "待核事实，不得升级认定",
      mapping: "原始记录→事实字段→过程文书",
      sources: r.sources,
    }));
    return {
      rows,
      checks: rows
        .filter((r) => r.confirmation !== "已确认事实")
        .map((r) =>
          check(
            "unconfirmed-fact",
            `${r.id} 尚需事实与证据充分性确认`,
            r.sources,
          ),
        ),
    };
  },
  C01(c) {
    const reports = reportRows(c);
    const seen = new Set();
    const rows = reports.map((r) => {
      const key = r.transactionId ?? r.issueId ?? r.factRef ?? r.id;
      const duplicate = seen.has(key);
      seen.add(key);
      return {
        id: r.id,
        title: r.title ?? r.subject,
        paragraph: r.text ?? r.description ?? r.title,
        factRef: r.factRef ?? r.id,
        evidenceIds: r.evidenceIds ?? [],
        sampleScope: r.sampleScope ?? "sample",
        claimScope: r.claimScope ?? "sample",
        date: r.date,
        dateSourceId: r.dateSourceId,
        lawIds: r.lawIds,
        issueId: r.issueId,
        amountYuan: amount(r),
        suggestedAmountYuan: money(r.suggestedAmount, r.unit),
        includedInTotal: !duplicate,
        qualifier:
          r.factStatus === "confirmed" ? "人工确认事实" : "待核实/单位陈述",
        sources: r.sources,
      };
    });
    return {
      rows,
      checks: reportChecks(c, reports),
      summary: {
        involvedYuan: sum(
          rows.filter((r) => r.includedInTotal),
          (r) => r.amountYuan,
        ),
        suggestedYuan: sum(
          rows.filter((r) => r.includedInTotal),
          (r) => r.suggestedAmountYuan,
        ),
        basis: "按 transactionId/factRef 去重，涉及与建议处理分列",
      },
    };
  },
  C02(c) {
    const rs = c.records("feedback");
    const rows = rs.flatMap((r) =>
      (Array.isArray(r.issueIds) && r.issueIds.length
        ? r.issueIds
        : [r.issueId ?? r.id]
      ).map((issue) => {
        const days = number(r.deadlineDays);
        const due =
          date(r.receivedDate) && days !== null
            ? new Date(Date.parse(r.receivedDate) + days * 86400000)
                .toISOString()
                .slice(0, 10)
            : null;
        const implemented = Boolean(
          r.modifiedArtifactId &&
            c.state.artifacts.some(
              (a) => a.id === r.modifiedArtifactId && a.status !== "stale",
            ) &&
            r.implementationEvidenceIds?.length &&
            r.implementationEvidenceIds.every((evidenceId) =>
              evidenceExists(c, evidenceId),
            ),
        );
        return {
          id: `${r.id}:${issue}`,
          feedbackId: r.id,
          issueId: issue,
          claim: r.claim ?? r.text,
          decision: r.decision ?? "待人工决定",
          receivedDate: r.receivedDate,
          dueDate: due,
          deadlineBasis: r.deadlineBasis ?? "机构模拟规则，非法定期限推断",
          reply: r.reply ?? "",
          implemented,
          status: implemented
            ? "有落实证据，待复核"
            : r.reply
              ? "已回复，未证实落实"
              : "待处理",
          sources: r.sources,
        };
      }),
    );
    return {
      rows,
      checks: rows
        .filter((r) => !r.implemented)
        .map((r) =>
          check(
            "feedback-not-implemented",
            `${r.id} ${r.status}`,
            r.sources,
            "待落实",
            true,
          ),
        ),
      tasks: rows.map((r) => ({
        title: `反馈 ${r.issueId}：${r.claim ?? ""}`,
        status: r.implemented
          ? "pending-review"
          : r.reply
            ? "replied"
            : "pending",
        sources: r.sources,
        feedbackId: r.feedbackId,
      })),
    };
  },
  D01(c) {
    const requirements = c
      .records("requirement")
      .filter((r) => !r.phase || r.phase === "review");
    const rows = requirements.map((r) => {
      const requested = r.expectedDocumentId ?? r.documentId;
      const candidates = c.state.documents.filter(
        (d) =>
          d.kind === r.requiredKind ||
          d.records.some((record) => record.type === r.requiredKind) ||
          d.id === requested,
      );
      const chosen = requested
        ? candidates.find((d) => d.id === requested)
        : (candidates.find((d) => d.status === "confirmed") ?? candidates[0]);
      const latest = candidates.find((d) => d.status === "confirmed");
      return {
        id: r.id,
        required: r.title ?? r.requiredKind,
        provided: chosen?.name ?? "未提供",
        providedVersion: chosen?.version ?? null,
        requiredVersion: r.requiredVersion ?? latest?.version ?? null,
        status: !chosen
          ? "缺件"
          : r.requiredVersion && chosen.version !== Number(r.requiredVersion)
            ? "错版"
            : chosen.status !== "confirmed"
              ? "待确认"
              : "版本对应",
        sources: refs([r, ...(chosen ? [{ sources: [c.ref(chosen)] }] : [])]),
      };
    });
    return {
      rows,
      checks: rows
        .filter((r) => r.status !== "版本对应")
        .map((r) =>
          check(
            "package-gap",
            `${r.required}：${r.status}`,
            r.sources,
            "待补正",
            true,
          ),
        ),
    };
  },
  D02(c) {
    const rs = reportRows(c);
    const checks = reportChecks(c, rs);
    const rows = rs.map((r) => ({
      id: r.id,
      issue: r.title ?? r.id,
      sampleScope: r.sampleScope ?? "未提供样本范围",
      claimScope: r.claimScope ?? "未提供表述范围",
      evidenceCount: r.evidenceIds?.length ?? 0,
      amountYuan: amount(r),
      unresolved: c.state.tasks.filter(
        (t) =>
          t.issueId === r.id && !["closed", "implemented"].includes(t.status),
      ).length,
      status: checks.some((x) =>
        x.sources.some((s) =>
          r.sources.some((t) => s.documentId === t.documentId),
        ),
      )
        ? "需补证或修改"
        : "技术检查未见差异，仍需独立复核",
      sources: r.sources,
    }));
    return { rows, checks };
  },
  D03(c) {
    const reports = reportRows(c);
    const rows = [];
    const checks = [];
    for (const r of reports) {
      const ids = r.lawIds ?? c.state.laws.map((l) => l.id);
      for (const lid of ids) {
        const law = c.state.laws.findLast(
          (l) =>
            (l.id === lid || l.logicalId === lid) &&
            l.status !== "stale" &&
            c.documents.some((document) =>
              l.sources.some((source) => source.documentId === document.id),
            ),
        );
        const dateValue = r.behaviorDate ?? r.date ?? c.options.behaviorDate;
        const valid =
          law &&
          date(dateValue) &&
          dateValue >= law.effectiveFrom &&
          (!law.effectiveTo || dateValue <= law.effectiveTo);
        const quotationMatches =
          !r.quotation || Boolean(law?.excerpt.includes(r.quotation));
        const status = !law
          ? "依据不存在"
          : !valid
            ? "行为期与法规施行期待核"
            : !quotationMatches
              ? "引文与原文不符"
              : law.status !== "人工已确认"
                ? "适用性待人工核验"
                : "来源/期间对应，定性待审理";
        rows.push({
          reportId: r.id,
          lawId: lid,
          article: law?.article ?? "",
          officialUrl: law?.officialUrl ?? "",
          effectiveFrom: law?.effectiveFrom ?? "",
          behaviorDate: dateValue ?? "",
          quotationMatches,
          status,
          sources: refs([r, ...(law ? [law] : [])]),
        });
        if (status !== "来源/期间对应，定性待审理")
          checks.push(
            check(
              "citation-review",
              `${r.id} / ${lid}：${status}`,
              refs([r, ...(law ? [law] : [])]),
              "待审理",
              true,
            ),
          );
      }
    }
    return { rows, checks };
  },
  D04(c) {
    const rs = c.records("review");
    const rows = rs.map((r) => {
      const artifact = c.state.artifacts.find(
        (a) => a.id === r.modifiedArtifactId && a.status !== "stale",
      );
      const locator = r.modifiedLocator;
      const implemented = Boolean(
        artifact &&
          locator &&
          r.evidenceIds?.length &&
          r.evidenceIds.every((evidenceId) => evidenceExists(c, evidenceId)) &&
          (!r.expectedText || artifact.content.includes(r.expectedText)),
      );
      return {
        id: r.id,
        target: r.targetId ?? r.issueId,
        requirement: r.requirement ?? r.text,
        response: r.response ?? "",
        modifiedArtifactId: artifact?.id ?? "",
        modifiedLocator: locator ?? "",
        implemented,
        status: implemented
          ? "具备落实依据，待独立复核"
          : r.response
            ? "已回复但未落实"
            : "未处理",
        sources: refs([r, ...(artifact ? [artifact] : [])]),
      };
    });
    const checks = rows
      .filter((r) => !r.implemented)
      .map((r) =>
        check(
          "review-not-implemented",
          `${r.id}：${r.status}`,
          r.sources,
          "待落实",
          true,
        ),
      );
    for (const [target, items] of group(rs, (r) => r.targetId ?? r.issueId)) {
      if (unique(items.map((r) => r.expectedValue).filter(present)).length > 1)
        checks.push(
          check(
            "review-conflict",
            `${target} 复核意见要求互相冲突，需协调`,
            refs(items),
            "待协调",
            true,
          ),
        );
    }
    return { rows, checks };
  },
  E01(c) {
    const reports = reportRows(c);
    const checks = reportChecks(c, reports);
    const relevant = c.selectedArtifacts.length
      ? c.selectedArtifacts.filter(
          (a) => !["C01", "B09"].includes(a.scenarioId),
        )
      : [
          ...group(
            c.state.artifacts.filter((a) =>
              ["C02", "D01", "D02", "D03", "D04"].includes(a.scenarioId),
            ),
            (a) => a.scenarioId,
          ).values(),
        ].map((as) => as.at(-1));
    for (const a of relevant) {
      if (a.status !== "confirmed")
        checks.push(
          check(
            "unconfirmed-version",
            `${a.title} v${a.version} 为 ${a.status}，尚未经人工确认`,
            a.sources,
            "待人工确认",
            true,
          ),
        );
    }
    const rows = ["事实", "日期", "金额数字", "版本与内控"].map(
      (category, i) => {
        const codes = [
          ["scope-overreach", "missing-evidence", "broken-evidence"],
          ["invalid-date", "date-conflict"],
          [
            "source-amount",
            "prose-amount",
            "double-total",
            "attachment-amount",
          ],
          ["unconfirmed-version"],
        ][i];
        const relevantChecks = checks.filter((x) => codes.includes(x.code));
        return {
          id: `E01-${i + 1}`,
          category,
          status: relevantChecks.length
            ? "待补正/专业判断"
            : "技术检查通过，待人工确认",
          issues: relevantChecks.length,
          reportVersions: c.documents
            .filter((d) => d.kind === "report")
            .map((d) => `${d.id}@${d.version}`)
            .join(", "),
          sources: refs([...reports, ...(i === 3 ? relevant : [])]),
        };
      },
    );
    return {
      rows,
      checks,
      dependencies: [
        ...relevant.map((a) => a.id),
        ...c.selectedArtifacts.map((a) => a.id),
      ],
    };
  },
  F01(c) {
    const rs = c.records("rectification");
    const reqs = rs.filter(
      (r) => r.recordKind === "requirement" || r.requiredAmount !== undefined,
    );
    const proofs = rs.filter((r) => r.recordKind === "proof" || r.voucherId);
    requireThat(
      reqs.length,
      "缺少整改要求记录（requiredAmount/recordKind）",
      409,
    );
    const rows = reqs.map((r) => {
      const matches = proofs.filter((p) => p.issueId === r.issueId);
      const valid = matches.filter(
        (p) =>
          p.payer === r.responsible &&
          p.recipient === r.recipient &&
          (p.bankVerified === true ||
            (/冲减|对账|offset/.test(p.proofType ?? "") &&
              p.offsetVerified === true)) &&
          p.voucherId &&
          proofs.filter((q) => q.voucherId === p.voucherId).length === 1,
      );
      const required = money(r.requiredAmount, r.unit),
        verified = sum(valid, amount);
      return {
        id: r.id,
        issueId: r.issueId,
        responsible: r.responsible,
        requiredAmount: required,
        verifiedAmount: verified,
        remaining:
          required === null ? null : round(Math.max(0, required - verified)),
        reportedStatus: r.reportedStatus ?? "待反馈",
        status:
          required !== null &&
          verified >= required &&
          (required > 0 || r.nonFinancialVerified === true)
            ? "具备复查条件"
            : matches.length
              ? "需补充到账/主体/唯一凭证"
              : "待反馈",
        sources: refs([r, ...matches]),
      };
    });
    return {
      rows,
      checks: rows
        .filter((r) => r.status !== "具备复查条件")
        .map((r) =>
          check("rectification-gap", `${r.issueId}：${r.status}`, r.sources),
        ),
      tasks: rows.map((r) => ({
        title: `整改 ${r.issueId}`,
        issueId: r.issueId,
        status:
          r.status === "具备复查条件" ? "ready-review" : "pending-evidence",
        requiredAmount: r.requiredAmount,
        verifiedAmount: r.verifiedAmount,
        sources: r.sources,
      })),
    };
  },
  F02(c) {
    const base = handlers.F01(c);
    const followups = c
      .records("rectification")
      .filter((r) => r.recordKind === "followup");
    const rows = base.rows.map((r) => {
      const follow = followups.filter((x) => x.issueId === r.issueId);
      const recurrence = follow.some((x) => x.recurred === true);
      return {
        ...r,
        followupPeriods: follow.map((x) => x.period).join(", "),
        recurrence,
        recommendation: recurrence
          ? "反弹，继续整改"
          : r.status === "具备复查条件" &&
              r.remaining === 0 &&
              follow.length &&
              follow.every((x) => x.confirmed === true)
            ? "可提请人工销号"
            : "待效果复查，不能销号",
        sources: refs([r, ...follow]),
      };
    });
    return {
      rows,
      checks: rows
        .filter((r) => r.recommendation !== "可提请人工销号")
        .map((r) =>
          check(
            "effect-review",
            `${r.issueId}：${r.recommendation}`,
            r.sources,
          ),
        ),
    };
  },
  F03(c) {
    const rs = reportRows(c);
    const scope = c.options.publicScope ?? ["title", "amount"];
    const rows = rs.map((r) => {
      let text = String(r.text ?? r.title ?? "");
      const matches = [...text.matchAll(/1[3-9]\d{9}|\b\d{17}[\dXx]\b/g)].map(
        (x) => x[0],
      );
      for (const sensitive of [...matches, ...(r.personalNames ?? [])])
        text = text.split(sensitive).join("[已脱敏]");
      const qualifier =
        r.factStatus === "confirmed"
          ? "经人工确认"
          : r.selfReported
            ? "单位自报，未经核实"
            : "待核实";
      return {
        id: r.id,
        title: scope.includes("title") ? r.title : "[范围外]",
        text: `${qualifier}；${text}`,
        amountYuan: scope.includes("amount") ? amount(r) : null,
        redactions: matches.length + (r.personalNames?.length ?? 0),
        status: "公告候选，未经公开审批",
        sources: r.sources,
      };
    });
    return {
      rows,
      checks: [
        ...reportChecks(c, rs),
        check(
          "publication-review",
          "公开范围、个人信息、内部工作信息和最终发布须有权人员审核；本场景不发布",
          refs(rs),
        ),
      ],
    };
  },
  F04(c) {
    const requirements = c
      .records("requirement")
      .filter((r) => !r.phase || r.phase === "archive");
    const rows = requirements.map((r) => {
      const ds = c.state.documents.filter(
        (d) =>
          d.kind === r.requiredKind ||
          d.records.some((record) => record.type === r.requiredKind) ||
          d.id === r.documentId,
      );
      const selected = ds.find((d) => d.status === "confirmed") ?? ds[0];
      return {
        id: r.id,
        required: r.title ?? r.requiredKind,
        documentId: selected?.id ?? "",
        name: selected?.name ?? "未提供",
        version: selected?.version ?? null,
        pages: selected?.pages ?? null,
        status: !selected
          ? "缺失待补"
          : r.requiredVersion && selected.version !== Number(r.requiredVersion)
            ? "错版"
            : selected.status !== "confirmed"
              ? "待确认"
              : r.requirePages && !selected.pages
                ? "页码待核"
                : "清单对应，待档案接收",
        sources: refs([
          r,
          ...(selected ? [{ sources: [c.ref(selected)] }] : []),
        ]),
      };
    });
    return {
      rows,
      checks: rows
        .filter((r) => r.status !== "清单对应，待档案接收")
        .map((r) =>
          check("archive-gap", `${r.required}：${r.status}`, r.sources),
        ),
      summary: {
        rectificationIndependent: true,
        unresolvedRectification: c.state.tasks.filter(
          (t) => t.scenarioId === "F01" && t.status !== "closed",
        ).length,
      },
    };
  },
  F05(c) {
    const measurements = c.records("measurement");
    const confirmed = measurements.filter((r) => r.factStatus === "confirmed");
    const sources = refs(confirmed.length ? confirmed : measurements);
    const schema = unique(
      measurements.flatMap((r) =>
        Object.keys(r).filter(
          (k) =>
            ![
              "sources",
              "documentName",
              "documentVersion",
              "factStatus",
            ].includes(k),
        ),
      ),
    );
    const rows = [
      {
        library: "knowledge",
        title: "区间重叠核查方法与反例",
        content:
          "同一实体与单位经人工确认后，计算区间交集；不同实体、冲回、重复影像不得据此认定重复金额。",
        scope: "线性工程计量；需确认合同、实体和计量单位",
        sources,
      },
      {
        library: "capability",
        title: "区间交集与价款复算",
        content: {
          algorithm: "interval-overlap-v1",
          requiredFields: ["segmentId", "start", "end", "unitPrice"],
          unit: "米",
        },
        scope: "同实体线性区间；单价单位元/米",
        sources,
      },
      {
        library: "data",
        title: "计量数据字段模型",
        content: {
          fields: schema,
          recordCount: measurements.length,
          containsProjectFacts: false,
        },
        scope: "字段定义与口径；不复制个案金额",
        sources,
      },
    ];
    return {
      rows,
      checks: [
        check(
          "asset-review",
          "候选资产须确认来源、脱敏、授权与适用范围；能力须实测后发布",
          sources,
        ),
      ],
      assetCandidates: rows.map((r) => ({
        ...r,
        status: "candidate",
        sourceConfirmed: confirmed.length === measurements.length,
        permission: "private",
        version: 1,
        testResults: null,
      })),
    };
  },
};
export function executeScenario(state, scenarioId, payload = {}) {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  requireThat(scenario, "未知场景", 404);
  let documents;
  if (payload.documentIds !== undefined) {
    requireThat(Array.isArray(payload.documentIds), "documentIds 必须是数组");
    documents = payload.documentIds.map((d) => {
      const doc = state.documents.find((x) => x.id === d);
      requireThat(doc, `资料 ${d} 不存在`, 404);
      return doc;
    });
  } else {
    documents = [...group(state.documents, (d) => d.logicalId).values()].map(
      (ds) =>
        ds.find((d) => d.status === "confirmed") ??
        ds.find((d) => d.status !== "superseded") ??
        ds[0],
    );
  }
  for (const kind of scenario.requiredKinds)
    requireThat(
      (kind === "report" &&
        (payload.artifactIds ?? []).some((id) =>
          state.artifacts.some(
            (a) => a.id === id && ["B09", "C01"].includes(a.scenarioId),
          ),
        )) ||
        documents.some((d) => d.kind === kind),
      `场景 ${scenarioId} 缺少 ${kind} 资料`,
      409,
    );
  const allRecords = documents
    .flatMap((d) =>
      d.records.map((record, index) => {
        const fact = state.facts.findLast(
          (f) =>
            f.documentId === d.id &&
            f.recordIndex === index &&
            f.status !== "superseded",
        );
        const r = fact?.record ?? record;
        return {
          ...r,
          id: r.id ?? `${d.id}:${index + 1}`,
          type: r.type ?? d.kind,
          originDocumentId: d.id,
          documentName: d.name,
          documentVersion: d.version,
          factStatus: fact?.status ?? "pending",
          sources: [
            {
              documentId: d.id,
              version: d.version,
              locator: r.locator ?? `记录 ${index + 1}`,
              factId: fact?.id,
              quote: JSON.stringify(r).slice(0, 500),
            },
            ...(fact?.sources ?? []).filter(
              (source) => source.documentId !== d.id,
            ),
          ],
        };
      }),
    )
    .filter((r) => !r.projectId || r.projectId === state.project.id);
  const selectedArtifacts = (payload.artifactIds ?? []).map((a) => {
    const artifact = state.artifacts.find((x) => x.id === a);
    requireThat(artifact, `成果 ${a} 不存在`, 404);
    requireThat(
      artifact.status !== "stale",
      `成果 ${a} 已失效，请选择重算或修订版本`,
      409,
    );
    return artifact;
  });
  const context = {
    state,
    documents,
    allRecords,
    selectedArtifacts,
    options: payload.options ?? {},
    records: (...types) => allRecords.filter((r) => types.includes(r.type)),
    ref: (d) => ({ documentId: d.id, version: d.version, locator: "全文" }),
  };
  const result = handlers[scenarioId](context);
  requireThat(
    result.rows.length > 0,
    `场景 ${scenarioId} 未发现可用结构化记录，请检查解析与资料种类`,
    409,
  );
  result.sources = refs([
    ...result.rows,
    ...(result.checks ?? []),
    ...(result.findings ?? []),
  ]);
  for (const source of result.sources) {
    if (
      source.factId &&
      state.facts.some(
        (fact) =>
          fact.id === source.factId &&
          ["stale", "superseded"].includes(fact.status),
      )
    ) {
      (result.checks ??= []).push(
        check(
          "stale-source",
          `来源事实 ${source.factId} 的确认已失效，请先确认资料适用版或修订事实`,
          [source],
          "待复核",
          true,
        ),
      );
    }
  }
  result.content = markdown(scenario.title, result.rows, result.checks ?? []);
  if (result.findings?.length)
    result.content += `\n\n## 候选发现与计算过程（待人工核验）\n\n${result.findings.map((finding) => `### ${finding.title}\n\n${finding.detail}\n\n涉及金额：${finding.amount ?? "待核"}元。来源：${finding.sources.map((source) => `${source.documentId} v${source.version} ${source.locator}`).join("；")}`).join("\n\n")}`;
  result.title = scenario.title;
  return { result, documents, scenario };
}
export function testCapability(asset) {
  requireThat(
    asset.content?.algorithm === "interval-overlap-v1",
    "能力算法未登记，不能执行任意生成代码",
  );
  const cases = [
    { a: [0, 200], b: [80, 300], p: 1800, expected: 216000 },
    { a: [0, 80], b: [80, 100], p: 1800, expected: 0 },
    { a: [100, 200], b: [0, 50], p: 2, expected: 0 },
    { a: [10, 30], b: [0, 40], p: 2.5, expected: 50 },
  ];
  return cases
    .map((c) => ({
      ...c,
      actual: round(
        intervalOverlap(
          { start: c.a[0], end: c.a[1] },
          { start: c.b[0], end: c.b[1] },
        ) * c.p,
      ),
    }))
    .map((r) => ({ ...r, passed: r.actual === r.expected }));
}
