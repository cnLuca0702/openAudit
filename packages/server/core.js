import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, open } from "node:fs/promises";
import { join } from "node:path";
export const LABEL = "演示模拟数据";
export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${randomUUID().slice(0, 12)}`;
export const hash = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
export class AuditError extends Error {
  constructor(message, status = 400, code = "INVALID_INPUT") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function requireThat(condition, message, status = 400) {
  if (!condition) throw new AuditError(message, status);
}
export function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[,，]/g, ""));
  return Number.isFinite(n) ? n : null;
}
export function money(value, unit = "元") {
  const n = number(value);
  const scale = { 元: 1, 万元: 10000, 亿元: 100000000, CNY: 1 }[unit];
  return n === null || scale === undefined
    ? null
    : Math.round(n * scale * 100) / 100;
}
export const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function date(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
    ? value
    : null;
}
export const unique = (rows) => [
  ...new Map(rows.map((x) => [JSON.stringify(x), x])).values(),
];
export const refs = (rows) => unique(rows.flatMap((x) => x.sources ?? []));
export const md = (value) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
export function markdown(title, rows, checks = []) {
  const keys = unique(rows.flatMap((r) => Object.keys(r))).filter(
    (k) => !["sources", "record", "cells"].includes(k),
  );
  return (
    `# ${title}\n\n${LABEL} · 辅助分析，事实与适用性待人工确认\n\n` +
    (rows.length
      ? `| ${keys.map(md).join(" | ")} |\n| ${keys.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${keys.map((k) => md(typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k])).join(" | ")} |`).join("\n")}`
      : "没有可生成的行。") +
    (checks.length
      ? `\n\n## 核验与缺口\n${checks.map((c) => `- ${c.status}: ${c.message}`).join("\n")}`
      : "")
  );
}
export function check(
  code,
  message,
  sources = [],
  status = "待人工核验",
  blocking = false,
) {
  return { id: id("check"), code, message, sources, status, blocking };
}
export class Store {
  constructor(dir, initial) {
    this.dir = dir;
    this.initial = initial;
    this.queue = Promise.resolve();
  }
  async init() {
    await mkdir(join(this.dir, "objects"), { recursive: true, mode: 0o700 });
    await mkdir(join(this.dir, "snapshots"), { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(
        await readFile(join(this.dir, "state.json"), "utf8"),
      );
      requireThat(this.state.schemaVersion === 1, "数据版本不受支持", 500);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      this.state = this.initial();
      await this.persist(this.state);
    }
    return this;
  }
  read() {
    return structuredClone(this.state);
  }
  async persist(state) {
    const dest = join(this.dir, "state.json");
    const tmp = dest + "." + randomUUID() + ".tmp";
    const file = await open(tmp, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(state, null, 2));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(tmp, dest);
    const directory = await open(this.dir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  transaction(fn) {
    const job = this.queue.then(async () => {
      const draft = this.read();
      const result = await fn(draft);
      draft.revision++;
      await this.persist(draft);
      this.state = draft;
      return { state: this.read(), result };
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async put(bytes) {
    const fingerprint = hash(bytes);
    try {
      await writeFile(join(this.dir, "objects", fingerprint), bytes, {
        flag: "wx",
        mode: 0o600,
      });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    return fingerprint;
  }
  async bytes(fingerprint) {
    requireThat(/^[a-f0-9]{64}$/.test(fingerprint), "原件指纹无效");
    return readFile(join(this.dir, "objects", fingerprint));
  }
  async snapshot(state) {
    const file = `${Date.now()}-${randomUUID()}.json`;
    await writeFile(
      join(this.dir, "snapshots", file),
      JSON.stringify(state, null, 2),
      { mode: 0o600, flag: "wx" },
    );
    return file;
  }
}
export function csvParse(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  requireThat(!quoted, "CSV 引号未闭合");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((s) => s.replace(/^\uFEFF/, ""));
  requireThat(new Set(headers).size === headers.length, "CSV 列名重复");
  return rows.map((r, i) =>
    Object.fromEntries([
      ...headers.map((h, j) => [h, r[j] ?? ""]),
      ["locator", `行 ${i + 2}`],
    ]),
  );
}
export const MIME = {
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
  doc: "application/msword",
  wps: "application/vnd.ms-works",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
};
export function parse(bytes, mime, explicitRecords) {
  let text = "",
    records = [],
    parseStatus = "pending-human-extraction";
  if (
    [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "image/svg+xml",
    ].includes(mime)
  ) {
    text = bytes.toString("utf8");
    parseStatus = "parsed";
    if (mime === "application/json") {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new AuditError("JSON 资料格式错误");
      }
      records = Array.isArray(data)
        ? data
        : Array.isArray(data.records)
          ? data.records
          : [];
    }
    if (mime === "text/csv") records = csvParse(text);
  }
  if (explicitRecords !== undefined) {
    requireThat(Array.isArray(explicitRecords), "records 必须为数组");
    records = explicitRecords;
    parseStatus = text
      ? "parsed-with-supplied-records"
      : "supplied-records-needs-verification";
  }
  requireThat(records.length <= 10000, "资料记录超过 10000 条", 413);
  requireThat(
    records.every((r) => r && typeof r === "object" && !Array.isArray(r)),
    "每条派生记录必须是对象",
  );
  return { text, records, parseStatus };
}
