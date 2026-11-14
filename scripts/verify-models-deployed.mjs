// Real provider calls via the deployed authenticated API, for the simulated project only.
import assert from 'node:assert/strict';
import {request} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const ctx=await request.newContext({baseURL:process.env.OPENAUDIT_URL||'http://127.0.0.1:13090',storageState:'runtime/browser-auth.json',timeout:300000});
const report={at:new Date().toISOString(),label:'演示模拟数据',results:[]};
async function call(action,payload={},scenarioId){const r=await ctx.post('/api/audit/action',{data:{action,payload,scenarioId}});const v=await r.json();assert(r.ok(),`${action}/${scenarioId}: ${r.status()} ${v.error}`);return v;}
try{
 let state=await (await ctx.get('/api/audit/state')).json();
 const ids=(...names)=>names.map(name=>{const d=state.documents.find(d=>d.id===name);assert(d,`Missing document ${name}`);return d.id;});
 for(const [scenarioId,documentIds] of [
 ['B03',ids('B-MEASUREMENTS','B-DRAWING-NOTES')],
 ['B06',ids('B-MEASUREMENTS','B-DRAWING-NOTES','drawing-plan-PNG')],
 ['B07',state.documents.filter(d=>['inventory','count'].includes(d.kind)||/inventory.*PNG/.test(d.id)).map(d=>d.id)],
 ['B08',state.documents.filter(d=>d.mimeType.startsWith('video/')||d.mimeType.startsWith('audio/')||d.id==='B-FIELD-NOTES').map(d=>d.id)],
 ]){
 const v=await call('run',{documentIds,useModel:true,options:{prompt:'简洁列出关键依据和待核事项，不超过800字。'}},scenarioId);const run=v.state.runs.at(-1);const artifact=v.state.artifacts.find(a=>a.id===run.artifactId);assert.equal(run.engine,'deterministic+model');assert.equal(artifact.status,'draft');assert(artifact.model?.text?.length>30);report.results.push({action:'run',scenarioId,run,artifact});console.log(scenarioId,'real model passed',artifact.model.model);await writeFile('validation/dsh-models.json',JSON.stringify(report,null,2)+'\n');
 }
 for(const documentId of ['A-APPROVAL',state.documents.find(d=>d.mimeType.startsWith('audio/')).id]){
 const action=documentId==='A-APPROVAL'?'recognize':'transcribe';const v=await call(action,{documentId});const derived=v.result.document;assert.equal(derived.parentDocumentId,documentId);assert.equal(derived.status,'pending');assert(derived.text.length>20);report.results.push({action,sourceDocumentId:documentId,run:v.state.runs.at(-1),document:derived});console.log(action,'real model passed');await writeFile('validation/dsh-models.json',JSON.stringify(report,null,2)+'\n');
 }
 report.passed=true;
}catch(e){report.passed=false;report.error=e.message;throw e;}finally{await writeFile('validation/dsh-models.json',JSON.stringify(report,null,2)+'\n');await ctx.dispose();}
