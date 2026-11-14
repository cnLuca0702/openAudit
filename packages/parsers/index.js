import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { unzipSync } from 'fflate';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TEXT = 1500000;

function boundedText(text) {
  if (text.length > MAX_TEXT) throw new Error('解析文本超过 150 万字符，请拆分资料');
  return text;
}
function result(text, records = [], warnings = []) {
  return { text: boundedText(text), records, parseStatus: text.trim() ? 'parsed' : 'pending', warnings: text.trim() ? warnings : [...warnings, '未提取到可读文本；需要图像识别或人工补充，不能据此认定无内容'] };
}
function safeZip(buffer) {
  let total = 0, count = 0;
  return unzipSync(new Uint8Array(buffer), { filter(entry) {
    count++; total += entry.originalSize;
    if (count > 3000 || total > 64 * 1024 * 1024 || entry.originalSize > 32 * 1024 * 1024) throw new Error('压缩包展开超限');
    if (entry.name.includes('\\') || entry.name.startsWith('/') || entry.name.split('/').includes('..')) throw new Error('压缩包包含非法路径');
    return true;
  } });
}
function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0,10);
  if (typeof value !== 'object') return value;
  if ('result' in value) return cellText(value.result);
  if ('richText' in value) return value.richText.map(t=>t.text).join('');
  if ('text' in value) return value.text;
  if ('error' in value) return value.error;
  return '';
}

export async function parseDocument({ buffer, mimeType = '', name = '' }) {
  if (!(buffer instanceof Uint8Array) || !buffer.length || buffer.length > MAX_FILE) throw new Error('资料必须为 1 字节至 10 MiB');
  buffer = Buffer.from(buffer);
  const ext = extname(name).toLowerCase();
  if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
    safeZip(buffer);
    const parsed = await mammoth.extractRawText({buffer});
    const paragraphs = parsed.value.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
    return result(paragraphs.map((text,i)=>`[段落 ${i+1}] ${text}`).join('\n'), [], parsed.messages.map(m=>m.message));
  }
  if (ext === '.xlsx' || mimeType.includes('spreadsheetml')) {
    safeZip(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const lines = [], records = [], warnings = [];
    let totalCells = 0;
    for (const sheet of workbook.worksheets) {
      let headers = null;
      sheet.eachRow((row,rowNumber)=>{
        totalCells += row.cellCount;
        if (totalCells > 100000) throw new Error('表格超过 10 万单元格，请拆分资料');
        const values=[];
        row.eachCell({includeEmpty:true},cell=>{
          values.push(cellText(cell.value));
          if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value && cell.value.result === undefined) warnings.push(`${sheet.name}!${cell.address} 公式无缓存值，未执行公式`);
        });
        if (!headers) { headers=values.map((v,i)=>String(v||`列${i+1}`)); lines.push(`[${sheet.name}!${rowNumber}] ${headers.join(' | ')}`); return; }
        const record={locator:`${sheet.name}!A${rowNumber}:${row.getCell(Math.max(1,values.length)).address}`};
        values.forEach((value,i)=>{ record[headers[i]??`列${i+1}`]=value; });
        records.push(record);
        lines.push(`[${sheet.name}!${rowNumber}] ${values.join(' | ')}`);
      });
    }
    return result(lines.join('\n'), records, [...new Set(warnings)]);
  }
  if (ext === '.pdf' || mimeType === 'application/pdf') {
    const directory=await mkdtemp(join(tmpdir(),'openaudit-pdf-'));
    try {
      const input=join(directory,'input.pdf'), output=join(directory,'output.txt');
      await writeFile(input,buffer);
      try { await exec('pdftotext',['-layout','-enc','UTF-8',input,output],{timeout:30000,maxBuffer:2*1024*1024}); }
      catch(error) { throw new Error(error.code==='ENOENT' ? '服务器缺少 poppler-utils/pdftotext，无法解析 PDF' : 'PDF 文本解析失败，文件可能损坏、加密或超时'); }
      const text=await readFile(output,'utf8');
      const pages=text.split('\f').map((page,i)=>page.trim() ? `[第 ${i+1} 页]\n${page.trim()}` : '').filter(Boolean);
      return result(pages.join('\n\n'));
    } finally { await rm(directory,{recursive:true,force:true}); }
  }
  if (ext === '.zip' || mimeType === 'application/zip') {
    const entries=safeZip(buffer);
    return {text:'',records:[],parseStatus:'archive',warnings:['压缩包应逐文件接收登记；每个条目保持独立来源'],entries:Object.entries(entries).filter(([path])=>!path.endsWith('/')).map(([path,data])=>({name:path,buffer:Buffer.from(data)}))};
  }
  if (mimeType.startsWith('image/') || mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
    return {text:'',records:[],parseStatus:'pending',warnings:['原始多模态文件已保留，需要运行图像分析或语音转写后人工核验']};
  }
  if (['.txt','.md','.csv','.json'].includes(ext) || mimeType.startsWith('text/') || mimeType === 'application/json') return result(buffer.toString('utf8'));
  return {text:'',records:[],parseStatus:'pending',warnings:['此类型仅保存原件，解析需人工补充']};
}

