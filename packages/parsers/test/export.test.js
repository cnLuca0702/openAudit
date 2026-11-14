import test from 'node:test';
import assert from 'node:assert/strict';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import {unzipSync,strFromU8} from 'fflate';
import {createWord,createWorkbook} from '../export.js';
const artifact={title:'支付核验',content:'金额 216000 元。待人工核验。<不确定>',version:2,status:'draft',createdAt:'2026-11-14',rows:[{id:'p1',amount:216000}],sources:[{documentId:'doc-1',version:1,locator:'支付!B2',quote:'216000'}]};
test('exported Word roundtrips source, numbers and escaped content',async()=>{
 const text=(await mammoth.extractRawText({buffer:createWord(artifact)})).value;
 assert.match(text,/216000/);assert.match(text,/<不确定>/);assert.match(text,/doc-1 v1 支付!B2/);assert.match(text,/演示模拟数据/);
});
test('exported XLSX keeps numeric amounts and source worksheet',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await createWorkbook(artifact));
 assert.equal(wb.getWorksheet('核验结果').getCell('B3').value,216000);assert.equal(wb.getWorksheet('来源索引').getCell('C2').value,'支付!B2');
});
test('Office exports retain actionable findings, checks and native table structure',async()=>{
 const value={...artifact,content:'# 核验\n\n| 编号 | 金额 |\n| --- | --- |\n| p1 | 216000 |\n\n候选发现：120米 × 1800元/米 = 216000元，待人工核验。',findings:[{title:'重复计量待核',amount:216000}],checks:[{message:'来源未确认',blocking:true}]};
 const doc=createWord(value);const files=unzipSync(doc);assert.match(strFromU8(files['word/document.xml']),/<w:tbl>/);assert.match((await mammoth.extractRawText({buffer:doc})).value,/120米 × 1800元\/米 = 216000元/);
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await createWorkbook(value));assert.equal(wb.getWorksheet('候选发现').getCell('B3').value,216000);assert.equal(wb.getWorksheet('核验事项').getCell('B3').value,true);assert(wb.getWorksheet('成果正文').rowCount>2);
});
