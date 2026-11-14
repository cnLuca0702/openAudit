import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rasterizePDF} from '../index.js';
test('actual PDF pages become actual PNG bytes; invalid page ranges fail without silently omitting pages',async()=>{
 const buffer=await readFile(new URL('../../../demo/materials/initial/A-APPROVAL.pdf',import.meta.url));
 const pages=await rasterizePDF({buffer});assert.equal(pages.length,1);assert.equal(pages[0].page,1);assert.equal(pages[0].pageCount,1);
 const png=Buffer.from(pages[0].contentBase64,'base64');assert.equal(png.subarray(1,4).toString(),'PNG');assert(png.length>1000);
 await assert.rejects(rasterizePDF({buffer,pages:[2]}),/页码/);await assert.rejects(rasterizePDF({buffer,pages:[1,1]}),/页码/);
});
