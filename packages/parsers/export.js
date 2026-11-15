import {zipSync,strToU8} from 'fflate';
import ExcelJS from 'exceljs';
const names={id:'编号',title:'标题',description:'说明',detail:'计算过程与说明',status:'状态',amount:'金额（元）',amountYuan:'金额（元）',sources:'来源',code:'检查代码',message:'核验事项',blocking:'是否阻断',matter:'比对事项',document:'资料',scope:'范围',quantity:'数量',start:'起点',end:'终点',version:'版本',date:'日期',unit:'单位',paymentId:'付款编号',contractId:'合同编号',paymentCap:'支付上限（元）'};
const label=key=>names[key]??key;
const xml=text=>String(text??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const clean=text=>String(text??'').replace(/\*\*(.*?)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1（$2）');
const paragraph=(text,level=0)=>`<w:p><w:pPr><w:spacing w:after="120"/>${level?'<w:keepNext/>':''}</w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="微软雅黑"/>${level?`<w:b/><w:sz w:val="${level===1?32:26}"/>`:'<w:sz w:val="21"/>'}</w:rPr><w:t xml:space="preserve">${xml(clean(text))}</w:t></w:r></w:p>`;
function table(rows){
 const columns=Math.max(...rows.map(r=>r.length)),width=Math.floor(9638/columns);
 return `<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(k=>`<w:${k} w:val="single" w:sz="4" w:color="B7C9C8"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${Array(columns).fill(`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows.map((row,i)=>`<w:tr>${i===0?'<w:trPr><w:tblHeader/></w:trPr>':''}${row.map(cell=>`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${i===0?'<w:shd w:fill="E4EFED"/>':''}</w:tcPr>${paragraph(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
}
function markdownBlocks(content){
 const lines=String(content??'').split('\n'),blocks=[];
 const cells=line=>line.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(s=>s.trim().replace(/\\\|/g,'|'));
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(line.trim().startsWith('|')&&/^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1]??'')){
   const header=cells(line).map(label),rows=[];i+=2;
   for(;i<lines.length&&lines[i].trim().startsWith('|');i++) rows.push(cells(lines[i]));i--;
   if(header.length<=6)blocks.push(table([header,...rows]));
   else for(const [n,row] of rows.entries())blocks.push(paragraph(`记录 ${n+1}`,3),table([['字段','内容'],...header.map((key,k)=>[key,row[k]??''])]));
  }else if(/^#{1,6} /.test(line)){const match=line.match(/^(#+) (.*)$/);blocks.push(paragraph(match[2],match[1].length));}
  else if(line.trim()&&!/^---+$/.test(line.trim()))blocks.push(paragraph(line.replace(/^- /,'• ')));
 }
 return blocks.join('');
}
export function createWord(artifact){
 const body=paragraph(artifact.title,1)+paragraph('演示模拟数据 — 辅助分析成果，须人工复核')+paragraph(`版本：${artifact.version}；状态：${artifact.status}；生成时间：${artifact.createdAt}`)+markdownBlocks(artifact.content)+paragraph('来源索引',2)+(artifact.sources??[]).map(s=>paragraph(`${s.documentId ?? s.artifactId ?? s.factId ?? '待定位'} v${s.version} ${s.locator} ${s.factId??''} ${s.quote??''}`)).join('');
 const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
 return Buffer.from(zipSync({
  '[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml':strToU8(document),
 }));
}
export async function createWorkbook(artifact){
 const workbook=new ExcelJS.Workbook();workbook.creator='openAudit';workbook.subject='演示模拟数据';
 function records(title,rows){const sheet=workbook.addWorksheet(title);sheet.addRow(['演示模拟数据',artifact.title,`版本 ${artifact.version}`,`状态 ${artifact.status}`]);const keys=[...new Set(rows.flatMap(Object.keys))];sheet.addRow(keys.map(label));for(const row of rows)sheet.addRow(keys.map(key=>typeof row[key]==='object'?JSON.stringify(row[key]):row[key]??''));sheet.views=[{state:'frozen',ySplit:2}];sheet.getRow(2).font={bold:true};sheet.columns.forEach(c=>{c.width=26;});return sheet;}
 records('核验结果',artifact.rows??[]);
 records('候选发现',artifact.findings??[]);
 records('核验事项',artifact.checks??[]);
 const prose=workbook.addWorksheet('成果正文');prose.addRow(['演示模拟数据','正文（含AI解释时仍待人工核验）']);for(const line of String(artifact.content??'').split('\n')){for(let i=0;i<Math.max(1,line.length);i+=30000)prose.addRow([line.slice(i,i+30000)]);}prose.getColumn(1).width=100;prose.getColumn(1).alignment={wrapText:true,vertical:'top'};
 const sources=workbook.addWorksheet('来源索引');sources.addRow(['资料ID','版本','定位','事实ID','成果ID','原文节录']);for(const source of artifact.sources??[])sources.addRow([source.documentId,source.version,source.locator,source.factId??'',source.artifactId??'',source.quote??'']);sources.columns.forEach(c=>{c.width=30;});
 return Buffer.from(await workbook.xlsx.writeBuffer());
}
