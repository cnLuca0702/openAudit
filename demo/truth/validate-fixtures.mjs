// 演示模拟数据 — test-only fixture integration, excluded from business ingestion.
import { AuditService } from '../../packages/server/service.js';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const dataDir=await mkdtemp(join(tmpdir(),'openaudit-fixture-check-'));
const service=await AuditService.create({dataDir,demoDir:join(root,'demo'),model:{capabilities:()=>({testFixtureOnly:true})}});
const imports=[];for(const batch of ['initial','feedback','review','rectification']){const r=await service.action({action:'seed',payload:{batch}});imports.push({batch,imported:r.result.imported});}
const maps=JSON.parse(await readFile(join(root,'demo/scenario-material-map.json'),'utf8'));const results=[];
for(const map of maps){try{const r=await service.action({action:'run',scenarioId:map.scenarioId,payload:{documentIds:map.documentIds,useModel:false}});const a=r.state.artifacts.find(x=>x.id===r.result.artifactId);results.push({scenarioId:map.scenarioId,status:'rule-execution-passed',rows:a.rows.length,checks:a.checks.length,sources:a.sources.length,engine:'deterministic',artifactId:a.id,checksCodes:a.checks.map(x=>x.code),observations:a.rows,summary:a.summary,findings:r.state.findings.filter(f=>f.artifactId===a.id)});}catch(e){results.push({scenarioId:map.scenarioId,status:'failed',error:e.message});}}
const byId=Object.fromEntries(results.map(r=>[r.scenarioId,r]));
const assertions=[];
function verify(name,passed,actual){assertions.push({name,passed,actual});}
verify('B03 同管线120米交集=216000元',byId.B03?.findings?.some(f=>f.amount===216000),byId.B03?.findings?.map(f=>({title:f.title,amount:f.amount})));
verify('B03 不同雨水管线未计为重复',byId.B03?.findings?.length===1,byId.B03?.findings?.length);
verify('B01 同一交易多来源去重后净额1336800元',byId.B01?.summary?.totalYuan===1336800,byId.B01?.summary);
verify('E01 日期与来源冲突被识别',byId.E01?.checksCodes?.includes('date-conflict'),byId.E01?.checksCodes);
verify('E01 全部范围超出样本被识别',byId.E01?.checksCodes?.includes('scope-overreach'),byId.E01?.checksCodes);
verify('B07 重复影像被识别',byId.B07?.checksCodes?.includes('duplicate-image'),byId.B07?.checksCodes);
verify('B06 未确认参数阻止复算',byId.B06?.observations?.every(r=>r.total===null),byId.B06?.observations?.map(r=>({id:r.id,total:r.total})));
verify('九项法规均保持待人工核验',service.state().laws.length===9&&service.state().laws.every(r=>r.status==='待人工核验'),service.state().laws.map(r=>r.status));
verify('F01 无证明人工核验不能具备复查条件',byId.F01?.observations?.filter(r=>r.issueId==='ISSUE-MEASURE').every(r=>r.status!=='具备复查条件'),byId.F01?.observations);
const report={assertions,label:'演示模拟数据',scope:'真实文件导入和确定性场景运行；不等于业务全流程、人审、模型、UI或部署验收',imports,documents:service.state().documents.length,laws:service.state().laws.length,results,failed:results.filter(r=>r.status==='failed').length};
await writeFile(join(root,'demo/truth/fixtures-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({imports,documents:report.documents,laws:report.laws,passed:24-report.failed,assertions:assertions.map(a=>({name:a.name,passed:a.passed})),failed:results.filter(r=>r.status==='failed')},null,2));if(report.failed||assertions.some(a=>!a.passed))process.exitCode=1;
