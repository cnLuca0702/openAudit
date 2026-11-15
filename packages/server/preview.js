import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, chmod, writeFile, rm, open } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
import { AuditError, requireThat } from "./core.js";
const exec = promisify(execFile);
const OFFICE = new Set([".doc", ".docx", ".wps", ".rtf", ".odt"]);
const LIMIT = 64 * 1024 * 1024;
export function isPdf(bytes) {
  return bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"));
}

// Every conversion gets a networkless filesystem namespace and an unprivileged UID.
// Only this job's original, profile and output are writable/visible besides system libraries/fonts.
export async function convertOffice(bytes, extension) {
  const root = await mkdtemp(join(tmpdir(), "openaudit-preview-"));
  const job = join(root, "work");
  try {
    await mkdir(job, { mode: 0o777 });
    await chmod(job, 0o777);
    await writeFile(join(job, "original" + extension), bytes, { mode: 0o444 });
    await mkdir(join(job, "profile/user"), { recursive: true, mode: 0o777 });
    await chmod(join(job, "profile"), 0o777);
    await chmod(join(job, "profile/user"), 0o777);
    await writeFile(
      join(job, "profile/user/registrymodifications.xcu"),
      `<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item><item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item></oor:items>`,
      { mode: 0o666 },
    );
    await chmod(join(job, "profile/user/registrymodifications.xcu"), 0o666);
    const args = [
      "--die-with-parent",
      "--new-session",
      "--unshare-all",
      "--cap-drop",
      "ALL",
      "--uid",
      "65534",
      "--gid",
      "65534",
      "--ro-bind",
      "/usr",
      "/usr",
      "--symlink",
      "usr/bin",
      "/bin",
      "--symlink",
      "usr/lib",
      "/lib",
      "--symlink",
      "usr/lib64",
      "/lib64",
      "--ro-bind-try",
      "/etc/libreoffice",
      "/etc/libreoffice",
      "--ro-bind-try",
      "/etc/fonts",
      "/etc/fonts",
      "--ro-bind-try",
      "/var/cache/fontconfig",
      "/var/cache/fontconfig",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--bind",
      job,
      "/work",
      "--chdir",
      "/work",
      "--clearenv",
      "--setenv",
      "HOME",
      "/work",
      "--setenv",
      "PATH",
      "/usr/bin:/bin",
      "--setenv",
      "LANG",
      "C.UTF-8",
      "/usr/bin/prlimit",
      "--as=2147483648",
      "--cpu=45",
      "--fsize=67108864",
      "--nofile=256",
      "--",
      "/usr/bin/libreoffice",
      "-env:UserInstallation=file:///work/profile",
      "--headless",
      "--nologo",
      "--nodefault",
      "--norestore",
      "--convert-to",
      "pdf:writer_pdf_Export",
      "--outdir",
      "/work",
      "/work/original" + extension,
    ];
    await exec("bwrap", args, {
      timeout: 60000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    });
    const output = join(job, "original.pdf");
    const handle = await open(
      output,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const info = await handle.stat();
      requireThat(
        info.isFile() && info.size <= LIMIT,
        "预览文件过大或无效，请下载原件查看",
        413,
      );
      const pdf = await handle.readFile();
      requireThat(isPdf(pdf), "未能生成有效预览", 422);
      return pdf;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof AuditError) throw error;
    if (error.code === "ENOENT" && error.path === "bwrap")
      throw new AuditError("服务器尚未安装文档预览组件，请下载原件查看", 503);
    throw new AuditError(
      "暂时无法预览此文件：可能已加密、损坏或属于不支持的旧版 WPS 格式。请下载原件，用 Word 或 WPS 打开；也可另存为 DOCX 或 PDF 后上传。",
      422,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
export class DocumentPreview {
  constructor(converter = convertOffice) {
    this.converter = converter;
    this.cache = new Map();
    this.pending = new Map();
    this.size = 0;
  }
  async open(file) {
    const extension = extname(file.name).toLowerCase();
    if (extension === ".pdf" || file.mimeType === "application/pdf") {
      requireThat(
        isPdf(file.bytes),
        "PDF 文件已损坏或格式不正确，请下载原件核验",
        422,
      );
      return { ...file, mimeType: "application/pdf", converted: false };
    }
    requireThat(
      OFFICE.has(extension),
      "此类资料暂不支持分页预览，请下载原件查看",
      415,
    );
    const b = file.bytes;
    requireThat(
      b.length <= 10 * 1024 * 1024,
      "资料超过预览大小限制，请下载原件查看",
      413,
    );
    requireThat(
      b.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex")) ||
        b.subarray(0, 2).toString() === "PK" ||
        b.subarray(0, 5).toString() === "{\\rtf" ||
        b.subarray(0, 3).toString() === "WPS",
      "文件格式无法识别，请下载原件核验，或另存为 DOCX、PDF 后上传",
      422,
    );
    const key = createHash("sha256").update(b).update(extension).digest("hex");
    let pdf = this.cache.get(key);
    if (!pdf) {
      let pending = this.pending.get(key);
      if (!pending) {
        requireThat(
          this.pending.size < 2,
          "文档预览正在处理其他资料，请稍后重试",
          429,
        );
        pending = this.converter(b, extension)
          .then((result) => {
            requireThat(
              isPdf(result) && result.length <= LIMIT,
              "未能生成有效预览，请下载原件查看",
              422,
            );
            while (this.size + result.length > LIMIT && this.cache.size) {
              const oldest = this.cache.keys().next().value;
              this.size -= this.cache.get(oldest).length;
              this.cache.delete(oldest);
            }
            this.cache.set(key, result);
            this.size += result.length;
            return result;
          })
          .finally(() => this.pending.delete(key));
        this.pending.set(key, pending);
      }
      pdf = await pending;
    }
    return {
      name: file.name + ".pdf",
      mimeType: "application/pdf",
      bytes: pdf,
      converted: true,
    };
  }
}
