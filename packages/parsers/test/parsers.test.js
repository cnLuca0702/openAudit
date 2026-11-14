import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {zipSync,strToU8} from 'fflate';
import {parseDocument} from '../index.js';
test('xlsx preserves worksheet/row provenance, numbers and cached formulas',async()=>{
 const wb=new ExcelJS.Workbook();const s=wb.addWorksheet('支付');s.addRow(['id','amount','unit']);s.addRow(['p1',216000,'元']);s.addRow(['p2',{formula:'B2*2',result:432000},'元']);
 const parsed=await parseDocument({name:'账本.xlsx',buffer:await wb.xlsx.writeBuffer()});
 assert.equal(parsed.records[0].amount,216000);assert.equal(parsed.records[1].amount,432000);assert.match(parsed.records[0].locator,/支付!A2/);
});
test('zip traversal rejected and ordinary entries available without disk extraction',async()=>{
 await assert.rejects(parseDocument({name:'bad.zip',buffer:zipSync({'../evil.txt':strToU8('bad')})}),/非法路径/);
 const parsed=await parseDocument({name:'good.zip',buffer:zipSync({'folder/a.txt':strToU8('模拟资料')})});
 assert.equal(parsed.entries[0].name,'folder/a.txt');assert.equal(parsed.entries[0].buffer.toString(),'模拟资料');
});
test('binary image requires real multimodal processing, no invented extracted content',async()=>{
 const parsed=await parseDocument({name:'scan.png',mimeType:'image/png',buffer:Buffer.from('image')});
 assert.equal(parsed.parseStatus,'pending');assert.equal(parsed.text,'');
});
