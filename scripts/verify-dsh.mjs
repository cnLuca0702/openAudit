// Run against the isolated deployment after logging in. Cookies stay in ignored runtime/.
import assert from 'node:assert/strict';
import { request } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const baseURL = process.env.OPENAUDIT_URL || 'http://127.0.0.1:13090';
const ctx = await request.newContext({baseURL,storageState:'runtime/browser-auth.json',timeout:240000});
const anonymous = await request.newContext({baseURL});
const report={at:new Date().toISOString(),label:'演示模拟数据',deployment:'isolated DSH 0.2.2-rc.1',checks:[],scenarios:[]};
async function action(action,payload={},scenarioId){const r=await ctx.post('/api/audit/action',{data:{action,payload,scenarioId}});const v=await r.json();assert(r.ok(),`${action}/${scenarioId}: ${r.status()} ${v.error}`);return v;}
try {
 for(const path of ['/api/audit/state','/audit/']){const r=await anonymous.get(path);assert.equal(r.status(),401);report.checks.push({path,unauthenticatedStatus:r.status()});}
 let response=await ctx.get('/api/audit/state');assert.equal(response.status(),200);
 const seeded=await action('seed',{batch:'all'});assert(seeded.state.documents.length>=55);
 for(const scenario of seeded.state.scenarios){const {state,result}=await action('run',{},scenario.id);const run=state.runs.at(-1);assert.equal(run.status,'succeeded');const artifact=state.artifacts.find(a=>a.id===run.artifactId);assert(artifact.rows.length>0);assert(artifact.sources.length>0);report.scenarios.push({id:scenario.id,runId:run.id,artifactId:artifact.id,rows:artifact.rows.length,sources:artifact.sources.length});console.log(scenario.id,'passed',artifact.rows.length,'rows');}
 const state=await (await ctx.get('/api/audit/state')).json();const artifact=state.artifacts.filter(a=>a.scenarioId==='B03').at(-1);
 for(const format of ['md','json','csv','docx','xlsx']){const r=await ctx.get('/api/audit/export',{params:{artifactId:artifact.id,format}});assert.equal(r.status(),200);const bytes=await r.body();assert(bytes.length>30);if(['docx','xlsx'].includes(format)) assert.equal(bytes.subarray(0,2).toString(),'PK');report.checks.push({export:format,bytes:bytes.length});}
 report.project={documents:state.documents.length,facts:state.facts.length,artifacts:state.artifacts.length};report.passed=true;
} catch(e){report.passed=false;report.error=e.message;throw e;}
finally{await writeFile('validation/dsh-api.json',JSON.stringify(report,null,2)+'\n');await ctx.dispose();await anonymous.dispose();}
