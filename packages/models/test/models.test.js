import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelAdapter } from '../index.js';
const config = { text: { apiKey: 'secret-test' }, vision: { apiKey: 'secret-test' }, speech: { apiKey: 'secret-test' } };
test('unconfigured AI fails explicitly and capabilities contain no secrets', async () => {
  const model = createModelAdapter();
  await assert.rejects(model.analyze({prompt:'核验'}), /尚未配置/);
  assert.equal(model.capabilities().text.configured, false);
  assert.ok(!JSON.stringify(createModelAdapter(config).capabilities()).includes('secret-test'));
});
test('only source-bound inputs sent; successful result remains pending human review', async () => {
  let sent;
  const model = createModelAdapter(config, { fetchImpl: async (_url, options) => { sent = JSON.parse(options.body); return Response.json({choices:[{message:{content:'材料 doc-1 表明待核验。'},finish_reason:'stop'}]}); } });
  const result = await model.analyze({prompt:'核验数量',documents:[{id:'doc-1',text:'120米'}]});
  assert.deepEqual(result.sources, ['doc-1']); assert.equal(result.status,'pending-review');
  assert.ok(sent.messages[1].content.includes('120米')); assert.ok(sent.messages[0].content.includes('不得编造'));
});
test('vision attaches actual image bytes and requires an image', async () => {
  let sent;
  const model = createModelAdapter(config, { fetchImpl: async (_url, options) => { sent=JSON.parse(options.body); return Response.json({choices:[{message:{content:'尺寸不清'}}]}); } });
  await assert.rejects(model.analyze({prompt:'图纸',mode:'vision',documents:[]}), /至少一张/);
  await model.analyze({prompt:'图纸',mode:'vision',documents:[{id:'drawing',mimeType:'image/png',contentBase64:'aGVsbG8='}]});
  assert.equal(sent.messages[1].content.at(-1).image_url.url,'data:image/png;base64,aGVsbG8=');
});
test('provider failures and truncated output cannot become successful artifacts', async () => {
  const failing = createModelAdapter(config,{ fetchImpl: async () => new Response('secret-test',{status:401}) });
  await assert.rejects(failing.analyze({prompt:'检查'}), error=>error.message.includes('401')&&!error.message.includes('secret-test'));
  const truncated = createModelAdapter(config,{ fetchImpl: async () => Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]}) });
  await assert.rejects(truncated.analyze({prompt:'检查'}), /不完整/);
});
test('speech sends multipart original bytes and does not invent timestamps', async () => {
  let sent;
  const model = createModelAdapter(config,{splitAudioImpl:async(buffer,mimeType)=>[{buffer,mimeType,start:0,end:2}],fetchImpl:async(_url,options)=>{sent=options;return Response.json({text:'演示模拟数据'});}});
  const result = await model.transcribe({buffer:Buffer.from('RIFF'),mimeType:'audio/wav'});
  assert.equal(sent.body.get('model'),'glm-asr-2512'); assert.equal(sent.body.get('file').size,4);
  assert.deepEqual(result.segments,[{start:0,end:2,text:'演示模拟数据'}]);assert.match(result.warning,/并非逐词对齐/);
});