export async function extractVideoFrames({buffer, name='video.mp4', seconds=[0,2,4]}) {
  if (!(buffer instanceof Uint8Array) || buffer.length>MAX_FILE) throw new Error('视频超过 10 MiB');
  if (!Array.isArray(seconds)||!seconds.length||seconds.length>6||seconds.some(t=>!Number.isFinite(t)||t<0||t>3600)) throw new Error('视频抽帧需 1–6 个有效时间点');
  const directory=await mkdtemp(join(tmpdir(),'openaudit-video-'));
  try {
    const input=join(directory,'input'+(extname(name)||'.mp4'));
    await writeFile(input,buffer);
    const frames=[];
    for (const [i,second] of seconds.entries()) {
      const output=join(directory,`frame-${i}.png`);
      try { await exec('ffmpeg',['-nostdin','-v','error','-ss',String(second),'-i',input,'-frames:v','1','-vf','scale=1280:-2',output],{timeout:30000,maxBuffer:1024*1024}); frames.push({seconds:second,mimeType:'image/png',contentBase64:(await readFile(output)).toString('base64')}); }
      catch { throw new Error(`视频 ${second} 秒抽帧失败，检查时长及 ffmpeg 安装`); }
    }
    return frames;
  } finally { await rm(directory,{recursive:true,force:true}); }
}

export async function rasterizePDF({buffer, pages, maxPages=6}) {
  if (!(buffer instanceof Uint8Array) || !buffer.length || buffer.length>MAX_FILE) throw new Error('PDF 必须为 1 字节至 10 MiB');
  if (!Number.isInteger(maxPages) || maxPages<1 || maxPages>6) throw new Error('每次最多识别 6 页 PDF');
  const directory=await mkdtemp(join(tmpdir(),'openaudit-pdf-image-'));
  try {
    const input=join(directory,'input.pdf');await writeFile(input,buffer);
    let count;
    try {
      const {stdout}=await exec('pdfinfo',[input],{timeout:15000,maxBuffer:65536,env:{...process.env,LC_ALL:'C'}});
      count=Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    } catch { throw new Error('无法读取 PDF 页数；检查文件及 poppler-utils/pdfinfo 安装'); }
    if (!Number.isInteger(count)||count<1) throw new Error('PDF 页数无效');
    if (pages===undefined) {
      if(count>maxPages) throw new Error(`PDF 共 ${count} 页；请指定本次识别的 1–${maxPages} 个页码`);
      pages=Array.from({length:count},(_,i)=>i+1);
    }
    if(!Array.isArray(pages)||!pages.length||pages.length>maxPages||new Set(pages).size!==pages.length||pages.some(p=>!Number.isInteger(p)||p<1||p>count)) throw new Error(`识别页码须为 1–${count} 之间的 ${maxPages} 个以内不重复整数`);
    const frames=[];
    for(const page of pages){
      const output=join(directory,`page-${page}`);
      try { await exec('pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-scale-to','1800','-png',input,output],{timeout:30000,maxBuffer:65536}); }
      catch { throw new Error(`PDF 第 ${page} 页转图失败；检查 poppler-utils/pdftoppm 安装`); }
      frames.push({page,pageCount:count,mimeType:'image/png',contentBase64:(await readFile(output+'.png')).toString('base64')});
    }
    return frames;
  } finally { await rm(directory,{recursive:true,force:true}); }
}
